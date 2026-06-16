package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/model"
)

type AuthHandler struct {
	db          *pgxpool.Pool
	jwt         *auth.JWTManager
	publicSignup bool
}

func NewAuthHandler(db *pgxpool.Pool, jwt *auth.JWTManager, publicSignup bool) *AuthHandler {
	return &AuthHandler{db: db, jwt: jwt, publicSignup: publicSignup}
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name,omitempty"`
	InviteCode  string `json:"invite_code"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (h *AuthHandler) Register() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Email == "" || req.Username == "" || req.Password == "" {
			writeError(w, http.StatusBadRequest, "email, username, and password are required")
			return
		}
		if len(req.Password) < 8 {
			writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
			return
		}
		if !h.publicSignup && req.InviteCode == "" {
			writeError(w, http.StatusBadRequest, "invite_code is required")
			return
		}

		var userID string

		if req.InviteCode != "" {
			tx, err := h.db.Begin(r.Context())
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to begin transaction")
				return
			}
			defer tx.Rollback(r.Context())

			var inviteUsedBy *string
			err = tx.QueryRow(r.Context(),
				`SELECT used_by FROM invite_tokens WHERE token = $1 AND expires_at > now() FOR UPDATE`,
				req.InviteCode,
			).Scan(&inviteUsedBy)
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusBadRequest, "invalid or expired invite code")
				return
			}
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to validate invite code")
				return
			}
			if inviteUsedBy != nil {
				writeError(w, http.StatusBadRequest, "invite code already used")
				return
			}

			hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to hash password")
				return
			}

			err = tx.QueryRow(r.Context(),
				`INSERT INTO users (email, username, password_hash, display_name)
				 VALUES ($1, $2, $3, $4)
				 RETURNING id`,
				req.Email, req.Username, string(hash), req.DisplayName,
			).Scan(&userID)
			if err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					writeError(w, http.StatusConflict, "email or username already exists")
					return
				}
				writeError(w, http.StatusInternalServerError, "failed to create user")
				return
			}

			_, err = tx.Exec(r.Context(),
				`UPDATE invite_tokens SET used_by = $1 WHERE token = $2`,
				userID, req.InviteCode,
			)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to mark invite as used")
				return
			}

			if err := tx.Commit(r.Context()); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to commit transaction")
				return
			}
		} else {
			hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to hash password")
				return
			}

			err = h.db.QueryRow(r.Context(),
				`INSERT INTO users (email, username, password_hash, display_name)
				 VALUES ($1, $2, $3, $4)
				 RETURNING id`,
				req.Email, req.Username, string(hash), req.DisplayName,
			).Scan(&userID)
			if err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					writeError(w, http.StatusConflict, "email or username already exists")
					return
				}
				writeError(w, http.StatusInternalServerError, "failed to create user")
				return
			}
		}

		accessToken, err := h.jwt.GenerateAccessToken(userID, req.Email, req.Username, "user")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate access token")
			return
		}

		refreshToken, err := h.storeRefreshToken(r.Context(), userID, req.Email, req.Username, "user")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate refresh token")
			return
		}

		writeJSON(w, http.StatusCreated, AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			ExpiresIn:    900,
		})
	}
}

func (h *AuthHandler) Login() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Email == "" || req.Password == "" {
			writeError(w, http.StatusBadRequest, "email and password are required")
			return
		}

		var userID, username, passwordHash, role string
		err := h.db.QueryRow(r.Context(),
			`SELECT id, username, password_hash, role FROM users WHERE email = $1`,
			req.Email,
		).Scan(&userID, &username, &passwordHash, &role)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}

		accessToken, err := h.jwt.GenerateAccessToken(userID, req.Email, username, role)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate access token")
			return
		}

		refreshToken, err := h.storeRefreshToken(r.Context(), userID, req.Email, username, role)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate refresh token")
			return
		}

		writeJSON(w, http.StatusOK, AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			ExpiresIn:    900,
		})
	}
}

func (h *AuthHandler) Refresh() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RefreshRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.RefreshToken == "" {
			writeError(w, http.StatusBadRequest, "refresh_token is required")
			return
		}

		claims, err := h.jwt.Validate(req.RefreshToken)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
			return
		}
		if claims.Kind != auth.RefreshToken {
			writeError(w, http.StatusUnauthorized, "token is not a refresh token")
			return
		}

		tokenHash := hashToken(req.RefreshToken)

		var storedUserID string
		err = h.db.QueryRow(r.Context(),
			`SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()`,
			tokenHash,
		).Scan(&storedUserID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "refresh token has been revoked or expired")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to verify refresh token")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`DELETE FROM refresh_tokens WHERE token_hash = $1`, tokenHash,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to revoke old refresh token")
			return
		}

		var userID, email, username, role string
		err = h.db.QueryRow(r.Context(),
			`SELECT id, email, username, role FROM users WHERE id = $1`, claims.UserID,
		).Scan(&userID, &email, &username, &role)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		accessToken, err := h.jwt.GenerateAccessToken(userID, email, username, role)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate access token")
			return
		}

		newRefreshToken, err := h.storeRefreshToken(r.Context(), userID, email, username, role)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate new refresh token")
			return
		}

		writeJSON(w, http.StatusOK, AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: newRefreshToken,
			ExpiresIn:    900,
		})
	}
}

func (h *AuthHandler) Me() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var user model.User
		err := h.db.QueryRow(r.Context(),
			`SELECT id, email, username, password_hash, display_name, avatar_url, role, status, storage_used, last_active_at, created_at, updated_at
			 FROM users WHERE id = $1`,
			claims.UserID,
		).Scan(
			&user.ID, &user.Email, &user.Username, &user.PasswordHash,
			&user.DisplayName, &user.AvatarURL, &user.Role, &user.Status,
			&user.StorageUsed, &user.LastActiveAt, &user.CreatedAt, &user.UpdatedAt,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		writeJSON(w, http.StatusOK, user)
	}
}

func (h *AuthHandler) storeRefreshToken(ctx context.Context, userID, email, username, role string) (string, error) {
	token, err := h.jwt.GenerateRefreshToken(userID, email, username, role)
	if err != nil {
		return "", err
	}

	tokenHash := hashToken(token)

	_, err = h.db.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, now() + INTERVAL '7 days')`,
		userID, tokenHash,
	)
	if err != nil {
		return "", err
	}

	return token, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

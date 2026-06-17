package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/model"
	"vidfriends.ai/backend/internal/storage"
)

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type AuthHandler struct {
	db             *pgxpool.Pool
	jwt            *auth.JWTManager
	s3             *storage.Client
	publicSignup   bool
	deleteRateMu   sync.Mutex
	deleteRate     map[string]time.Time
}

func NewAuthHandler(db *pgxpool.Pool, jwt *auth.JWTManager, s3 *storage.Client, publicSignup bool) *AuthHandler {
	return &AuthHandler{
		db:           db,
		jwt:          jwt,
		s3:           s3,
		publicSignup: publicSignup,
		deleteRate:   make(map[string]time.Time),
	}
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

func createUser(ctx context.Context, q querier, email, username, password, displayName string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	var userID string
	err = q.QueryRow(ctx,
		`INSERT INTO users (email, username, password_hash, display_name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		email, username, string(hash), displayName,
	).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return "", pgErr
		}
		return "", err
	}
	return userID, nil
}

func validateRegisterInput(req RegisterRequest) string {
	var errs []string

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		errs = append(errs, "email is required")
	} else if len(email) > 255 {
		errs = append(errs, "email must be at most 255 characters")
	} else if !emailRe.MatchString(email) {
		errs = append(errs, "invalid email address")
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		errs = append(errs, "username is required")
	} else if len(req.Username) < 3 {
		errs = append(errs, "username must be at least 3 characters")
	} else if len(req.Username) > 30 {
		errs = append(errs, "username must be at most 30 characters")
	}

	password := req.Password
	if password == "" {
		errs = append(errs, "password is required")
	} else if len(password) < 8 {
		errs = append(errs, "password must be at least 8 characters")
	} else if len(password) > 128 {
		errs = append(errs, "password must be at most 128 characters")
	} else {
		hasUpper, hasLower, hasDigit := false, false, false
		for _, r := range password {
			switch {
			case unicode.IsUpper(r):
				hasUpper = true
			case unicode.IsLower(r):
				hasLower = true
			case unicode.IsDigit(r):
				hasDigit = true
			}
		}
		if !hasUpper {
			errs = append(errs, "password must contain at least one uppercase letter")
		}
		if !hasLower {
			errs = append(errs, "password must contain at least one lowercase letter")
		}
		if !hasDigit {
			errs = append(errs, "password must contain at least one number")
		}
	}

	return strings.Join(errs, "; ")
}

func (h *AuthHandler) Register() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if errMsg := validateRegisterInput(req); errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}

		req.Email = strings.TrimSpace(strings.ToLower(req.Email))
		req.Username = strings.TrimSpace(req.Username)

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

			userID, err = createUser(r.Context(), tx, req.Email, req.Username, req.Password, req.DisplayName)
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
			var err error
			userID, err = createUser(r.Context(), h.db, req.Email, req.Username, req.Password, req.DisplayName)
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

type UpdateProfileRequest struct {
	DisplayName string `json:"display_name,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

func (h *AuthHandler) UpdateProfile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req UpdateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		_, err := h.db.Exec(r.Context(),
			`UPDATE users SET display_name = COALESCE(NULLIF($1, ''), display_name),
			                  avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
			                  updated_at = now()
			 WHERE id = $3`,
			req.DisplayName, req.AvatarURL, claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}

		var user model.User
		err = h.db.QueryRow(r.Context(),
			`SELECT id, email, username, password_hash, display_name, avatar_url, role, status, storage_used, last_active_at, created_at, updated_at
			 FROM users WHERE id = $1`,
			claims.UserID,
		).Scan(
			&user.ID, &user.Email, &user.Username, &user.PasswordHash,
			&user.DisplayName, &user.AvatarURL, &user.Role, &user.Status,
			&user.StorageUsed, &user.LastActiveAt, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		writeJSON(w, http.StatusOK, user)
	}
}

func (h *AuthHandler) DeleteAccount() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Password == "" {
			writeError(w, http.StatusBadRequest, "password is required")
			return
		}

		var passwordHash string
		err := h.db.QueryRow(r.Context(),
			`SELECT password_hash FROM users WHERE id = $1`,
			claims.UserID,
		).Scan(&passwordHash)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
			writeError(w, http.StatusUnauthorized, "invalid password")
			return
		}

		h.deleteRateMu.Lock()
		lastAttempt, exists := h.deleteRate[claims.UserID]
		if exists && time.Since(lastAttempt) < time.Hour {
			h.deleteRateMu.Unlock()
			writeError(w, http.StatusTooManyRequests, "you can only delete your account once per hour")
			return
		}
		h.deleteRate[claims.UserID] = time.Now()
		h.deleteRateMu.Unlock()

		rows, err := h.db.Query(r.Context(),
			`SELECT file_url, thumbnail_url FROM videos WHERE user_id = $1`,
			claims.UserID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var fileURL, thumbnailURL string
				if err := rows.Scan(&fileURL, &thumbnailURL); err != nil {
					continue
				}
				if fileURL != "" {
					if err := h.s3.DeleteFile(r.Context(), fileURL); err != nil {
						slog.Error("failed to delete video file from s3", "file_url", fileURL, "error", err)
					}
				}
				if thumbnailURL != "" {
					if err := h.s3.DeleteFile(r.Context(), thumbnailURL); err != nil {
						slog.Error("failed to delete thumbnail from s3", "thumbnail_url", thumbnailURL, "error", err)
					}
				}
			}
		}

		tag, err := h.db.Exec(r.Context(),
			`DELETE FROM users WHERE id = $1`, claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete account")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		h.deleteRateMu.Lock()
		delete(h.deleteRate, claims.UserID)
		h.deleteRateMu.Unlock()

		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
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

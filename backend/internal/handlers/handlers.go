package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/auth"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/config"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/db"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/models"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/util"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/yt"
)

const sessionCookie = "vidshare_session"

type Handler struct {
	store    *db.Store
	cfg      *config.Config
	ytClient *yt.Client
}

func New(store *db.Store, cfg *config.Config, ytClient *yt.Client) *Handler {
	return &Handler{store: store, cfg: cfg, ytClient: ytClient}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	allowed := h.cfg.AllowOrigins
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: allowed,
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			return len(allowed) == 0
		},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))
	r.Get("/healthz", h.handleHealth)
	r.Post("/api/signup", h.handleSignup)
	r.Post("/api/login", h.handleLogin)
	r.Post("/api/logout", h.handleLogout)
	r.Group(func(r chi.Router) {
		r.Use(h.requireAuth)
		r.Get("/api/me", h.handleMe)
		r.Get("/api/friends", h.handleListFriends)
		r.Post("/api/friends", h.handleAddFriend)
		r.Get("/api/feed", h.handleFeed)
		r.Post("/api/share", h.handleShare)
	})
	return r
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (h *Handler) handleSignup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if body.Username == "" || body.Password == "" {
		respondError(w, http.StatusBadRequest, errors.New("username and password required"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	user, err := h.store.CreateUser(ctx, body.Username, hash)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			respondError(w, http.StatusConflict, errors.New("username already exists"))
			return
		}
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	// Auto-add self to friend list for convenience
	_ = h.store.UpsertFriendship(ctx, user.ID, user.ID)

	respondJSON(w, http.StatusCreated, map[string]any{"user": publicUser(user)})
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.store.GetUserByUsername(ctx, body.Username)
	if err != nil {
		respondError(w, http.StatusUnauthorized, errors.New("invalid credentials"))
		return
	}

	if err := auth.CheckPassword(user.Password, body.Password); err != nil {
		respondError(w, http.StatusUnauthorized, errors.New("invalid credentials"))
		return
	}

	token, err := util.RandomToken(32)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	expires := time.Now().Add(30 * 24 * time.Hour)
	if err := h.store.CreateSession(ctx, user.ID, token, expires); err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.setSessionCookie(w, token, expires)
	respondJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	token := readSessionCookie(r)
	if token != "" {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		_ = h.store.DeleteSession(ctx, token)
	}
	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := readSessionCookie(r)
		if token == "" {
			respondError(w, http.StatusUnauthorized, errors.New("missing session"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		sess, err := h.store.GetSession(ctx, token)
		if err != nil || sess.ExpiresAt.Before(time.Now()) {
			h.clearSessionCookie(w)
			respondError(w, http.StatusUnauthorized, errors.New("session expired"))
			return
		}
		next.ServeHTTP(w, r.WithContext(withUserID(r.Context(), sess.UserID)))
	})
}

func (h *Handler) handleMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	user, err := h.store.GetUserByID(ctx, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (h *Handler) handleListFriends(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	friends, err := h.store.ListFriends(ctx, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"friends": publicUsers(friends)})
}

func (h *Handler) handleAddFriend(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	var body struct {
		Username string `json:"username"`
	}
	if err := decodeJSON(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if body.Username == "" {
		respondError(w, http.StatusBadRequest, errors.New("username required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	friend, err := h.store.GetUserByUsername(ctx, body.Username)
	if err != nil {
		respondError(w, http.StatusNotFound, errors.New("user not found"))
		return
	}
	if err := h.store.UpsertFriendship(ctx, userID, friend.ID); err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	if err := h.store.UpsertFriendship(ctx, friend.ID, userID); err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"friend": publicUser(friend)})
}

func (h *Handler) handleFeed(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	shares, err := h.store.ListSharesForUser(ctx, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"shares": publicShares(shares)})
}

func (h *Handler) handleShare(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFrom(r.Context())
	var body struct {
		URL        string   `json:"url"`
		Recipients []string `json:"recipients"`
		Note       string   `json:"note"`
	}
	if err := decodeJSON(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	body.URL = strings.TrimSpace(body.URL)
	if body.URL == "" {
		respondError(w, http.StatusBadRequest, errors.New("url is required"))
		return
	}
	if len(body.Recipients) == 0 {
		respondError(w, http.StatusBadRequest, errors.New("at least one recipient"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	me, err := h.store.GetUserByID(ctx, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	count, err := h.store.CountVideosForUser(ctx, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	if count >= h.cfg.MaxVideoPerUser {
		respondError(w, http.StatusTooManyRequests, errors.New("video quota exceeded"))
		return
	}

	ytCtx, ytCancel := yt.WithTimeout(ctx, 25*time.Second)
	defer ytCancel()
	meta, err := h.ytClient.Fetch(ytCtx, body.URL)
	if err != nil {
		respondError(w, http.StatusBadGateway, err)
		return
	}

	video := &models.Video{
		URL:         body.URL,
		Title:       strings.TrimSpace(meta.Title),
		Thumbnail:   meta.Thumbnail,
		Duration:    int(meta.Duration + 0.5),
		Description: strings.TrimSpace(meta.Description),
	}
	createdVideo, err := h.store.CreateVideo(ctx, userID, video)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	var createdShares []*models.Share
	for _, username := range body.Recipients {
		username = strings.TrimSpace(username)
		if username == "" {
			continue
		}
		friend, err := h.store.GetUserByUsername(ctx, username)
		if err != nil {
			respondError(w, http.StatusNotFound, errors.New("recipient "+username+" not found"))
			return
		}
		if err := h.store.UpsertFriendship(ctx, userID, friend.ID); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		if err := h.store.UpsertFriendship(ctx, friend.ID, userID); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		share, err := h.store.CreateShare(ctx, userID, friend.ID, createdVideo.ID, body.Note)
		if err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		share.Video = createdVideo
		share.Sender = me
		createdShares = append(createdShares, share)
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"video":  publicVideo(createdVideo),
		"shares": publicShares(createdShares),
	})
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func respondJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func respondError(w http.ResponseWriter, status int, err error) {
	respondJSON(w, status, map[string]any{"error": err.Error()})
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Expires:  expires,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func readSessionCookie(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func publicUser(user *models.User) map[string]any {
	return map[string]any{
		"id":        user.ID,
		"username":  user.Username,
		"createdAt": user.CreatedAt,
	}
}

func publicUsers(users []*models.User) []map[string]any {
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		out = append(out, publicUser(u))
	}
	return out
}

func publicVideo(video *models.Video) map[string]any {
	return map[string]any{
		"id":          video.ID,
		"ownerId":     video.OwnerID,
		"url":         video.URL,
		"title":       video.Title,
		"thumbnail":   video.Thumbnail,
		"duration":    video.Duration,
		"description": video.Description,
		"createdAt":   video.CreatedAt,
	}
}

func publicShares(shares []*models.Share) []map[string]any {
	out := make([]map[string]any, 0, len(shares))
	for _, s := range shares {
		entry := map[string]any{
			"id":        s.ID,
			"note":      s.Note,
			"createdAt": s.CreatedAt,
			"senderId":  s.SenderID,
			"targetId":  s.TargetID,
		}
		if s.Video != nil {
			entry["video"] = publicVideo(s.Video)
		}
		if s.Sender != nil {
			entry["sender"] = map[string]any{"id": s.Sender.ID, "username": s.Sender.Username}
		}
		out = append(out, entry)
	}
	return out
}

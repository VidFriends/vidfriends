package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/push"
)

type PushHandler struct {
	db *pgxpool.Pool
	pm *push.PushManager
}

func NewPushHandler(db *pgxpool.Pool, pm *push.PushManager) *PushHandler {
	return &PushHandler{db: db, pm: pm}
}

type registerPushRequest struct {
	Provider      string   `json:"provider"`
	Target        string   `json:"target"`
	EnabledEvents []string `json:"enabled_events,omitempty"`
}

type pushRegisterResponse struct {
	ID string `json:"id"`
}

func (h *PushHandler) Register() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req registerPushRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Provider == "" || req.Target == "" {
			writeError(w, http.StatusBadRequest, "provider and target are required")
			return
		}

		validProviders := map[string]bool{"ntfy": true, "gotify": true, "fcm": true, "apns": true}
		if !validProviders[req.Provider] {
			writeError(w, http.StatusBadRequest, "invalid provider; must be ntfy, gotify, fcm, or apns")
			return
		}

		if req.EnabledEvents == nil {
			req.EnabledEvents = []string{}
		}

		var col string
		switch req.Provider {
		case "ntfy":
			col = "ntfy_topic"
		case "gotify":
			col = "gotify_token"
		case "fcm":
			col = "fcm_token"
		case "apns":
			col = "apns_token"
		}

		query := `INSERT INTO push_preferences (user_id, ` + col + `, enabled_events)
		           VALUES ($1, $2, $3)
		           ON CONFLICT (user_id)
		           DO UPDATE SET ` + col + ` = $2, enabled_events = $3, updated_at = now()
		           RETURNING id`

		var prefID string
		err := h.db.QueryRow(r.Context(), query, claims.UserID, req.Target, req.EnabledEvents).Scan(&prefID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to register push target")
			return
		}

		writeJSON(w, http.StatusOK, pushRegisterResponse{ID: prefID})
	}
}

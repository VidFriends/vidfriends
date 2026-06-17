package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/storage"
)

type AdminHandler struct {
	db              *pgxpool.Pool
	actLog          *middleware.ActivityLogger
	s3              *storage.Client
	evictionAgeDays int
}

func NewAdminHandler(db *pgxpool.Pool, actLog *middleware.ActivityLogger, s3 *storage.Client, evictionAgeDays int) *AdminHandler {
	return &AdminHandler{db: db, actLog: actLog, s3: s3, evictionAgeDays: evictionAgeDays}
}

type AdminStatsResponse struct {
	TotalVideos      int `json:"total_videos"`
	TotalStorage     int `json:"total_storage"`
	TotalUsers       int `json:"total_users"`
	ActiveUsersToday int `json:"active_users_today"`
}

type AdminUserInfo struct {
	ID               string  `json:"id"`
	Email            string  `json:"email"`
	Username         string  `json:"username"`
	Role             string  `json:"role"`
	Status           string  `json:"status"`
	StorageUsed      int64   `json:"storage_used"`
	UploadQuotaBytes *int64  `json:"upload_quota_bytes,omitempty"`
	LastActive       *string `json:"last_active_at,omitempty"`
	CreatedAt        string  `json:"created_at"`
}

type AdminUpdateUserRequest struct {
	Role             *string `json:"role,omitempty"`
	Status           *string `json:"status,omitempty"`
	UploadQuotaBytes *int64  `json:"upload_quota_bytes,omitempty"`
}

type StorageBreakdownItem struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	StorageUsed int64  `json:"storage_used"`
}

type InviteTokenResponse struct {
	Token     string  `json:"token"`
	UsedBy    *string `json:"used_by,omitempty"`
	ExpiresAt string  `json:"expires_at"`
	CreatedBy string  `json:"created_by"`
	CreatedAt string  `json:"created_at"`
}

type CreateInviteRequest struct {
	ExpiresAt string `json:"expires_at"`
}

type ActivityLogResponse struct {
	Entries    []middleware.ActivityEntry `json:"entries"`
	Total      int                        `json:"total"`
	Limit      int                        `json:"limit"`
	Offset     int                        `json:"offset"`
}

func (h *AdminHandler) Stats() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var resp AdminStatsResponse
		err := h.db.QueryRow(r.Context(),
			`SELECT
			 (SELECT COUNT(*) FROM videos WHERE status != 'deleted'),
			 (SELECT COALESCE(SUM(storage_used), 0) FROM users),
			 (SELECT COUNT(*) FROM users),
			 (SELECT COUNT(*) FROM users WHERE last_active_at >= now() - interval '24 hours')`,
		).Scan(&resp.TotalVideos, &resp.TotalStorage, &resp.TotalUsers, &resp.ActiveUsersToday)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch stats")
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func (h *AdminHandler) Users() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		where := "WHERE 1=1"
		args := make([]any, 0)
		argIdx := 1

		if email := r.URL.Query().Get("email"); email != "" {
			where += fmt.Sprintf(" AND email ILIKE $%d", argIdx)
			args = append(args, "%"+email+"%")
			argIdx++
		}
		if username := r.URL.Query().Get("username"); username != "" {
			where += fmt.Sprintf(" AND username ILIKE $%d", argIdx)
			args = append(args, "%"+username+"%")
			argIdx++
		}
		if role := r.URL.Query().Get("role"); role != "" {
			where += fmt.Sprintf(" AND role = $%d", argIdx)
			args = append(args, role)
			argIdx++
		}
		if status := r.URL.Query().Get("status"); status != "" {
			where += fmt.Sprintf(" AND status = $%d", argIdx)
			args = append(args, status)
			argIdx++
		}

		query := fmt.Sprintf(
			`SELECT id, email, username, role, status, storage_used, upload_quota_bytes, last_active_at, created_at
			 FROM users %s ORDER BY created_at DESC`, where)

		rows, err := h.db.Query(r.Context(), query, args...)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch users")
			return
		}
		defer rows.Close()

		users := make([]AdminUserInfo, 0)
		for rows.Next() {
			var u AdminUserInfo
			var lastActive *time.Time
			var createdAt time.Time
			if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.Role, &u.Status, &u.StorageUsed, &u.UploadQuotaBytes, &lastActive, &createdAt); err != nil {
				continue
			}
			u.CreatedAt = createdAt.Format(time.RFC3339)
			if lastActive != nil {
				s := lastActive.Format(time.RFC3339)
				u.LastActive = &s
			}
			users = append(users, u)
		}

		writeJSON(w, http.StatusOK, users)
	}
}

func (h *AdminHandler) UpdateUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.PathValue("id")

		var req AdminUpdateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Role == nil && req.Status == nil && req.UploadQuotaBytes == nil {
			writeError(w, http.StatusBadRequest, "at least one field (role, status, upload_quota_bytes) must be provided")
			return
		}

		if req.Role != nil {
			validRoles := map[string]bool{"user": true, "admin": true}
			if !validRoles[*req.Role] {
				writeError(w, http.StatusBadRequest, "role must be 'user' or 'admin'")
				return
			}
		}
		if req.Status != nil {
			validStatuses := map[string]bool{"active": true, "suspended": true, "disabled": true}
			if !validStatuses[*req.Status] {
				writeError(w, http.StatusBadRequest, "status must be 'active', 'suspended', or 'disabled'")
				return
			}
		}

		tag, err := h.db.Exec(r.Context(),
			`UPDATE users SET
			 role              = COALESCE($1, role),
			 status            = COALESCE($2, status),
			 upload_quota_bytes = COALESCE($3, upload_quota_bytes),
			 updated_at        = now()
			 WHERE id = $4`,
			req.Role, req.Status, req.UploadQuotaBytes, userID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update user")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		meta := make(map[string]any)
		if req.Role != nil {
			meta["new_role"] = *req.Role
		}
		if req.Status != nil {
			meta["new_status"] = *req.Status
		}
		h.actLog.RecordFromRequest(r, "admin_update_user", "user", userID, meta)

		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func (h *AdminHandler) DeleteUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.PathValue("id")

		tag, err := h.db.Exec(r.Context(),
			`DELETE FROM users WHERE id = $1`, userID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete user")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		h.actLog.RecordFromRequest(r, "admin_delete_user", "user", userID, nil)

		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func (h *AdminHandler) StorageBreakdown() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := h.db.Query(r.Context(),
			`SELECT id, username, storage_used FROM users
			 WHERE storage_used > 0
			 ORDER BY storage_used DESC`,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch storage breakdown")
			return
		}
		defer rows.Close()

		items := make([]StorageBreakdownItem, 0)
		for rows.Next() {
			var item StorageBreakdownItem
			if err := rows.Scan(&item.UserID, &item.Username, &item.StorageUsed); err != nil {
				continue
			}
			items = append(items, item)
		}

		writeJSON(w, http.StatusOK, items)
	}
}

func (h *AdminHandler) RunEviction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := h.db.Query(r.Context(),
			`SELECT id, file_url, thumbnail_url FROM videos
			 WHERE status IN ('ready', 'processing')
			   AND created_at < now() - $1 * interval '1 day'
			   AND (keep_forever IS NULL OR keep_forever = false)
			   AND id NOT IN (SELECT video_id FROM likes)
			   AND id NOT IN (SELECT video_id FROM comments)`,
			h.evictionAgeDays,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query evictable videos")
			return
		}
		defer rows.Close()

		type videoFile struct {
			ID           string
			FileURL      string
			ThumbnailURL string
		}
		var videos []videoFile
		for rows.Next() {
			var v videoFile
			if err := rows.Scan(&v.ID, &v.FileURL, &v.ThumbnailURL); err != nil {
				continue
			}
			videos = append(videos, v)
		}

		for _, v := range videos {
			if v.FileURL != "" {
				if err := h.s3.DeleteFile(r.Context(), v.FileURL); err != nil {
					slog.Error("eviction: failed to delete file from s3", "video_id", v.ID, "error", err)
				}
			}
			if v.ThumbnailURL != "" {
				if err := h.s3.DeleteFile(r.Context(), v.ThumbnailURL); err != nil {
					slog.Error("eviction: failed to delete thumbnail from s3", "video_id", v.ID, "error", err)
				}
			}
		}

		tag, err := h.db.Exec(r.Context(),
			`UPDATE videos SET status = 'deleted'
			 WHERE status IN ('ready', 'processing')
			   AND created_at < now() - $1 * interval '1 day'
			   AND (keep_forever IS NULL OR keep_forever = false)
			   AND id NOT IN (SELECT video_id FROM likes)
			   AND id NOT IN (SELECT video_id FROM comments)`,
			h.evictionAgeDays,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to run eviction")
			return
		}

		h.actLog.RecordFromRequest(r, "admin_eviction_run", "video", "",
			map[string]any{"evicted_count": tag.RowsAffected()})

		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "eviction_complete",
			"evicted": tag.RowsAffected(),
		})
	}
}

func (h *AdminHandler) DeleteVideo() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID := r.PathValue("id")

		var fileURL, thumbnailURL string
		err := h.db.QueryRow(r.Context(),
			`SELECT file_url, thumbnail_url FROM videos WHERE id = $1`,
			videoID,
		).Scan(&fileURL, &thumbnailURL)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		if fileURL != "" {
			if err := h.s3.DeleteFile(r.Context(), fileURL); err != nil {
				slog.Error("failed to delete video file from s3", "video_id", videoID, "error", err)
			}
		}
		if thumbnailURL != "" {
			if err := h.s3.DeleteFile(r.Context(), thumbnailURL); err != nil {
				slog.Error("failed to delete thumbnail from s3", "video_id", videoID, "error", err)
			}
		}

		tag, err := h.db.Exec(r.Context(),
			`UPDATE videos SET status = 'deleted' WHERE id = $1`, videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to evict video")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "video not found")
			return
		}

		h.actLog.RecordFromRequest(r, "admin_delete_video", "video", videoID, nil)

		writeJSON(w, http.StatusOK, map[string]string{"status": "evicted"})
	}
}

func (h *AdminHandler) ListInvites() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := h.db.Query(r.Context(),
			`SELECT token, used_by, expires_at, created_by, created_at
			 FROM invite_tokens ORDER BY created_at DESC`,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch invites")
			return
		}
		defer rows.Close()

		invites := make([]InviteTokenResponse, 0)
		for rows.Next() {
			var inv InviteTokenResponse
			var expiresAt, createdAt time.Time
			if err := rows.Scan(&inv.Token, &inv.UsedBy, &expiresAt, &inv.CreatedBy, &createdAt); err != nil {
				continue
			}
			inv.ExpiresAt = expiresAt.Format(time.RFC3339)
			inv.CreatedAt = createdAt.Format(time.RFC3339)
			invites = append(invites, inv)
		}

		writeJSON(w, http.StatusOK, invites)
	}
}

func (h *AdminHandler) CreateInvite() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req CreateInviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		expiresAt, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "expires_at must be an ISO8601/RFC3339 timestamp")
			return
		}
		if expiresAt.Before(time.Now()) {
			writeError(w, http.StatusBadRequest, "expires_at must be in the future")
			return
		}

		tokenBytes := make([]byte, 32)
		if _, err := rand.Read(tokenBytes); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate token")
			return
		}
		token := hex.EncodeToString(tokenBytes)

		_, err = h.db.Exec(r.Context(),
			`INSERT INTO invite_tokens (token, expires_at, created_by) VALUES ($1, $2, $3)`,
			token, expiresAt, claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create invite")
			return
		}

		h.actLog.RecordFromRequest(r, "admin_create_invite", "invite_token", token,
			map[string]any{"expires_at": req.ExpiresAt})

		writeJSON(w, http.StatusCreated, map[string]string{"token": token, "expires_at": req.ExpiresAt})
	}
}

func (h *AdminHandler) ActivityLog() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		if limit <= 0 || limit > 100 {
			limit = 50
		}
		if offset < 0 {
			offset = 0
		}

		q := middleware.ActivityQuery{
			Action:     r.URL.Query().Get("action"),
			ActorID:    r.URL.Query().Get("actor_id"),
			EntityType: r.URL.Query().Get("entity_type"),
			EntityID:   r.URL.Query().Get("entity_id"),
			Limit:      limit,
			Offset:     offset,
		}

		entries, total, err := h.actLog.Query(r.Context(), q)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch activity log")
			return
		}

		writeJSON(w, http.StatusOK, ActivityLogResponse{
			Entries: entries,
			Total:   total,
			Limit:   limit,
			Offset:  offset,
		})
	}
}



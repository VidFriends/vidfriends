package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/downloader"
	vhash "vidfriends.ai/backend/internal/hash"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/model"
	"vidfriends.ai/backend/internal/storage"
)

type VideoHandler struct {
	db              *pgxpool.Pool
	s3              *storage.Client
	dlManager       *downloader.Manager
	hub             *WSHub
	detector        *vhash.Detector
	maxStorageBytes int64
	maxUploadSize   int64
}

func NewVideoHandler(db *pgxpool.Pool, s3 *storage.Client, dlManager *downloader.Manager, hub *WSHub, detector *vhash.Detector, maxStorageBytes int64, maxUploadSize int64) *VideoHandler {
	return &VideoHandler{db: db, s3: s3, dlManager: dlManager, hub: hub, detector: detector, maxStorageBytes: maxStorageBytes, maxUploadSize: maxUploadSize}
}

type CreateVideoFromLinkRequest struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

type DuplicateInfo struct {
	GroupID      string `json:"group_id"`
	CanonicalID  string `json:"canonical_id"`
	Similarity   int    `json:"similarity"`
}

type UploadVideoResponse struct {
	ID         string         `json:"id"`
	Status     string         `json:"status"`
	UploadURL  string         `json:"upload_url,omitempty"`
	DownloadID string         `json:"download_id,omitempty"`
	Duplicate  *DuplicateInfo `json:"duplicate,omitempty"`
}

type VideoResponse struct {
	ID               string         `json:"id"`
	UserID           string         `json:"user_id"`
	Title            string         `json:"title"`
	Description      string         `json:"description,omitempty"`
	FileURL          string         `json:"file_url,omitempty"`
	ThumbnailURL     string         `json:"thumbnail_url,omitempty"`
	Duration         string         `json:"duration,omitempty"`
	Status           string         `json:"status"`
	SourceURL        string         `json:"source_url,omitempty"`
	SourcePlatform   string         `json:"source_platform,omitempty"`
	DuplicateGroupID *string        `json:"duplicate_group_id,omitempty"`
	CreatedAt        string         `json:"created_at"`
	UpdatedAt        string         `json:"updated_at"`
	LikeCount        int            `json:"like_count,omitempty"`
	CommentCount     int            `json:"comment_count,omitempty"`
	Liked            bool           `json:"liked,omitempty"`
	UserName         string         `json:"user_name,omitempty"`
	IsCanonical      *bool          `json:"is_canonical,omitempty"`
	CanonicalInfo    *CanonicalInfo `json:"canonical_info,omitempty"`
}

type CanonicalInfo struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	UserName string `json:"user_name"`
}

func (h *VideoHandler) Upload() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		if err := r.ParseMultipartForm(100 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse multipart form")
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "file field is required")
			return
		}
		defer file.Close()

		if !strings.HasPrefix(header.Header.Get("Content-Type"), "video/") {
			writeError(w, http.StatusBadRequest, "only video files are accepted")
			return
		}

		fileSize := header.Size

		if h.maxUploadSize > 0 && fileSize > h.maxUploadSize {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file exceeds maximum upload size of %d bytes", h.maxUploadSize))
			return
		}

		// Check instance-level storage quota
		if h.maxStorageBytes > 0 {
			var totalStorage int64
			err := h.db.QueryRow(r.Context(),
				`SELECT COALESCE(SUM(storage_used), 0) FROM users`,
			).Scan(&totalStorage)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to check storage quota")
				return
			}
			if totalStorage+fileSize > h.maxStorageBytes {
				writeError(w, http.StatusForbidden, "Instance storage quota exceeded. Contact an administrator.")
				return
			}
		}

		// Check per-user upload quota
		var userStorageUsed int64
		var uploadQuotaBytes *int64
		err = h.db.QueryRow(r.Context(),
			`SELECT storage_used, upload_quota_bytes FROM users WHERE id = $1`,
			claims.UserID,
		).Scan(&userStorageUsed, &uploadQuotaBytes)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to check user quota")
			return
		}
		if uploadQuotaBytes != nil && userStorageUsed+fileSize > *uploadQuotaBytes {
			writeError(w, http.StatusForbidden, "Upload quota exceeded. Reduce storage usage or request a quota increase.")
			return
		}

		title := r.FormValue("title")
		if title == "" {
			title = header.Filename
		}

		description := r.FormValue("description")

		fileURL, err := h.s3.PutFile(r.Context(), header.Filename, file, fileSize, header.Header.Get("Content-Type"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to store video file")
			return
		}

		var videoID string
		err = h.db.QueryRow(r.Context(),
			`INSERT INTO videos (user_id, title, description, file_url, status)
			 VALUES ($1, $2, $3, $4, 'ready')
			 RETURNING id`,
			claims.UserID, title, description, fileURL,
		).Scan(&videoID)
		if err != nil {
			h.s3.DeferCleanup(fileURL, "video_id", "pending", "reason", "db_insert_failed")
			writeError(w, http.StatusInternalServerError, "failed to create video")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`UPDATE users SET storage_used = storage_used + $1 WHERE id = $2`,
			fileSize, claims.UserID,
		)
		if err != nil {
			slog.Error("failed to update user storage_used", "user_id", claims.UserID, "error", err)
		}

		dupCtx, dupCancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer dupCancel()
		go h.detectAndHandleDuplicate(dupCtx, videoID, fileURL, claims.UserID)

		resp := UploadVideoResponse{
			ID:     videoID,
			Status: "ready",
		}

		writeJSON(w, http.StatusCreated, resp)
	}
}

func (h *VideoHandler) CreateFromLink() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req CreateVideoFromLinkRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.URL == "" {
			writeError(w, http.StatusBadRequest, "url is required")
			return
		}

		platform, err := h.dlManager.ValidateAndDetectPlatform(req.URL)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid URL: %v", err))
			return
		}

		var videoID string
		err = h.db.QueryRow(r.Context(),
			`INSERT INTO videos (user_id, title, description, source_url, source_platform, status)
			 VALUES ($1, $2, $3, $4, $5, 'processing')
			 RETURNING id`,
			claims.UserID, req.Title, req.Description, req.URL, platform,
		).Scan(&videoID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create video")
			return
		}

		var downloadID string
		err = h.db.QueryRow(r.Context(),
			`INSERT INTO downloads (video_id, user_id, source_url, platform, status)
			 VALUES ($1, $2, $3, $4, 'queued')
			 RETURNING id`,
			videoID, claims.UserID, req.URL, platform,
		).Scan(&downloadID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create download record")
			return
		}

		job := downloader.Job{
			ID:        downloadID,
			VideoID:   videoID,
			UserID:    claims.UserID,
			SourceURL: req.URL,
			Platform:  platform,
		}

		if err := h.dlManager.Enqueue(job); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to enqueue download: %v", err))
			return
		}

		writeJSON(w, http.StatusAccepted, UploadVideoResponse{
			ID:         videoID,
			Status:     "processing",
			DownloadID: downloadID,
		})
	}
}

func (h *VideoHandler) Delete() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var ownerID, fileURL, thumbnailURL string
		err := h.db.QueryRow(r.Context(),
			`SELECT user_id, file_url, thumbnail_url FROM videos WHERE id = $1`,
			videoID,
		).Scan(&ownerID, &fileURL, &thumbnailURL)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		if ownerID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "cannot delete another user's video")
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

		_, err = h.db.Exec(r.Context(), `DELETE FROM videos WHERE id = $1`, videoID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete video")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func (h *VideoHandler) Keep() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var ownerID string
		err := h.db.QueryRow(r.Context(),
			`SELECT user_id FROM videos WHERE id = $1`, videoID,
		).Scan(&ownerID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		if ownerID != claims.UserID {
			writeError(w, http.StatusForbidden, "cannot modify another user's video")
			return
		}

		var req struct {
			KeepForever *bool `json:"keep_forever"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.KeepForever == nil {
			writeError(w, http.StatusBadRequest, "keep_forever is required")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`UPDATE videos SET keep_forever = $1, updated_at = now() WHERE id = $2`,
			*req.KeepForever, videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update keep_forever")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status":       "updated",
			"keep_forever": *req.KeepForever,
		})
	}
}

func (h *VideoHandler) GetDetail() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var v VideoResponse
		var createdAt, updatedAt time.Time
		var duration string
		var dupGroupID *string
		err := h.db.QueryRow(r.Context(),
			`SELECT v.id, v.user_id, v.title, v.description, v.file_url,
			        v.thumbnail_url, EXTRACT(EPOCH FROM v.duration)::text, v.status,
			        v.source_url, v.source_platform, v.duplicate_group_id,
			        v.created_at, v.updated_at,
			        u.username,
			        COALESCE(l.like_count, 0) AS like_count,
			        COALESCE(c.comment_count, 0) AS comment_count,
			        EXISTS(SELECT 1 FROM likes WHERE video_id = v.id AND user_id = $1) AS liked
			 FROM videos v
			 JOIN users u ON u.id = v.user_id
			 LEFT JOIN (SELECT video_id, COUNT(*) AS like_count FROM likes GROUP BY video_id) l ON l.video_id = v.id
			 LEFT JOIN (SELECT video_id, COUNT(*) AS comment_count FROM comments GROUP BY video_id) c ON c.video_id = v.id
			 WHERE v.id = $2`,
			claims.UserID, videoID,
		).Scan(&v.ID, &v.UserID, &v.Title, &v.Description, &v.FileURL,
			&v.ThumbnailURL, &duration, &v.Status,
			&v.SourceURL, &v.SourcePlatform, &dupGroupID,
			&createdAt, &updatedAt,
			&v.UserName, &v.LikeCount, &v.CommentCount, &v.Liked)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}
		v.CreatedAt = createdAt.Format(time.RFC3339)
		v.UpdatedAt = updatedAt.Format(time.RFC3339)
		v.Duration = duration
		v.DuplicateGroupID = dupGroupID

		if dupGroupID != nil {
			isCanonical := false
			v.IsCanonical = &isCanonical

			var canonicalID string
			err := h.db.QueryRow(r.Context(),
				`SELECT canonical_id FROM duplicate_groups WHERE id = $1`,
				*dupGroupID,
			).Scan(&canonicalID)
			if err == nil {
				if videoID == canonicalID {
					canonical := true
					v.IsCanonical = &canonical
				} else {
					var ci CanonicalInfo
					err := h.db.QueryRow(r.Context(),
						`SELECT v.id, v.title, u.username
						 FROM videos v
						 JOIN users u ON u.id = v.user_id
						 WHERE v.id = $1`,
						canonicalID,
					).Scan(&ci.ID, &ci.Title, &ci.UserName)
					if err == nil {
						v.CanonicalInfo = &ci
					}
				}
			}
		}

		writeJSON(w, http.StatusOK, v)
	}
}

func (h *VideoHandler) StreamFile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID := r.PathValue("id")

		var fileURL string
		err := h.db.QueryRow(r.Context(),
			`SELECT file_url FROM videos WHERE id = $1 AND status = 'ready'`,
			videoID,
		).Scan(&fileURL)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found or not ready")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		reader, size, contentType, err := h.s3.GetFile(r.Context(), fileURL)
		if err != nil {
			slog.Error("failed to get file", "file_url", fileURL, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to retrieve video file")
			return
		}
		defer reader.Close()

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
		w.Header().Set("Accept-Ranges", "bytes")
		w.WriteHeader(http.StatusOK)

		io.Copy(w, reader)
	}
}

type FeedResponse struct {
	Videos        []VideoResponse `json:"videos"`
	NextPageToken string          `json:"next_page_token,omitempty"`
}

func (h *VideoHandler) GetFeed() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		pageSize := 20
		if ps := r.URL.Query().Get("page_size"); ps != "" {
			if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 100 {
				pageSize = parsed
			}
		}

		query := `SELECT v.id, v.user_id, v.title, v.description, v.thumbnail_url,
				  v.status, v.created_at, v.updated_at, u.username,
				  COALESCE(l.like_count, 0) AS like_count,
				  COALESCE(c.comment_count, 0) AS comment_count
			   FROM videos v
			   JOIN users u ON u.id = v.user_id
			   LEFT JOIN (SELECT video_id, COUNT(*) AS like_count FROM likes GROUP BY video_id) l ON l.video_id = v.id
			   LEFT JOIN (SELECT video_id, COUNT(*) AS comment_count FROM comments GROUP BY video_id) c ON c.video_id = v.id
			   WHERE v.status = 'ready'
			     AND v.id NOT IN (
			       SELECT video_id FROM watch_history WHERE user_id = $1
			     )`
		args := []any{claims.UserID}

		pageToken := r.URL.Query().Get("page_token")
		if pageToken != "" {
			decoded, err := decodeCursor(pageToken)
			if err == nil && decoded != "" {
				query += ` AND v.created_at < $2`
				args = append(args, decoded)
			}
		}

		query += ` ORDER BY v.created_at DESC LIMIT $` + strconv.Itoa(len(args)+1)
		args = append(args, pageSize+1)

		rows, err := h.db.Query(r.Context(), query, args...)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch feed")
			return
		}
		defer rows.Close()

		videos := make([]VideoResponse, 0, pageSize)
		for rows.Next() {
			var v VideoResponse
			var createdAt, updatedAt time.Time
			if err := rows.Scan(&v.ID, &v.UserID, &v.Title, &v.Description, &v.ThumbnailURL,
				&v.Status, &createdAt, &updatedAt, &v.UserName,
				&v.LikeCount, &v.CommentCount); err != nil {
				continue
			}
			v.CreatedAt = createdAt.Format(time.RFC3339)
			v.UpdatedAt = updatedAt.Format(time.RFC3339)
			videos = append(videos, v)
		}

		var nextPageToken string
		if len(videos) > pageSize {
			videos = videos[:pageSize]
			nextPageToken = encodeCursor(videos[len(videos)-1].CreatedAt)
		}

		resp := FeedResponse{
			Videos:        videos,
			NextPageToken: nextPageToken,
		}
		if resp.Videos == nil {
			resp.Videos = []VideoResponse{}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

func (h *VideoHandler) Like() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		_, err := h.db.Exec(r.Context(),
			`INSERT INTO likes (user_id, video_id) VALUES ($1, $2)
			 ON CONFLICT (user_id, video_id) DO NOTHING`,
			claims.UserID, videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to like video")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "liked"})
	}
}

func (h *VideoHandler) Unlike() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		_, err := h.db.Exec(r.Context(),
			`DELETE FROM likes WHERE user_id = $1 AND video_id = $2`,
			claims.UserID, videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to unlike video")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "unliked"})
	}
}

func (h *VideoHandler) Comment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var req struct {
			Body     string  `json:"body"`
			ParentID *string `json:"parent_id,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Body == "" {
			writeError(w, http.StatusBadRequest, "body is required")
			return
		}

		var commentID string
		var createdAt time.Time
		err := h.db.QueryRow(r.Context(),
			`INSERT INTO comments (user_id, video_id, parent_id, body)
			 VALUES ($1, $2, NULLIF($3, '')::uuid, $4)
			 RETURNING id, created_at`,
			claims.UserID, videoID, coalesceStr(req.ParentID), req.Body,
		).Scan(&commentID, &createdAt)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create comment")
			return
		}

		writeJSON(w, http.StatusCreated, map[string]string{
			"id":         commentID,
			"created_at": createdAt.Format(time.RFC3339),
		})
	}
}

type CommentNode struct {
	ID        string         `json:"id"`
	UserID    string         `json:"user_id"`
	UserName  string         `json:"user_name"`
	Body      string         `json:"body"`
	CreatedAt string         `json:"created_at"`
	Replies   []*CommentNode `json:"replies,omitempty"`
}

func (h *VideoHandler) GetComments() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID := r.PathValue("id")

		rows, err := h.db.Query(r.Context(),
			`SELECT c.id, c.user_id, c.parent_id::text, c.body, c.created_at, u.username
			 FROM comments c
			 JOIN users u ON u.id = c.user_id
			 WHERE c.video_id = $1
			 ORDER BY c.created_at ASC`,
			videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch comments")
			return
		}
		defer rows.Close()

		type flatComment struct {
			ID        string
			UserID    string
			UserName  string
			ParentID  *string
			Body      string
			CreatedAt time.Time
		}

		var flat []flatComment
		for rows.Next() {
			var c flatComment
			var parentID *string
			if err := rows.Scan(&c.ID, &c.UserID, &parentID, &c.Body, &c.CreatedAt, &c.UserName); err != nil {
				continue
			}
			c.ParentID = parentID
			flat = append(flat, c)
		}

		if flat == nil {
			flat = []flatComment{}
		}

		nodeMap := make(map[string]*CommentNode, len(flat))
		var roots []*CommentNode

		for _, f := range flat {
			node := &CommentNode{
				ID:        f.ID,
				UserID:    f.UserID,
				UserName:  f.UserName,
				Body:      f.Body,
				CreatedAt: f.CreatedAt.Format(time.RFC3339),
				Replies:   []*CommentNode{},
			}
			nodeMap[f.ID] = node
		}

		for _, f := range flat {
			node := nodeMap[f.ID]
			if f.ParentID != nil {
				parent, ok := nodeMap[*f.ParentID]
				if ok {
					parent.Replies = append(parent.Replies, node)
				} else {
					roots = append(roots, node)
				}
			} else {
				roots = append(roots, node)
			}
		}

		for _, r := range roots {
			if len(r.Replies) == 0 {
				r.Replies = nil
			}
		}

		if roots == nil {
			roots = []*CommentNode{}
		}

		writeJSON(w, http.StatusOK, roots)
	}
}

func (h *VideoHandler) MarkWatched() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var req struct {
			ProgressSeconds int `json:"progress_seconds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			req.ProgressSeconds = 0
		}

		_, err := h.db.Exec(r.Context(),
			`INSERT INTO watch_history (user_id, video_id, progress_seconds)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, video_id)
			 DO UPDATE SET watched_at = now(), progress_seconds = EXCLUDED.progress_seconds`,
			claims.UserID, videoID, req.ProgressSeconds,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to mark watched")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "watched"})
	}
}

type HistoryResponse struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	ThumbnailURL    string `json:"thumbnail_url,omitempty"`
	UserName        string `json:"user_name"`
	UserID          string `json:"user_id"`
	WatchedAt       string `json:"watched_at"`
	ProgressSeconds int    `json:"progress_seconds"`
}

func (h *VideoHandler) GetHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		q := strings.TrimSpace(r.URL.Query().Get("q"))
		friend := strings.TrimSpace(r.URL.Query().Get("friend"))
		dateFrom := strings.TrimSpace(r.URL.Query().Get("date_from"))
		dateTo := strings.TrimSpace(r.URL.Query().Get("date_to"))

		limit := 20
		offset := 0
		if l := r.URL.Query().Get("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
				limit = parsed
			}
		}
		if o := r.URL.Query().Get("offset"); o != "" {
			if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
				offset = parsed
			}
		}

		query := `SELECT v.id, v.title, v.thumbnail_url, u.username, u.id,
			         wh.watched_at, wh.progress_seconds
			 FROM watch_history wh
			 JOIN videos v ON v.id = wh.video_id
			 JOIN users u ON u.id = v.user_id
			 WHERE wh.user_id = $1`
		args := []any{claims.UserID}
		argIdx := 2

		if q != "" {
			query += fmt.Sprintf(` AND (v.title ILIKE $%d OR v.description ILIKE $%d)`, argIdx, argIdx)
			args = append(args, "%"+q+"%")
			argIdx++
		}
		if friend != "" {
			query += fmt.Sprintf(` AND u.username ILIKE $%d`, argIdx)
			args = append(args, "%"+friend+"%")
			argIdx++
		}
		if dateFrom != "" {
			query += fmt.Sprintf(` AND wh.watched_at >= $%d`, argIdx)
			args = append(args, dateFrom)
			argIdx++
		}
		if dateTo != "" {
			query += fmt.Sprintf(` AND wh.watched_at <= $%d`, argIdx)
			args = append(args, dateTo)
			argIdx++
		}

		query += fmt.Sprintf(` ORDER BY wh.watched_at DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
		args = append(args, limit, offset)

		rows, err := h.db.Query(r.Context(), query, args...)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch history")
			return
		}
		defer rows.Close()

		history := make([]HistoryResponse, 0)
		for rows.Next() {
			var h HistoryResponse
			var watchedAt time.Time
			if err := rows.Scan(&h.ID, &h.Title, &h.ThumbnailURL, &h.UserName, &h.UserID,
				&watchedAt, &h.ProgressSeconds); err != nil {
				continue
			}
			h.WatchedAt = watchedAt.Format(time.RFC3339)
			history = append(history, h)
		}

		writeJSON(w, http.StatusOK, history)
	}
}

func (h *VideoHandler) GetDownload() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var d model.Download
		var startedAt, completedAt *time.Time
		err := h.db.QueryRow(r.Context(),
			`SELECT id, video_id, user_id, source_url, platform, status,
			        error_message, file_path, file_size, started_at, completed_at,
			        created_at, updated_at
			 FROM downloads
			 WHERE video_id = $1 AND user_id = $2
			 ORDER BY created_at DESC
			 LIMIT 1`,
			videoID, claims.UserID,
		).Scan(&d.ID, &d.VideoID, &d.UserID, &d.SourceURL, &d.Platform,
			&d.Status, &d.ErrorMessage, &d.FilePath, &d.FileSize,
			&startedAt, &completedAt, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "download not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch download")
			return
		}
		d.StartedAt = startedAt
		d.CompletedAt = completedAt

		writeJSON(w, http.StatusOK, d)
	}
}

func (h *VideoHandler) CancelDownload() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		downloadID := r.PathValue("downloadId")

		var ownerID string
		err := h.db.QueryRow(r.Context(),
			`SELECT user_id FROM downloads WHERE id = $1`, downloadID,
		).Scan(&ownerID)
		if err != nil {
			writeError(w, http.StatusNotFound, "download not found")
			return
		}
		if ownerID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "not authorized to cancel this download")
			return
		}

		if err := h.dlManager.Cancel(downloadID); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
	}
}

func (h *VideoHandler) DeleteComment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		commentID := r.PathValue("id")

		var ownerID string
		err := h.db.QueryRow(r.Context(),
			`SELECT user_id FROM comments WHERE id = $1`, commentID,
		).Scan(&ownerID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "comment not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch comment")
			return
		}

		if ownerID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "cannot delete another user's comment")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`DELETE FROM comments WHERE id = $1`, commentID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete comment")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func (h *VideoHandler) GetVideoLikes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID := r.PathValue("id")

		rows, err := h.db.Query(r.Context(),
			`SELECT u.id, u.username, u.avatar_url, l.created_at
			 FROM likes l
			 JOIN users u ON u.id = l.user_id
			 WHERE l.video_id = $1
			 ORDER BY l.created_at DESC`,
			videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch likes")
			return
		}
		defer rows.Close()

		type LikeUserResponse struct {
			UserID    string  `json:"user_id"`
			Username  string  `json:"username"`
			AvatarURL *string `json:"avatar_url,omitempty"`
			CreatedAt string  `json:"created_at"`
		}

		likes := make([]LikeUserResponse, 0)
		for rows.Next() {
			var l LikeUserResponse
			var createdAt time.Time
			if err := rows.Scan(&l.UserID, &l.Username, &l.AvatarURL, &createdAt); err != nil {
				continue
			}
			l.CreatedAt = createdAt.Format(time.RFC3339)
			likes = append(likes, l)
		}

		writeJSON(w, http.StatusOK, likes)
	}
}

func (h *VideoHandler) AddReaction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		var req struct {
			Emoji string `json:"emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Emoji == "" {
			writeError(w, http.StatusBadRequest, "emoji is required")
			return
		}

		_, err := h.db.Exec(r.Context(),
			`INSERT INTO reactions (user_id, video_id, emoji)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, video_id)
			 DO UPDATE SET emoji = EXCLUDED.emoji, updated_at = now()`,
			claims.UserID, videoID, req.Emoji,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add reaction")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "reacted", "emoji": req.Emoji})
	}
}

func (h *VideoHandler) RemoveReaction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		videoID := r.PathValue("id")

		_, err := h.db.Exec(r.Context(),
			`DELETE FROM reactions WHERE user_id = $1 AND video_id = $2`,
			claims.UserID, videoID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to remove reaction")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
	}
}

func (h *VideoHandler) Unsend() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		sendID := r.PathValue("id")

		var senderID, recipientID, videoID string
		err := h.db.QueryRow(r.Context(),
			`SELECT sender_id, recipient_id, video_id FROM received_videos WHERE id = $1`,
			sendID,
		).Scan(&senderID, &recipientID, &videoID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "send not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch send")
			return
		}

		if senderID != claims.UserID {
			writeError(w, http.StatusForbidden, "can only unsend your own sends")
			return
		}

		var watched bool
		err = h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM watch_history WHERE user_id = $1 AND video_id = $2)`,
			recipientID, videoID,
		).Scan(&watched)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to check watch status")
			return
		}
		if watched {
			writeError(w, http.StatusBadRequest, "cannot unsend after recipient has watched the video")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`DELETE FROM received_videos WHERE id = $1`, sendID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to unsend")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "unsent"})
	}
}

func (h *VideoHandler) detectAndHandleDuplicate(ctx context.Context, videoID, fileURL, ownerUserID string) {
	if h.detector == nil {
		return
	}

	tmpFile, err := downloadToTemp(ctx, fileURL, h.s3)
	if err != nil {
		slog.Error("failed to download video for phash", "video_id", videoID, "error", err)
		return
	}
	defer os.Remove(tmpFile)

	phash, err := vhash.Compute(ctx, tmpFile)
	if err != nil {
		slog.Error("failed to compute phash", "video_id", videoID, "error", err)
		return
	}

	if err := h.detector.SaveHash(ctx, videoID, phash); err != nil {
		slog.Error("failed to save phash", "video_id", videoID, "error", err)
		return
	}

	result, err := h.detector.Check(ctx, videoID, phash)
	if err != nil {
		slog.Error("failed to check duplicates", "video_id", videoID, "error", err)
		return
	}

	if !result.IsDuplicate {
		return
	}

	group, err := h.detector.CreateOrJoinGroup(ctx, videoID, result.CanonicalID)
	if err != nil {
		slog.Error("failed to create/join group", "video_id", videoID, "error", err)
		return
	}

	if err := h.detector.MergeSocial(ctx, videoID, result.CanonicalID); err != nil {
		slog.Error("failed to merge social data", "video_id", videoID, "error", err)
	}

	slog.Info("duplicate processed",
		"video_id", videoID,
		"group_id", group.ID,
		"canonical_id", result.CanonicalID,
		"similarity", result.Similarity,
	)

	if h.hub != nil && ownerUserID != "" {
		h.hub.SendToUser(ownerUserID, Notification{
			Type: "duplicate_detected",
			Payload: map[string]string{
				"video_id":    videoID,
				"canonical_id": result.CanonicalID,
				"group_id":    group.ID,
			},
		})
	}
}

func downloadToTemp(ctx context.Context, fileURL string, s3 *storage.Client) (string, error) {
	reader, size, _, err := s3.GetFile(ctx, fileURL)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	f, err := os.CreateTemp("", "vidfriends_phash_*.mp4")
	if err != nil {
		return "", err
	}
	defer f.Close()

	written, err := io.Copy(f, reader)
	if err != nil {
		os.Remove(f.Name())
		return "", err
	}
	if written != size {
		os.Remove(f.Name())
		return "", fmt.Errorf("downloaded %d bytes, expected %d", written, size)
	}

	return f.Name(), nil
}

func extractFilename(url string) string {
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "Untitled"
}

func coalesceStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}



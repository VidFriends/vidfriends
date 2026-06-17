package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
)

type SocialHandler struct {
	db *pgxpool.Pool
}

func NewSocialHandler(db *pgxpool.Pool) *SocialHandler {
	return &SocialHandler{db: db}
}

type InviteRequest struct {
	Username string `json:"username"`
}

type InviteResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (h *SocialHandler) Invite() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Username == "" {
			writeError(w, http.StatusBadRequest, "username is required")
			return
		}

		var addresseeID string
		err := h.db.QueryRow(r.Context(),
			`SELECT id FROM users WHERE username = $1`, req.Username,
		).Scan(&addresseeID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query user")
			return
		}

		if addresseeID == claims.UserID {
			writeError(w, http.StatusBadRequest, "cannot send friend request to yourself")
			return
		}

		var blocked bool
		err = h.db.QueryRow(r.Context(),
			`SELECT EXISTS(
				SELECT 1 FROM friends
				WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'
			)`,
			addresseeID, claims.UserID,
		).Scan(&blocked)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to check block status")
			return
		}
		if blocked {
			writeError(w, http.StatusForbidden, "cannot send friend request")
			return
		}

		var existingStatus string
		err = h.db.QueryRow(r.Context(),
			`SELECT status FROM friends
			 WHERE (requester_id = $1 AND addressee_id = $2)
			    OR (requester_id = $2 AND addressee_id = $1)`,
			claims.UserID, addresseeID,
		).Scan(&existingStatus)
		if err == nil {
			switch existingStatus {
			case "accepted":
				writeError(w, http.StatusConflict, "already friends")
			case "pending":
				writeError(w, http.StatusConflict, "friend request already pending")
			case "blocked":
				writeError(w, http.StatusForbidden, "cannot send friend request")
			}
			return
		}

		var friendID string
		var createdAt time.Time
		err = h.db.QueryRow(r.Context(),
			`INSERT INTO friends (requester_id, addressee_id, status)
			 VALUES ($1, $2, 'pending')
			 RETURNING id, created_at`,
			claims.UserID, addresseeID,
		).Scan(&friendID, &createdAt)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				writeError(w, http.StatusConflict, "friend request already exists")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to create friend request")
			return
		}

		writeJSON(w, http.StatusCreated, InviteResponse{
			ID:        friendID,
			Username:  req.Username,
			Status:    "pending",
			CreatedAt: createdAt.Format(time.RFC3339),
		})
	}
}

type AcceptRequest struct {
	Action string `json:"action"`
}

func (h *SocialHandler) Accept() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		requestID := r.PathValue("id")

		var requesterID, status string
		err := h.db.QueryRow(r.Context(),
			`SELECT requester_id, status FROM friends WHERE id = $1 AND addressee_id = $2`,
			requestID, claims.UserID,
		).Scan(&requesterID, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "friend request not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to query friend request")
			return
		}
		if status != "pending" {
			writeError(w, http.StatusBadRequest, "friend request is not pending")
			return
		}

		var req AcceptRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		var newStatus string
		switch req.Action {
		case "accept":
			newStatus = "accepted"
		case "decline":
			newStatus = "declined"
		default:
			writeError(w, http.StatusBadRequest, "action must be 'accept' or 'decline'")
			return
		}

		if newStatus == "declined" {
			_, err = h.db.Exec(r.Context(),
				`DELETE FROM friends WHERE id = $1`, requestID,
			)
		} else {
			_, err = h.db.Exec(r.Context(),
				`UPDATE friends SET status = $1, updated_at = now() WHERE id = $2`,
				newStatus, requestID,
			)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update friend request")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": newStatus})
	}
}

type FriendResponse struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (h *SocialHandler) ListFriends() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		rows, err := h.db.Query(r.Context(),
			`SELECT f.id,
			        CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS friend_id,
			        u.username,
			        f.status,
			        f.created_at
			 FROM friends f
			 JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
			 WHERE (f.requester_id = $1 OR f.addressee_id = $1)
			   AND f.status = 'accepted'
			 ORDER BY f.created_at DESC`,
			claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch friends")
			return
		}
		defer rows.Close()

		friends := make([]FriendResponse, 0)
		for rows.Next() {
			var f FriendResponse
			var createdAt time.Time
			if err := rows.Scan(&f.ID, &f.UserID, &f.Username, &f.Status, &createdAt); err != nil {
				continue
			}
			f.CreatedAt = createdAt.Format(time.RFC3339)
			friends = append(friends, f)
		}

		writeJSON(w, http.StatusOK, friends)
	}
}

func (h *SocialHandler) PendingRequests() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		rows, err := h.db.Query(r.Context(),
			`SELECT f.id, u.id, u.username, f.status, f.created_at
			 FROM friends f
			 JOIN users u ON u.id = f.requester_id
			 WHERE f.addressee_id = $1 AND f.status = 'pending'
			 ORDER BY f.created_at DESC`,
			claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch pending requests")
			return
		}
		defer rows.Close()

		requests := make([]FriendResponse, 0)
		for rows.Next() {
			var f FriendResponse
			var createdAt time.Time
			if err := rows.Scan(&f.ID, &f.UserID, &f.Username, &f.Status, &createdAt); err != nil {
				continue
			}
			f.CreatedAt = createdAt.Format(time.RFC3339)
			requests = append(requests, f)
		}

		writeJSON(w, http.StatusOK, requests)
	}
}

func (h *SocialHandler) Block() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		userID := r.PathValue("id")

		if userID == claims.UserID {
			writeError(w, http.StatusBadRequest, "cannot block yourself")
			return
		}

		var targetExists bool
		err := h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, userID,
		).Scan(&targetExists)
		if err != nil || !targetExists {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`DELETE FROM friends
			 WHERE (requester_id = $1 AND addressee_id = $2)
			    OR (requester_id = $2 AND addressee_id = $1)`,
			claims.UserID, userID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to block user")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`INSERT INTO friends (requester_id, addressee_id, status)
			 VALUES ($1, $2, 'blocked')`,
			claims.UserID, userID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to block user")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "blocked"})
	}
}

type SendVideoRequest struct {
	VideoID string `json:"video_id"`
	Caption string `json:"caption,omitempty"`
}

func (h *SocialHandler) Send() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req SendVideoRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.VideoID == "" {
			writeError(w, http.StatusBadRequest, "video_id is required")
			return
		}

		recipientID := r.PathValue("id")

		if recipientID == claims.UserID {
			writeError(w, http.StatusBadRequest, "cannot send video to yourself")
			return
		}

		var isFriend bool
		err := h.db.QueryRow(r.Context(),
			`SELECT EXISTS(
				SELECT 1 FROM friends
				WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
				AND status = 'accepted'
			)`,
			claims.UserID, recipientID,
		).Scan(&isFriend)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to check friendship")
			return
		}
		if !isFriend {
			writeError(w, http.StatusForbidden, "can only send videos to friends")
			return
		}

		var videoExists bool
		err = h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM videos WHERE id = $1 AND user_id = $2)`,
			req.VideoID, claims.UserID,
		).Scan(&videoExists)
		if err != nil || !videoExists {
			writeError(w, http.StatusNotFound, "video not found or not yours")
			return
		}

		var receivedID string
		var createdAt time.Time
		err = h.db.QueryRow(r.Context(),
			`INSERT INTO received_videos (video_id, sender_id, recipient_id, caption)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, created_at`,
			req.VideoID, claims.UserID, recipientID, coalesceStr(&req.Caption),
		).Scan(&receivedID, &createdAt)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				writeError(w, http.StatusConflict, "video already sent to this friend")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to send video")
			return
		}

		writeJSON(w, http.StatusCreated, map[string]string{
			"id":         receivedID,
			"created_at": createdAt.Format(time.RFC3339),
		})
	}
}

type ReceivedVideoResponse struct {
	ID          string  `json:"id"`
	VideoID     string  `json:"video_id"`
	Title       string  `json:"title"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	SenderID    string  `json:"sender_id"`
	SenderName  string  `json:"sender_name"`
	Caption     *string `json:"caption,omitempty"`
	ReadAt      *string `json:"read_at,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

func (h *SocialHandler) Inbox() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

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

		rows, err := h.db.Query(r.Context(),
			`SELECT rv.id, rv.video_id, v.title, v.thumbnail_url,
			        rv.sender_id, u.username,
			        rv.caption, rv.read_at, rv.created_at
			 FROM received_videos rv
			 JOIN videos v ON v.id = rv.video_id
			 JOIN users u ON u.id = rv.sender_id
			 WHERE rv.recipient_id = $1
			 ORDER BY rv.created_at DESC
			 LIMIT $2 OFFSET $3`,
			claims.UserID, limit, offset,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch inbox")
			return
		}
		defer rows.Close()

		inbox := make([]ReceivedVideoResponse, 0)
		for rows.Next() {
			var item ReceivedVideoResponse
			var caption *string
			var readAt *time.Time
			var createdAt time.Time
			if err := rows.Scan(&item.ID, &item.VideoID, &item.Title, &item.ThumbnailURL,
				&item.SenderID, &item.SenderName, &caption, &readAt, &createdAt); err != nil {
				continue
			}
			if caption != nil && *caption != "" {
				item.Caption = caption
			}
			if readAt != nil {
				f := readAt.Format(time.RFC3339)
				item.ReadAt = &f
			}
			item.CreatedAt = createdAt.Format(time.RFC3339)
			inbox = append(inbox, item)
		}

		writeJSON(w, http.StatusOK, inbox)
	}
}

func (h *SocialHandler) SearchUsers() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeError(w, http.StatusBadRequest, "query parameter q is required")
			return
		}

		rows, err := h.db.Query(r.Context(),
			`SELECT id, username, display_name, avatar_url
			 FROM users
			 WHERE username ILIKE '%' || $1 || '%'
			 ORDER BY username ASC
			 LIMIT 20`,
			q,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to search users")
			return
		}
		defer rows.Close()

		type UserSearchResult struct {
			ID          string  `json:"id"`
			Username    string  `json:"username"`
			DisplayName string  `json:"display_name,omitempty"`
			AvatarURL   string  `json:"avatar_url,omitempty"`
		}

		users := make([]UserSearchResult, 0)
		for rows.Next() {
			var u UserSearchResult
			if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
				continue
			}
			users = append(users, u)
		}

		writeJSON(w, http.StatusOK, users)
	}
}

type InboxActionRequest struct {
	Action string `json:"action"`
}

func (h *SocialHandler) HandleInboxItem() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		inboxID := r.PathValue("id")

		var recipientID string
		err := h.db.QueryRow(r.Context(),
			`SELECT recipient_id FROM received_videos WHERE id = $1`,
			inboxID,
		).Scan(&recipientID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inbox item not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch inbox item")
			return
		}

		if recipientID != claims.UserID {
			writeError(w, http.StatusForbidden, "cannot modify another user's inbox")
			return
		}

		var req InboxActionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		switch req.Action {
		case "accept":
			_, err = h.db.Exec(r.Context(),
				`UPDATE received_videos SET read_at = now() WHERE id = $1`,
				inboxID,
			)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to accept inbox item")
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
		case "reject":
			_, err = h.db.Exec(r.Context(),
				`DELETE FROM received_videos WHERE id = $1`,
				inboxID,
			)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to reject inbox item")
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
		default:
			writeError(w, http.StatusBadRequest, "action must be 'accept' or 'reject'")
		}
	}
}

func (h *SocialHandler) MarkAsRead() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		inboxID := r.PathValue("id")

		var recipientID string
		err := h.db.QueryRow(r.Context(),
			`SELECT recipient_id FROM received_videos WHERE id = $1`,
			inboxID,
		).Scan(&recipientID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inbox item not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch inbox item")
			return
		}

		if recipientID != claims.UserID {
			writeError(w, http.StatusForbidden, "cannot modify another user's inbox")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`UPDATE received_videos SET read_at = now() WHERE id = $1`,
			inboxID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to mark as read")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (h *SocialHandler) FYPFeed() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		rows, err := h.db.Query(r.Context(),
			`SELECT v.id, v.user_id, v.title, v.description, v.thumbnail_url,
			        v.status, v.created_at, v.updated_at, u.username,
			        COALESCE(l.like_count, 0) AS like_count,
			        COALESCE(c.comment_count, 0) AS comment_count
			 FROM received_videos rv
			 JOIN videos v ON v.id = rv.video_id
			 JOIN users u ON u.id = v.user_id
			 LEFT JOIN (SELECT video_id, COUNT(*) AS like_count FROM likes GROUP BY video_id) l ON l.video_id = v.id
			 LEFT JOIN (SELECT video_id, COUNT(*) AS comment_count FROM comments GROUP BY video_id) c ON c.video_id = v.id
			 WHERE rv.recipient_id = $1
			   AND v.status = 'ready'
			   AND v.id NOT IN (
			     SELECT video_id FROM watch_history WHERE user_id = $1
			   )
			 ORDER BY rv.created_at DESC
			 LIMIT 50`,
			claims.UserID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch FYP feed")
			return
		}
		defer rows.Close()

		videos := make([]VideoResponse, 0)
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

		writeJSON(w, http.StatusOK, videos)
	}
}

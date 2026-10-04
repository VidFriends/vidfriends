package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/middleware"
)

type DuplicateHandler struct {
	db *pgxpool.Pool
}

func NewDuplicateHandler(db *pgxpool.Pool) *DuplicateHandler {
	return &DuplicateHandler{db: db}
}

type DuplicateGroupResponse struct {
	ID             string                    `json:"id"`
	CanonicalID    string                    `json:"canonical_id"`
	Members        []DuplicateMemberResponse `json:"members"`
	MemberCount    int                       `json:"member_count"`
	CreatedAt      string                    `json:"created_at"`
	UpdatedAt      string                    `json:"updated_at"`
}

type DuplicateMemberResponse struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	UserName     string `json:"user_name"`
	Title        string `json:"title"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	IsCanonical  bool   `json:"is_canonical"`
	CreatedAt    string `json:"created_at"`
}

func (h *DuplicateHandler) GetGroup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		groupID := r.PathValue("id")

		var canonicalID string
		var createdAt, updatedAt time.Time
		err := h.db.QueryRow(r.Context(),
			`SELECT id, canonical_id, created_at, updated_at
			 FROM duplicate_groups WHERE id = $1`,
			groupID,
		).Scan(&groupID, &canonicalID, &createdAt, &updatedAt)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "group not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch group")
			return
		}

		writeDuplicateGroup(w, h.db, r, groupID, canonicalID, createdAt, updatedAt)
	}
}

func (h *DuplicateHandler) GetGroupForVideo() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		videoID := r.PathValue("id")

		var groupID *string
		err := h.db.QueryRow(r.Context(),
			`SELECT duplicate_group_id FROM videos WHERE id = $1`,
			videoID,
		).Scan(&groupID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "video not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		if groupID == nil {
			writeJSON(w, http.StatusOK, map[string]any{"group": nil})
			return
		}

		var canonicalID string
		var createdAt, updatedAt time.Time
		err = h.db.QueryRow(r.Context(),
			`SELECT id, canonical_id, created_at, updated_at
			 FROM duplicate_groups WHERE id = $1`,
			*groupID,
		).Scan(groupID, &canonicalID, &createdAt, &updatedAt)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusNotFound, "group not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch group")
			return
		}

		writeDuplicateGroup(w, h.db, r, *groupID, canonicalID, createdAt, updatedAt)
	}
}

func writeDuplicateGroup(w http.ResponseWriter, db *pgxpool.Pool, r *http.Request, groupID, canonicalID string, createdAt, updatedAt time.Time) {
	rows, err := db.Query(r.Context(),
		`SELECT v.id, v.user_id, u.username, v.title, v.thumbnail_url, v.created_at
		 FROM videos v
		 JOIN users u ON u.id = v.user_id
		 WHERE v.duplicate_group_id = $1
		 ORDER BY v.created_at ASC`,
		groupID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch members")
		return
	}
	defer rows.Close()

	members := make([]DuplicateMemberResponse, 0)
	for rows.Next() {
		var m DuplicateMemberResponse
		var memCreatedAt time.Time
		if err := rows.Scan(&m.ID, &m.UserID, &m.UserName, &m.Title, &m.ThumbnailURL, &memCreatedAt); err != nil {
			continue
		}
		m.IsCanonical = m.ID == canonicalID
		m.CreatedAt = memCreatedAt.Format(time.RFC3339)
		members = append(members, m)
	}

	if members == nil {
		members = []DuplicateMemberResponse{}
	}

	resp := DuplicateGroupResponse{
		ID:          groupID,
		CanonicalID: canonicalID,
		Members:     members,
		MemberCount: len(members),
		CreatedAt:   createdAt.Format(time.RFC3339),
		UpdatedAt:   updatedAt.Format(time.RFC3339),
	}

	writeJSON(w, http.StatusOK, resp)
}

type SetCanonicalRequest struct {
	VideoID string `json:"video_id"`
}

func (h *DuplicateHandler) SetCanonical() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		groupID := r.PathValue("id")

		var req SetCanonicalRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.VideoID == "" {
			writeError(w, http.StatusBadRequest, "video_id is required")
			return
		}

		var groupExists bool
		err := h.db.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM duplicate_groups WHERE id = $1)`,
			groupID,
		).Scan(&groupExists)
		if err != nil || !groupExists {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}

		var videoOwnerID string
		err = h.db.QueryRow(r.Context(),
			`SELECT user_id FROM videos WHERE id = $1 AND duplicate_group_id = $2`,
			req.VideoID, groupID,
		).Scan(&videoOwnerID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusBadRequest, "video is not a member of this group")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to fetch video")
			return
		}

		if videoOwnerID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "you do not own this video")
			return
		}

		_, err = h.db.Exec(r.Context(),
			`UPDATE duplicate_groups SET canonical_id = $1, updated_at = now() WHERE id = $2`,
			req.VideoID, groupID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update canonical")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "updated", "canonical_id": req.VideoID})
	}
}

package handler

import (
	"encoding/json"
	"net/http"

	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/importer"
	"vidfriends.ai/backend/internal/middleware"
)

type ImportHandler struct {
	importer *importer.Manager
}

func NewImportHandler(importer *importer.Manager) *ImportHandler {
	return &ImportHandler{importer: importer}
}

type createImportRequest struct {
	Provider      string `json:"provider"`
	PlaylistID    string `json:"playlist_id"`
	PlaylistTitle string `json:"playlist_title"`
}

func (h *ImportHandler) CreateJob() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		var req createImportRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Provider == "" || req.PlaylistID == "" {
			writeError(w, http.StatusBadRequest, "provider and playlist_id are required")
			return
		}

		job, err := h.importer.CreateJob(r.Context(), claims.UserID, req.Provider, req.PlaylistID, req.PlaylistTitle)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create import job")
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"job_id":                  job.ID,
			"provider":                job.Provider,
			"source_playlist_id":      job.SourcePlaylistID,
			"source_playlist_title":   job.SourcePlaylistTitle,
			"status":                  job.Status,
		})
	}
}

func (h *ImportHandler) ListJobs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)

		jobs, err := h.importer.ListJobs(r.Context(), claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list import jobs")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
	}
}

func (h *ImportHandler) GetJob() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		jobID := r.PathValue("jobId")

		job, err := h.importer.GetJob(r.Context(), jobID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get job")
			return
		}
		if job == nil {
			writeError(w, http.StatusNotFound, "job not found")
			return
		}
		if job.UserID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		items, err := h.importer.ListJobItems(r.Context(), jobID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list job items")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"job":   job,
			"items": items,
		})
	}
}

func (h *ImportHandler) CancelJob() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(middleware.UserClaimsKey).(*auth.Claims)
		jobID := r.PathValue("jobId")

		job, err := h.importer.GetJob(r.Context(), jobID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get job")
			return
		}
		if job == nil {
			writeError(w, http.StatusNotFound, "job not found")
			return
		}
		if job.UserID != claims.UserID && claims.Role != "admin" {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if err := h.importer.CancelJob(r.Context(), jobID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to cancel job")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
	}
}

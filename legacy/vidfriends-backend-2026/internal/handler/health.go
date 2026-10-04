package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
}

func Health(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "ok"
		if err := db.Ping(r.Context()); err != nil {
			dbStatus = "error: " + err.Error()
		}

		status := "ok"
		if dbStatus != "ok" {
			status = "degraded"
		}

		w.Header().Set("Content-Type", "application/json")

		if status != "ok" {
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			w.WriteHeader(http.StatusOK)
		}

		json.NewEncoder(w).Encode(HealthResponse{
			Status:   status,
			Database: dbStatus,
		})
	}
}

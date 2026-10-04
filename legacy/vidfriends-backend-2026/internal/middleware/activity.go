package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
)

type ActivityLogger struct {
	db *pgxpool.Pool
}

func NewActivityLogger(db *pgxpool.Pool) *ActivityLogger {
	return &ActivityLogger{db: db}
}

type ActivityEntry struct {
	ID         string          `json:"id"`
	ActorID    *string         `json:"actor_id,omitempty"`
	ActorEmail string          `json:"actor_email,omitempty"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   string          `json:"entity_id,omitempty"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
	IPAddress  string          `json:"ip_address,omitempty"`
	CreatedAt  string          `json:"created_at"`
}

func (l *ActivityLogger) Record(ctx context.Context, actorID, action, entityType, entityID string, metadata map[string]any, ipAddress string) error {
	metaJSON := []byte("{}")
	if metadata != nil {
		var err error
		metaJSON, err = json.Marshal(metadata)
		if err != nil {
			metaJSON = []byte("{}")
		}
	}

	_, err := l.db.Exec(ctx,
		`INSERT INTO activity_log (actor_id, action, entity_type, entity_id, metadata, ip_address)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		actorID, action, entityType, entityID, metaJSON, ipAddress,
	)
	return err
}

func (l *ActivityLogger) RecordFromRequest(r *http.Request, action, entityType, entityID string, metadata map[string]any) error {
	claims, _ := r.Context().Value(UserClaimsKey).(*auth.Claims)
	actorID := ""
	if claims != nil {
		actorID = claims.UserID
	}
	ipAddr := r.RemoteAddr
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		ipAddr = fwd
	}
	return l.Record(r.Context(), actorID, action, entityType, entityID, metadata, ipAddr)
}

type ActivityQuery struct {
	Action     string
	ActorID    string
	EntityType string
	EntityID   string
	Limit      int
	Offset     int
}

func (l *ActivityLogger) Query(ctx context.Context, q ActivityQuery) ([]ActivityEntry, int, error) {
	if q.Limit <= 0 || q.Limit > 100 {
		q.Limit = 50
	}

	where := "WHERE 1=1"
	args := make([]any, 0)
	argIdx := 1

	if q.Action != "" {
		where += fmt.Sprintf(" AND a.action = $%d", argIdx)
		args = append(args, q.Action)
		argIdx++
	}
	if q.ActorID != "" {
		where += fmt.Sprintf(" AND a.actor_id = $%d", argIdx)
		args = append(args, q.ActorID)
		argIdx++
	}
	if q.EntityType != "" {
		where += fmt.Sprintf(" AND a.entity_type = $%d", argIdx)
		args = append(args, q.EntityType)
		argIdx++
	}
	if q.EntityID != "" {
		where += fmt.Sprintf(" AND a.entity_id = $%d", argIdx)
		args = append(args, q.EntityID)
		argIdx++
	}

	countSQL := `SELECT COUNT(*) FROM activity_log a ` + where
	var total int
	if err := l.db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	querySQL := fmt.Sprintf(`SELECT a.id, a.actor_id, COALESCE(u.email, ''), a.action, a.entity_type,
	                    COALESCE(a.entity_id, ''), a.metadata, a.ip_address, a.created_at
	             FROM activity_log a
	             LEFT JOIN users u ON u.id = a.actor_id
	             %s
	             ORDER BY a.created_at DESC
	             LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)
	args = append(args, q.Limit, q.Offset)

	rows, err := l.db.Query(ctx, querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	entries := make([]ActivityEntry, 0)
	for rows.Next() {
		var e ActivityEntry
		var createdAt time.Time
		var actorID *string
		if err := rows.Scan(&e.ID, &actorID, &e.ActorEmail, &e.Action, &e.EntityType,
			&e.EntityID, &e.Metadata, &e.IPAddress, &createdAt); err != nil {
			continue
		}
		if actorID != nil {
			e.ActorID = actorID
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		entries = append(entries, e)
	}

	return entries, total, nil
}



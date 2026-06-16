package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var expectedTables = []string{"users", "videos", "comments", "likes", "hashes", "watch_history", "friends", "invite_tokens", "downloads", "activity_log", "refresh_tokens", "received_videos", "reactions", "push_preferences", "duplicate_groups"}

func VerifyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	for _, table := range expectedTables {
		var exists bool
		err := pool.QueryRow(ctx,
			"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
			table,
		).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check table %s: %w", table, err)
		}
		if !exists {
			return fmt.Errorf("expected table %q not found — migrations may not have run", table)
		}
	}
	slog.Info("migrations verified", "table_count", len(expectedTables))
	return nil
}

func ConnectPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse pool config: %w", err)
	}
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	slog.Info("connected to database", "max_conns", config.MaxConns)
	return pool, nil
}

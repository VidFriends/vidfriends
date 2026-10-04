package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/config"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/db"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/handlers"
	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/yt"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	sCtx := context.Background()
	store, err := db.New(sCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer store.Close()

	if err := db.RunMigrations(sCtx, store, "./migrations"); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	ytClient := yt.New(cfg.YTExecutable)
	h := handlers.New(store, cfg, ytClient)
	srv := &http.Server{
		Addr:         cfg.ListenAddress,
		Handler:      h.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		log.Printf("backend listening on %s", cfg.ListenAddress)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-done
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

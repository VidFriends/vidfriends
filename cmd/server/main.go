package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/config"
	"vidfriends.ai/backend/internal/database"
	"vidfriends.ai/backend/internal/downloader"
	"vidfriends.ai/backend/internal/handler"
	vhash "vidfriends.ai/backend/internal/hash"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/push"
	"vidfriends.ai/backend/internal/router"
	"vidfriends.ai/backend/internal/storage"
)

func main() {
	cfg := config.Load()

	logLevel := new(slog.LevelVar)
	switch cfg.LogLevel {
	case "debug":
		logLevel.Set(slog.LevelDebug)
	case "warn":
		logLevel.Set(slog.LevelWarn)
	case "error":
		logLevel.Set(slog.LevelError)
	default:
		logLevel.Set(slog.LevelInfo)
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))

	ctx := context.Background()

	db, err := database.ConnectPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.VerifyMigrations(ctx, db); err != nil {
		slog.Error("migration verification failed", "error", err)
		os.Exit(1)
	}

	s3Client, err := storage.NewS3Client(cfg.S3)
	if err != nil {
		slog.Error("failed to create s3 client", "error", err)
		os.Exit(1)
	}
	if err := s3Client.EnsureBucket(ctx); err != nil {
		slog.Error("failed to ensure s3 bucket", "error", err)
		os.Exit(1)
	}

	jwt := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry, cfg.JWTRefreshExpiry)
	hub := handler.NewWSHub()

	detector := vhash.NewDetectorWithType(db, cfg.DuplicateThreshold, vhash.HashType(cfg.HashType))
	dlManager := downloader.NewManager(cfg.YTDLP, cfg.AllowedPlatforms, db, s3Client, cfg.YTDLP.OutputDir,
		func(ctx context.Context, videoID, userID, filePath, thumbnailPath string) {
			hub.SendToUser(userID, handler.Notification{
				Type: "download_complete",
				Payload: map[string]string{
					"video_id":       videoID,
					"file_path":      filePath,
					"thumbnail_path": thumbnailPath,
				},
			})

			go func() {
				phash, err := vhash.Compute(context.Background(), filePath)
				if err != nil {
					slog.Error("failed to compute phash for download", "video_id", videoID, "error", err)
					return
				}
				if err := detector.SaveHash(context.Background(), videoID, phash); err != nil {
					slog.Error("failed to save phash for download", "video_id", videoID, "error", err)
					return
				}
				result, err := detector.Check(context.Background(), videoID, phash)
				if err != nil {
					slog.Error("failed to check duplicates for download", "video_id", videoID, "error", err)
					return
				}
				if !result.IsDuplicate {
					return
				}
				if _, err := detector.CreateOrJoinGroup(context.Background(), videoID, result.CanonicalID); err != nil {
					slog.Error("failed to create/join group for download", "video_id", videoID, "error", err)
					return
				}
				if err := detector.MergeSocial(context.Background(), videoID, result.CanonicalID); err != nil {
					slog.Error("failed to merge social for download", "video_id", videoID, "error", err)
				}
			}()
		},
	)
	dlManager.Start(ctx)

	actLog := middleware.NewActivityLogger(db)
	pm := push.NewPushManager(db,
		cfg.Push.NtfyURL,
		cfg.Push.GotifyURL,
		cfg.Push.FCMCredentials,
		cfg.Push.APNsKeyFile,
		cfg.Push.APNsKeyID,
		cfg.Push.APNsTeamID,
		cfg.Push.APNsTopic,
	)

	h := router.New(db, s3Client, jwt, hub, dlManager, actLog, pm, cfg.DuplicateThreshold, cfg.HashType, cfg.PublicSignup, cfg.EvictionAgeDays, cfg.MaxStorageBytes)

	server := &http.Server{
		Addr:         cfg.Addr,
		Handler:      h,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	go func() {
		slog.Info("starting server", "addr", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("forced shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}

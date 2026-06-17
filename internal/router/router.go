package router

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/auth"
	"vidfriends.ai/backend/internal/downloader"
	"vidfriends.ai/backend/internal/handler"
	vhash "vidfriends.ai/backend/internal/hash"
	"vidfriends.ai/backend/internal/middleware"
	"vidfriends.ai/backend/internal/push"
	"vidfriends.ai/backend/internal/storage"
)

func New(db *pgxpool.Pool, s3 *storage.Client, jwt *auth.JWTManager, hub *handler.WSHub, dl *downloader.Manager, actLog *middleware.ActivityLogger, pm *push.PushManager, cfgDuplicateThreshold int, cfgHashType string, cfgPublicSignup bool, cfgEvictionAgeDays int, cfgMaxStorageBytes int64, cfgMaxUploadSize int64) http.Handler {
	mux := http.NewServeMux()

	detector := vhash.NewDetectorWithType(db, cfgDuplicateThreshold, vhash.HashType(cfgHashType))
	authHandler := handler.NewAuthHandler(db, jwt, cfgPublicSignup)
	videoHandler := handler.NewVideoHandler(db, s3, dl, hub, detector, cfgMaxStorageBytes, cfgMaxUploadSize)
	adminHandler := handler.NewAdminHandler(db, actLog, s3, cfgEvictionAgeDays)
	wsHandler := handler.NewWSHandler(hub, jwt, db)
	socialHandler := handler.NewSocialHandler(db)
	pushHandler := handler.NewPushHandler(db, pm)
	dupHandler := handler.NewDuplicateHandler(db)

	authMW := middleware.Auth(jwt)
	adminMW := middleware.AdminOnly

	// Public
	mux.HandleFunc("GET /api/health", handler.Health(db))
	mux.HandleFunc("POST /api/auth/register", authHandler.Register())
	mux.HandleFunc("POST /api/auth/login", authHandler.Login())
	mux.HandleFunc("POST /api/auth/refresh", authHandler.Refresh())

	// Authenticated
	mux.Handle("GET /api/auth/me", authMW(http.HandlerFunc(authHandler.Me())))
	mux.Handle("PUT /api/auth/profile", authMW(http.HandlerFunc(authHandler.UpdateProfile())))

	// Push Notifications
	mux.Handle("POST /api/push/register", authMW(http.HandlerFunc(pushHandler.Register())))

	// WebSocket
	mux.HandleFunc("GET /api/ws", wsHandler.ServeWS())

	// Authenticated — Video
	mux.Handle("POST /api/videos/upload", authMW(http.HandlerFunc(videoHandler.Upload())))
	mux.Handle("POST /api/videos/from-link", authMW(http.HandlerFunc(videoHandler.CreateFromLink())))
	mux.Handle("GET /api/videos/{id}", authMW(http.HandlerFunc(videoHandler.GetDetail())))
	mux.Handle("DELETE /api/videos/{id}", authMW(http.HandlerFunc(videoHandler.Delete())))
	mux.Handle("GET /api/videos/{id}/file", authMW(http.HandlerFunc(videoHandler.StreamFile())))
	mux.Handle("GET /api/videos/{id}/download", authMW(http.HandlerFunc(videoHandler.GetDownload())))
	mux.Handle("DELETE /api/videos/{id}/download", authMW(http.HandlerFunc(videoHandler.CancelDownload())))

	// Authenticated — Social
	mux.Handle("POST /api/videos/{id}/like", authMW(http.HandlerFunc(videoHandler.Like())))
	mux.Handle("DELETE /api/videos/{id}/like", authMW(http.HandlerFunc(videoHandler.Unlike())))
	mux.Handle("GET /api/videos/{id}/comments", authMW(http.HandlerFunc(videoHandler.GetComments())))
	mux.Handle("POST /api/videos/{id}/comment", authMW(http.HandlerFunc(videoHandler.Comment())))
	mux.Handle("POST /api/videos/{id}/watched", authMW(http.HandlerFunc(videoHandler.MarkWatched())))
	mux.Handle("POST /api/friends/invite", authMW(http.HandlerFunc(socialHandler.Invite())))
	mux.Handle("POST /api/friends/accept/{id}", authMW(http.HandlerFunc(socialHandler.Accept())))
	mux.Handle("GET /api/friends", authMW(http.HandlerFunc(socialHandler.ListFriends())))
	mux.Handle("GET /api/friends/requests", authMW(http.HandlerFunc(socialHandler.PendingRequests())))
	mux.Handle("POST /api/friends/block/{id}", authMW(http.HandlerFunc(socialHandler.Block())))
	mux.Handle("POST /api/send/{id}", authMW(http.HandlerFunc(socialHandler.Send())))
	mux.Handle("GET /api/inbox", authMW(http.HandlerFunc(socialHandler.Inbox())))
	mux.Handle("PATCH /api/inbox/{id}", authMW(http.HandlerFunc(socialHandler.HandleInboxItem())))
	mux.Handle("POST /api/inbox/{id}/read", authMW(http.HandlerFunc(socialHandler.MarkAsRead())))
	mux.Handle("GET /api/feed/fyp", authMW(http.HandlerFunc(socialHandler.FYPFeed())))
	mux.Handle("GET /api/users", authMW(http.HandlerFunc(socialHandler.SearchUsers())))
	mux.Handle("GET /api/users/{id}/profile", authMW(http.HandlerFunc(socialHandler.GetUserProfile())))
	mux.Handle("GET /api/users/{id}/videos", authMW(http.HandlerFunc(socialHandler.GetUserVideos())))

	// Reactions
	mux.Handle("POST /api/videos/{id}/react", authMW(http.HandlerFunc(videoHandler.AddReaction())))
	mux.Handle("DELETE /api/videos/{id}/react", authMW(http.HandlerFunc(videoHandler.RemoveReaction())))

	// Comments — nested
	mux.Handle("DELETE /api/videos/{id}/comments/{commentId}", authMW(http.HandlerFunc(videoHandler.DeleteComment())))

	// Video likes list
	mux.Handle("PATCH /api/videos/{id}/keep", authMW(http.HandlerFunc(videoHandler.Keep())))
	mux.Handle("GET /api/videos/{id}/likes", authMW(http.HandlerFunc(videoHandler.GetVideoLikes())))

	// Unsend
	mux.Handle("POST /api/videos/{id}/unsend", authMW(http.HandlerFunc(videoHandler.Unsend())))

	// Duplicate Groups
	mux.Handle("GET /api/videos/{id}/duplicates", authMW(http.HandlerFunc(dupHandler.GetGroupForVideo())))
	mux.Handle("PUT /api/duplicates/{id}/canonical", authMW(http.HandlerFunc(dupHandler.SetCanonical())))

	// Feed & History
	mux.Handle("GET /api/feed", authMW(http.HandlerFunc(videoHandler.GetFeed())))
	mux.Handle("GET /api/history", authMW(http.HandlerFunc(videoHandler.GetHistory())))

	// Admin (auth + admin role required)
	mux.Handle("GET /api/admin/stats", authMW(adminMW(http.HandlerFunc(adminHandler.Stats()))))
	mux.Handle("GET /api/admin/users", authMW(adminMW(http.HandlerFunc(adminHandler.Users()))))
	mux.Handle("PATCH /api/admin/users/{id}", authMW(adminMW(http.HandlerFunc(adminHandler.UpdateUser()))))
	mux.Handle("DELETE /api/admin/users/{id}", authMW(adminMW(http.HandlerFunc(adminHandler.DeleteUser()))))
	mux.Handle("DELETE /api/admin/videos/{id}", authMW(adminMW(http.HandlerFunc(adminHandler.DeleteVideo()))))
	mux.Handle("GET /api/admin/storage", authMW(adminMW(http.HandlerFunc(adminHandler.StorageBreakdown()))))
	mux.Handle("POST /api/admin/eviction/run", authMW(adminMW(http.HandlerFunc(adminHandler.RunEviction()))))
	mux.Handle("GET /api/admin/invites", authMW(adminMW(http.HandlerFunc(adminHandler.ListInvites()))))
	mux.Handle("GET /api/admin/activity", authMW(adminMW(http.HandlerFunc(adminHandler.ActivityLog()))))
	mux.Handle("POST /api/admin/invites", authMW(adminMW(http.HandlerFunc(adminHandler.CreateInvite()))))

	rl := middleware.GetRateLimiterFromEnv()

	var h http.Handler = mux
	h = middleware.CORS(h)
	h = middleware.RateLimit(rl)(h)
	h = middleware.Logging(h)
	h = middleware.Recovery(h)

	return h
}

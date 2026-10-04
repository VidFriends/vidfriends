package model

import "time"

type User struct {
	ID               string     `json:"id"`
	Email            string     `json:"email"`
	Username         string     `json:"username"`
	PasswordHash     string     `json:"-"`
	DisplayName      string     `json:"display_name,omitempty"`
	AvatarURL        string     `json:"avatar_url,omitempty"`
	Role             string     `json:"role"`
	Status           string     `json:"status"`
	StorageUsed      int64      `json:"storage_used"`
	UploadQuotaBytes *int64     `json:"upload_quota_bytes,omitempty"`
	LastActiveAt     *time.Time `json:"last_active_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type InviteToken struct {
	ID        string    `json:"id"`
	Token     string    `json:"token"`
	UsedBy    *string   `json:"used_by,omitempty"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

type Video struct {
	ID               string     `json:"id"`
	UserID           string     `json:"user_id"`
	Title            string     `json:"title"`
	Description      string     `json:"description,omitempty"`
	FileURL          string     `json:"file_url,omitempty"`
	ThumbnailURL     string     `json:"thumbnail_url,omitempty"`
	Duration         string     `json:"duration,omitempty"`
	Status           string     `json:"status"`
	SourceURL        string     `json:"source_url,omitempty"`
	SourcePlatform   string     `json:"source_platform,omitempty"`
	DuplicateGroupID *string    `json:"duplicate_group_id,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type Download struct {
	ID           string     `json:"id"`
	VideoID      string     `json:"video_id"`
	UserID       string     `json:"user_id"`
	SourceURL    string     `json:"source_url"`
	Platform     string     `json:"platform"`
	Status       string     `json:"status"`
	ErrorMessage string     `json:"error_message,omitempty"`
	FilePath     string     `json:"file_path,omitempty"`
	FileSize     int64      `json:"file_size,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type Comment struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id"`
	VideoID   string     `json:"video_id"`
	ParentID  *string    `json:"parent_id,omitempty"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type Like struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	VideoID   string    `json:"video_id"`
	CreatedAt time.Time `json:"created_at"`
}

type Friend struct {
	ID          string    `json:"id"`
	RequesterID string    `json:"requester_id"`
	AddresseeID string    `json:"addressee_id"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type WatchHistory struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	VideoID         string    `json:"video_id"`
	WatchedAt       time.Time `json:"watched_at"`
	ProgressSeconds int32     `json:"progress_seconds"`
	CreatedAt       time.Time `json:"created_at"`
}

type ReceivedVideo struct {
	ID          string     `json:"id"`
	VideoID     string     `json:"video_id"`
	SenderID    string     `json:"sender_id"`
	RecipientID string     `json:"recipient_id"`
	Caption     *string    `json:"caption,omitempty"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Hash struct {
	ID        string    `json:"id"`
	VideoID   string    `json:"video_id"`
	Hash      []byte    `json:"hash"`
	Algorithm string    `json:"algorithm"`
	CreatedAt time.Time `json:"created_at"`
}

type Reaction struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	VideoID   string    `json:"video_id"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PushPreference struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	NtfyTopic     *string   `json:"ntfy_topic,omitempty"`
	GotifyURL     *string   `json:"gotify_url,omitempty"`
	GotifyToken   *string   `json:"gotify_token,omitempty"`
	FCMToken      *string   `json:"fcm_token,omitempty"`
	APNSToken     *string   `json:"apns_token,omitempty"`
	EnabledEvents []string  `json:"enabled_events"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type DuplicateGroup struct {
	ID          string    `json:"id"`
	CanonicalID string    `json:"canonical_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PushRegisterRequest struct {
	Provider      string   `json:"provider"`
	Target        string   `json:"target"`
	EnabledEvents []string `json:"enabled_events,omitempty"`
}

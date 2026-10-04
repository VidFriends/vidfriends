package oauth

import (
	"context"
	"time"
)

type Token struct {
	AccessToken    string    `json:"access_token"`
	RefreshToken   string    `json:"refresh_token,omitempty"`
	TokenType      string    `json:"token_type"`
	ExpiresAt      time.Time `json:"expires_at,omitempty"`
	Scope          string    `json:"scope,omitempty"`
	ProviderUserID string    `json:"provider_user_id,omitempty"`
}

type ProviderInfo struct {
	Name        string `json:"name"`
	AuthURL     string `json:"auth_url"`
	Connected   bool   `json:"connected"`
	ConnectedAt string `json:"connected_at,omitempty"`
}

type Playlist struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	ItemCount   int    `json:"item_count"`
	Visibility  string `json:"visibility,omitempty"`
}

type PlaylistItem struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	Description  string `json:"description,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	URL          string `json:"url"`
	Position     int    `json:"position"`
}

type Provider interface {
	Name() string
	AuthURL(state string) string
	Exchange(ctx context.Context, code string, redirectURI string) (*Token, error)
	RefreshToken(ctx context.Context, refreshToken string) (*Token, error)
	ListPlaylists(ctx context.Context, token *Token) ([]Playlist, error)
	ListPlaylistItems(ctx context.Context, token *Token, playlistID string) ([]PlaylistItem, error)
	Revoke(ctx context.Context, token *Token) error
}

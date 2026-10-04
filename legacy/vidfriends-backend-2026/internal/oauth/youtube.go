package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type YouTubeConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
}

type youtubeProvider struct {
	cfg YouTubeConfig
	hc  *http.Client
}

func NewYouTubeProvider(cfg YouTubeConfig) Provider {
	return &youtubeProvider{
		cfg: cfg,
		hc:  &http.Client{Timeout: 15 * time.Second},
	}
}

const (
	ytAuthURL      = "https://accounts.google.com/o/oauth2/v2/auth"
	ytTokenURL     = "https://oauth2.googleapis.com/token"
	ytScope        = "https://www.googleapis.com/auth/youtube.readonly"
	ytPeopleURL    = "https://people.googleapis.com/v1/people/me?personFields=names"
	ytPlaylistsURL = "https://www.googleapis.com/youtube/v3/playlists"
	ytPlaylistURL  = "https://www.googleapis.com/youtube/v3/playlistItems"
)

func (y *youtubeProvider) Name() string {
	return "youtube"
}

func (y *youtubeProvider) AuthURL(state string) string {
	v := url.Values{}
	v.Set("client_id", y.cfg.ClientID)
	v.Set("redirect_uri", y.cfg.RedirectURI)
	v.Set("response_type", "code")
	v.Set("scope", ytScope)
	v.Set("access_type", "offline")
	v.Set("prompt", "consent")
	v.Set("state", state)
	return ytAuthURL + "?" + v.Encode()
}

func (y *youtubeProvider) Exchange(ctx context.Context, code string, redirectURI string) (*Token, error) {
	v := url.Values{}
	v.Set("code", code)
	v.Set("client_id", y.cfg.ClientID)
	v.Set("client_secret", y.cfg.ClientSecret)
	v.Set("redirect_uri", redirectURI)
	v.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, "POST", ytTokenURL, strings.NewReader(v.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := y.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token,omitempty"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	token := &Token{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		TokenType:    tokenResp.TokenType,
		Scope:        tokenResp.Scope,
	}
	if tokenResp.ExpiresIn > 0 {
		token.ExpiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	}

	userID, err := y.fetchUserID(ctx, token.AccessToken)
	if err != nil {
		return token, nil
	}
	token.ProviderUserID = userID

	return token, nil
}

func (y *youtubeProvider) fetchUserID(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", ytPeopleURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := y.hc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", nil
	}

	var peopleResp struct {
		ResourceName string `json:"resourceName"`
		Names        []struct {
			DisplayName string `json:"displayName"`
		} `json:"names"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&peopleResp); err != nil {
		return "", nil
	}

	// resourceName is like "people/12345"
	if parts := strings.Split(peopleResp.ResourceName, "/"); len(parts) == 2 {
		return parts[1], nil
	}
	return "", nil
}

func (y *youtubeProvider) RefreshToken(ctx context.Context, refreshToken string) (*Token, error) {
	v := url.Values{}
	v.Set("client_id", y.cfg.ClientID)
	v.Set("client_secret", y.cfg.ClientSecret)
	v.Set("refresh_token", refreshToken)
	v.Set("grant_type", "refresh_token")

	req, err := http.NewRequestWithContext(ctx, "POST", ytTokenURL, strings.NewReader(v.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create refresh request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := y.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("refresh request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read refresh response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token refresh failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		ExpiresIn    int    `json:"expires_in"`
		TokenType    string `json:"token_type"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse refresh response: %w", err)
	}

	token := &Token{
		AccessToken: tokenResp.AccessToken,
		RefreshToken: refreshToken,
		TokenType:    tokenResp.TokenType,
		Scope:        tokenResp.Scope,
	}
	if tokenResp.ExpiresIn > 0 {
		token.ExpiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	}

	return token, nil
}

func (y *youtubeProvider) getValidToken(ctx context.Context, stored *StoredToken) (*Token, error) {
	if stored.ExpiresAt != nil && time.Now().Before(*stored.ExpiresAt) {
		return &Token{
			AccessToken:    stored.AccessToken,
			RefreshToken:   stored.RefreshToken,
			TokenType:      stored.TokenType,
			Scope:          stored.Scope,
			ProviderUserID: stored.ProviderUserID,
		}, nil
	}

	if stored.RefreshToken == "" {
		return nil, errors.New("token expired and no refresh token available")
	}

	return y.RefreshToken(ctx, stored.RefreshToken)
}

func (y *youtubeProvider) ListPlaylists(ctx context.Context, token *Token) ([]Playlist, error) {
	v := url.Values{}
	v.Set("part", "snippet,contentDetails")
	v.Set("mine", "true")
	v.Set("maxResults", "50")

	var allPlaylists []Playlist
	nextPageToken := ""

	for {
		if nextPageToken != "" {
			v.Set("pageToken", nextPageToken)
		}

		req, err := http.NewRequestWithContext(ctx, "GET", ytPlaylistsURL+"?"+v.Encode(), nil)
		if err != nil {
			return nil, fmt.Errorf("create playlists request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token.AccessToken)

		resp, err := y.hc.Do(req)
		if err != nil {
			return nil, fmt.Errorf("playlists request failed: %w", err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read playlists response: %w", err)
		}

		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("playlists API error (%d): %s", resp.StatusCode, string(body))
		}

		var result struct {
			Items []struct {
				ID      string `json:"id"`
				Snippet struct {
					Title       string `json:"title"`
					Description string `json:"description"`
					Thumbnails  struct {
						Default struct {
							URL string `json:"url"`
						} `json:"default"`
					} `json:"thumbnails"`
				} `json:"snippet"`
				ContentDetails struct {
					ItemCount int `json:"itemCount"`
				} `json:"contentDetails"`
				Status struct {
					PrivacyStatus string `json:"privacyStatus"`
				} `json:"status"`
			} `json:"items"`
			NextPageToken string `json:"nextPageToken,omitempty"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("parse playlists response: %w", err)
		}

		for _, item := range result.Items {
			allPlaylists = append(allPlaylists, Playlist{
				ID:           item.ID,
				Title:        item.Snippet.Title,
				Description:  item.Snippet.Description,
				ThumbnailURL: item.Snippet.Thumbnails.Default.URL,
				ItemCount:    item.ContentDetails.ItemCount,
				Visibility:   item.Status.PrivacyStatus,
			})
		}

		nextPageToken = result.NextPageToken
		if nextPageToken == "" {
			break
		}
	}

	return allPlaylists, nil
}

func (y *youtubeProvider) ListPlaylistItems(ctx context.Context, token *Token, playlistID string) ([]PlaylistItem, error) {
	v := url.Values{}
	v.Set("part", "snippet")
	v.Set("playlistId", playlistID)
	v.Set("maxResults", "50")

	var allItems []PlaylistItem
	nextPageToken := ""

	for {
		if nextPageToken != "" {
			v.Set("pageToken", nextPageToken)
		}

		req, err := http.NewRequestWithContext(ctx, "GET", ytPlaylistURL+"?"+v.Encode(), nil)
		if err != nil {
			return nil, fmt.Errorf("create playlist items request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+token.AccessToken)

		resp, err := y.hc.Do(req)
		if err != nil {
			return nil, fmt.Errorf("playlist items request failed: %w", err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read playlist items response: %w", err)
		}

		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("playlist items API error (%d): %s", resp.StatusCode, string(body))
		}

		var result struct {
			Items []struct {
				Snippet struct {
					ResourceID struct {
						Kind    string `json:"kind"`
						VideoID string `json:"videoId"`
					} `json:"resourceId"`
					Title       string `json:"title"`
					Description string `json:"description"`
					Position    int    `json:"position"`
					Thumbnails  struct {
						Default struct {
							URL string `json:"url"`
						} `json:"default"`
					} `json:"thumbnails"`
				} `json:"snippet"`
			} `json:"items"`
			NextPageToken string `json:"nextPageToken,omitempty"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("parse playlist items response: %w", err)
		}

		for _, item := range result.Items {
			if item.Snippet.ResourceID.Kind != "youtube#video" {
				continue
			}
			allItems = append(allItems, PlaylistItem{
				VideoID:      item.Snippet.ResourceID.VideoID,
				Title:        item.Snippet.Title,
				Description:  item.Snippet.Description,
				ThumbnailURL: item.Snippet.Thumbnails.Default.URL,
				URL:          fmt.Sprintf("https://www.youtube.com/watch?v=%s", item.Snippet.ResourceID.VideoID),
				Position:     item.Snippet.Position,
			})
		}

		nextPageToken = result.NextPageToken
		if nextPageToken == "" {
			break
		}
	}

	return allItems, nil
}

func (y *youtubeProvider) Revoke(ctx context.Context, token *Token) error {
	v := url.Values{}
	v.Set("token", token.AccessToken)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://oauth2.googleapis.com/revoke", strings.NewReader(v.Encode()))
	if err != nil {
		return fmt.Errorf("create revoke request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := y.hc.Do(req)
	if err != nil {
		return fmt.Errorf("revoke request failed: %w", err)
	}
	defer resp.Body.Close()

	return nil
}

package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type GotifyNotifier struct {
	baseURL string
	client  *http.Client
}

func NewGotifyNotifier(baseURL string) *GotifyNotifier {
	return &GotifyNotifier{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

type gotifyMessage struct {
	Title    string `json:"title"`
	Message  string `json:"message"`
	Priority int    `json:"priority,omitempty"`
}

func (g *GotifyNotifier) Send(ctx context.Context, token string, notif Notification) error {
	msg := gotifyMessage{
		Title:    notif.Title,
		Message:  notif.Body,
		Priority: notif.Priority,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("gotify marshal: %w", err)
	}

	url := g.baseURL + "/message?token=" + token
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("gotify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("gotify send: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("gotify returned status %d", resp.StatusCode)
	}
	return nil
}

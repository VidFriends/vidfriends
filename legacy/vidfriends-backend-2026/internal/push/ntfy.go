package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type NtfyNotifier struct {
	baseURL string
	client  *http.Client
}

func NewNtfyNotifier(baseURL string) *NtfyNotifier {
	if baseURL == "" {
		baseURL = "https://ntfy.sh"
	}
	return &NtfyNotifier{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

type ntfyRequest struct {
	Topic    string `json:"topic"`
	Title    string `json:"title,omitempty"`
	Message  string `json:"message"`
	Tags     string `json:"tags,omitempty"`
	Click    string `json:"click,omitempty"`
	Icon     string `json:"icon,omitempty"`
	Priority int    `json:"priority,omitempty"`
}

func (n *NtfyNotifier) Send(ctx context.Context, topic string, notif Notification) error {
	body := ntfyRequest{
		Topic:    topic,
		Title:    notif.Title,
		Message:  notif.Body,
		Tags:     notif.Tags,
		Click:    notif.Click,
		Icon:     notif.Icon,
		Priority: notif.Priority,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("ntfy marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.baseURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("ntfy request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.client.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy send: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("ntfy returned status %d", resp.StatusCode)
	}
	return nil
}

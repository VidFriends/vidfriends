package yt

import (
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"time"
)

type Metadata struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Duration    float64 `json:"duration"`
	Thumbnail   string  `json:"thumbnail"`
}

type Client struct {
	executable string
}

func New(executable string) *Client {
	return &Client{executable: executable}
}

func (c *Client) Fetch(ctx context.Context, url string) (*Metadata, error) {
	if c.executable == "" {
		return nil, errors.New("yt-dlp executable not configured")
	}
	cmd := exec.CommandContext(ctx, c.executable, "--skip-download", "--no-warnings", "--dump-json", url)
	cmd.Env = append(cmd.Env, "PYTHONIOENCODING=utf-8")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var meta Metadata
	if err := json.Unmarshal(output, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

func WithTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}

package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL     string
	ListenAddress   string
	SessionSecret   string
	AllowOrigins    []string
	YTExecutable    string
	MaxVideoPerUser int
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		ListenAddress:   getenv("LISTEN_ADDRESS", ":8080"),
		SessionSecret:   os.Getenv("SESSION_SECRET"),
		AllowOrigins:    splitAndTrim(os.Getenv("ALLOW_ORIGINS")),
		YTExecutable:    getenv("YT_EXECUTABLE", "yt-dlp"),
		MaxVideoPerUser: getenvInt("MAX_VIDEOS_PER_USER", 500),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.SessionSecret == "" {
		return nil, fmt.Errorf("SESSION_SECRET is required")
	}

	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	start := 0
	for i := 0; i <= len(raw); i++ {
		if i == len(raw) || raw[i] == ',' {
			segment := raw[start:i]
			start = i + 1
			trimmed := trimSpace(segment)
			if trimmed != "" {
				out = append(out, trimmed)
			}
		}
	}
	return out
}

func trimSpace(s string) string {
	start := 0
	for start < len(s) && isSpace(s[start]) {
		start++
	}
	end := len(s)
	for end > start && isSpace(s[end-1]) {
		end--
	}
	return s[start:end]
}

func isSpace(b byte) bool {
	switch b {
	case ' ', '\n', '\r', '\t', '\v', '\f':
		return true
	default:
		return false
	}
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}

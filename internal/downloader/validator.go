package downloader

import (
	"fmt"
	"net/url"
	"strings"
)

func ValidateURL(rawURL string, allowedPlatforms []string) (string, error) {
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("unsupported scheme: %s", parsed.Scheme)
	}

	host := strings.ToLower(parsed.Host)
	if strings.HasPrefix(host, "www.") {
		host = host[4:]
	}

	for _, allowed := range allowedPlatforms {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			platform := extractPlatform(host)
			return platform, nil
		}
	}

	return "", fmt.Errorf("domain %q is not in the allowed platforms list", host)
}

func extractPlatform(host string) string {
	switch {
	case strings.Contains(host, "youtube"), strings.Contains(host, "youtu.be"):
		return "youtube"
	case strings.Contains(host, "tiktok"):
		return "tiktok"
	case strings.Contains(host, "instagram"):
		return "instagram"
	case strings.Contains(host, "twitter"), strings.Contains(host, "x.com"):
		return "twitter"
	case strings.Contains(host, "reddit"):
		return "reddit"
	case strings.Contains(host, "vimeo"):
		return "vimeo"
	case strings.Contains(host, "facebook"):
		return "facebook"
	default:
		return host
	}
}

package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type YTDLPConfig struct {
	BinPath         string
	OutputDir       string
	MaxFileSize     int64
	DownloadTimeout time.Duration
}

type PushConfig struct {
	NtfyURL       string
	GotifyURL     string
	FCMCredentials string
	APNsKeyFile   string
	APNsKeyID     string
	APNsTeamID    string
	APNsTopic     string
}

type Config struct {
	Addr                string
	DatabaseURL         string
	JWTSecret           string
	JWTExpiry           time.Duration
	JWTRefreshExpiry    time.Duration
	ReadTimeout         time.Duration
	WriteTimeout        time.Duration
	ShutdownTimeout     time.Duration
	LogLevel            string
	S3                  S3Config
	YTDLP               YTDLPConfig
	AllowedPlatforms    []string
	Push                PushConfig
	DuplicateThreshold  int
	HashType            string
	PublicSignup        bool
}

func Load() *Config {
	return &Config{
		Addr:            getEnv("VIDFRIENDS_ADDR", ":8080"),
		DatabaseURL:     getEnv("VIDFRIENDS_DATABASE_URL", "postgres://vidfriends:vidfriends@localhost:5432/vidfriends?sslmode=disable"),
		JWTSecret:       getEnv("VIDFRIENDS_JWT_SECRET", "vidfriends-dev-secret-do-not-use-in-prod"),
		JWTExpiry:       getDurationEnv("VIDFRIENDS_JWT_EXPIRY", 15*time.Minute),
		JWTRefreshExpiry: getDurationEnv("VIDFRIENDS_JWT_REFRESH_EXPIRY", 168*time.Hour),
		ReadTimeout:     getDurationEnv("VIDFRIENDS_READ_TIMEOUT", 10*time.Second),
		WriteTimeout:    getDurationEnv("VIDFRIENDS_WRITE_TIMEOUT", 30*time.Second),
		ShutdownTimeout: getDurationEnv("VIDFRIENDS_SHUTDOWN_TIMEOUT", 15*time.Second),
		LogLevel:        getEnv("VIDFRIENDS_LOG_LEVEL", "info"),
		S3: S3Config{
			Endpoint:  getEnv("VIDFRIENDS_S3_ENDPOINT", "http://localhost:9000"),
			AccessKey: getEnv("VIDFRIENDS_S3_ACCESS_KEY", "minioadmin"),
			SecretKey: getEnv("VIDFRIENDS_S3_SECRET_KEY", "minioadmin"),
			Bucket:    getEnv("VIDFRIENDS_S3_BUCKET", "vidfriends-videos"),
			UseSSL:    getEnv("VIDFRIENDS_S3_USE_SSL", "false") == "true",
		},
		YTDLP: YTDLPConfig{
			BinPath:         getEnv("VIDFRIENDS_YTDLP_PATH", "yt-dlp"),
			OutputDir:       getEnv("VIDFRIENDS_YTDLP_OUTPUT_DIR", "/tmp/vidfriends-downloads"),
			MaxFileSize:     getInt64Env("VIDFRIENDS_YTDLP_MAX_FILE_SIZE", 500*1024*1024),
			DownloadTimeout: getDurationEnv("VIDFRIENDS_YTDLP_DOWNLOAD_TIMEOUT", 30*60),
		},
		AllowedPlatforms: getListEnv("VIDFRIENDS_ALLOWED_PLATFORMS", "youtube.com,youtu.be,tiktok.com,instagram.com,twitter.com,x.com,reddit.com,vimeo.com,facebook.com"),
		DuplicateThreshold: getIntEnv("VIDFRIENDS_DUPLICATE_THRESHOLD", 12),
		HashType:           getEnv("VIDFRIENDS_HASH_TYPE", "phash"),
		PublicSignup:       getEnv("VIDFRIENDS_ALLOW_PUBLIC_SIGNUP", "false") == "true",
		Push: PushConfig{
			NtfyURL:       getEnv("VIDFRIENDS_NTFY_URL", ""),
			GotifyURL:     getEnv("VIDFRIENDS_GOTIFY_URL", ""),
			FCMCredentials: getEnv("VIDFRIENDS_FCM_CREDENTIALS_FILE", ""),
			APNsKeyFile:   getEnv("VIDFRIENDS_APNS_KEY_FILE", ""),
			APNsKeyID:     getEnv("VIDFRIENDS_APNS_KEY_ID", ""),
			APNsTeamID:    getEnv("VIDFRIENDS_APNS_TEAM_ID", ""),
			APNsTopic:     getEnv("VIDFRIENDS_APNS_TOPIC", ""),
		},
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	val, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	d, err := time.ParseDuration(val)
	if err == nil {
		return d
	}
	intVal, err := strconv.Atoi(val)
	if err == nil {
		return time.Duration(intVal) * time.Second
	}
	return fallback
}

func getInt64Env(key string, fallback int64) int64 {
	val, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func getIntEnv(key string, fallback int) int {
	val, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return n
}

func getListEnv(key, fallback string) []string {
	val, ok := os.LookupEnv(key)
	if !ok {
		val = fallback
	}
	if val == "" {
		return nil
	}
	return strings.Split(val, ",")
}



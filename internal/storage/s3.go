package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"vidfriends.ai/backend/internal/config"
)

type Client struct {
	client *minio.Client
	cfg    config.S3Config
}

func NewS3Client(cfg config.S3Config) (*Client, error) {
	endpoint := strings.TrimPrefix(cfg.Endpoint, "http://")
	endpoint = strings.TrimPrefix(endpoint, "https://")

	bucketLookup := minio.BucketLookupDNS
	if cfg.PathStyle {
		bucketLookup = minio.BucketLookupPath
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure:       cfg.UseSSL,
		Region:       cfg.Region,
		BucketLookup: bucketLookup,
	})
	if err != nil {
		return nil, fmt.Errorf("create s3 client: %w", err)
	}

	return &Client{client: client, cfg: cfg}, nil
}

func (s *Client) EnsureBucket(ctx context.Context) error {
	var lastErr error
	backoff := 1 * time.Second
	const maxRetries = 3

	for attempt := range maxRetries {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
		}

		exists, err := s.client.BucketExists(ctx, s.cfg.Bucket)
		if err != nil {
			lastErr = fmt.Errorf("check bucket %q: %w", s.cfg.Bucket, err)
			continue
		}

		if !exists {
			err = s.client.MakeBucket(ctx, s.cfg.Bucket, minio.MakeBucketOptions{})
			if err != nil {
				lastErr = fmt.Errorf("create bucket %q: %w", s.cfg.Bucket, err)
				continue
			}
			slog.Info("created s3 bucket", "bucket", s.cfg.Bucket)
		} else {
			slog.Info("s3 bucket already exists", "bucket", s.cfg.Bucket)
		}

		return nil
	}

	return fmt.Errorf("ensure bucket %q after %d retries: %w", s.cfg.Bucket, maxRetries, lastErr)
}

func (s *Client) PutFile(ctx context.Context, filename string, reader io.Reader, size int64, contentType string) (string, error) {
	objectName := fmt.Sprintf("%s/%s", uuid.New().String(), filename)

	_, err := s.client.PutObject(ctx, s.cfg.Bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("upload to s3: %w", err)
	}

	endpoint := strings.TrimRight(s.cfg.Endpoint, "/")
	url := fmt.Sprintf("%s/%s/%s", endpoint, s.cfg.Bucket, objectName)
	return url, nil
}

func (s *Client) DeferCleanup(objectURL string, logFields ...any) {
	if objectURL == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.DeleteFile(ctx, objectURL); err != nil {
			slog.Error("deferred s3 cleanup failed", append(logFields, "url", objectURL, "error", err)...)
		} else {
			slog.Debug("deferred s3 cleanup completed", append(logFields, "url", objectURL)...)
		}
	}()
}

func (s *Client) DeleteFile(ctx context.Context, objectURL string) error {
	objectName := strings.TrimPrefix(objectURL, s.cfg.Endpoint+"/"+s.cfg.Bucket+"/")
	if objectName == objectURL || objectName == "" {
		return nil
	}

	err := s.client.RemoveObject(ctx, s.cfg.Bucket, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete from s3: %w", err)
	}
	return nil
}

func (s *Client) GetFile(ctx context.Context, objectPath string) (io.ReadCloser, int64, string, error) {
	trimmed := strings.TrimPrefix(objectPath, s.cfg.Endpoint+"/"+s.cfg.Bucket+"/")

	obj, err := s.client.GetObject(ctx, s.cfg.Bucket, trimmed, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, "", fmt.Errorf("get from s3: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, 0, "", fmt.Errorf("stat s3 object: %w", err)
	}

	return obj, stat.Size, stat.ContentType, nil
}

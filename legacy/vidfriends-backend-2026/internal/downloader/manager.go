package downloader

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/config"
	"vidfriends.ai/backend/internal/storage"
	"vidfriends.ai/backend/internal/thumbnail"
)

type Job struct {
	ID        string
	VideoID   string
	UserID    string
	SourceURL string
	Platform  string
}

type Manager struct {
	cfg              config.YTDLPConfig
	allowedPlatforms []string
	db               *pgxpool.Pool
	s3               *storage.Client
	thumbnailDir     string
	onComplete       func(ctx context.Context, videoID, userID, filePath, thumbnailPath string)
	mu               sync.Mutex
	jobs             map[string]*activeDownload
}

type activeDownload struct {
	job    Job
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

func NewManager(cfg config.YTDLPConfig, allowedPlatforms []string, db *pgxpool.Pool, s3 *storage.Client, thumbnailDir string, onComplete func(ctx context.Context, videoID, userID, filePath, thumbnailPath string)) *Manager {
	return &Manager{
		cfg:              cfg,
		allowedPlatforms: allowedPlatforms,
		db:               db,
		s3:               s3,
		thumbnailDir:     thumbnailDir,
		onComplete:       onComplete,
		jobs:             make(map[string]*activeDownload),
	}
}

func (m *Manager) Start(ctx context.Context) {
	slog.Info("downloader manager started", "bin", m.cfg.BinPath, "output_dir", m.cfg.OutputDir)

	if err := os.MkdirAll(m.cfg.OutputDir, 0755); err != nil {
		slog.Warn("failed to create download directory", "dir", m.cfg.OutputDir, "error", err)
	}
}

func (m *Manager) ValidateAndDetectPlatform(rawURL string) (string, error) {
	return ValidateURL(rawURL, m.allowedPlatforms)
}

func (m *Manager) Enqueue(job Job) error {
	platform, err := ValidateURL(job.SourceURL, m.allowedPlatforms)
	if err != nil {
		return fmt.Errorf("url validation failed: %w", err)
	}
	job.Platform = platform
	go m.runDownload(job)
	return nil
}

func (m *Manager) Cancel(downloadID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	ad, ok := m.jobs[downloadID]
	if !ok {
		return fmt.Errorf("download %q not found or already completed", downloadID)
	}

	ad.cancel()
	slog.Info("cancelled download", "download_id", downloadID, "video_id", ad.job.VideoID)

	_, err := m.db.Exec(context.Background(),
		`UPDATE downloads SET status = 'cancelled', updated_at = now() WHERE id = $1`,
		downloadID,
	)
	return err
}

func (m *Manager) runDownload(job Job) {
	slog.Info("starting download",
		"download_id", job.ID, "video_id", job.VideoID,
		"url", job.SourceURL, "platform", job.Platform,
	)

	ctx, cancel := context.WithTimeout(context.Background(), m.cfg.DownloadTimeout)
	defer cancel()

	m.mu.Lock()
	m.jobs[job.ID] = &activeDownload{
		job:    job,
		cancel: cancel,
	}
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.jobs, job.ID)
		m.mu.Unlock()
	}()

	_, err := m.db.Exec(ctx,
		`UPDATE downloads SET status = 'downloading', started_at = now(), updated_at = now() WHERE id = $1`,
		job.ID,
	)
	if err != nil {
		slog.Error("failed to update download status", "download_id", job.ID, "error", err)
		return
	}

	outputTemplate := filepath.Join(m.cfg.OutputDir, fmt.Sprintf("%s_%%(title).100s_%%(id)s.%%(ext)s", job.VideoID))

	args := []string{
		"--no-playlist",
		"--print", "after_move:filepath",
		"-o", outputTemplate,
		"--max-filesize", fmt.Sprintf("%d", m.cfg.MaxFileSize),
		"--restrict-filenames",
		"--no-warnings",
		job.SourceURL,
	}

	cmd := exec.CommandContext(ctx, m.cfg.BinPath, args...)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.failDownload(ctx, job.ID, fmt.Sprintf("stderr pipe: %v", err))
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.failDownload(ctx, job.ID, fmt.Sprintf("stdout pipe: %v", err))
		return
	}

	m.mu.Lock()
	if ad, ok := m.jobs[job.ID]; ok {
		ad.cmd = cmd
	}
	m.mu.Unlock()

	if err := cmd.Start(); err != nil {
		m.failDownload(ctx, job.ID, fmt.Sprintf("start yt-dlp: %v", err))
		return
	}

	logLines := captureLogs(stderr)

	outputPath := ""
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			outputPath = line
		}
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			m.failDownload(ctx, job.ID, "download timed out")
		} else {
			errMsg := strings.Join(logLines, "; ")
			m.failDownload(ctx, job.ID, fmt.Sprintf("yt-dlp failed: %v - %s", err, errMsg))
		}
		return
	}

	if outputPath == "" {
		m.failDownload(ctx, job.ID, "yt-dlp did not produce output file")
		return
	}

	fileInfo, err := os.Stat(outputPath)
	if err != nil {
		m.failDownload(ctx, job.ID, fmt.Sprintf("stat output file: %v", err))
		return
	}

	fileSize := fileInfo.Size()
	contentType := detectContentType(outputPath)

	_, err = m.db.Exec(ctx,
		`UPDATE downloads SET status = 'completed', file_path = $1, file_size = $2, completed_at = now(), updated_at = now() WHERE id = $3`,
		outputPath, fileSize, job.ID,
	)
	if err != nil {
		slog.Error("failed to mark download complete", "download_id", job.ID, "error", err)
	}

	thumbnailPath, _ := thumbnail.Extract(ctx, outputPath, m.thumbnailDir, job.VideoID)

	if thumbnailPath != "" {
		slog.Info("thumbnail generated", "path", thumbnailPath, "video_id", job.VideoID)
	}

	m.uploadToStorage(ctx, job.VideoID, outputPath, thumbnailPath, contentType, fileSize)

	if m.onComplete != nil {
		m.onComplete(ctx, job.VideoID, job.UserID, outputPath, thumbnailPath)
	}

	slog.Info("download completed",
		"download_id", job.ID, "video_id", job.VideoID,
		"file", outputPath, "size", fileSize,
		"content_type", contentType,
	)
}

func (m *Manager) uploadToStorage(ctx context.Context, videoID, filePath, thumbnailPath, contentType string, fileSize int64) {
	f, err := os.Open(filePath)
	if err != nil {
		slog.Error("failed to open downloaded file for upload", "video_id", videoID, "error", err)
		return
	}
	defer f.Close()

	fileURL, err := m.s3.PutFile(ctx, filepath.Base(filePath), f, fileSize, contentType)
	if err != nil {
		slog.Error("failed to upload file to s3", "video_id", videoID, "error", err)
		return
	}

	var thumbnailURL string
	if thumbnailPath != "" {
		tf, err := os.Open(thumbnailPath)
		if err == nil {
			defer tf.Close()
			thumbInfo, _ := os.Stat(thumbnailPath)
			thumbURL, err := m.s3.PutFile(ctx, filepath.Base(thumbnailPath), tf, thumbInfo.Size(), "image/jpeg")
			if err == nil {
				thumbnailURL = thumbURL
			} else {
				slog.Error("failed to upload thumbnail to s3", "video_id", videoID, "error", err)
			}
		}
	}

	_, err = m.db.Exec(ctx,
		`UPDATE videos SET file_url = $1, thumbnail_url = $2, status = 'ready', updated_at = now() WHERE id = $3`,
		fileURL, thumbnailURL, videoID,
	)
	if err != nil {
		slog.Error("failed to update video record after upload", "video_id", videoID, "error", err)
		m.s3.DeferCleanup(fileURL, "video_id", videoID, "reason", "db_update_failed")
		if thumbnailURL != "" {
			m.s3.DeferCleanup(thumbnailURL, "video_id", videoID, "reason", "db_update_failed")
		}
	}
}

func captureLogs(reader io.ReadCloser) []string {
	var lines []string
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		lines = append(lines, line)
		if len(lines) > 100 {
			lines = lines[len(lines)-100:]
		}
	}
	return lines
}

func detectContentType(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mkv":
		return "video/x-matroska"
	case ".avi":
		return "video/x-msvideo"
	case ".mov":
		return "video/quicktime"
	case ".gif":
		return "image/gif"
	default:
		return "application/octet-stream"
	}
}

func (m *Manager) failDownload(ctx context.Context, downloadID, errMsg string) {
	slog.Error("download failed", "download_id", downloadID, "error", errMsg)

	if len(errMsg) > 500 {
		errMsg = errMsg[:500]
	}

	_, err := m.db.Exec(ctx,
		`UPDATE downloads SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
		errMsg, downloadID,
	)
	if err != nil {
		slog.Error("failed to mark download failed", "download_id", downloadID, "error", err)
	}

	_, err = m.db.Exec(ctx,
		`UPDATE videos SET status = 'failed' WHERE id = (SELECT video_id FROM downloads WHERE id = $1)`,
		downloadID,
	)
	if err != nil {
		slog.Error("failed to mark video failed", "download_id", downloadID, "error", err)
	}
}

package thumbnail

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
)

func Extract(ctx context.Context, videoPath, outputDir, videoID string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create thumbnail dir: %w", err)
	}

	thumbnailPath := filepath.Join(outputDir, videoID+".jpg")

	args := []string{
		"-y",
		"-ss", "00:00:01",
		"-i", videoPath,
		"-vframes", "1",
		"-q:v", "3",
		"-vf", "scale=640:-1",
		thumbnailPath,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("thumbnail generation cancelled")
		}
		slog.Warn("ffmpeg thumbnail extraction failed", "error", err, "stderr", stderr.String())
		return generatePlaceholderThumbnail(outputDir, videoID)
	}

	slog.Info("thumbnail extracted", "path", thumbnailPath, "video_id", videoID)
	return thumbnailPath, nil
}

func generatePlaceholderThumbnail(outputDir, videoID string) (string, error) {
	width, height := 640, 360
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	for x := 0; x < width; x++ {
		for y := 0; y < height; y++ {
			img.Set(x, y, color.RGBA{30, 30, 30, 255})
		}
	}

	thumbnailPath := filepath.Join(outputDir, videoID+".jpg")
	f, err := os.Create(thumbnailPath)
	if err != nil {
		return "", fmt.Errorf("create placeholder thumbnail: %w", err)
	}
	defer f.Close()

	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 85}); err != nil {
		return "", fmt.Errorf("encode placeholder thumbnail: %w", err)
	}

	slog.Info("generated placeholder thumbnail", "path", thumbnailPath)
	return thumbnailPath, nil
}

func DetectContentType(data []byte) string {
	if len(data) < 8 {
		return "image/jpeg"
	}

	if bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47}) {
		return "image/png"
	}
	if bytes.HasPrefix(data, []byte{0xFF, 0xD8}) {
		return "image/jpeg"
	}
	if bytes.HasPrefix(data, []byte{0x47, 0x49, 0x46}) {
		return "image/gif"
	}
	return "image/jpeg"
}

var _ = io.ReadAll

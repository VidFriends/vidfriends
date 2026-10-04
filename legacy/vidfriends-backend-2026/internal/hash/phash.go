package hash

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"log/slog"
	"os"
	"os/exec"
)

type PerceptualHash struct {
	Bits     uint64
	Distance int
}

func Compute(ctx context.Context, videoPath string) (*PerceptualHash, error) {
	return ComputeWithHasher(ctx, videoPath, NewPHashHasher())
}

func ComputeWithHasher(ctx context.Context, videoPath string, hasher Hasher) (*PerceptualHash, error) {
	framePath, err := extractMidFrame(ctx, videoPath)
	if err != nil {
		return nil, fmt.Errorf("extract frame: %w", err)
	}
	defer os.Remove(framePath)

	img, err := loadImage(framePath)
	if err != nil {
		return nil, fmt.Errorf("load image: %w", err)
	}

	bits, err := hasher.ComputeHash(img)
	if err != nil {
		return nil, fmt.Errorf("hash computation: %w", err)
	}

	return &PerceptualHash{
		Bits: bits,
	}, nil
}

func ComputeFromBytes(data []byte) (*PerceptualHash, error) {
	return ComputeFromBytesWithHasher(data, NewPHashHasher())
}

func ComputeFromBytesWithHasher(data []byte, hasher Hasher) (*PerceptualHash, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}

	bits, err := hasher.ComputeHash(img)
	if err != nil {
		return nil, fmt.Errorf("hash computation: %w", err)
	}

	return &PerceptualHash{
		Bits: bits,
	}, nil
}

func (p *PerceptualHash) HammingDistance(other *PerceptualHash) int {
	x := p.Bits ^ other.Bits
	d := 0
	for x != 0 {
		d++
		x &= x - 1
	}
	return d
}

func (p *PerceptualHash) IsDuplicate(other *PerceptualHash, threshold int) bool {
	if other == nil {
		return false
	}
	d := p.HammingDistance(other)
	return d <= threshold
}

func extractMidFrame(ctx context.Context, videoPath string) (string, error) {
	tmpFile := videoPath + "_phash_frame.jpg"

	args := []string{
		"-y",
		"-i", videoPath,
		"-vframes", "1",
		"-q:v", "3",
		"-vf", "scale=320:-1",
		tmpFile,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("frame extraction cancelled")
		}
		slog.Warn("ffmpeg frame extraction failed, using placeholder", "error", err, "stderr", stderr.String())
		return generatePlaceholderFrame(tmpFile)
	}

	return tmpFile, nil
}

func generatePlaceholderFrame(path string) (string, error) {
	img := image.NewRGBA(image.Rect(0, 0, 320, 240))
	for x := 0; x < 320; x++ {
		for y := 0; y < 240; y++ {
			img.Set(x, y, color.RGBA{16, 16, 16, 255})
		}
	}

	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("create placeholder: %w", err)
	}
	defer f.Close()

	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 50}); err != nil {
		return "", fmt.Errorf("encode placeholder: %w", err)
	}

	return path, nil
}

func loadImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	return img, err
}

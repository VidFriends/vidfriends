package hash

import (
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestHammingDistance(t *testing.T) {
	tests := []struct {
		a, b     uint64
		expected int
	}{
		{0, 0, 0},
		{1, 0, 1},
		{0xFF, 0x00, 8},
		{0xFFFF, 0x0000, 16},
		{0xAAAAAAAAAAAAAAAA, 0x5555555555555555, 64},
	}

	for _, tt := range tests {
		a := &PerceptualHash{Bits: tt.a}
		b := &PerceptualHash{Bits: tt.b}
		got := a.HammingDistance(b)
		if got != tt.expected {
			t.Errorf("HammingDistance(0x%X, 0x%X) = %d; want %d", tt.a, tt.b, got, tt.expected)
		}
	}
}

func TestIsDuplicate(t *testing.T) {
	a := &PerceptualHash{Bits: 0xFFFF}
	b := &PerceptualHash{Bits: 0xFF0F}

	if a.IsDuplicate(b, 3) {
		t.Error("expected not duplicate at threshold 3 (distance 4 > 3)")
	}
	if !a.IsDuplicate(b, 8) {
		t.Error("expected duplicate at threshold 8")
	}
	if a.IsDuplicate(nil, 10) {
		t.Error("expected false for nil other")
	}
	if !a.IsDuplicate(a, 0) {
		t.Error("expected true for same hash at threshold 0 (distance 0 <= 0)")
	}
}

func TestComputeFromBytes(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 4), uint8(y * 4), 128, 255})
		}
	}

	tmpFile := filepath.Join(t.TempDir(), "test.jpg")
	f, err := os.Create(tmpFile)
	if err != nil {
		t.Fatal(err)
	}
	jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	f.Close()

	data, err := os.ReadFile(tmpFile)
	if err != nil {
		t.Fatal(err)
	}

	phash, err := ComputeFromBytes(data)
	if err != nil {
		t.Fatalf("ComputeFromBytes failed: %v", err)
	}

	phash2, err := ComputeFromBytes(data)
	if err != nil {
		t.Fatalf("second ComputeFromBytes failed: %v", err)
	}

	if phash.Bits != phash2.Bits {
		t.Error("same image produced different hashes")
	}

	dist := phash.HammingDistance(phash2)
	if dist != 0 {
		t.Errorf("same image should have distance 0, got %d", dist)
	}
}

func TestBytesConversion(t *testing.T) {
	original := uint64(0xDEADBEEFCAFEBABE)
	bytes := uint64ToBytes(original)
	roundtrip := bytesToUint64(bytes)

	if original != roundtrip {
		t.Errorf("bytes conversion roundtrip failed: 0x%X -> 0x%X", original, roundtrip)
	}

	if len(bytes) != 8 {
		t.Errorf("expected 8 bytes, got %d", len(bytes))
	}
}

func TestDifferentImages(t *testing.T) {
	img1 := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			v := uint8((x + y) * 3)
			img1.Set(x, y, color.RGBA{v, v, v, 255})
		}
	}

	img2 := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			if (x+y)%2 == 0 {
				img2.Set(x, y, color.RGBA{255, 255, 255, 255})
			} else {
				img2.Set(x, y, color.RGBA{0, 0, 0, 255})
			}
		}
	}

	saveJPEG := func(img image.Image, name string) string {
		p := filepath.Join(t.TempDir(), name)
		f, _ := os.Create(p)
		jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
		f.Close()
		return p
	}

	p1 := saveJPEG(img1, "gradient.jpg")
	p2 := saveJPEG(img2, "checkerboard.jpg")

	d1, _ := os.ReadFile(p1)
	d2, _ := os.ReadFile(p2)

	h1, _ := ComputeFromBytes(d1)
	h2, _ := ComputeFromBytes(d2)

	dist := h1.HammingDistance(h2)
	if dist == 0 {
		t.Error("expected different images to have non-zero distance")
	}

	t.Logf("Hamming distance between gradient and checkerboard: %d", dist)
}

func TestHasherForType(t *testing.T) {
	tests := []struct {
		ht       HashType
		expected string
	}{
		{HashTypePHash, "*hash.PHashHasher"},
		{HashTypeDHash, "*hash.DHashHasher"},
		{HashTypeAHash, "*hash.AHashHasher"},
	}

	for _, tt := range tests {
		t.Run(string(tt.ht), func(t *testing.T) {
			h := HasherForType(tt.ht)
			if h == nil {
				t.Fatal("expected non-nil hasher")
			}
			if h.Type() != tt.ht {
				t.Errorf("expected type %s, got %s", tt.ht, h.Type())
			}
		})
	}
}

func TestHasherForType_Default(t *testing.T) {
	h := HasherForType("unknown")
	if _, ok := h.(*PHashHasher); !ok {
		t.Errorf("expected PHashHasher for unknown type, got %T", h)
	}
}

func TestDHashHasher_ComputeHash(t *testing.T) {
	h := NewDHashHasher()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 4), uint8(y * 4), 128, 255})
		}
	}
	hash, err := h.ComputeHash(img)
	if err != nil {
		t.Fatalf("ComputeHash failed: %v", err)
	}
	if hash == 0 {
		t.Error("expected non-zero hash")
	}
}

func TestAHashHasher_ComputeHash(t *testing.T) {
	h := NewAHashHasher()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 4), uint8(y * 4), 128, 255})
		}
	}
	hash, err := h.ComputeHash(img)
	if err != nil {
		t.Fatalf("ComputeHash failed: %v", err)
	}
	if hash == 0 {
		t.Error("expected non-zero hash")
	}
}

func TestComputeWithHasher(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for x := 0; x < 64; x++ {
		for y := 0; y < 64; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 4), uint8(y * 4), 128, 255})
		}
	}

	tmpFile := filepath.Join(t.TempDir(), "test.jpg")
	f, err := os.Create(tmpFile)
	if err != nil {
		t.Fatal(err)
	}
	jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	f.Close()

	hashers := []Hasher{NewPHashHasher(), NewDHashHasher(), NewAHashHasher()}
	for _, hasher := range hashers {
		t.Run(string(hasher.Type()), func(t *testing.T) {
			data, err := os.ReadFile(tmpFile)
			if err != nil {
				t.Fatal(err)
			}
			h1, err := ComputeFromBytesWithHasher(data, hasher)
			if err != nil {
				t.Fatalf("ComputeFromBytesWithHasher failed: %v", err)
			}
			h2, err := ComputeFromBytesWithHasher(data, hasher)
			if err != nil {
				t.Fatalf("second ComputeFromBytesWithHasher failed: %v", err)
			}
			if h1.Bits != h2.Bits {
				t.Error("same image produced different hashes")
			}
			dist := h1.HammingDistance(h2)
			if dist != 0 {
				t.Errorf("same image should have distance 0, got %d", dist)
			}
		})
	}
}

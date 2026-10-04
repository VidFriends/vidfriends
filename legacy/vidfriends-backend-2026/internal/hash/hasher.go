package hash

import (
	"fmt"
	"image"
	"os"

	goimagehash "github.com/corona10/goimagehash"
)

type HashType string

const (
	HashTypePHash HashType = "phash"
	HashTypeDHash HashType = "dhash"
	HashTypeAHash HashType = "ahash"
)

const DefaultHashType = HashTypePHash

type Hasher interface {
	ComputeHash(img image.Image) (uint64, error)
	ComputeHashFromFile(path string) (uint64, error)
	Distance(a, b uint64) (int, error)
	IsDuplicate(a, b uint64, threshold int) (bool, error)
	Type() HashType
}

type PHashHasher struct {
}

func NewPHashHasher() *PHashHasher {
	return &PHashHasher{}
}

func (h *PHashHasher) ComputeHash(img image.Image) (uint64, error) {
	hash, err := goimagehash.PerceptionHash(img)
	if err != nil {
		return 0, fmt.Errorf("phash computation failed: %w", err)
	}
	return hash.GetHash(), nil
}

func (h *PHashHasher) ComputeHashFromFile(path string) (uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open image: %w", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return 0, fmt.Errorf("decode image: %w", err)
	}
	return h.ComputeHash(img)
}

func (h *PHashHasher) Distance(a, b uint64) (int, error) {
	return goimagehash.NewImageHash(a, goimagehash.PHash).Distance(goimagehash.NewImageHash(b, goimagehash.PHash))
}

func (h *PHashHasher) IsDuplicate(a, b uint64, threshold int) (bool, error) {
	d, err := h.Distance(a, b)
	if err != nil {
		return false, err
	}
	return d <= threshold, nil
}

func (h *PHashHasher) Type() HashType {
	return HashTypePHash
}

type DHashHasher struct {
}

func NewDHashHasher() *DHashHasher {
	return &DHashHasher{}
}

func (h *DHashHasher) ComputeHash(img image.Image) (uint64, error) {
	hash, err := goimagehash.DifferenceHash(img)
	if err != nil {
		return 0, fmt.Errorf("dhash computation failed: %w", err)
	}
	return hash.GetHash(), nil
}

func (h *DHashHasher) ComputeHashFromFile(path string) (uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open image: %w", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return 0, fmt.Errorf("decode image: %w", err)
	}
	return h.ComputeHash(img)
}

func (h *DHashHasher) Distance(a, b uint64) (int, error) {
	return goimagehash.NewImageHash(a, goimagehash.DHash).Distance(goimagehash.NewImageHash(b, goimagehash.DHash))
}

func (h *DHashHasher) IsDuplicate(a, b uint64, threshold int) (bool, error) {
	d, err := h.Distance(a, b)
	if err != nil {
		return false, err
	}
	return d <= threshold, nil
}

func (h *DHashHasher) Type() HashType {
	return HashTypeDHash
}

type AHashHasher struct {
}

func NewAHashHasher() *AHashHasher {
	return &AHashHasher{}
}

func (h *AHashHasher) ComputeHash(img image.Image) (uint64, error) {
	hash, err := goimagehash.AverageHash(img)
	if err != nil {
		return 0, fmt.Errorf("ahash computation failed: %w", err)
	}
	return hash.GetHash(), nil
}

func (h *AHashHasher) ComputeHashFromFile(path string) (uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open image: %w", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return 0, fmt.Errorf("decode image: %w", err)
	}
	return h.ComputeHash(img)
}

func (h *AHashHasher) Distance(a, b uint64) (int, error) {
	return goimagehash.NewImageHash(a, goimagehash.AHash).Distance(goimagehash.NewImageHash(b, goimagehash.AHash))
}

func (h *AHashHasher) IsDuplicate(a, b uint64, threshold int) (bool, error) {
	d, err := h.Distance(a, b)
	if err != nil {
		return false, err
	}
	return d <= threshold, nil
}

func (h *AHashHasher) Type() HashType {
	return HashTypeAHash
}

func HasherForType(hashType HashType) Hasher {
	switch hashType {
	case HashTypeDHash:
		return NewDHashHasher()
	case HashTypeAHash:
		return NewAHashHasher()
	default:
		return NewPHashHasher()
	}
}

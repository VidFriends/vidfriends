package hash

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vidfriends.ai/backend/internal/model"
)

type Detector struct {
	db        *pgxpool.Pool
	threshold int
	hashType  HashType
}

func NewDetector(db *pgxpool.Pool, threshold int) *Detector {
	return &Detector{db: db, threshold: threshold, hashType: DefaultHashType}
}

func NewDetectorWithType(db *pgxpool.Pool, threshold int, hashType HashType) *Detector {
	return &Detector{db: db, threshold: threshold, hashType: hashType}
}

type DuplicateResult struct {
	IsDuplicate  bool
	CanonicalID  string
	GroupID      string
	Similarity   int
}

func (d *Detector) Check(ctx context.Context, videoID string, phash *PerceptualHash) (*DuplicateResult, error) {
	rows, err := d.db.Query(ctx,
		`SELECT h.video_id, h.hash
		 FROM hashes h
		 JOIN videos v ON v.id = h.video_id
		 WHERE h.algorithm = $2
		   AND h.video_id != $1
		   AND v.status = 'ready'`,
		videoID, string(d.hashType),
	)
	if err != nil {
		return nil, fmt.Errorf("query hashes: %w", err)
	}
	defer rows.Close()

	var closestHash string
	var closestDist int = d.threshold + 1

	for rows.Next() {
		var existingVideoID string
		var hashBytes []byte
		if err := rows.Scan(&existingVideoID, &hashBytes); err != nil {
			continue
		}

		if len(hashBytes) < 8 {
			continue
		}

		existingBits := bytesToUint64(hashBytes)
		other := &PerceptualHash{Bits: existingBits}
		dist := phash.HammingDistance(other)

		if dist < closestDist {
			closestDist = dist
			closestHash = existingVideoID
		}
	}

	if closestDist > d.threshold {
		return &DuplicateResult{IsDuplicate: false}, nil
	}

	slog.Info("duplicate detected",
		"video_id", videoID,
		"canonical_id", closestHash,
		"distance", closestDist,
		"threshold", d.threshold,
	)

	return &DuplicateResult{
		IsDuplicate: true,
		CanonicalID: closestHash,
		Similarity:  closestDist,
	}, nil
}

func (d *Detector) CreateOrJoinGroup(ctx context.Context, videoID, canonicalID string) (*model.DuplicateGroup, error) {
	tx, err := d.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var groupID string
	err = tx.QueryRow(ctx,
		`SELECT dg.id FROM duplicate_groups dg
		 JOIN videos v ON v.duplicate_group_id = dg.id
		 WHERE v.id = $1`,
		canonicalID,
	).Scan(&groupID)

	if err == pgx.ErrNoRows {
		err = tx.QueryRow(ctx,
			`INSERT INTO duplicate_groups (canonical_id)
			 VALUES ($1)
			 RETURNING id`,
			canonicalID,
		).Scan(&groupID)
		if err != nil {
			return nil, fmt.Errorf("create duplicate group: %w", err)
		}

		_, err = tx.Exec(ctx,
			`UPDATE videos SET duplicate_group_id = $1 WHERE id = $2`,
			groupID, canonicalID,
		)
		if err != nil {
			return nil, fmt.Errorf("assign canonical to group: %w", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("find existing group: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE videos SET duplicate_group_id = $1 WHERE id = $2`,
		groupID, videoID,
	)
	if err != nil {
		return nil, fmt.Errorf("assign duplicate to group: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE duplicate_groups SET updated_at = $1 WHERE id = $2`,
		time.Now(), groupID,
	)
	if err != nil {
		return nil, fmt.Errorf("update group: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &model.DuplicateGroup{
		ID:          groupID,
		CanonicalID: canonicalID,
	}, nil
}

func (d *Detector) MergeSocial(ctx context.Context, videoID, canonicalID string) error {
	tx, err := d.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO likes (user_id, video_id)
		 SELECT user_id, $1 FROM likes
		 WHERE video_id = $2
		   AND user_id NOT IN (SELECT user_id FROM likes WHERE video_id = $1)
		 ON CONFLICT DO NOTHING`,
		canonicalID, videoID,
	)
	if err != nil {
		return fmt.Errorf("merge likes: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE comments SET video_id = $1 WHERE video_id = $2`,
		canonicalID, videoID,
	)
	if err != nil {
		return fmt.Errorf("merge comments: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO reactions (user_id, video_id, emoji)
		 SELECT user_id, $1, emoji FROM reactions
		 WHERE video_id = $2
		   AND user_id NOT IN (SELECT user_id FROM reactions WHERE video_id = $1)
		 ON CONFLICT (user_id, video_id)
		 DO UPDATE SET emoji = EXCLUDED.emoji, updated_at = now()`,
		canonicalID, videoID,
	)
	if err != nil {
		return fmt.Errorf("merge reactions: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE received_videos SET video_id = $1 WHERE video_id = $2`,
		canonicalID, videoID,
	)
	if err != nil {
		return fmt.Errorf("merge received: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit social merge: %w", err)
	}

	slog.Info("merged social data",
		"from_video", videoID,
		"to_canonical", canonicalID,
	)

	return nil
}

func (d *Detector) SaveHash(ctx context.Context, videoID string, phash *PerceptualHash) error {
	_, err := d.db.Exec(ctx,
		`INSERT INTO hashes (video_id, hash, algorithm)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (video_id)
		 DO UPDATE SET hash = EXCLUDED.hash, algorithm = EXCLUDED.algorithm, created_at = now()`,
		videoID, uint64ToBytes(phash.Bits), string(d.hashType),
	)
	return err
}

func bytesToUint64(b []byte) uint64 {
	if len(b) < 8 {
		return 0
	}
	return uint64(b[0]) | uint64(b[1])<<8 | uint64(b[2])<<16 | uint64(b[3])<<24 |
		uint64(b[4])<<32 | uint64(b[5])<<40 | uint64(b[6])<<48 | uint64(b[7])<<56
}

func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	b[0] = byte(n)
	b[1] = byte(n >> 8)
	b[2] = byte(n >> 16)
	b[3] = byte(n >> 24)
	b[4] = byte(n >> 32)
	b[5] = byte(n >> 40)
	b[6] = byte(n >> 48)
	b[7] = byte(n >> 56)
	return b
}

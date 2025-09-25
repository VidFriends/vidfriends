package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/TheMinecraftGuyGuru/vidshare/backend/internal/models"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, url string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

func (s *Store) WithTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) CreateUser(ctx context.Context, username, password string) (*models.User, error) {
	row := s.pool.QueryRow(ctx, `
INSERT INTO users (username, password_hash)
VALUES ($1, $2)
RETURNING id, username, password_hash, created_at
`, username, password)
	return scanUser(row)
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, username, password_hash, created_at
FROM users
WHERE username = $1
`, username)
	return scanUser(row)
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (*models.User, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, username, password_hash, created_at
FROM users
WHERE id = $1
`, id)
	return scanUser(row)
}

func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	if err := row.Scan(&u.ID, &u.Username, &u.Password, &u.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *Store) CreateSession(ctx context.Context, userID int64, token string, expires time.Time) error {
	_, err := s.pool.Exec(ctx, `
INSERT INTO sessions (user_id, token, expires_at)
VALUES ($1, $2, $3)
`, userID, token, expires)
	return err
}

func (s *Store) GetSession(ctx context.Context, token string) (*models.Session, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, user_id, token, expires_at, created_at
FROM sessions
WHERE token = $1
`, token)
	var sess models.Session
	if err := row.Scan(&sess.ID, &sess.UserID, &sess.Token, &sess.ExpiresAt, &sess.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &sess, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *Store) CountVideosForUser(ctx context.Context, userID int64) (int, error) {
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM videos WHERE owner_id = $1`, userID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Store) CreateVideo(ctx context.Context, ownerID int64, v *models.Video) (*models.Video, error) {
	row := s.pool.QueryRow(ctx, `
INSERT INTO videos (owner_id, url, title, thumbnail_url, duration_seconds, description)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, owner_id, url, title, thumbnail_url, duration_seconds, description, created_at
`, ownerID, v.URL, v.Title, v.Thumbnail, v.Duration, v.Description)
	return scanVideo(row)
}

func (s *Store) GetVideo(ctx context.Context, videoID int64) (*models.Video, error) {
	row := s.pool.QueryRow(ctx, `
SELECT id, owner_id, url, title, thumbnail_url, duration_seconds, description, created_at
FROM videos
WHERE id = $1
`, videoID)
	return scanVideo(row)
}

func scanVideo(row pgx.Row) (*models.Video, error) {
	var v models.Video
	if err := row.Scan(&v.ID, &v.OwnerID, &v.URL, &v.Title, &v.Thumbnail, &v.Duration, &v.Description, &v.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &v, nil
}

func (s *Store) CreateShare(ctx context.Context, senderID, targetID, videoID int64, note string) (*models.Share, error) {
	row := s.pool.QueryRow(ctx, `
INSERT INTO video_shares (video_id, sender_id, target_id, note)
VALUES ($1, $2, $3, $4)
RETURNING id, video_id, sender_id, target_id, note, created_at
`, videoID, senderID, targetID, note)
	return scanShare(row)
}

func scanShare(row pgx.Row) (*models.Share, error) {
	var s models.Share
	if err := row.Scan(&s.ID, &s.VideoID, &s.SenderID, &s.TargetID, &s.Note, &s.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (s *Store) ListSharesForUser(ctx context.Context, userID int64) ([]*models.Share, error) {
	rows, err := s.pool.Query(ctx, `
SELECT
s.id,
s.video_id,
s.sender_id,
s.target_id,
s.note,
s.created_at,
v.id,
v.owner_id,
v.url,
v.title,
v.thumbnail_url,
v.duration_seconds,
v.description,
v.created_at,
u.id,
u.username,
u.created_at
FROM video_shares s
JOIN videos v ON v.id = s.video_id
JOIN users u ON u.id = s.sender_id
WHERE s.target_id = $1
ORDER BY s.created_at DESC
`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []*models.Share
	for rows.Next() {
		share := &models.Share{Video: &models.Video{}, Sender: &models.User{}}
		if err := rows.Scan(
			&share.ID,
			&share.VideoID,
			&share.SenderID,
			&share.TargetID,
			&share.Note,
			&share.CreatedAt,
			&share.Video.ID,
			&share.Video.OwnerID,
			&share.Video.URL,
			&share.Video.Title,
			&share.Video.Thumbnail,
			&share.Video.Duration,
			&share.Video.Description,
			&share.Video.CreatedAt,
			&share.Sender.ID,
			&share.Sender.Username,
			&share.Sender.CreatedAt,
		); err != nil {
			return nil, err
		}
		shares = append(shares, share)
	}
	return shares, rows.Err()
}

func (s *Store) ListFriends(ctx context.Context, userID int64) ([]*models.User, error) {
	rows, err := s.pool.Query(ctx, `
SELECT DISTINCT u.id, u.username, u.created_at
FROM friendships f
JOIN users u ON u.id = f.friend_id
WHERE f.user_id = $1
ORDER BY u.username
`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) UpsertFriendship(ctx context.Context, userID, friendID int64) error {
	_, err := s.pool.Exec(ctx, `
INSERT INTO friendships (user_id, friend_id)
VALUES ($1, $2)
ON CONFLICT (user_id, friend_id) DO NOTHING
`, userID, friendID)
	return err
}

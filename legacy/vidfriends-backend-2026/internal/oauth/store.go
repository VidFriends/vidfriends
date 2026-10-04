package oauth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TokenStore struct {
	db *pgxpool.Pool
}

func NewTokenStore(db *pgxpool.Pool) *TokenStore {
	return &TokenStore{db: db}
}

type StoredToken struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Provider       string    `json:"provider"`
	AccessToken    string    `json:"-"`
	RefreshToken   string    `json:"-"`
	TokenType      string    `json:"token_type"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	Scope          string    `json:"scope,omitempty"`
	ProviderUserID string    `json:"provider_user_id,omitempty"`
	ProviderUserName string  `json:"provider_user_name,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (s *TokenStore) Save(ctx context.Context, userID, provider string, token *Token, userName string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, token_type, expires_at, scope, provider_user_id, provider_user_name)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (user_id, provider) DO UPDATE SET
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_type = EXCLUDED.token_type,
			expires_at = EXCLUDED.expires_at,
			scope = EXCLUDED.scope,
			provider_user_id = EXCLUDED.provider_user_id,
			provider_user_name = EXCLUDED.provider_user_name,
			updated_at = now()
	`,
		userID, provider, token.AccessToken, token.RefreshToken,
		token.TokenType, token.ExpiresAt, token.Scope,
		token.ProviderUserID, userName,
	)
	return err
}

func (s *TokenStore) Get(ctx context.Context, userID, provider string) (*StoredToken, error) {
	t := &StoredToken{}
	err := s.db.QueryRow(ctx, `
		SELECT id, user_id, provider, access_token, refresh_token, token_type,
		       expires_at, scope, provider_user_id, provider_user_name,
		       created_at, updated_at
		FROM oauth_tokens
		WHERE user_id = $1 AND provider = $2
	`, userID, provider).Scan(
		&t.ID, &t.UserID, &t.Provider, &t.AccessToken, &t.RefreshToken,
		&t.TokenType, &t.ExpiresAt, &t.Scope, &t.ProviderUserID,
		&t.ProviderUserName, &t.CreatedAt, &t.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return t, err
}

func (s *TokenStore) Delete(ctx context.Context, userID, provider string) error {
	_, err := s.db.Exec(ctx, `
		DELETE FROM oauth_tokens WHERE user_id = $1 AND provider = $2
	`, userID, provider)
	return err
}

func (s *TokenStore) ListByUser(ctx context.Context, userID string) ([]StoredToken, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, user_id, provider, access_token, refresh_token, token_type,
		       expires_at, scope, provider_user_id, provider_user_name,
		       created_at, updated_at
		FROM oauth_tokens
		WHERE user_id = $1
		ORDER BY provider
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []StoredToken
	for rows.Next() {
		var t StoredToken
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.Provider, &t.AccessToken, &t.RefreshToken,
			&t.TokenType, &t.ExpiresAt, &t.Scope, &t.ProviderUserID,
			&t.ProviderUserName, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

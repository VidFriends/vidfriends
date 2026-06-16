CREATE TABLE invite_tokens (
    token       TEXT PRIMARY KEY,
    used_by     UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_tokens_expires_at ON invite_tokens (expires_at);

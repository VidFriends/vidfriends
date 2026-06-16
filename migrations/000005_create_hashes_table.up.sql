CREATE TABLE hashes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id   UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
    hash       BYTEA NOT NULL,
    algorithm  TEXT NOT NULL DEFAULT 'sha256',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hashes_hash ON hashes (hash);

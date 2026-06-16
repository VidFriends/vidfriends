ALTER TABLE videos
  ADD COLUMN source_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN source_platform TEXT NOT NULL DEFAULT '';

CREATE TABLE downloads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_url    TEXT NOT NULL,
    platform      TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT NOT NULL DEFAULT '',
    file_path     TEXT NOT NULL DEFAULT '',
    file_size     BIGINT NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_downloads_video_id ON downloads (video_id);
CREATE INDEX idx_downloads_user_id ON downloads (user_id);
CREATE INDEX idx_downloads_status ON downloads (status);

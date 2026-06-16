CREATE TYPE video_status AS ENUM ('processing', 'ready', 'failed', 'deleted');

CREATE TABLE videos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    file_url     TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    duration     INTERVAL NOT NULL DEFAULT '0 seconds',
    status       video_status NOT NULL DEFAULT 'processing',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_user_id ON videos (user_id);
CREATE INDEX idx_videos_status ON videos (status);
CREATE INDEX idx_videos_created_at ON videos (created_at DESC);

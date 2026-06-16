CREATE TABLE watch_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id         UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    watched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    progress_seconds INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_watch_history_user_id ON watch_history (user_id);
CREATE INDEX idx_watch_history_video_id ON watch_history (video_id);
CREATE INDEX idx_watch_history_watched_at ON watch_history (watched_at DESC);
CREATE UNIQUE INDEX idx_watch_history_user_video_unique ON watch_history (user_id, video_id);

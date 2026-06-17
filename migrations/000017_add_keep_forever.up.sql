ALTER TABLE videos ADD COLUMN keep_forever BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_videos_keep_forever ON videos (keep_forever);

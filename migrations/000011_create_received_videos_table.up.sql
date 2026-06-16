CREATE TABLE received_videos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id     UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption      TEXT,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_send UNIQUE (video_id, sender_id, recipient_id)
);

CREATE INDEX idx_received_videos_recipient ON received_videos (recipient_id, created_at DESC);
CREATE INDEX idx_received_videos_sender ON received_videos (sender_id);

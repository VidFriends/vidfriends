CREATE TABLE duplicate_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE videos ADD COLUMN duplicate_group_id UUID REFERENCES duplicate_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_videos_duplicate_group ON videos (duplicate_group_id);

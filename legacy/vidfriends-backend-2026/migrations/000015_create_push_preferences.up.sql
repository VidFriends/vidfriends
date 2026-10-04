CREATE TABLE push_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    ntfy_topic      TEXT,
    gotify_url      TEXT,
    gotify_token    TEXT,
    fcm_token       TEXT,
    apns_token      TEXT,
    enabled_events  TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_push_preferences_user_id ON push_preferences (user_id);

CREATE INDEX idx_push_preferences_ntfy_topic ON push_preferences (ntfy_topic) WHERE ntfy_topic IS NOT NULL;
CREATE INDEX idx_push_preferences_gotify_token ON push_preferences (gotify_token) WHERE gotify_token IS NOT NULL;

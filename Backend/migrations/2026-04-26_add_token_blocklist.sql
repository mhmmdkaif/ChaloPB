-- Ensure token_blocklist exists for JWT revocation/logout invalidation.
CREATE TABLE IF NOT EXISTS token_blocklist (
  id BIGSERIAL PRIMARY KEY,
  jti TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires_at
  ON token_blocklist(expires_at);

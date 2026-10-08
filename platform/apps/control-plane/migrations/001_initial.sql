CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identities (
  id uuid PRIMARY KEY,
  oidc_issuer text,
  oidc_subject text,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (oidc_issuer, oidc_subject)
);

CREATE TABLE IF NOT EXISTS rooms (
  id varchar(80) PRIMARY KEY,
  created_by uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS room_sessions (
  id uuid PRIMARY KEY,
  room_id varchar(80) NOT NULL REFERENCES rooms(id),
  actor_id uuid NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('host', 'moderator', 'participant', 'viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id uuid PRIMARY KEY,
  url text NOT NULL,
  signing_secret_ciphertext text NOT NULL,
  events text[] NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES webhook_subscriptions(id),
  event_id uuid NOT NULL,
  status varchar(16) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, event_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  room_id varchar(80),
  actor_role varchar(16),
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_sessions_room_id_idx ON room_sessions (room_id, joined_at);
CREATE INDEX IF NOT EXISTS audit_events_room_id_idx ON audit_events (room_id, occurred_at DESC);

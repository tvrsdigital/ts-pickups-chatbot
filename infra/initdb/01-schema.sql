CREATE TABLE sessions (
  igsid           text PRIMARY KEY,
  typebot_session text,
  handoff_until   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE processed_mids (
  mid text PRIMARY KEY,
  ts  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  user_hash  text NOT NULL,
  event      text NOT NULL,
  detail     text,
  latency_ms integer
);

CREATE TABLE config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
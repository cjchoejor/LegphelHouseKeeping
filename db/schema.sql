-- Legphel Housekeeping — auth & policy schema (run once on your Neon database)
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT.

-- A person who works at the hotel and may use the app.
CREATE TABLE IF NOT EXISTS staff_info (
  staff_id    SERIAL PRIMARY KEY,
  full_name   TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT,
  role        TEXT        NOT NULL CHECK (role IN ('housekeeping', 'gm', 'admin')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login credentials, one per staff member.
CREATE TABLE IF NOT EXISTS users (
  user_id         SERIAL PRIMARY KEY,
  staff_id        INTEGER     NOT NULL REFERENCES staff_info(staff_id) ON DELETE CASCADE,
  username        TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  last_login      TIMESTAMPTZ,
  failed_attempts INTEGER     NOT NULL DEFAULT 0,  -- brute-force protection for short PINs
  locked_until    TIMESTAMPTZ,                     -- account temporarily locked after too many wrong tries
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row config: how many days before/after today housekeeping may view.
CREATE TABLE IF NOT EXISTS policy_for_date_range (
  id          INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  days_before INTEGER     NOT NULL DEFAULT 1,
  days_after  INTEGER     NOT NULL DEFAULT 1,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO policy_for_date_range (id, days_before, days_after)
VALUES (1, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Audit trail of every administrative change.
CREATE TABLE IF NOT EXISTS change_log (
  id          SERIAL PRIMARY KEY,
  changed_by  TEXT,                       -- username who made the change
  change_type TEXT        NOT NULL,       -- 'policy_update' | 'user_create' | 'user_delete' | 'password_change'
  details     JSONB,                      -- { old: ..., new: ... }
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who opened / logged into the app, and when.
CREATE TABLE IF NOT EXISTS access_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  username   TEXT,
  role       TEXT,
  action     TEXT        NOT NULL,        -- 'login' | 'open'
  ip         TEXT,
  user_agent TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

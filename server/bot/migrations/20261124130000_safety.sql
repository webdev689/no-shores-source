-- Moderation cases: one row per act, numbered per server. A warning counts while `active`; a temporary ban waits
-- for `expires_at` while `active`. Times are Unix seconds.
CREATE TABLE mod_cases (
  guild_id TEXT NOT NULL,
  case_no INTEGER NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  mod_id TEXT NOT NULL,
  mod_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  duration_s INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, case_no)
);
CREATE INDEX mod_cases_user ON mod_cases (guild_id, user_id, case_no DESC);
CREATE INDEX mod_cases_expiry ON mod_cases (expires_at) WHERE expires_at > 0 AND active = 1;

-- A server in raid mode: until when, and the verification level to give back when it ends (-1: left as it was).
CREATE TABLE raid_mode (
  guild_id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  until_s INTEGER NOT NULL,
  prior_level INTEGER NOT NULL DEFAULT -1
);

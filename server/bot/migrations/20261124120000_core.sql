-- The bot's own database: what the panel configures, what the Gateway knows of each server, who did what, and the
-- panel's sign-in. Times are Unix seconds.

-- One row per server and module: its settings as JSON, checked against the module's schema before it is written.
-- `rev` rises on every write, so two people saving the same page cannot silently overwrite each other.
CREATE TABLE guild_config (
  guild_id TEXT NOT NULL,
  module TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (guild_id, module)
);

-- What the Gateway last saw of each server, so the panel can list channels and roles without asking Discord.
CREATE TABLE guild_snapshot (
  guild_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  owner_id TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  roles TEXT NOT NULL DEFAULT '[]',
  channels TEXT NOT NULL DEFAULT '[]',
  present INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- Every change made through the panel or the bot, newest first per server.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_guild ON audit_log (guild_id, id DESC);

-- A Discord sign-in in flight: the state sent to Discord (kept as its hash) and the PKCE verifier that goes with it.
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A finished sign-in waiting for the panel to collect it: one use, two minutes.
CREATE TABLE panel_tickets (
  ticket_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A signed-in panel. Only the token's hash is kept.
CREATE TABLE panel_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX panel_sessions_user ON panel_sessions (user_id);

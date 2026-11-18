-- Every player is an account from their first visit: a guest, who may add a username and password or Discord.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT,
  -- The username folded to lower case, so no two accounts share one however it is typed.
  username_key TEXT UNIQUE,
  -- `pbkdf2-sha256$<iterations>$<salt>$<derived>`, both in base64.
  password TEXT,
  discord_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

-- A session is a random token in the player's browser, kept here only as its SHA-256.
-- One with a way back in to its account lapses once it has gone unseen a month.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_account ON sessions (account_id);
CREATE INDEX sessions_by_seen ON sessions (seen_at);

-- Each account's character (the gear crate's Character as JSON; null until a room first keeps it), and the one
-- player in one room that holds it now, whose hold lapses once that room stops saving it.
CREATE TABLE characters (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  body TEXT,
  holder TEXT,
  held_until INTEGER NOT NULL DEFAULT 0,
  saved_at INTEGER NOT NULL DEFAULT 0
);

-- Discord's sign-in under way: a state sent to Discord, the page to come back to, the account it may link and the
-- nonce the page kept for itself, which it shows again to take what came back; or, with no page, a ticket a
-- signed-in page takes to Discord to say which account is asking.
CREATE TABLE discord_states (
  state TEXT PRIMARY KEY,
  account_id TEXT,
  back TEXT,
  nonce TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX discord_states_by_age ON discord_states (created_at);

-- What a Discord sign-in came to, held under a one-time code until the page that began it takes it: a sign-in to an
-- account (null for a new one) or a link to the page's own account, with the Discord account it was for.
CREATE TABLE discord_codes (
  code TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  kind TEXT NOT NULL,
  account_id TEXT,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX discord_codes_by_age ON discord_codes (created_at);

-- How often one address or username has asked within a window, to slow guessing and floods.
CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX limits_by_window ON limits (window_start);

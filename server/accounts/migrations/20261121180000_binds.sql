-- Each account's controls as its player bound them: what differs from the game's defaults, as JSON
-- (client/src/player/binds.ts reads it), so a player's binds follow them to any browser.
CREATE TABLE binds (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);

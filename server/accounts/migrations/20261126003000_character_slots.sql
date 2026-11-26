-- An account keeps four characters, one in play. The one in play stays the `characters` row, so all that reads the
-- account's character reads it; `slot` says which of the four it is, and `look` is its figure as the page chose it.
ALTER TABLE characters ADD COLUMN slot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN look TEXT;

-- The other three, each kept as it was when another was chosen to play: a slot with no row here is empty.
CREATE TABLE benched (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 3),
  body TEXT,
  look TEXT,
  room TEXT,
  came_from TEXT,
  saved_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, slot)
);

-- The vault and Aurem, the account's and shared by all four (`gear::shared`), saved with the character in play; none
-- until a room first saves one, while a character kept before this still holds its own.
CREATE TABLE vaults (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  saved_at INTEGER NOT NULL DEFAULT 0
);

-- A benched character's carried errand, as `characters_errand` indexes the one in play's, so its answer is kept.
CREATE INDEX benched_errand ON benched (json_extract(CASE WHEN json_valid(body) THEN body END, '$.errand.rid'));

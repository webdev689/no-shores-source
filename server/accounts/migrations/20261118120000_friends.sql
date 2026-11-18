-- Friends, after Destiny's: one row for each pair, from the player who asked to the player asked, waiting until the
-- one asked accepts.
CREATE TABLE friends (
  asker_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  asked_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (asker_id, asked_id)
);
CREATE INDEX friends_by_asked ON friends (asked_id);
-- One row a pair whichever asked, so two asks that cross at once cannot both be kept.
CREATE UNIQUE INDEX friends_pair ON friends (min(asker_id, asked_id), max(asker_id, asked_id));

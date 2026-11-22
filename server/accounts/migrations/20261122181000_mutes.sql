-- Whom each player mutes: the muted player's chat lines never reach them. Kept with the account, so a mute follows the
-- player to any browser; ended by unmuting, and gone with either account.
CREATE TABLE mutes (
  muter_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  muted_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (muter_id, muted_id)
);
CREATE INDEX mutes_by_muted ON mutes (muted_id);

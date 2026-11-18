-- The nonce a page kept for itself when it sent its player to Discord, which it shows again to take what came back.
ALTER TABLE discord_states ADD COLUMN nonce TEXT;

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
CREATE INDEX discord_states_by_age ON discord_states (created_at);

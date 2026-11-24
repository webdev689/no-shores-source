-- A guild's treasury, Aurem its members put in and its outposts earn, spent only on its outposts; and its ledger, a
-- line for each move with the balance after, named by an id each ask makes, so an ask made twice moves once.
ALTER TABLE guilds ADD COLUMN treasury INTEGER NOT NULL DEFAULT 0 CHECK (treasury >= 0 AND treasury <= 1000000);
CREATE TABLE guild_ledger (
  guild_id TEXT NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  rid TEXT NOT NULL,
  mark TEXT NOT NULL,
  account_id TEXT,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, rid)
);
-- A guild's outposts, one at a site: when it was raised, the Aurem spent on it, and its strongbox and stores, each
-- filled by time since it was last settled.
CREATE TABLE outposts (
  guild_id TEXT NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  raised_at INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  strongbox INTEGER NOT NULL DEFAULT 0,
  strongbox_at INTEGER NOT NULL,
  stores TEXT NOT NULL DEFAULT '{}',
  stores_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, site)
);
-- Each structure on an outpost's plot: its kind, the tier built and the tier being built over it (0 for none) with
-- the materials delivered toward it, its corner cell and turn, and the Aurem spent on it.
CREATE TABLE outpost_structures (
  guild_id TEXT NOT NULL,
  site TEXT NOT NULL,
  id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  tier INTEGER NOT NULL,
  building INTEGER NOT NULL DEFAULT 0,
  delivered TEXT NOT NULL DEFAULT '{}',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, site, id),
  FOREIGN KEY (guild_id, site) REFERENCES outposts (guild_id, site) ON DELETE CASCADE
);
-- Each piece of decoration on an outpost's plot, at metres from its corner, and what it cost.
CREATE TABLE outpost_decor (
  guild_id TEXT NOT NULL,
  site TEXT NOT NULL,
  id INTEGER NOT NULL,
  piece TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  turn INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  PRIMARY KEY (guild_id, site, id),
  FOREIGN KEY (guild_id, site) REFERENCES outposts (guild_id, site) ON DELETE CASCADE
);
-- What each member took from their guild's outposts' stores each day, of each material.
CREATE TABLE outpost_takes (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  stuff TEXT NOT NULL,
  taken INTEGER NOT NULL,
  PRIMARY KEY (account_id, day, stuff)
);
-- The week a guild last sounded its War Horn: once a week.
ALTER TABLE guilds ADD COLUMN horn_week INTEGER NOT NULL DEFAULT -1;

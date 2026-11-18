-- What the Roster keeps, after Destiny 1's: whom each player blocks; parties of up to three, each player's party
-- privacy and the invites between them; guilds, their members and invites; reports for the owner to read; and where
-- a player is in a room that keeps no character (the sea).

-- Who may join a player's party: 0 anyone, 1 their friends (Destiny's own first setting), 2 whom they invite,
-- 3 no one.
ALTER TABLE accounts ADD COLUMN privacy INTEGER NOT NULL DEFAULT 1;

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX blocks_by_blocked ON blocks (blocked_id);

-- A party of two or three; a player alone leads their own, which needs no row. A player is in one at most.
CREATE TABLE parties (
  id TEXT PRIMARY KEY,
  leader_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE party_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  party_id TEXT NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL
);
CREATE INDEX party_members_by_party ON party_members (party_id);
CREATE TABLE party_invites (
  from_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX party_invites_by_to ON party_invites (to_id);

-- A guild: its name and tag, each unique however it is typed, and its motto. A player is in one at most, at a rank:
-- 0 its founder, 1 an admin, 2 a member.
CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL,
  tag_key TEXT NOT NULL UNIQUE,
  motto TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE guild_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX guild_members_by_guild ON guild_members (guild_id);
CREATE TABLE guild_invites (
  guild_id TEXT NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, account_id)
);
CREATE INDEX guild_invites_by_account ON guild_invites (account_id);

-- A player reported by another, and why, for the owner to read.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reported_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Where a player is in a room that keeps no character, until a while after its room last said so.
CREATE TABLE presence (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  room TEXT NOT NULL,
  until INTEGER NOT NULL
);

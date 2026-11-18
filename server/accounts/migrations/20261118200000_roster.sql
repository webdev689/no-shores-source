-- What the Roster keeps, after Destiny 1's: whom each player blocks; fireteams of up to three, each player's fireteam
-- privacy and the invites between them; guilds, their members and invites; reports for the owner to read; and where
-- a player is in a room that keeps no character (the sea).

-- Who may join a player's fireteam: 0 anyone, 1 their friends (Destiny's own first setting), 2 whom they invite,
-- 3 no one.
ALTER TABLE accounts ADD COLUMN privacy INTEGER NOT NULL DEFAULT 1;

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX blocks_by_blocked ON blocks (blocked_id);

-- A fireteam of two or three; a player alone leads their own, which needs no row. A player is in one at most.
CREATE TABLE fireteams (
  id TEXT PRIMARY KEY,
  leader_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE fireteam_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  fireteam_id TEXT NOT NULL REFERENCES fireteams (id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL
);
CREATE INDEX fireteam_members_by_fireteam ON fireteam_members (fireteam_id);
CREATE TABLE fireteam_invites (
  from_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX fireteam_invites_by_to ON fireteam_invites (to_id);

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
-- The players in a room are found from these: those it last saw, and the characters it holds (each holder begins with
-- its room's name), never by reading every account.
CREATE INDEX presence_by_room ON presence (room);
CREATE INDEX characters_by_holder ON characters (holder);

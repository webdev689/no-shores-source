-- What each guild did each week: the XP its members gave it and their counts toward the week's four guild bounties,
-- each bounty marked done once its count reaches its target, and paid (its XP added to the guild) once.
CREATE TABLE guild_weeks (
  guild_id TEXT NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  given INTEGER NOT NULL DEFAULT 0,
  count0 INTEGER NOT NULL DEFAULT 0,
  count1 INTEGER NOT NULL DEFAULT 0,
  count2 INTEGER NOT NULL DEFAULT 0,
  count3 INTEGER NOT NULL DEFAULT 0,
  done0 INTEGER NOT NULL DEFAULT 0,
  done1 INTEGER NOT NULL DEFAULT 0,
  done2 INTEGER NOT NULL DEFAULT 0,
  done3 INTEGER NOT NULL DEFAULT 0,
  paid0 INTEGER NOT NULL DEFAULT 0,
  paid1 INTEGER NOT NULL DEFAULT 0,
  paid2 INTEGER NOT NULL DEFAULT 0,
  paid3 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, week)
);
-- How much of a member's week their guild has been given already: their character's guild record as last counted,
-- so each save adds only what came since; set at joining, so nothing done before it counts.
ALTER TABLE guild_members ADD COLUMN counted TEXT NOT NULL DEFAULT '';

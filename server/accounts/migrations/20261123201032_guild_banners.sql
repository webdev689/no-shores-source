-- A guild's face beyond its name: the banner its founder and admins make (the banner law's parts as JSON, written at
-- its founding from its name), its description in its own words, and the XP its members have earned it, whose sum
-- sets its level. A guild founded before this keeps an empty banner, which reads as the one its name draws.
ALTER TABLE guilds ADD COLUMN banner TEXT NOT NULL DEFAULT '';
ALTER TABLE guilds ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE guilds ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0);

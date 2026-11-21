-- The room that last held each character, and the room that held it before: the rooms judge where a character comes
-- from by them, so no one arrives anywhere on their page's word.
ALTER TABLE characters ADD COLUMN room TEXT;
ALTER TABLE characters ADD COLUMN came_from TEXT;
-- A character held as this lands is in the room its holder names (`<room>:<id>`), so a player playing through the
-- deploy is judged from where they stand.
UPDATE characters SET room = substr(holder, 1, instr(holder, ':') - 1) WHERE instr(holder, ':') > 0;

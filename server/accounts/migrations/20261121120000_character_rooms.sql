-- The room that last held each character, and the room that held it before: the rooms judge where a character comes
-- from by them, so no one arrives anywhere on their page's word.
ALTER TABLE characters ADD COLUMN room TEXT;
ALTER TABLE characters ADD COLUMN came_from TEXT;

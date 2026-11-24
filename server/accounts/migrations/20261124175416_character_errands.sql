-- An outpost errand's kept answer is forgotten a week on, once no character carries the errand (`gear::errand`), which
-- asks again whenever a room next holds it. Each saved character's carried errand's id, indexed, so the answers none
-- carries are found without reading every character; a body that is no JSON carries none, and is saved as ever.
CREATE INDEX characters_errand ON characters (json_extract(CASE WHEN json_valid(body) THEN body END, '$.errand.rid'));

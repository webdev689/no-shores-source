-- What the server layout made or adopted in a server, by its part's key: a build never makes a part twice, keeps one
-- renamed by hand, and leaves out one deleted by hand. `made` is 0 for a part that was there already and was adopted.
CREATE TABLE layout_parts (
  guild_id TEXT NOT NULL,
  part TEXT NOT NULL,
  discord_id TEXT NOT NULL DEFAULT '',
  made INTEGER NOT NULL DEFAULT 1,
  at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, part)
);

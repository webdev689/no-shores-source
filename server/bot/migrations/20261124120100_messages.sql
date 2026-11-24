-- Messages and their pictures.
-- guild_snapshot.emojis   the server's own emoji, for the panel's emoji picker.
-- announce_posts          the post an announcement made in each channel, so Edit in place changes it instead of
--                         posting again. A post deleted in Discord is posted afresh and its row replaced.
-- media                   a picture a server uploaded for its messages: kept in the BOT_MEDIA bucket under `id`,
--                         served to anyone with its address. The row holds who uploaded it and its size, so each
--                         server is held to its share.
ALTER TABLE guild_snapshot ADD COLUMN emojis TEXT NOT NULL DEFAULT '[]';

CREATE TABLE announce_posts (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name, channel_id)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  by_user TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX media_by_guild ON media (guild_id, at);

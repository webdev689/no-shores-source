-- The engagement modules' tables: giveaways, starboard posts, tickets, birthdays, voice rooms, invite joins and
-- the feeds already read. Times are Unix seconds.

CREATE TABLE giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL DEFAULT '',
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL,
  required_role TEXT NOT NULL DEFAULT '',
  host_id TEXT NOT NULL,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  winner_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX giveaways_due ON giveaways (ends_at) WHERE ended = 0;
CREATE TABLE giveaway_entries (
  giveaway_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

-- A starred message and the starboard post that shows it.
CREATE TABLE starboard_posts (
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  star_message_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  PRIMARY KEY (guild_id, message_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER NOT NULL DEFAULT 0,
  closed_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX tickets_open ON tickets (guild_id, user_id) WHERE closed_at = 0;
CREATE INDEX tickets_channel ON tickets (channel_id);

-- `role_on` is the day (YYYYMMDD) the birthday role was given, so the clock takes it back the day after.
CREATE TABLE birthdays (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  told_year INTEGER NOT NULL DEFAULT 0,
  role_on INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX birthdays_day ON birthdays (month, day);

-- A voice room the bot made for a member, deleted when it empties.
CREATE TABLE temp_voice (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  made_at INTEGER NOT NULL
);

CREATE TABLE invite_joins (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  code TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX invite_joins_inviter ON invite_joins (guild_id, inviter_id);

-- The newest item already told of in each feed, by a key of the feed's address.
CREATE TABLE social_seen (
  guild_id TEXT NOT NULL,
  feed TEXT NOT NULL,
  last_id TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, feed)
);

-- The community modules' tables. Times are Unix seconds.
-- welcome_pending   a new member's roles still to give: after a delay (`due_at`), or once Discord's membership
--                   screening is passed (`due_at` -1, set when they pass).
-- levels            each member's experience in a server. `level` is the one last announced, so a level is told once.
-- rolemenu_posts    where each role menu was posted, by the menu's name, so publishing again edits it and reactions
--                   find it.
-- announce_sent     when each scheduled announcement was last sent, by its name.
CREATE TABLE welcome_pending (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX welcome_pending_due ON welcome_pending (due_at) WHERE due_at > 0;

CREATE TABLE levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX levels_rank ON levels (guild_id, xp DESC);

CREATE TABLE rolemenu_posts (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, name)
);
CREATE INDEX rolemenu_posts_message ON rolemenu_posts (message_id);

CREATE TABLE announce_sent (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);

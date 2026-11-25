-- The bans and unbans the bot asked Discord for in the last few minutes, one row an ask. Discord's word of a ban or an
-- unban does not say who made it; one the bot did not ask for was made by hand, and ends the member's ban cases so no
-- time limit of the bot's lifts it. `at` is when the bot asked, in Unix seconds; the clock lets go of old rows.
CREATE TABLE bot_ban_asks (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX bot_ban_asks_member ON bot_ban_asks (guild_id, user_id, action);
CREATE INDEX bot_ban_asks_at ON bot_ban_asks (at);

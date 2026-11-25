-- The servers Discord said a person is in when they signed in to the panel, as a JSON list of ids, so the panel lists
-- only the servers they share with the bot. Null where Discord did not answer: the panel then weighs the bot's first
-- servers by name instead.
ALTER TABLE panel_tickets ADD COLUMN guilds TEXT;
ALTER TABLE panel_sessions ADD COLUMN guilds TEXT;

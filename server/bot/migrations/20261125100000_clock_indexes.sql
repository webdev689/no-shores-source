-- What the clock reads each minute, by index rather than by reading every row.
-- guild_config_on     the servers where a module is on, for the modules that run on the clock.
-- birthdays_role_on   the members of a server still holding the day's birthday role.
CREATE INDEX guild_config_on ON guild_config (module) WHERE enabled = 1;
CREATE INDEX birthdays_role_on ON birthdays (guild_id, role_on) WHERE role_on > 0;

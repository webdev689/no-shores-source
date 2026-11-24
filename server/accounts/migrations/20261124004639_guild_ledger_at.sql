-- A guild's ledger is read and pruned newest first, by guild and time.
CREATE INDEX guild_ledger_at ON guild_ledger (guild_id, at);
-- Unanswered guild invites are let go by age as new ones are sent.
CREATE INDEX guild_invites_at ON guild_invites (created_at);

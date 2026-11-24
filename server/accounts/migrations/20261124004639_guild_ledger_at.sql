-- A guild's ledger is read and pruned newest first, by guild and time.
CREATE INDEX guild_ledger_at ON guild_ledger (guild_id, at);

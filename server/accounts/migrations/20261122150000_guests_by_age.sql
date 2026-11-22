-- The guests oldest first, so each new guest's sweep of those unused for 30 days reads only them.
CREATE INDEX accounts_guests_by_age ON accounts (created_at) WHERE username IS NULL AND discord_id IS NULL;

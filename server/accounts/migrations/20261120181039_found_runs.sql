-- The players a run was found for by Find a Company, so its room lets them in together for that run alone; the
-- company each keeps stays as it is. Kept a day, far past any run.
CREATE TABLE found_runs (
  room TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  found_at INTEGER NOT NULL,
  PRIMARY KEY (room, account_id)
);
CREATE INDEX found_runs_by_time ON found_runs (found_at);

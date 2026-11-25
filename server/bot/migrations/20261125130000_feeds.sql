-- Each feed keeps the ids of its newest items, so a deleted newest item does not bring back the one below it; and
-- the clock keeps the feed a run stopped before, so the next run starts there.

ALTER TABLE social_seen ADD COLUMN recent TEXT NOT NULL DEFAULT '[]';

CREATE TABLE social_cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_turn TEXT NOT NULL
);

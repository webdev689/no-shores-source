-- What the accounts answered each outpost errand a room asked (a delivery, a take from the stores, the War Horn), by
-- the room's own id for it, written in the same write as the errand: asked again under that id, the same answer comes
-- back and nothing is done twice. Kept a day.
CREATE TABLE outpost_errands (
  rid TEXT PRIMARY KEY,
  answer INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX outpost_errands_at ON outpost_errands (at);

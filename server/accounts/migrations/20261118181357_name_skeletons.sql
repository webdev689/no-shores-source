-- How each username looks (names.ts's skeleton: lower case, 0 as o, 1 and l as i, 5 as s, rn as m, vv as w, with no
-- underscores), so no two accounts hold names told apart only by look-alike letters. A username holds only letters,
-- digits and underscores, so these replaces make the whole skeleton.
ALTER TABLE accounts ADD COLUMN name_skeleton TEXT;

UPDATE accounts
SET name_skeleton = replace(replace(replace(replace(replace(replace(replace(
  lower(username), '0', 'o'), '1', 'i'), 'l', 'i'), '5', 's'), 'rn', 'm'), 'vv', 'w'), '_', '')
WHERE username IS NOT NULL;

-- Of names already kept that look alike, the oldest keeps its skeleton; the others keep their names, and the owner
-- may rename them.
UPDATE accounts SET name_skeleton = NULL
WHERE name_skeleton IS NOT NULL AND EXISTS (
  SELECT 1 FROM accounts AS older WHERE older.name_skeleton = accounts.name_skeleton
  AND (older.created_at < accounts.created_at OR (older.created_at = accounts.created_at AND older.id < accounts.id)));

CREATE UNIQUE INDEX accounts_by_skeleton ON accounts (name_skeleton) WHERE name_skeleton IS NOT NULL;

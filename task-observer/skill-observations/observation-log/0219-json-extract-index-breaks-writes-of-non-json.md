---
id: 219
title: "An index on json_extract(body, ...) made every save of a character body that is not JSON fail with 'malformed JSON', and would have failed the migration on such a row"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "server/accounts/migrations"]
siblings_checked: "checked: no other migration indexes an expression over a JSON column; the accounts' other json_extract uses are in queries, where a malformed body only fails that read"
area: "D1/SQLite expression indexes over JSON text columns"
date: 2026-11-24
session_context: "Follow-up to PR #179 (forgetting kept errand answers): a migration added CREATE INDEX characters_errand ON characters (json_extract(body, '$.errand.rid')) so the prune could find carried errands cheaply. The full check failed two keeper tests: saving or releasing a body the room cannot read ('not a character') raised ERR_SQLITE_ERROR 'malformed JSON' from the index. Fixed with json_extract(CASE WHEN json_valid(body) THEN body END, ...) in both the index and the query, checked with EXPLAIN QUERY PLAN to still SEARCH the index."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: server/accounts/migrations/20261124175416_character_errands.sql:4, reused in 20261126003000_character_slots.sql:27 (json_valid guard)"
reference:
commands_verified: "run: node --test server/keeping.test.ts server/keepingRuns.test.ts server/accounts/outpostFixes.test.ts -> 49 pass after the guard; EXPLAIN QUERY PLAN -> SEARCH characters USING COVERING INDEX characters_errand (<expr>=?)"
---

**Issue:** An index expression is evaluated on every insert and update. If it raises an error (json_extract on text that isn't JSON), the write fails, and creating the index fails if any existing row is bad. A column the code treats as possibly unreadable must never be indexed with an expression that can throw.

**Suggested improvement:** Over a JSON text column that may hold anything, index `json_extract(CASE WHEN json_valid(col) THEN col END, path)`, and match on the same expression. Check with EXPLAIN QUERY PLAN that the lookup searches the index; a TEXT-affinity column on the other side may need a unary `+`.

**Principle:** An index is part of every write. Anything it computes must work on every value the column can hold.

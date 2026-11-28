---
id: 23
title: "After a merge, the page's tests fail on stale fixtures in target/ until wasm and two cargo test runs refresh them"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are the project's instructions and toolkit note, not a skill"
area: "test fixtures"
date: 2026-11-20
session_context: "Overlook factions round, final audit's fix pass: fix3-looks hit artLevels.test.ts and gearMessages.test.ts failing on target/protocol fixtures after merging the branch; the controller's own full check needed the same refresh; fix3-keepers hit it too (messages.test.ts after a schema regen)"
parked_until: "PR #240 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #240, merged 2026-11-27"
reference: "/root/wt/reports/fix3-looks.md OBSERVATIONS"
commands_verified: "none"
---

**Issue:** `npm test` reads fixtures in target/protocol written by `cargo test -p protocol` and `cargo test -p room`,
and the wasm built by `npm run -s wasm`; after a merge they are stale and tests fail for reasons unrelated to the
change. CLAUDE.local.md names this for a fresh worktree only, not after a merge.

**Suggested improvement:** one script (or an npm script) that refreshes every fixture the page's tests read, named in
the worker brief's pre-commit list and run after any merge; or have the page's tests say which command refreshes
their fixture (artLevels.test.ts already does).

---
id: 104
title: "A codebase audit has no pinned dead-code finder: an unpinned npx tool was refused, and a text scan stood in"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: no skill in the kit finds unused exports or items; Serena's find_referencing_symbols could, one symbol at a time"
area: "audits, dead code"
date: 2026-11-21
session_context: "The owner asked for a deep audit with dead code cleaned up. `npx -y ts-unused-exports` was refused by the auto-mode classifier (an unpinned package fetched and run); a Python scan of each export's name across the repo found 13 TS and 4 Rust candidates, and the area auditors found the rest by grep."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "run: npx -y ts-unused-exports@11 refused by the classifier; the name scan (scratchpad scripts/unused_exports.py, unused_rust.py) ran in seconds and every candidate was confirmed by git grep before removal"
---

**Issue:** The kit pins everything it installs, so a dead-code finder fetched on the spot is refused, rightly. With
none in the kit, a dead-code pass falls back to a name scan, which misses an export whose name happens to appear
elsewhere (a common word) and cannot see a test-only use as dead. Rust's own lint never fires on a `pub` item.

**Suggested improvement:** Pin one finder in the install (for TypeScript, knip or ts-unused-exports at a version and
hash, run over client, server and tests together; for Rust, a `pub` to `pub(crate)` dry run or cargo-machete), and
name it in Toolkit.md's Audits section beside the audit agents.

**Principle:** A cleanup the owner asks for regularly needs its instrument installed with the kit, pinned like the
rest; an ad hoc fetch at audit time is both a supply-chain risk and a blocked call.

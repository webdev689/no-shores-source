---
id: 26
title: "headroom learn wrote 'push in the same command as every commit' into the project memory, against CLAUDE.md's check before every push"
status: declined
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: headroom is a toolkit tool, not a skill"
area: "headroom learn"
date: 2026-11-20
session_context: "Overlook factions round, end of session: headroom learn --apply read the stop hook's repeated 'unpushed commits' messages and wrote a pattern to push on every commit into ~/.claude/projects/<project>/memory/MEMORY.md; CLAUDE.md requires cargo xtask check before every push. The controller reworded it by hand."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: obsolete. CLAUDE.md:12-13 no longer asks for the full check before a push, and CLAUDE.local.md now holds no push rule"
reference: "/root/.claude/projects/-home-user-overlook-source/memory/MEMORY.md, the Pushing section"
commands_verified: "none"
---

**Issue:** headroom learn turns repeated friction into rules without reading the project's own rules, so the stop
hook's unpushed-commits nagging became "push in the same command as every commit", which would skip the full check
CLAUDE.md requires. A later learn run may write it back over the hand edit.

**Suggested improvement:** the session's end step reviews headroom learn's diff before applying (run without --apply,
then apply only lines that agree with CLAUDE.md); or the stop hook stays quiet while a full check is running.

**Seen again, 2026-11-20 (ship-power pick-up session):** `headroom learn --project . --apply` wrote "A Stop hook blocks
the session from ending while commits are unpushed. Push right after committing, before writing the final report."
into MEMORY.md, again against the check before every push. Reworded by hand to push once `cargo xtask check` passes.
The same session nearly pushed past a failed check by piping `cargo xtask check | tail` without `pipefail`; a check
wrapped in a pipe needs `set -o pipefail` before its `&&`.

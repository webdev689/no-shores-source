---
id: 164
title: "The harness's stop hook asks to commit and push at every turn's end, though CLAUDE.md holds a push until the full check passes"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the hook is the cloud harness's ('command hook 2'), not the kit's hooks/; the kit's own hooks say nothing of pushing"
area: "pushing from a cloud session"
date: 2026-11-23
session_context: "Session pickup: while three full checks ran (one failed on the event fingerprints, one on a horse card and R2, one on foot.ts's size), the stop hook asked six times to push 162 to 165 unpushed commits; each time the push was held under CLAUDE.md's 'Run it before every push'. Work was committed as each piece was tested, so nothing sat uncommitted."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: obsolete; CLAUDE.md:12-13 no longer holds a push for the full check (repo plus changed tests only), so no conflict with the Stop hook"
reference: "PR #172"
commands_verified: "run: git ls-remote origin ccr-06efd4d0-ffd79v -> 160 of the unpushed commits already on origin under the earlier branch"
---

**Issue:** The two rules pull apart during a long check: the hook wants every turn to end pushed, the repository wants
no push before a passing check. Holding the push is right, but each turn spends words saying so.

**Suggested improvement:** In `bible/03-Code/Toolkit.md`, say: commit each tested piece at once (the hook's
uncommitted check is then met), and answer the hook's push request with the check's state until it passes; then push.

**Another instance (2026-11-24, No Shores boxing budget and meadow):** the Stop hook asked for a push five times while a full `cargo xtask check` (about 35 min) ran on the commit it named; each time the push was held until the check passed, so the rule held by attention alone, at the cost of a check per doc-only commit.

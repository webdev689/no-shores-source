---
id: 216
title: "rtk showed a refused branch delete as 'Everything up-to-date'; CI's 45-minute check limit now cuts runs on main"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", ".github/workflows/ci.yml", "bible/03-Code/Toolkit.md"]
siblings_checked: "rtk bypass of the same push printed 'fatal: the remote end hung up unexpectedly' then 'Everything up-to-date'; ci.yml timeout-minutes 45; main's runs 1003 (#179, cancelled at the limit) and 997/996 (success, 47-52 min with deploys)"
area: "pushing; CI"
date: 2026-11-24
session_context: "After merging #191 on the owner's 'Deploy': 'git push origin --delete <branch>' through rtk answered only 'Everything up-to-date' though the branch stayed (ls-remote showed it); rtk bypass showed the proxy refused it. Earlier, #191's CI run 998 was cancelled at 45 minutes in its last stage (server bundle) while five CI runs shared the runners; main's own run for #179 was cancelled the same way, so #179 never deployed."
parked_until: "PR #239 merge"
resolved:
resolution:
reference: "PR #191; runs 45442300990, 45450525381"
commands_verified: "git ls-remote --heads origin <branch>; rtk bypass git push origin --delete <branch>"
---

**Issue:** rtk's compaction can turn a failed push into an apparent success; and the CI check job runs near its
45-minute limit, so a busy hour cancels it, on main too, where a cancel means no deploy.

**Suggested improvement:** Keep rtk from compacting git push (or keep its fatal lines); Toolkit.md: after any push,
confirm with git ls-remote. For CI: the owner's call to raise timeout-minutes or split the check job; a session that
merges should watch main's run to its deploy.

**Principle:** A tool's output must never read success where the command failed; a time limit that a busy day reaches
is a flaky gate.

**Again (2026-11-25, #194):** after the squash-merge, `git push origin --delete ccr-e0e5f211-v55a3s` through rtk
again printed only "Everything up-to-date"; `git ls-remote` still listed the branch, and `rtk bypass` showed the
proxy's HTTP 403. Caught only because the merge step was followed by an `ls-remote`. Second occurrence, so the fix is a
barrier, not a sentence: rtk's git filter keeps any `fatal:`/`error:` line and the exit code of `git push`, or
`git push` is left out of rtk's compaction entirely. Since the first entry, `ci.yml`'s check limit is 75 minutes; #194's
PR run took 49 minutes and passed.

**Instance (2026-11-26, a read-only auditor of No Shores #211):** rtk's condensed `git log --oneline` dropped merge commits (it said 19 and showed 14); the auditor reran it as `rtk bypass` to count them.

**Instance (2026-11-26, No Shores #211 merged):** the hook rewrote `git push origin --delete ccr-9e470c58-pm6nyz` to `rtk git push ...`; the remote refused it ("the remote end hung up unexpectedly") and rtk still printed "Everything up-to-date". `git ls-remote` showed the branch still there. The merged branch could not be deleted from this session; the owner deletes it from the PR page.

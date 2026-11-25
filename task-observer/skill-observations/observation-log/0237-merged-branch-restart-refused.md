---
id: 237
title: "The session's git rules say to restart a merged PR's branch from main with a force-with-lease push, but auto mode refuses that push"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md"]
siblings_checked: "checked: instance-specific to cloud sessions on one assigned branch; the git rules and the Stop hook both come from the environment, not a skill"
area: "a cloud session's one branch after its PR is squash-merged"
date: 2026-11-25
session_context: "After #205 was squash-merged (9e690992), the session reset its branch ccr-e6d499b8-6v6er9 onto main, as its git rules say ('restart the branch under the same name from the latest default branch (a force-with-lease push is fine when it holds only already-merged history)'). The Stop hook then reported one unpushed commit (main's squash commit), and the force-with-lease push was refused twice by the auto mode classifier ([Destructive or Unwanted Actions]); the first attempt also had its input changed by a graphify hook. Resolved by pointing the local branch back at the remote head, whose tree equals the squash commit's."
parked_until:
resolved:
resolution:
reference: "PR #205; merge 9e690992; branch head df6d66fd"
commands_verified: "git rev-parse 9e690992^{tree} df6d66fd^{tree} -> equal; git checkout -B ccr-e6d499b8-6v6er9 origin/ccr-e6d499b8-6v6er9"
---

**Issue:** Two environment rules disagree after a squash merge. The git rules ask for a force-with-lease restart of
the merged branch; auto mode refuses it; the Stop hook then flags main's squash commit as unpushed. A session that
follows the rules ends stuck between the hook and the classifier.

**Suggested improvement:** After a squash merge, keep the local branch at its remote head (same tree) and restart it
from main only when new work begins, asking the owner for that one force push then; or the owner adds a permission
rule for `git push --force-with-lease` on the session's own branch.

**Principle:** A rule that needs a permission the session's guard refuses should name the fallback that needs none.

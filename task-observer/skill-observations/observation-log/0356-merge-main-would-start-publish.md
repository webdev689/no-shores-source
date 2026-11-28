---
id: 356
title: "An open PR that clashes with main only in notes merges cleanly without taking main in, when its own lines move clear of main's; the publish guard then needs no yes"
status: open
type: workaround
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "bible/04-Procedures/Branches and Merging.md"]
siblings_checked: "checked: #352 (a merged branch restarted from main refused) and #348 (the guard's reason); this is the open-PR case, and Toolkit.md's push-guard row says only that a merge of main is refused"
area: "pushing"
date: 2026-11-28
session_context: "PR #265 went dirty after main took #254 #256 #259 #263; merging main conflicted only in Decisions.md and Hand-off.md, and pre-push refused the merge's push (wreck.yml, from #259). Moving the branch's own lines a line or more away from main's hunks (and not moving lines main left), then git merge-tree --write-tree HEAD origin/main, showed a clean merge; the push carried no wreck path and the guard let it through."
parked_until:
resolved:
resolution:
reference: "PR #265, head 11191c8f0"
commands_verified: "git merge-tree --write-tree HEAD <main> | grep -i conflict (clean after the move); git push passed pre-push"
---
Works only when the clash is in text the branch owns: a code clash still needs main in, and so the owner's yes.
Proposal for the owner: the push-guard row in Toolkit.md names this way out before asking for ALLOW_PUBLISH.

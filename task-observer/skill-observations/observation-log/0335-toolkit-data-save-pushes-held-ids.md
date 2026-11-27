---
id: 335
title: "toolkit-data.sh save pushed a log where two observations held each of six ids, and two sessions ran the same weekly review in parallel unaware"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the target is a kit script and the Toolkit note, not a skill; restore and save are the only writers of the branch"
area: "carrying the observation log over between sessions"
date: 2026-11-27
session_context: "#232's audit session, running the task-observer review asked for by the owner; its save met the branch's 7573222e"
parked_until:
resolved:
resolution:
reference: "toolkit-data branch 7573222e (the clashes), 35d37a82 (the fix); reviews/2026-11-27/second-reading.md"
commands_verified: "grep -h '^id:' over the branch's 7573222e log | sort | uniq -d: printed 1, 321, 322, 323, 324, 325; after the fix, nothing"
---
What happened: the branch's tip 7573222e ("numbers another session took, moved on") held two observations at each of
ids 1 and 321 to 325 (e.g. 0321-dfo-source-repo-unnamed and 0321-worker-brief-graphify-out-untracked). `renumber()`
moves only files the save adds whose number the tip already has; nothing checks the tree it pushes, so a clash made any
other way goes out. Fixed by hand at 35d37a82 (the newcomers moved to 329 to 334, floor 334).

Separately, two sessions ran the 2026-11-27 review at once, each reading all ~290 entries with four readers;
`review-started.txt` is written only in a session's own container, so neither saw the other's. The second learned of it
only when its save failed to merge, and spent the merge reconciling two renumberings.

Proposal (kit, standing order): (1) `save` refuses to push when any id is held twice in the final tree, naming them;
(2) a review saves `review-started.txt` to the branch as it starts, and `restore` (or the review's Step 0) says
"a review started <date> in another session" when the branch's says so.

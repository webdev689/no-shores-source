---
id: 45
title: "toolkit-data.sh cannot save a log begun before the branch was restored: two logs with the same ids"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh", "tools/claude-toolkit/install-all.sh"]
siblings_checked: "family: the kit's end-of-session saves (claude-mem-save.sh saved; toolkit-data.sh refused)."
area: "overlook-source, the observation log"
date: "2026-11-20"
session_context: "PR #98's session: its log was on disk before install-all.sh's restore, so restore noted no base."
commands_verified: "bash tools/claude-toolkit/toolkit-data.sh save (refused, then saved after the merge below)"
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/toolkit-data.sh:47-48, :19-35"
---

- `restore` notes the branch commit a log came from only when no log exists yet; this session's log predated it, so
  `save` refused ("not restored from the branch"), rightly, as the branch held another session's 32 observations under
  the same numbers 0001 onward.
- Merged by hand: the branch's log as the base, this session's twelve renumbered 0033 to 0044 (each file's `id:`
  with it), both checkpoint logs kept, the review date the branch's, `.id-floor` 44 with claims to 0044, then
  `restored-from` set to the branch's tip and saved. New ids now start at 0045.
- Proposed fix: `restore` merges an existing log into the branch's the same way (renumbering the local ids above the
  branch's floor) and notes the base, so `save` never meets two histories.

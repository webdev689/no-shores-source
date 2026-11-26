---
id: 47
title: "toolkit-data save refused a log that held the branch's content, as restore wrote no restored-from into a folder not fresh"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "observation log storage"
date: 2026-11-20
session_context: "A session that started before the kit's restore step existed"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
---
# toolkit-data save refused a log that held the branch's content

- **What happened:** at the session's end, `toolkit-data.sh save` refused: "this log was not restored from the branch".
  The session had started before the kit's restore step existed; its start scan made `skill-observations/` first, so
  a later `restore` took the branch's files in (skip-old-files) but, the folder not being fresh, wrote no
  `restored-from`. Save then refused though the log now held the branch's tip plus one observation of this session's.
- **Done here:** wrote `restored-from` as FETCH_HEAD after the restore (what restore writes for a fresh log), then saved.
- **Proposed:** `restore` could write `restored-from` whenever it is missing, since it has just laid the branch's files
  in, rather than only when the folder is new. The owner's to agree.

---
id: 79
title: "toolkit-data.sh save renumbers the id-claim files as if they were observations, and fails on a name it made before"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/toolkit-data.sh"]
siblings_checked: "family: the save's renumber step; archive/.id-claims already held a malformed '0069-' from an earlier save."
area: "overlook-source, toolkit observation log"
date: "2026-11-21"
session_context: "PR #113's end of session: the save's renumber found this session's 0072 taken on the branch."
commands_verified: "toolkit-data.sh save failed: git mv .id-claims/0072 to .id-claims/0079- (destination exists); a copy with the fix below saved"
---

- `renumber` walks every file the save added under the observation log, takes its first four characters as its
  number, and moves any whose number the branch's tip already holds. The claim files in `archive/.id-claims/` are
  named by number alone (`0072`), so they are moved too, to a name ending in a bare dash (`0079-`), and a later save
  that makes the same name fails: "fatal: destination exists". `archive/.id-claims/0069-` on the branch is one such.
- Fix used for this save (a copy in the session's scratchpad, the repository's script unchanged): skip any file whose
  name is not `NNNN-<title>.md`:
  `[[ $(basename "$file") =~ ^[0-9]{4}-.+\.md$ ]] || continue` in place of the bare four-digit test.
- Proposed: that line in tools/claude-toolkit/toolkit-data.sh, in its own pull request, with a test of a save whose
  added claim file shares a number with the branch; and the stray `archive/.id-claims/0069-` removed.

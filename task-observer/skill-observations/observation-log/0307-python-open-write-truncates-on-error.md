---
id: 307
title: "A Python open(p,'w').write(build()) truncated a note when the build raised"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: no Toolkit line on scripted file edits"
area: "scripted edits"
date: 2026-11-26
session_context: "Worker lights-core truncated Sky.md once with open(p,'w').write(bad); it restored it from git."
parked_until:
resolved:
resolution:
reference:
commands_verified: "reported by worker lights-core"
---

**Issue:** open(p,'w') empties the file before the new text is built, so an exception in building it leaves the file empty.

**Suggested improvement:** Build the whole string first, then open and write; or write to a temp file and rename.

**Principle:** Never open a file for writing before its new content exists.

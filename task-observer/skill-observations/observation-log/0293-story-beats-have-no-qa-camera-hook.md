---
id: 293
title: "The prologue story has no QA camera hook (__qaEye works in nodes only), so pictures of a story scene need pointer-locked mouse moves"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["client/src/game/prologue", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "picturing the prologue wreck headless"
date: 2026-11-26
session_context: "wreck worker turned the view with pointer-locked mouse moves to picture the heap; a skip at a given story second needed about 150 s of real time at 4 s a frame."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "wreck.md OBSERVATIONS"
---

**Issue:** Without a camera hook, story pictures are slow and imprecise.

**Suggested improvement:** Add the __qaEye hook to the story's director as nodes have it, and a ?qa clock so a beat can be pictured at a story second without real-time waiting.

**Principle:** Every scene the owner asks about should be picturable by a script.

---
id: 283
title: "tools/uiShot.mjs has no port flag and falls back to 5173; a copy under target/ cannot find its modules; R2 serves pictures only to 5173"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/uiShot.mjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "taking interface pictures from worker worktrees"
date: 2026-11-26
session_context: "welcome, wreck and hordes workers each copied uiShot.mjs to pick a port in 5180-5189 (the brief bars 5173); hordes found a copy under target/ fails since Vite's root is client/, so it copied into tools/ and deleted after; welcome's tiles showed initials and the keeper figure panel was empty because R2's CORS allows only 5173."
parked_until:
resolved:
resolution:
reference:
commands_verified: "welcome.md and hordes.md reports; v1_weaponsmith shots with initials"
---

**Issue:** Every worker re-solves the same port problem, and pictures off 5173 cannot show the forge's art, so the look of items and figures goes unchecked.

**Suggested improvement:** Give uiShot.mjs a --port flag (default 5173); in the Toolkit, say R2 answers only 5173, so the one picture-heavy worker gets 5173 and the rest expect initials.

**Principle:** A tool used by parallel workers takes its shared resource (a port) as an argument.

---
id: 176
title: "A window opened from the game's own keydown on Escape was heard as Escape again by the drawn interface the next frame, and shut at once"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/02-Systems/Interface.md"]
siblings_checked: "none: the first key that both opens a window and means back"
area: "keys that open a drawn window and also mean back"
date: 2026-11-24
session_context: "Escape made to open Settings (gameKeys.ts). Unit tests passed; the real game headless (webgpu-shot noGpu, waitFor 'Exit to Desktop') never showed it. The keydown opened the menu at once, the interface's queued key event reached it the next frame as escaped, and the menu's step back shut it. Fixed in gearWindow.ts with a fresh-open flag, a test that fails without it."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: client/src/game/gearWindow.ts:121,184 (fresh-open flag); bible/03-Code/Toolkit.md:63 (drive an interactive feature once before a PR)"
reference: "branch ccr-cb6f70a9-3mm7g6"
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan with noGpu and waitFor>; node --test client/src/game/gearWindow.test.ts with the fix stashed: fails"
---

**Issue:** A key heard both by a page listener (which opens a drawn window) and by the drawn interface's queue (which
reads Escape as back) acts twice. Unit tests that call the page listener alone, or the interface alone, miss it.

**Proposal:** Interface's "Pressed, focused, typed" could say a window opened by a key that also means back ignores
back on its first frame; and drive any new key that opens a window once in the real game headless before calling it
done.

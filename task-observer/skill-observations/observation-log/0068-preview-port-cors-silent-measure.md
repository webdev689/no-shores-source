---
id: 68
title: "A headless measure on a random preview port never loads the world, silently: R2 allows only port 4173"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0015 (picture runs that break) covers headless shots failing; this one fails quietly and the numbers look fine"
area: "measuring the game headless (vite preview + Playwright + SwiftShader)"
date: 2026-11-21
session_context: "Measuring frame time, long tasks and key-to-frame before moving the game into a worker"
parked_until:
resolved:
resolution:
reference: "scratchpad framePerf.mjs; the page's console showed CORS refusals from the R2 bucket for port 40471"
commands_verified: "ran: framePerf on port 0 (1 draw a frame after 200 s, 0.3 ms busy), then on port 4173 (393 draws a frame, 41 ms busy)"
---

**Issue:** The measuring script served the build with `vite preview` on port 0. The R2 bucket's CORS answers only the
usual ports, so the ship's mesh, the sprites and the sounds were refused, `loadParts` never settled, and the game drew
only its interface for minutes. Nothing failed loudly: the numbers (0.3 ms a frame, 60 frames a second) looked like a
light game, not a stuck one. Only counting draws a frame (1, where the world takes about 390) showed it.

Also seen this session: three parallel porting workers each created `client/src/ui/page.ts` (add/add conflicts at
every merge), and a conflict-marker regex that dropped both sides of CSS hunks passed types and lint; only
`prettier --check` caught the broken stylesheet.

**Proposal for the owner:** a headless measure or picture run serves on port 4173 and asserts the world drew (draws a
frame over a floor) before reporting numbers; a worker brief names the one worker that creates a shared new file.

---
id: 274
title: "tools/uiShot.mjs asked for reduced motion on every page, so no picture could show the interface moving"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/uiShot.mjs", "bible/02-Systems/Interface.md"]
siblings_checked: "checked: webgpu-shot.cjs drives the game's worker, not a module's tree; only uiShot pictures a screen's parts headless"
area: "browser QA"
date: 2026-11-25
session_context: "Playlist nodes redesign (PR #216): the owner chose motion for the Playlist's crests and mark; uiShot's newPage pinned reducedMotion 'reduce', so every motion read still in its pictures."
parked_until:
resolved: 2026-11-25
resolution: "uiShot takes \"motion\": true in its shots file (reducedMotion 'no-preference'); Interface.md 'Checked headless' says so. In PR #216."
reference: "tools/uiShot.mjs newPage; client/src/plus/kit.ts motionReduced"
commands_verified: "node tools/uiShot.mjs with motion true at 9, 21, 60 and 150 frames showed the rise, the sweep and the dials turning"
---

A screen that moves (a rise, a sweep, a turning dial) pictured with uiShot showed only its still form: the tool opened
its page with reduced motion asked for, and every animated part of the game reads motionReduced(). The shots file now
asks for motion with "motion": true; without it the page still asks for reduced motion, so existing pictures are
unchanged. A frame is 1/60 s, so a moment t seconds in is t × 60 frames.

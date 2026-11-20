---
id: 8
title: "webgpu-shot.cjs needs the page on port 5173, so parallel workers taking pictures collide"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a kit script, not a skill"
area: "Browser QA with parallel workers"
date: 2026-11-19
session_context: "Close-views and drawing workers ran at once; both needed pictures of a built page."
parked_until:
resolved: 2026-11-20
resolution: "webgpu-shot.cjs servedAt serves the 5173 origin from any port; hiding the HUD is the existing eval step; playwright resolves from any directory here, so no NODE_PATH note (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "NOT RUN: reported by the close-views worker (it served on 5174/5175 and routed localhost:5173 there)"
---

**Issue:** Toolkit.md says to serve the built page on port 5173, "the only origin R2 answers". With two workers taking
pictures at once, the second found the port taken, served elsewhere, and wrapped webgpu-shot.cjs with a route that
forwards localhost:5173 to its own port. It also found playwright only global (NODE_PATH needed), the HUD's hint and
Dock button covering the ship (it hid #hud), and frames at about 0.05 a second under load.

**Suggested improvement:** Give webgpu-shot.cjs a serve option: it starts `vite preview` on a free port itself and
routes the page's own origin (5173) to it, so any number of workers can take pictures at once; and a steps option to
hide the HUD. Say in Toolkit.md that playwright is global here.

**Principle:** A shared fixed port in a tool meant for parallel workers is a lock nobody declared; let the tool own
its port.

---
id: 229
title: "uiShot served Vite on a random port, so R2 refused the forge's pictures (CORS) and menu shots had no item art; and its events could only aim at coordinates"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/uiShot.mjs", "client/src/ui/shot.ts", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: headless picture tools. 0024 is webgpu-shot's own port-5173 rule (a sibling tool, same R2 origin cause); 0177 and 0215 are other uiShot limits, not this one. Fixed here in uiShot; webgpu-shot already holds 5173."
area: "headless UI pictures of the menu (tools/uiShot.mjs)"
date: 2026-11-24
session_context: "Inspect panel redesign: the first baseline render of the item page printed 'blocked by CORS policy' for every R2 index fetch, and the menu drew initials in place of item pictures. uiShot created its Vite server on port 0; R2 answers only localhost:5173. Fixed: uiShot tries 5173 first (strictPort false). Also added to shot.ts: an event may name a node (`on`) and carry its own frame (`at`), so a shot can open a flyout, right-click a tile and hover a node laid on earlier frames without guessing coordinates."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: node tools/uiShot.mjs /tmp/claude-0/shots/base.json -> CORS errors on port 43453; after the port change -> pictures drawn, no errors"
---

**Issue:** `tools/uiShot.mjs` started Vite with `port: 0`. The forge's pictures come from R2, which answers only the
origin `localhost:5173`, so every shot of a gear screen silently lost its item art (only console CORS lines said so).
The Toolkit note states the 5173 rule for webgpu-shot but not for uiShot. Separately, shot events took only
coordinates, so a shot could not reliably press a tile or node whose place depends on layout.

**Suggested improvement:** Keep uiShot on 5173 when free (done in this branch) and say in Toolkit's Browser QA row that
uiShot and webgpu-shot both need 5173 for R2. Document the `on` and per-event `at` fields beside the shots.json format.

**Principle:** A headless tool that fetches from an origin-restricted host must pin the origin that host allows, or
fail loudly; a silent fallback picture reads as a design bug.

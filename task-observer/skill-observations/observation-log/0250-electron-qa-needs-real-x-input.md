---
id: 250
title: "Driving the desktop app headless: Playwright's keys never reach Electron's shell, and a packed app cannot be attached"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0246 (a place with no offline way in): the same family, QA reach; the Toolkit's Browser QA row covers Chromium pages only, nothing on Electron"
area: "Browser QA of the desktop app (desktop/)"
date: 2026-11-25
session_context: "The desktop app session, branch ccr-42a55a97-wkid9r, PR #210. Playwright's _electron.launch drove the unpacked shell under xvfb; F11, Alt+Enter and F12 went unanswered until sent as real X keys."
parked_until: "PR #243 merge"
resolved:
resolution:
reference:
commands_verified: "page.keyboard.press('F11') -> before-input-event heard nothing; xdotool windowfocus --sync <id>; xdotool key F11 -> isFullScreen() true (windowactivate refused: no window manager under xvfb)"
---

Three findings for a Toolkit row on the desktop app, each tried in this container:

1. Playwright's keyboard (`page.keyboard.press`) and mouse are sent through DevTools' input, which reaches the page
   but never Electron's `before-input-event`, so the shell's own keys (F11, Alt+Enter, F12) need real X input:
   `apt-get install xdotool`, `xdotool windowfocus --sync <window>` (not `windowactivate`: xvfb has no window manager),
   then `xdotool key F11`.
2. A packed app with the `EnableNodeCliInspectArguments` fuse off cannot be attached by Playwright's `_electron`
   (it needs `--inspect`); run the packed binary directly and read its `app.log` instead.
3. Routes and the worker listener must be set before the game's worker is fetched: the app loads at once, so a QA
   driver reloads the page after `context.route(...)`. The toolkit's `OWN_TEXTURE` patch at the head of the worker
   lets the game run under Electron on SwiftShader as in Chromium.

Proposal for the owner: a "Desktop app QA" row in the Toolkit's table saying the above.

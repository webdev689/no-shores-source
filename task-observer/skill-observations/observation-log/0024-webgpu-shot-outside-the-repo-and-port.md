---
id: 24
title: "webgpu-shot.cjs from a scratch copy needs NODE_PATH, and only port 5173 reaches R2, so a worker's own port draws nothing"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-shot.cjs", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the targets are the project's toolkit, not a skill"
area: "browser pictures"
date: 2026-11-20
session_context: "Overlook factions round, final audit's fix pass: fix3-keepers, told to serve on its own port 5194, needed a CORS route to R2 for that port and NODE_PATH=/opt/node-tools/node_modules to run the shot script from a scratch copy; headless frames took about 15 s each"
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: port half done by `anyPort` (webgpu-shot.cjs:13, :186-198; Toolkit.md:63). Playwright now resolves from outside the repo (`require.resolve('playwright')` from /tmp ran just now and gave /opt/node-tools)"
reference: "/root/wt/reports/fix3-keepers.md OBSERVATIONS"
commands_verified: "none"
---

**Issue:** The worker brief gives each worker its own port, but Toolkit.md says R2 answers only port 5173, so pictures
from any other port load no forge art without a workaround; the shot script run from outside the repo cannot find
Playwright without NODE_PATH. The two rules contradict each other.

**Suggested improvement:** the brief's port list and Toolkit.md agree (a CORS route the script sets up for any port,
or pictures taken one worker at a time on 5173), and the script resolves Playwright itself.

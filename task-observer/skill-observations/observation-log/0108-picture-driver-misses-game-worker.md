---
id: 108
title: "The picture driver patches the page, but the game now runs in a worker, so pictures fail headless"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md", "/root/.claude/skills/task-observer/scripts/new-observation.sh"]
siblings_checked: "none: webgpu-shot.cjs is the only picture driver"
area: "headless WebGPU pictures"
date: 2026-11-21
session_context: "Main's page moved its drawing into a worker (HTML Is Avoided Where It Can Be); every headless picture run on main ended with 'A valid external Instance reference no longer exists'. The owner: 'The headless issue is due to us moving away from html. So not really an issue per say.'"
parked_until:
resolved:
resolution:
reference: "local commit cfd75bba in /root/wt/headless (branch headless, not pushed): the driver patches the game's worker too"
commands_verified: "none"
---

**Issue:** `webgpu-shot.cjs` gives the page's canvas a texture of its own, but main now draws from a worker over an
OffscreenCanvas, so the patch never reaches the device and presenting loses it headless. Hours went to bisecting a
cause the owner already knew. Also: `new-observation.sh` failed its floor write (`10#0099-: syntax error`) because a
claim name carries its slug, so `.id-floor` was not raised.

**Suggested improvement:** Land the driver's worker patch (cfd75bba) with the owner's yes, and say in Toolkit.md's
Browser QA row that the game draws in a worker. Strip the slug before `10#` in the script's `top_claim`.

**Principle:** When a tool stops working right after a known architecture change, ask the owner before bisecting.

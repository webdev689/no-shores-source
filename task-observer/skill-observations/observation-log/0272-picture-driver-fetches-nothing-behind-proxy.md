---
id: 272
title: "The WebGPU picture driver fetched nothing behind a cloud session's proxy: Playwright's route.fetch ignores HTTPS_PROXY, and a launch proxy also takes localhost"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: tools/uiShot.mjs launches Chromium without routes, so Chromium's own proxy from the environment served it; only webgpu-shot.cjs re-fetches R2 through route.fetch"
area: "headless pictures in a cloud session behind the agent proxy"
date: 2026-11-26
session_context: "Passages session, picturing the held map at sea: the game's page stopped with 'The game could not start: Failed to fetch' and every R2 mesh 'Failed to fetch'; a second run with chromium.launch({proxy}) drew no frame for 15 minutes because Playwright sends loopback through a launch proxy, so localhost:5173 never loaded."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/webgpu-shot.cjs:165-170 (HTTPS_PROXY launch, localhost bypassed); Toolkit.md:63"
reference: "commits 20c99669, 671b5f36, af9cee0c on ccr-1c146825-lrjepv"
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan>: before, the page's worker reported 'Failed to fetch'; after, __qaSea lent, flow 'foot' then 'sea', pictures written (target/passages/v6_sea-map-c.png, v7_*, v9_*)"
---

**Issue:** A picture plan failing with "Failed to fetch" looked like a timing or load problem (two runs were spent on longer waits) before the log's "game stopped" line named the cause. route.fetch in Playwright does not read HTTPS_PROXY, and once a launch proxy is set, Playwright routes loopback through it unless bypassed.

**Suggested improvement:** When a headless page reports a fetch failure in a cloud session, check the proxy first: curl the same URL from the shell; if curl succeeds, the browser or its routes are off the proxy. Keep the driver's proxy launch with a loopback bypass.

**Principle:** In a proxied sandbox, a tool that makes its own requests (route.fetch, Node fetch, an SDK) must be put on the proxy explicitly, and the local server must be kept off it.

---
id: 163
title: "The full check's ship tests fail with 'fetch failed' in a session on a Default environment, and Node's fetch ignores the proxy"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: shipTags.test.ts is the one TypeScript test that fetches from R2 (the meshes, kept in tmpdir after); the picture drivers fetch R2 from Chromium, which reads the proxy"
area: "running cargo xtask check in a cloud session"
date: 2026-11-23
session_context: "Session pickup of ccr-06efd4d0-ffd79v onto ccr-435c1d22-loawza: the session ran on a Default environment (no allowed hosts); four shipTags.test.ts tests failed 'fetch failed' because the proxy refused pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev (403 on CONNECT) and Node's built-in fetch does not read HTTPS_PROXY without NODE_USE_ENV_PROXY=1. The no-shores-source environment allows that host; switch_environment moved the session's network there and the four passed."
parked_until: "PR #240 merge"
resolved:
resolution:
reference: "PR #172"
commands_verified: "run: NODE_USE_ENV_PROXY=1 node --test client/src/ships/shipTags.test.ts -> pass 4 after the switch; fail 4 before; NODE_USE_ENV_PROXY=1 cargo xtask check -> passed at 8bfe6951"
---

**Issue:** A fresh container has no cached ship meshes, so the full check's ship tests reach R2. On a Default
environment the proxy refuses the bucket's host, and even on one that allows it Node's fetch goes direct unless
NODE_USE_ENV_PROXY=1 is set. The failure reads as a broken test, and a full check (about 40 minutes) is lost to it.

**Suggested improvement:** In `bible/03-Code/Toolkit.md` ("Running the kit"), say: in a cloud session, run the full
check as `NODE_USE_ENV_PROXY=1 cargo xtask check`, on the `no-shores-source` environment (switch_environment with
network_only when a session starts on a Default one), before the first full run.

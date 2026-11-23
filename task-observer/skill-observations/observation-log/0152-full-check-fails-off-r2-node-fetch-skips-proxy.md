---
id: 152
title: "The full check fails in a container that cannot reach R2: the session started on Default, and Node's fetch ignores the proxy"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "tools/claude-toolkit/check-tools.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: every test that fetches R2 from Node (client/src/ships/shipTags.test.ts is the one that failed); curl and Python honour HTTPS_PROXY, Node's fetch does not"
area: "session setup: the network a cloud session starts on, and Node's proxy use"
date: 2026-11-23
session_context: "Audit leftovers session: the first cargo xtask check on a branch failed 4 TypeScript tests in shipTags.test.ts with 'fetch failed'. The session had started on the Default environment, whose network allows no extra host, so the proxy refused pub-…r2.dev (403). After switch_environment onto the saved no-shores-source environment (which allows that host), curl reached R2 but Node's fetch still failed until NODE_USE_ENV_PROXY=1 (/root/.ccr/README.md). With both, the 4 tests passed and every branch's full check passed. About 25 minutes of a full check were spent before the cause was found."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: NODE_USE_ENV_PROXY=1 node --test client/src/ships/shipTags.test.ts -> 4 pass (0 pass without it, after the switch); curl r2.dev -> 404 after the switch, 403 from the proxy before"
---

**Issue:** A session started on the Default environment cannot reach R2, so `cargo xtask check` fails four ship tests, which download meshes, and it does so only near the end of a 25-minute run. Even on an environment that allows R2, Node's built-in `fetch` does not use the container's HTTPS proxy unless `NODE_USE_ENV_PROXY=1` is set, so the same tests still fail.

**Suggested improvement:** (1) `install-all.sh` writes `NODE_USE_ENV_PROXY=1` into the settings' `env`, as it sets task-observer's, so every Bash command and the full check use the proxy. (2) `check-tools.sh` probes R2 (`curl` HEAD of the manifest's base) and prints a FAIL naming the `no-shores-source` environment when the proxy refuses it, so the session moves before its first check, not after.

**Principle:** A check that needs the network should have that network probed at session start, by the same client the check uses; a proxy one tool honours and another ignores fails late and looks like a code fault.

---
id: 154
title: "cargo xtask check cannot pass in a cloud session on the Default environment: shipTags.test.ts fetches meshes from R2, a host it refuses, and Node's fetch ignores HTTPS_PROXY"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.md", "tools/claude-toolkit/check-tools.sh"]
siblings_checked: "checked: the rest of the check (format, lints, types, shaders, Rust tests, wasm, the other 3930 TS tests, build, bundle, repo checks) needs no host; only client/src/ships/shipTags.test.ts fetches (ships.base, the pub-...r2.dev bucket). The kit's install also FAILs on Context7 and SkillsMP here: their keys are network secrets on another environment, not on Default."
area: "running the required check in a cloud container"
date: 2026-11-23
session_context: "Picking up PR #168 after merging main: cargo xtask check failed only on shipTags.test.ts's four tests, 'fetch failed'. curl showed the proxy's CONNECT 403 for pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev; with NODE_USE_ENV_PROXY=1 Node got the same 403. The session was on the Default environment (no allowed hosts); overlook-source is unrestricted and a running session cannot move onto it. The owner approved a new personal environment no-shores-source allowing the R2 host, with npm ci as its setup script; then NODE_USE_ENV_PROXY=1 node --test shipTags.test.ts passed 4/4. Without the variable Node's fetch goes direct and fails even with the host allowed. xtask stops at the first failing step, so the build, bundle and repo checks had to be run by hand to see them."
parked_until:
resolved:
resolution:
reference: "environment no-shores-source (env_014htJmLMrHjN6D4NBU6APdR)"
commands_verified: "run: NODE_USE_ENV_PROXY=1 node --test client/src/ships/shipTags.test.ts -> 4 pass after the host was allowed; curl to the R2 host -> CONNECT tunnel failed, response 403 before"
---

**Issue:** The rule is that done means `cargo xtask check` passes, but in a cloud session on the Default environment it
cannot: four ship-tag tests fetch the published meshes from the R2 bucket, which that environment's network refuses,
and Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set. The failure reads only "fetch
failed", so it looks like a code problem until the proxy's 403 is found by hand, and xtask stops there, hiding
whether the build, bundle and repo checks pass.

**Suggested improvement:** For the owner to approve: in Toolkit.md's "Running the kit", say cloud sessions run on the
`no-shores-source` environment (R2's public bucket allowed) and run the check as
`NODE_USE_ENV_PROXY=1 cargo xtask check`; and have check-tools.sh fetch one mesh from `ships.base` the way the test
does, printing a FAIL naming the host when it is refused, so the session learns it at install, not after a
10-minute check.

**Principle:** A required check that depends on the network should say so where it is run, and the setup check should
try that host first, so a refused host is reported as a refused host rather than as a failing test.

---
id: 275
title: "A page build started beside a running cargo xtask check deletes the generated messages the check's tests read"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/schema.mjs"]
siblings_checked: "checked — instance-specific to this repo's schema step; Toolkit.md's Browser QA says a cargo build beside the driver delays the world, not that a page build can break the check"
area: "running headless pictures beside the full check"
date: "2026-11-25"
session_context: "#207 audit: with `cargo xtask check` running in the background, a picture run began `npm run -s build`, whose prebuild runs tools/schema.mjs: it rmSync's generated/messages and writes it again. The check's TypeScript tests import generated/messages/ts. Caught and stopped before the schema step overlapped the tests; the earlier pictures beside a check reused a page already built."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "none run to reproduce; read tools/schema.mjs (rmSync(OUT, { recursive: true, force: true }) before flatc) and package.json (prebuild: schema && wasm)"
---

**Issue:** A headless picture needs a fresh page build, and the build's schema step deletes and rewrites the generated
messages. Beside a running full check, whose TypeScript tests import them, that can fail the check falsely, costing a
whole rerun.

**Suggested improvement:** Toolkit.md's Browser QA says to build the page before starting the check (or after it), never
during; or tools/schema.mjs writes to a temporary folder and renames it into place, so a reader never sees it missing.

**Principle:** A step that deletes and regenerates shared outputs must not run beside another job that reads them;
either serialise the two or make the regeneration atomic.

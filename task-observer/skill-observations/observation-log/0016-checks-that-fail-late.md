---
id: 16
title: "The layer check and the test files' types only fail at the end of the full check"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the workers' focused-check practice"
area: "fanning out: which checks a worker runs while working"
date: 2026-11-20
session_context: "Combat-feel and mapread workers each ran the full check several times to clear failures the focused checks never showed."
parked_until:
resolved: 2026-11-20
resolution: "brief template 'Checks while working': cargo xtask repo after import changes, npm run -s types after test changes, Rust tests in debug; full check in the background (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "reported by the workers: combat-feel (three full runs before the layer ban showed), mapread (test type errors only at test time); controller: a release-mode test run hid a debug overflow the full check caught"
---

**Issue:** Workers work with focused checks (`cargo test -p`, `node --test`), then the full check fails late on what
those never run: the client's layer check (`cargo xtask repo`), the test files' types (the node tsconfig), Rust debug
overflow checks (focused runs in `--release`), and rustfmt. Each costs a full check of 10 minutes or more.

**Suggested improvement:** The brief template's checks line: while working, run `cargo xtask repo`, `npm run -s types`
and focused tests in debug (not `--release`) after each change to imports or tests; the full check before committing.

**Principle:** Run the cheap checks that the full check would fail on, early and often.

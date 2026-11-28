---
id: 224
title: "A baseline cargo xtask check run in the checkout being edited is spoiled by the edits; and cargo test stops at the first failing crate"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "bible/03-Code/Testing.md"]
siblings_checked: "none: the targets are project notes, not skills"
area: "running the full check beside work in progress"
date: 2026-11-24
session_context: "Ships at the Harbourmaster: a baseline 'cargo xtask check' started on main's head in the same checkout reached its doctest stage after I had begun editing crates/naval, compiled the half-edited sources and failed (E0425 Helm), so its TypeScript half never ran and it told nothing about main. Later a 'cargo test --workspace' stopped at the first failing crate (room-wasm), hiding whether later crates passed; '--no-fail-fast' gave every failure in one run."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference:
commands_verified: "NODE_USE_ENV_PROXY=1 cargo xtask check (failed in doctests on my edits); cargo test --workspace --locked -q (stopped at room-wasm); cargo test --workspace --locked -q --no-fail-fast (exit 0 after fixes)"
---

**Issue:** A full check takes over half an hour and compiles each stage from the working tree as it reaches it. Started as a baseline while I edited the same checkout, it judged my half-written code, not main's. Separately, cargo test stops at the first failing test target, so one failing crate hides every later crate's result and costs a second full run.

**Suggested improvement:** In the Toolkit note: run a baseline either before the first edit (and wait for it), or in a git worktree of its own. In the Testing note: when hunting what a change broke across the workspace, use cargo test --workspace --no-fail-fast.

**Principle:** A long check reads the working tree lazily, stage by stage, so it measures whatever the tree holds when each stage starts; isolate a baseline in time or space. A test runner that stops at the first failing unit reports a floor, not the set of failures.

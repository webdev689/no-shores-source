---
id: 177
title: "A busy port's vite preview failed silently, so pictures showed the old build; a worker's targeted checks skipped rustfmt"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "the controller's resume brief (~/wt/briefs/resume.md) listed node --test, types, eslint, prettier, cargo test, clippy and xtask repo, not cargo fmt"
area: "worker checks and before/after pictures"
date: 2026-11-24
session_context: "Town worker (Harbourmaster, rain, patrol nodes). A second `vite preview --strictPort` on a port still held by the first failed under nohup with no sign, so some 'after' runs pictured the old build. Overlook hub's buildings never drew in any headless run. A 'sealed' wall test passed while bodies could still climb the block wall, so the test had to check the way's floor. After the resume brief (no full check), the branch's first full check failed in seconds on `cargo fmt --check` in crates/city."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo fmt --all --check (failed on crates/city/src/hub/tests.rs, then passed after cargo fmt --all)"
---

**Issue:** Two silent gaps. A picture run can show the wrong build when its preview never started, and nothing
checks which build answered. A list of targeted checks that leaves out a formatter lets a branch reach the full
check unformatted.

**Suggested improvement:** webgpu-shot.cjs (or the brief) prints the served bundle's hash and the worktree's head,
and refuses to picture when they differ. The template's targeted checks name `cargo fmt --all --check` and
`npx prettier --check` beside clippy and eslint, so a brief written in a hurry copies them all.

**Principle:** A check list written from memory drops the cheap steps; keep one canonical list and copy it.

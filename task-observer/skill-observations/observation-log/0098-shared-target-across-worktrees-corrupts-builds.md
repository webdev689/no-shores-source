---
id: 98
title: "A bisect worktree that shares target/ overwrites the main checkout's compiled crates"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the lesson is the repo's worker and bisect setup, not a skill"
area: "worktrees, cargo target directory"
date: 2026-11-21
session_context: "Bisecting a headless WebGPU start failure across five commits of main, each built in a worktree whose target/ was a symlink to the main checkout's."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: after the worktree builds, the main checkout's footRoom test failed 'the game's rules are from another version'; npm run wasm did not rebuild; touching every crate source and rebuilding fixed it"
---

**Issue:** To save build time, each bisect worktree linked the main checkout's target/. Cargo hashes workspace path
crates without their path, so building an older commit wrote its room and room-wasm artifacts over the main
checkout's, and the fingerprints still looked fresh: npm run wasm rebuilt nothing, and a later test loaded the older
WebAssembly. It took a forced rebuild (touching every crate source) to recover. The Toolkit's reviewer worktrees link
target/ too; they are read-only, so they are safe, but nothing says a builder must not.

**Suggested improvement:** Toolkit.md, Workers: a worktree that builds (a bisect, a builder worker) gets a
CARGO_TARGET_DIR of its own; only read-only reviewers link the main target/. If one did build into it, touch the
crates' sources and rebuild before trusting any test.

**Principle:** A build cache shared between checkouts of different commits is only safe if its keys include
everything that differs between them; when the tool deliberately drops the path from its keys, give each checkout its
own cache.

---
id: 98
title: "Two cargo runs on one target/ (a worktree linking it, or a background suite beside a foreground run in the same checkout) overwrite each other's crates; seen four times, needs a barrier"
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

**Second occurrence, 2026-11-24 (first Breach, round-two fixes):** a rules worker in an Agent isolation worktree set
`CARGO_TARGET_DIR=/home/user/no-shores-source/target` to skip a rebuild. The controller's `cargo xtask check` in the
main checkout then failed in protocol's doctest ("can't find crate for `room`") while the worker built its own `room`
into the same folder; the doctest passed when rerun alone. A second violation of the same lesson: per the rule, a
barrier, not a clearer sentence. Proposed: `cargo xtask check` refuses to run when another cargo process (by its cwd
outside this checkout) has the same target dir, or when CARGO_TARGET_DIR points outside the checkout; and the worker
brief template forbids setting CARGO_TARGET_DIR.

**Third effect, the worst, same day:** after the worker finished, crates it had compiled in the shared target kept
their dep-info pointing at the worktree's files (`include_str!` of content/modules/modules.json in `city`, the
`rerun-if-changed` paths of `room`'s and `dungeon`'s build scripts). Those worktree files never change, so cargo
reused them in the main checkout: `city` embedded the worktree's pre-art manifest while `room`'s tables read the new
one, and a test comparing them failed. Worse, targeted test runs before that point passed against stale embedded data,
so "tested offline" results were silently of the wrong content. Cleanup: grep every `.fingerprint` and `deps/*.d` for
`.claude/worktrees` and `cargo clean -p` those packages (17 crates, 15 GB). Barrier still proposed: forbid a target dir
shared across checkouts.

**Fourth occurrence, 2026-11-24 (inspect panel, the owner's Fruit ask), same checkout, no worktree:** a background
`cargo test -p combat -p room -p room-wasm -p protocol` ran while the controller edited `protocol`'s sources and ran
`cargo test -p gear -p protocol` in the foreground. The background run's room-wasm doctest failed "can't find crate for
`protocol`" though rustdoc was handed `--extern protocol=…rlib`: the foreground run had rewritten that rlib (same
metadata hash, new contents) under it. Rerun alone after the edits: 1722 passed, doctests included. The barrier
proposed above covers it only if it also refuses a second cargo process in the same checkout, which cargo's own lock
does not do across the build-then-rustdoc gap. Until a barrier exists: never start a cargo command while a backgrounded
cargo run is alive; stop it first, or wait.


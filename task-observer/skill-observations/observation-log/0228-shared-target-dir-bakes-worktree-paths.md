---
id: 228
title: "A worktree sharing CARGO_TARGET_DIR leaves its paths compiled into the main checkout's build scripts and tests"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — instance-specific to Rust workspaces whose build scripts or tests use env!(\"CARGO_MANIFEST_DIR\")"
area: "measuring main beside a branch"
date: 2026-11-24
session_context: "PR #186: to see what the branch added to CI's time, main was checked out as a git worktree under the scratchpad with CARGO_TARGET_DIR pointed at the branch's target, so registry crates were reused. Workspace crates got the same hashes in both checkouts, so every crate whose source matched main's (the dungeon build script, test binaries that find files through env!(\"CARGO_MANIFEST_DIR\")) was reused with the worktree's path compiled in. After the worktree was removed, the dungeon build script panicked on content/dungeon/landmarks.json; strings on the binary showed the worktree path. Fixed with cargo clean -p for every workspace member (21 GiB), then a rebuild."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "strings target/debug/build/dungeon-*/build-script-build | grep main-wt; cargo clean -p <each member>"
---

**Issue:** Sharing a target directory between two checkouts of one workspace is not safe for workspace crates: their
fingerprints do not include the checkout's path, so a crate built in one checkout is reused in the other with
compile-time paths (`env!("CARGO_MANIFEST_DIR")`, `file!()`) pointing at the first.

**Proposed:** Toolkit.md: to time main beside a branch, give the worktree its own target directory (or share only
`CARGO_HOME`'s registry), and never point two checkouts at one `CARGO_TARGET_DIR`. If it was done, `cargo clean -p` every
workspace member before trusting a local run.

---
id: 0297
title: "Starting workers in parallel on a fresh container races rustup's toolchain install and corrupts it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: run-worker.sh builds generated/, the WebAssembly and protocol fixtures on first run; nothing installs rust-toolchain.toml's 1.97.0 first or serialises the first cargo call"
area: "starting several workers at once"
date: 2026-11-26
session_context: "Three workers started seconds apart on a container that had only stable; each worktree's first cargo call made rustup install 1.97.0 at once. Two setups failed 'component download failed ... No such file or directory', and the third's build then failed 'can't find crate for std' on the half-installed toolchain. Fixed by stopping two workers, rustup toolchain uninstall 1.97.0, reinstalling, rebuilding the third's setup by hand and restarting the two."
parked_until:
resolved:
resolution:
reference: "session 01AQ3N4ngdqNdXFFNT7JJmBM, worktrees hub-ground, ship-stern, music-pass"
commands_verified: "rustup toolchain uninstall 1.97.0 then cargo --version: run, reinstalled; npm run schema && npm run wasm && cargo test -p protocol in music-pass: run, exit 0"
---
Proposed: install-all.sh (or run-worker.sh under a flock) runs `rustup toolchain install` for rust-toolchain.toml
once before any worker starts, so parallel starts never install it together.

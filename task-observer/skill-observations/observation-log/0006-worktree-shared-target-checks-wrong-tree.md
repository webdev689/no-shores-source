---
id: 6
title: "A worktree with target/ linked to the main checkout's ran cargo xtask check on the main checkout's tree"
status: open
type: internal
skill: ["superpowers:using-git-worktrees"]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.local.md"]
siblings_checked: "0004 (worktree tests need the ignored builds): its recipe links target/, which caused this. bible/03-Code/Testing.md 'Measuring' (#100, on main) already warns that two trees sharing a target folder write their binaries to one path, for speed comparisons only. No skill-families.md in this workspace"
area: "Toolkit, Workers: a worktree ready to test"
date: 2026-11-20
session_context: "The comprehensive audit of #102, #95 and #96: the follow-up's fixes made in a worktree, /home/user/overlook-audit, set up with node_modules, generated/ and target/ linked from the main checkout"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: cargo xtask check in /home/user/overlook-audit with target -> /home/user/overlook-source/target reported the main checkout's commit and tree (#102's), not the worktree's; with target relinked to a target of its own (scratchpad/audit-target), the same command reported 83ba69ca7489, the worktree's head, and passed"
---

**Issue:** the recipe for a worktree ready to test (0004; the Toolkit's Workers section, and CLAUDE.local.md's
"Testing in a Worktree") links `target/` from the main checkout, so the client tests find the WebAssembly. Cargo
then builds into the shared target, and `cargo xtask check` run in the worktree ran on the main checkout instead:
xtask finds the repository by `env!("CARGO_MANIFEST_DIR")/../..`, compiled into the binary, and the binary in the
shared target was the main checkout's. The check reported the main checkout's commit, so its result was for the
wrong branch. Building in the worktree also overwrote the main checkout's WebAssembly with the worktree's.

**Suggested improvement:** link `target/` only into a worktree that runs node tests against the main checkout's
build and never runs cargo. A worktree that builds or runs `cargo xtask` gets a target of its own (no link, or
`CARGO_TARGET_DIR` set to a folder of its own). Say so in the Toolkit's line for read-only reviewers and in
CLAUDE.local.md's worktree advice, beside the advice to link it.

**Principle:** a link to another checkout's build products shares that checkout's binaries as well as its outputs,
including whatever paths were compiled into them. A tool that finds its repository from a compile-time path checks
whichever checkout built it.

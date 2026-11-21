---
id: 49
title: "cargo xtask check prints 'checked <sha>, nothing uncommitted' last even when a step failed: read as a pass, a push went out"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["crates/xtask/src/main.rs", "CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: reading a check's result from its last line. The log of a2ead99b had '== format (Rust) failed' at line 16 and 'checked a2ead99b94cb, nothing uncommitted' last."
area: "overlook-source, the push gate"
date: "2026-11-21"
session_context: "Public events controller: 'check && git push' skipped the push on a failed check; the controller saw the last line, took it for a pass and pushed by hand."
commands_verified: "grep -n '^== .*failed' on the check log; cargo fmt --all; the full check rerun with its exit code printed"
---

- The controller ran `cargo xtask check > log && git push`, which rightly skipped the push when rustfmt failed. The
  log's last line still read "checked <sha>, nothing uncommitted", the line CLAUDE.md says the check prints last, so
  it was taken for a pass and the commit pushed by hand. It happened twice (5059fff8, a2ead99b); the second was a
  format failure on a test file; a fix commit followed with a full check.
- Proposed: the check's last line says whether it passed ("passed: checked <sha>" / "FAILED: <steps>"), and the
  controller's habit is to read the exit code, never the last line. The owner decides any rule or tool change.

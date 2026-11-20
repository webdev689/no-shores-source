---
id: 5
title: "Serena's replace_symbol_body drops a Rust symbol's doc comments and attributes, and rename_symbol failed"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the kit's tool guide, not a skill"
area: "Serena edits in Rust"
date: 2026-11-19
session_context: "Hulls worker threading a hull kind through the naval and sailing crates; reported in its OBSERVATIONS line."
parked_until:
resolved: 2026-11-20
resolution: "Toolkit.md's Serena row: give replace_symbol_body the doc comments and attributes, read the diff after each Serena edit, plain edits for renames when rename_symbol refuses (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "NOT RUN: reported by the worker"
---

**Issue:** The toolkit tells workers to edit whole functions with Serena's `replace_symbol_body`. In Rust it replaced
the body and dropped the doc comments and attributes above it unless they were included in the new text.
`rename_symbol` failed with "content modified". The worker fell back to scripted edits for most of its bulk changes.

**Suggested improvement:** In Toolkit.md's Serena row: include a symbol's doc comments and attributes in the text given
to `replace_symbol_body`, check the diff after each Serena edit, and use plain edits for renames across files when
`rename_symbol` refuses.

**Principle:** A structural edit tool's idea of "the symbol" may exclude what sits above it; say which parts it owns
before telling agents to prefer it.

**Recurrence (after actioning):** the fix-room worker of the sea audit lost a `#[test]` attribute to
`replace_symbol_body` again. The fix lives in PR #93's `Toolkit.md`, which worktrees cut from the sea branch do not
have until #93 merges, and the brief template (read by every worker in its prompt) does not carry it. Put the line in
the template's Serena bullet too.

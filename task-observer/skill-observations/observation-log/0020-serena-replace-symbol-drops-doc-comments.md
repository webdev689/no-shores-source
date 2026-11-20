---
id: 20
title: "Serena's replace_symbol_body dropped a function's doc comment and attribute when the new body left them out"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the project's toolkit note and brief template, not a skill"
area: "editing tools"
date: 2026-11-20
session_context: "Overlook factions round, second fix pass: the fix-rules worker reported that replace_symbol_body removed a doc comment and #[must_use] it had not repeated; its reviewer caught one lost doc comment"
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fix-rules.md OBSERVATIONS"
commands_verified: "none"
---

**Issue:** The brief tells workers to use Serena replace_symbol_body for whole-function edits; its symbol range includes
the doc comment and attributes, so a replacement body without them deletes them silently.

**Suggested improvement:** The brief's Serena line says replace_symbol_body replaces the doc comment and attributes too,
so the new body must carry them; a diff check for removed `///` and `#[` lines before commit.

**Principle:** An editing tool's notion of a symbol's extent must be stated where the tool is recommended, or its
silent deletions read as the author's.

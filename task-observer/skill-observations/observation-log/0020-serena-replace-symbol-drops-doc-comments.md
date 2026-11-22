---
id: 20
title: "Serena's symbol edits misplace doc comments: replace_symbol_body drops them, insert_before_symbol lands between a class and its doc comment"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the project's toolkit note and brief template, not a skill"
area: "editing tools"
date: 2026-11-20
session_context: "Overlook factions round, second fix pass: the fix-rules worker reported that replace_symbol_body removed a doc comment and #[must_use] it had not repeated; its reviewer caught one lost doc comment; Overlook third audit (2026-11-22): the flow worker's insert_before_symbol on a class put the new function between the class and its doc comment"
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

**Another instance (2026-11-22):** insert_before_symbol on a TypeScript class inserted above the class line but below its
`/** ... */`, so the class's doc comment then described the inserted function. Caught by the worker on reading back.

---
id: 251
title: "A comment-rule sweep was briefed to workers without counting its instances: 7 of 158 'the owner's' phrases stripped, then restored"
status: open
type: internal
skill: ["superpowers:dispatching-parallel-agents"]
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: controller briefs for audit fixers. The other rule sweep this session (bible links in comments) was counted and done repo-wide by the controller in one commit; only the who-decided sweep was split across worker briefs."
area: "controller, briefing audit fixers"
date: "2026-11-25"
session_context: "PR #209, the codebase audit: worker D's item 17 removed 'the owner's'/'Claude's' from 8 crate comments; restored in a78de452."
commands_verified: "run: git grep -nE \"(//|\\*|#).*\\bthe owner('s)?\\b\" -- '*.ts' '*.rs' '*.py' '*.mjs' '*.wgsl' | wc -l printed 158."
---

The read-only auditors flagged a few comments that say whose call a value was ("at the owner's word", "The numbers are
Claude's") under Comments Say Why's "who asked for what". The controller put them in one fixer's brief as listed
items. The fixer did them; another fixer flagged two more in the client; only then did a count show 158 such
comments, most of which mark a value as a design decision rather than a tuning, which matters under "never invent game
design". A partial sweep left the code half one way, and one replacement ("a first pick, open to tuning") was a claim
nobody had recorded. The controller restored the eight files and put the reading of the rule to the owner.

Proposal: before a rule's breaches go into a worker brief, the controller counts them repo-wide; a pattern past a
handful is either swept whole by one hand or, if the rule's reach is unclear, asked of the owner first.

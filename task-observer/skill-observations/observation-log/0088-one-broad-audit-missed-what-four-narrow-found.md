---
id: 88
title: "One broad audit of a 60-file change found 10 things; four narrow audits of the same change found 34 more"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: the Audits section's one read-only audit agent per feature; only this change measured."
area: "overlook-source, the perk pass (#119)"
date: "2026-11-21"
session_context: "#119 was audited once by one agent over the whole diff; the owner then asked for a deep audit, run as four agents each on one area (room mechanics, naval, gear crate and content, client)."
commands_verified: "each of the 34 later findings checked against the code; 20 fixed with a test that failed before the fix"
---

- The first audit, one agent over `git diff origin/main...HEAD`, reported 10 findings. The four area auditors found real
  defects it had not: a kept module's bought perk swapped for a trade-off by position, an arrow on a corpse leaping,
  bursts striking one bystander twice across a sweep, Snare missing a rowing captain, the large pictures' manifest not
  in the branch, and more.
- Proposed rule (Toolkit.md, Audits): a change over about 20 files is audited by one agent per area it touches, each
  with its own files and spec sections, not by one agent over the whole diff.

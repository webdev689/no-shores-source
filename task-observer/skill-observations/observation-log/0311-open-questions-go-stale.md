---
id: 311
title: "Open Questions entries asked as live were already settled in code (keepers' names, split wiki links); the owner had to catch it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Recording a Decision.md", "bible/07-Open/Open Questions.md"]
siblings_checked: "checked: content/story/cast.json names Arlo Kestrel and Sable; crates/xtask/src/checks/vault.rs:295 already refuses split links; land already hides plates (plateSight.ts)"
area: "walking the owner through open questions"
date: 2026-11-27
session_context: "Walking 61 Open Questions one at a time, Claude asked the owner to name the Stormcallers' and Veiled's keepers; they already had names in cast.json. The owner: 'ensure some of these haven't already been changed (Like faction members do get their own names)'. Two more entries (split wiki-link check, land hiding plates) were also already built."
parked_until:
resolved:
resolution:
reference: "PR #234"
commands_verified: "grep -rn stormcaller content/story/cast.json: run, name Arlo Kestrel"
---
Before asking the owner an open question, grep the code and content it names: the Open Questions note is not kept
current as pull requests land. Proposed rule: a walk-through checks each entry against the code first and drops or
marks the stale ones before asking.

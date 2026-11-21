---
id: 75
title: "An 'every X is used' ask was designed before X was inventoried: the worker's coverage test found 103 forge layers unworn"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: owner asks that every member of a set appear somewhere (models, sounds, emblems); only this one seen."
area: "overlook-source, gear looks (the perk pass)"
date: "2026-11-21"
session_context: "The owner asked that all weapon and armour models be used; the controller wrote 'named pieces own looks, rolled tiers spread' and briefed a worker on it."
commands_verified: "the worker's modelsWorn.test.ts against tools/forge/tools/sprite-forge/fitted/male.json (103 layers in LEFT_OUT); design rewritten as a ladder by rarity and level"
---

- The controller counted the forge's metals and sets by hand and judged the design to cover them. Named pieces (one
  look each) cannot reach kind x metal pairs that no named item of that kind exists for, so the finest metals stayed
  unworn on most kinds.
- The worker's test listed every forge layer and named the unworn ones; that list made the gap plain in one read.
- Proposed rule: for an ask that every member of a set be used, the controller lists the set from its source of truth
  and writes the coverage test (or has it written) before fixing the design, and the brief says a LEFT_OUT list is for
  members that cannot belong to the ask (a class's own layer), never for ones the design missed.

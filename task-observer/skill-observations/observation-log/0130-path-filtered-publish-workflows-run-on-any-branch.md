---
id: 130
title: "Editing a path-filtered publishing workflow on a session branch would run it and publish to R2"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: a repository workflow fact, no skill family"
area: "audits that touch .github/workflows"
date: 2026-11-22
session_context: "Overlook third audit: adding tools/r2.py to the flora, modules, freesound and dungeon-modules path filters. Those four have 'on: push: paths:' with no branch filter and list their own yml, so pushing the edit to the session branch would have run them with R2_TOKEN. Caught before commit and reverted; the change went to the owner instead."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: for f in .github/workflows/*.yml; sed -n '/^on:/,/^jobs:/p' showed dungeon-modules, flora, freesound, modules, island-modules, ships, wreck with push paths and no branches filter"
---

**Issue:** Four publishing workflows trigger on a push to any branch when a listed path changes, and each lists its own
file. An audit fix to their path filters, pushed to a session branch, would have published to R2 and spent Actions
minutes: an outward action the owner approves.

**Suggested improvement:** Toolkit.md (Audits or Workers): before editing a workflow, read its trigger; a workflow
with push paths and no branch filter runs from any branch, so propose the change instead of pushing it.

**Principle:** Before changing a CI file, check what pushing the change itself triggers.

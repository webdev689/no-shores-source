---
id: 130
title: "Editing a path-filtered publishing workflow, or any tools/ path one watches, on a session branch would run it and publish to R2"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: a repository workflow fact, no skill family"
area: "audits that touch .github/workflows"
date: 2026-11-22
session_context: "Overlook third audit: adding tools/r2.py to the flora, modules, freesound and dungeon-modules path filters. Those four have 'on: push: paths:' with no branch filter and list their own yml, so pushing the edit to the session branch would have run them with R2_TOKEN. Caught before commit and reverted; the change went to the owner instead. Again in the cleanup-audit session (2026-11-23): dead-code and docstring fixes under tools/wreck, tools/dungeon, tools/islands, tools/freesound and tools/r2.py, plus the modules.yml upload-path fix, were made and reverted before the first push once the triggers were read; the wreck workflow would also have re-rendered a scene the owner is holding back."
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

**Second instance (2026-11-23):** not only workflow files: any file under a path a publishing workflow watches
(tools/wreck/**, tools/dungeon/**, tools/islands/**, tools/freesound/**, tools/ships/**, tools/flora/**,
tools/modules/**, tools/r2.py) starts it on push from any branch. Caught by reading every workflow's `on.push.paths`
after the edits, before any push. Nothing written down protected it; the open entry above was its only carrier.

**Suggested improvement (second occurrence, so a barrier):** a pre-push hook in the kit (beside the pre-commit guard)
that reads each workflow's `on.push.paths` with no `branches` filter, matches them against the pushed commits' files,
and refuses the push naming the workflows it would start, unless `ALLOW_PUBLISH=1` is set for that push.

**Principle:** Before changing a CI file, check what pushing the change itself triggers.

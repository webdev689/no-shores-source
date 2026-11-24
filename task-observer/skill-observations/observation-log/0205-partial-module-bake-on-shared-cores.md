---
id: 205
title: "A full module bake took over 2 hours on shared cores; baking only the changed modules with bake.py's own baked() and splicing took 2 minutes, and 'before' renders raced the edits"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/modules/bake.py", "bible/02-Systems/Modules.md", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: modules.yml re-bakes everything twice in CI and diffs the committed manifest, so a spliced manifest is still verified there; island-modules.yml and dungeon-modules.yml have the same whole-bake shape"
area: "re-baking a few Blender modules locally while other workers share the cores"
date: 2026-11-24
session_context: "PR #179's third audit, fix3-look: changed outpost_*.py (slits, windows, braziers, Delve Gate). The brief said a full bake takes ~20 min; with four workers on 4 cores it ran over 2 h. The worker baked only the 12 outpost modules through bake.py's baked() with a scratch script and spliced them into content/modules/modules.json, twice, byte-identical. Its background Blender 'before' renders read module files after later edits, so they showed the new shapes; it re-rendered 'before' from a git archive copy of HEAD."
parked_until:
resolved:
resolution:
reference:
commands_verified: "worker's report /root/wt/reports/fix3-look.md and its OBSERVATIONS lines; .github/workflows/modules.yml lines 44-54"
---

**Issue:** bake.py only bakes everything, so a change to one module family costs a full bake, which runs for hours when the cores are shared. The worker wrote its own splice script to bake a subset. Separately, "before" renders run in the background against the live worktree picked up edits made after they started.

**Suggested improvement:** Give bake.py a `--only <prefix>` option that bakes the named modules and rewrites only their manifest entries. CI's whole bake stays the check. In the brief: render "before" pictures from a `git archive` copy of the base, never from the worktree being edited.

**Principle:** A local tool should let you redo only the part you changed when CI already checks the whole. A "before" picture has to come from a frozen copy.

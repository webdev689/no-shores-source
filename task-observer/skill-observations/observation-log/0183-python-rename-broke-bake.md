---
id: 183
title: "A names-only rename in a Blender script left an undefined name; no repo check runs the Python, so only the modules workflow's bake on push caught it"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["crates/xtask/src/checks/", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: every tools/modules/outpost_*.py after the fix with a re-bake of the 38 outpost modules (none differ from the manifest); tools/islands, tools/dungeon and tools/forge have the same exposure"
area: "checks: Python tool scripts"
date: 2026-11-24
session_context: "Guild outposts session: the fix-page worker was told to spell out short Python names with no shape change, so no bake. It renamed `hx, hy = half` to `half_x, half_y` in outpost_standards.py but missed one later `hx`. cargo xtask check passed (it does not run or lint Python), and the PR's modules workflow failed with NameError in scaffold(). The controller fixed the one line and proved no shape changed by re-baking the 38 outpost modules against content/modules/modules.json."
parked_until: "PR #245 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #245, merged 2026-11-27"
reference: "modules workflow job 138158084959 on PR #179; fix ef6a2a67"
commands_verified: "run: ~/bpy-venv/bin/python -I outpost_rebake.py -> 38 outpost modules re-baked; differing from the manifest: none"
---

**Issue:** `cargo xtask check` covers both languages' code but no Python: the Blender scripts in tools/ are run only
by their content workflows on push. A rename in one became a broken bake that every local check passed.

**Suggested improvement:** add a repo check that byte-compiles every tools/**/*.py and runs pyflakes (or `python -m
py_compile` plus a builtin undefined-name pass) so an undefined name fails `cargo xtask repo`; and in the common
brief, "a change to a Blender script, even names only, re-bakes the modules it builds and compares them with the
manifest" (a 30-line script: bake.baked(name) per module, compared with modules.json).

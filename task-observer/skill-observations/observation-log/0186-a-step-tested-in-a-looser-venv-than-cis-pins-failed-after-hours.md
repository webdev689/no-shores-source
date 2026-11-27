---
id: 186
title: "A workflow step tested in a worker's own venv passed locally, then failed in CI on a module the pinned requirements lacked, after four hours of figure strips, losing them all"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md", ".github/workflows/forge.yml"]
siblings_checked: "checked: every asset workflow that installs pinned requirements (forge.yml, lattice.yml, dungeon-modules.yml) has the same shape: a step tested locally in a looser venv can fail in CI on a missing pin; a late step failing loses the earlier steps' work when staging is last"
area: "testing a CI step locally before a long, owner-approved run"
date: 2026-11-24
session_context: "#169's forge run 45307444321: the fpforge worker tested the new firstperson step 'with the venv's python' (/root/wt/reports/bpyvenv, which had scikit-image and Blender 5.3 installed ad hoc); CI installs only artbirds-requirements.txt (Blender 5.2.3, no scikit-image). The run drew all 10,220 figure frames in about 4 h, then the firstperson step failed with ModuleNotFoundError: skimage; staging came after it, so nothing was published. Fixed by pinning scikit-image and its five dependencies with hashes, verifying the step in a venv built from the pins alone, and moving the first-person step before the figure strips."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: one-off; its fix is in (artbirds-requirements.txt:35 pins scikit-image; forge.yml draws first person before the figure strips)"
reference:
commands_verified: "run: pip install --require-hashes --only-binary=:all: -r artbirds-requirements.txt into a fresh venv, then fplayers.py --weapon dagger --sets '' [--left] --metals Ebony --samples 4 -> 124 files; run: fplayers.py --check -> both weapons cut from their own canvas"
---

**Issue:** A worker added a CI step and tested its command locally, but in a venv that had grown by hand (other packages, a newer Blender), not one built from the workflow's pinned requirements. The step needed a module the pins lacked. In CI it ran after a four-hour step, and the step that stages results came last, so the failure lost the four hours as well. The brief asked for a local test of "the step's own run: text", and the worker did that, but with the wrong interpreter.

**Suggested improvement:** When a brief has a worker add or change a CI step, it should say to test the step in a fresh venv built only from that workflow's pinned requirements (`pip install --require-hashes -r ...`), and to report the venv's provenance. Workflows that run a long step should put their quick, failure-prone steps first, or stage after each step, so a late failure doesn't throw away the long step's output.

**Principle:** A local test proves a CI step only if it runs in CI's environment: the same pins, built fresh. Order a long pipeline so cheap steps that can fail run before expensive ones.

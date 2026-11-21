---
id: 84
title: "A controller-made bpy venv lacked the forge's packages (pillow, scipy, cma); the forge pins its own wheels"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/forge/tools/sprite-forge/artbirds-requirements.txt"]
siblings_checked: "family: Blender pipelines (modules, flora, ships, wreck: bpy 5.3.0; forge and lattice: artbirds-requirements.txt, bpy 5.2.3)."
area: "overlook-source, Blender in a cloud container"
date: "2026-11-21"
session_context: "Public events: three workers given one shared venv (/root/bpy-venv, bpy 5.3.0 + numpy)."
commands_verified: "lattice worker's report: installed pillow, scipy, cma into the venv itself"
---

- The controller installed `bpy==5.3.0` and numpy for the workers. The forge and the Lattice pin bpy 5.2.3 and more
  (pillow, scipy, cma) by hash in `artbirds-requirements.txt`; the lattice worker added the missing ones by hand.
- Proposed habit: a session that will run the forge installs `artbirds-requirements.txt` into a venv of its own
  (`pip install --require-hashes -r ...`), and the modules' bpy 5.3.0 into another, as CI does; Toolkit.md could say so.
- Also seen: Context7's anonymous monthly quota is used up (the worker could not read actions' docs), and the forge's
  `--views` cannot draw a fresh move (it needs strips already drawn), so a render job is a whole move.

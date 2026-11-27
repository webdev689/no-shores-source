---
id: 286
title: "The modules' picture tool lays a ground plane that hides any view from below, so an airship seen overhead could not be pictured as players see it"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/modules/render.py", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "picturing a Blender module before and after a fix"
date: 2026-11-26
session_context: "No Shores #211's last audit: a worker fixed the Grey Tithe airship's plates, lift frames and hatch struts, faults seen from below as it hangs 16 m over players. tools/modules/render.py lays a ground plane at the model's foot, so a camera under the hull saw only ground; the worker rendered with a scratch copy that dropped the ground 30 m."
parked_until: "PR #243 merge"
resolved:
resolution:
reference:
commands_verified: "none: the worker's scratch render.py copy is not kept"
---

**Issue:** `tools/modules/render.py` always lays its ground plane under the model, so a view from below (how an
airship hanging overhead is seen) shows ground, not the hull. The worker had to copy and patch the tool to picture
the faults it was fixing, and the patch was not kept.

**Suggested improvement:** give render.py a view from below (or a flag that leaves the ground out), and name it in
Toolkit.md's row for module pictures, so a module seen overhead is pictured as players see it.

**Principle:** a picture tool's fixed staging decides which faults can be seen; when a model is seen from an angle the
staging hides, the staging needs an option, not a scratch copy each time.

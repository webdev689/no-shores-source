---
id: 161
title: "Forge local runs: fplayers.py fails 'past the canvas' with two records at once, layers.py skips its index before a pull, and the render cache needs re-recording after layers.py or stage.py change"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/02-Systems/Sprite Forge.md", "bible/03-Code/Toolkit.md", "tools/forge/tools/sprite-forge/fplayers.py"]
siblings_checked: "checked — forge-specific: fplayers.py, layers.py and rendercache.py are the forge's local entry points; the dungeon pieces' build has its own notes in Toolkit.md"
area: "rendering the sprite forge locally"
date: 2026-11-23
session_context: "Worker fblade (faction blades' colour), OBSERVATIONS line: `fplayers.py --records 0,1` fails 'past the canvas', already at HEAD, so it ran one record per call; layers.py only writes its index after the published tables are pulled (strips still render); `rendercache.py --record` must be re-run after any change to layers.py or stage.py. Also: no workflow runs fplayers.py, so first-person frames are published only by a local run and forge_publish.py add."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fblade.md (session-local; the findings are in the body)"
commands_verified: "NOT RUN by the controller; reported by worker fblade"
---

**Issue:** Running the forge locally hit four traps the notes don't mention:
- `fplayers.py` with several records (`--records 0,1`) fails "past the canvas", even at HEAD.
- `layers.py` writes its index only after the published tables are pulled.
- The render cache (`rendercache.py --record`) is stale after any change to `layers.py` or `stage.py`.
- No workflow renders first-person frames, so they need a local run plus `forge_publish.py add` with the key.

Each cost a worker time to find out.

**Suggested improvement:** Say all four in Sprite Forge.md's how-to and in Toolkit.md's forge row, and fix the multi-record failure, or have `fplayers.py` refuse more than one record with a clear message. Consider a forge.yml input that renders and publishes first-person frames, so they publish the way figure strips do.

**Principle:** A tool's local run should either work as its CI run does or say plainly where it differs. Traps found only by running into them cost every new user the same time.

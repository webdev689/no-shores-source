---
id: 280
title: "A merge from main made publish.py import numpy through root.py; the local test passed because this container has numpy, the freesound runner has none"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/freesound/publish.py"]
siblings_checked: "none: the targets are project files, not skills"
area: "merging main into a branch whose workflows main's tools feed"
date: 2026-11-25
session_context: "Merging 199 commits of main into claude/exciting-pascal-uec4ac. Main had added tools/freesound/root.py (imports numpy at the top) and publish.py did `from root import ROOT` for a regex. Locally `python3 -I tools/freesound/test_publish.py` passed (numpy installed here). The freesound workflow's first step after checkout failed in 0 s: ModuleNotFoundError: numpy (run 45680120524). Main's own last freesound run had died earlier at the stale apt list, so the break was latent there. cargo xtask check does not run the freesound workflow's steps."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: .github/workflows/freesound.yml:46 (\"Test the publish, as it loads here with no numpy\")"
reference:
commands_verified: "freesound runs 45680120524 and 45682864239 (failed at the publish test), 45608443046 on main (failed at Install ffmpeg); fixed in 5120e28f, publish.py imported with sys.modules['numpy'] = None"
---

**Issue:** After a merge, the agent checked the tools main changed with this container's Python, which has packages a
GitHub runner's system Python lacks; a path-triggered workflow outside `cargo xtask check` then failed on an import.

**Suggested improvement:** Toolkit.md (after merging main): for each path-triggered workflow whose files the merge
touched, run its Python steps with the packages that workflow installs and nothing else (for freesound: none, so
import each script with `sys.modules['numpy'] = None`), and read the workflow's first run on the pushed head.

**Principle:** A local pass proves the code in this environment only; where CI runs in a leaner one, test in that
leaner shape, or read CI's own run before calling it passing.

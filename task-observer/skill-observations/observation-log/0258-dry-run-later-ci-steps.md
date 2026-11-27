---
id: 258
title: "Fixing one failing step of a long CI pipeline, without running its later steps locally, cost another 45-minute run"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — 0247 is the first failure of the same runs (apt), this is the one it masked (numpy)"
area: "CI workflows"
date: 2026-11-25
session_context: "Freesound runs 157/164 failed at the ffmpeg install; I fixed that (apt-get update) and pushed. Run 167 then failed at the next step: publish.py imports root.py, which imported numpy, absent on the runner (my own earlier commit 835c3348; run 141 had failed the same way and was never read). A local dry run of the cut and stage steps on 167's real download, with numpy blocked (sys.modules['numpy'] = None), took two minutes and passed after the fix (9f46aa3e)."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference: "https://github.com/Lattymoy/no-shores-source/actions/runs/45633888913"
commands_verified: "python3 -I -c \"import runpy,sys; sys.modules['numpy']=None; sys.argv=['publish.py','--cut',D]; runpy.run_path('tools/freesound/publish.py', run_name='__main__')\""
---

**Issue:** A failed run hides every step after the one that failed. Fixing that one and pushing tests only it; the
next step's fault waits another full run. And a failed run of my own (141) went unread, so its cause shipped to main.

**Proposed:** Toolkit.md's CI section: when a long workflow fails, read every failed run you caused, and before pushing
the fix run the later steps locally on the run's own artifact, under the runner's conditions (missing packages blocked).
The same held for ci.yml: CI run 1098 stopped at the TypeScript lints (id-length on a parameter `at`) because I
ran types and tests but not `npm run lint`; for a TS change, run each step in crates/xtask/src/toolchain.rs the change
touches (format:check, lint, types, test). Protection in play: none yet; needs the owner's agreement as a rule.

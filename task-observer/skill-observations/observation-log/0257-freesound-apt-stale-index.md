---
id: 257
title: "The freesound workflow installs ffmpeg after a 45-minute search, without apt-get update, so a stale index wastes the run"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: [".github/workflows/freesound.yml"]
siblings_checked: "checked — the only apt-get in .github/workflows/; run 141 also failed on this branch, cause unchecked"
area: "CI workflows"
date: 2026-11-25
session_context: "Taking the owner's sound picks in. Run 157 searched all 33 cues and read 236 picks (42 min), then failed at `sudo apt-get install -y -q ffmpeg`: 404 for pipewire packages Ubuntu had superseded since the runner image was built. Nothing was cut, staged or published. Fixed at its cause (apt-get update first, 56282343); a second run of the same search had to start over."
parked_until:
resolved:
resolution:
reference: "https://github.com/Lattymoy/no-shores-source/actions/runs/45621633485"
commands_verified: "mcp__github__get_job_logs run_id failed_only"
---

**Issue:** A step that can fail on the machine (an apt install) runs after the long network search, so its failure shows
only after the search's whole time is spent; and it installed from the image's stale package index.

**Proposed:** Fixed the cause (apt-get update before install). Proposed to the owner: install ffmpeg before the search
too, so a machine fault fails the run in seconds. The owner: "Do it" (152031e7). Protection in play: the workflow's own
step order, checked by every run.

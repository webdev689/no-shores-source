---
id: 181
title: "World pictures of new models before merge need their meshes routed from the local bake, a clock shift and a wait for the HUD: none of it is written down"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-shot.cjs"]
siblings_checked: "checked: the island and dungeon module workers would meet the same gap for any model not yet on R2"
area: "pictures of the game world with content not yet published"
date: 2026-11-23
session_context: "Foe arrivals session (2026-11-25): the plan's `routes` for the airship's and crown's six new meshes were passed over again and the game's worker fetched R2 (404); worked round as before, by an `init` wrapping `self.fetch` to a copy under `dist/local-modules/`, and a clock slowed 60 times from a set hour. Earlier, guild outposts session: the outpost-page worker's OBSERVATIONS said its world shots needed an init clock shift (for the world's hour) and `waitFor 'All controls'` (else black frames), which it worked out itself; and that the outposts' meshes answered 404 on R2, so no structure drew. The modules workflow publishes meshes on any push that touches tools/modules, which had not run yet; the controller then routed each new mesh to /root/wt/bake-out through webgpu-shot.cjs's `routes`."
parked_until: "PR #243 merge"
resolved:
resolution:
reference: "/root/wt/reports/outpost-page.log (OBSERVATIONS line); /tmp/claude-0/-root-wt-outpost-page/fb21aed2-69f5-4cd3-b0e7-b463f15a1e45/scratchpad/makeplan.mjs"
commands_verified: "run: python3 tools/claude-toolkit/workers/audit.py /root/wt/outpost-page -> MISSING (defect): none; FIRST3 ok"
---

**Issue:** A worker taking world pictures of content it just made meets three things no note says: the dev build's
world hour needs a shifted `Date.now` in the plan's `init` to be lit; the first frames are black until the HUD shows
(`waitFor: 'All controls'`); and new module meshes are not on R2 until the modules workflow runs on a push, so they
404 and nothing draws. Each worker works these out alone.

**Suggested improvement:** In `bible/03-Code/Toolkit.md`'s Browser QA row, give the recipe: the clock shift line, the
`waitFor`, and "content baked but not pushed: map each new mesh (`modules/<hash>.mesh` from the manifest) to the bake
folder with the plan's `routes`". A `--routes-from <manifest> <folder>` option in webgpu-shot.cjs would make it one
flag.

**Found since:** the plan's `routes` alone cannot serve R2 files: webgpu-shot.cjs adds its own R2 route after the
plan's, and Playwright runs the last-added route first, so the R2 route fetched R2 (404) and the plan's never ran. The
picture agent worked round it by wrapping `self.fetch` in the plan's `init` to send outpost meshes to a same-origin
path the plan's route answers. Fix in the driver: the R2 route calls `route.fallback()` for a URL a plan route covers,
or the plan's routes are added last. Also: the bare view needs about 10 frames, not 4, before the arrival blink opens,
and a clock shift can land on a storm day; hold the clock at a clear hour.

**Second instance (foe arrivals, 2026-11-25):** the same `routes` miss cost a capture run of some minutes before the
404s showed. A second occurrence calls for the barrier, not a note: fix the driver so a plan's `routes` reach the
game's worker (add them last, or have its R2 route `fallback()` for a covered URL), with a check in the driver that a
routed URL was in fact served once, printed at the end.

---
id: 86
title: "webgpu-shot has no way to show meshes not yet on R2, and headless WebGPU is too slow to play a timed event"
parked_until: "PR #243 merge"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: pictures of unpublished content (props worker and page worker both wrote an init-script fetch rewrite into dist/modules)."
area: "overlook-source, browser QA of new content"
date: "2026-11-21"
session_context: "Public events: props and page workers pictured meshes before the modules workflow had published them."
commands_verified: "page worker's report: about 5 frames a minute headless at load 16; 10-minute default background limit killed a bake, a preview server and a capture"
---

- Twice a worker needed meshes on the page before CI published them; both wrote the same init-script fetch rewrite
  (the driver's own routes lose to its anyPort route). Proposed: a webgpu-shot step that serves a local folder for
  a URL prefix.
- Headless SwiftShader drew about 5 frames a minute at load 16, and a page room steps at most 0.1 s a frame, so an
  8-minute event cannot be played through for pictures; a dev-only sim speed and scripted bots were then briefed.
- Long background jobs need an explicit timeout: the 10-minute default stopped a 30-minute bake, a preview server and
  a capture mid-run. A dev-only address needs a  build for built-page pictures. Two repo checks
  (layer imports, crate edges) show only in the full check; repo checks: 2556 files, no problems is the quick one to run first.

- Worked round (2026-11-25, no-shores-source, foe arrivals #211): a 200-frame step of a raid scene failed ("200 frames
  were not drawn in 10 minutes"; the driver's cap per frames step). What worked: a dev page with `&public=raid&speed=16`
  and `&spawn=`; an `eval` setting `__play.until = () => false` so the play reads snapshots with no bots, then the real
  `until` once the event shows; between pictures `__play.speed = 6` with `{ "frames": 50 }` or fewer, and 1 tick a
  frame for 3 frames before each `shot`; pictures at 960x540; `self.__qaEye` placed from `__play.read` (whose points are
  flat, so the height comes from the event's ground). Candidate for the Toolkit's Browser QA recipe.

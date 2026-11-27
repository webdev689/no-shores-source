---
id: 211
title: "Offline the page holds no gear (`foot.gear` is null without a socket; drops were drawn only from it), `__qaView` stands the body clear of what stands and re-arrives it as a fresh character, and a GPU run cannot finish a timed hold"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "bible/02-Systems/Game.md"]
siblings_checked: "none: the targets are project notes, not skills"
area: "building a feature that must work playing alone, and picturing it headless"
date: 2026-11-24
session_context: "Chests and searchable containers: the offline room stood chests, but the page drew and offered none, because `Foot.gear` (`gearInRoom`) is null unless the link is a RoomConnection; only `held.alone` carries the offline room's word (the public event's chests already read it). Found only by reading code before picturing. Then a no-GPU picture plan stood the body 1 m from a crate with `__qaView`, but the arrival put it 2.3 m off (moved clear of a tent's box), so the prompt never showed; checking `__qaWhere`/the body against the target and trying each side fixed the plan."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs <plan with noGpu> (first run: 'Hold to search the' did not show in 120 s; with a per-side retry: searched)"
---

**Issue:** Two traps for a feature meant to work when the page plays alone: the page's gear accessor is online-only,
and a QA arrival does not stand the body where asked when something stands near.

**Suggested improvement:** Game.md (or Toolkit's Browser QA row): "Alone, `Foot.gear` is null; what a room alone stands
for the player is read from `held.gear ?? held.alone`"; and "`__qaView` stands the body clear of boxes: check
`__qaWhere` against the point before reading a prompt, and retry from another side."

**Principle:** A test harness that silently relocates its subject needs its post-condition checked, not assumed;
and an accessor named for the general case but valid only in one mode should say so where it is defined.

**Second instance (same session, DFO's chest and the pour):**
- The foot view drew drops only from `this.gear?.gear`, so a page playing alone never drew a drop. It was found only when a GPU picture of a poured Vestige showed nothing; fixed to read `held.gear ?? held.alone`.
- `__qaView` re-arrives the player as a fresh character: the gear's Aurem and resources restart, and a chest already opened stands again. A no-GPU plan that opened four chests each through `__qaView` read each chest's Aurem diff as 0 after the first, which looked like a bug in the room. A room test showed the four chests paying 21 each.
- With the GPU on, neither `askGear` nor a `hold` step finished a chest's 1 s hold: a headless frame moves the game on too little. Opening works only in a `noGpu` plan.
- Handing the page a state to picture (`held.alone = {...}`) lasts one frame, because each room message replaces it. Wrapping the field in a getter that re-applies the state to every message worked.

**Suggested improvement (added):** Toolkit's Browser QA row: "`__qaView` re-arrives a fresh character; a timed hold cannot finish with the GPU on (drive it `noGpu`); to picture a state the room sends, wrap `foot.held.alone` (or `.gear`) in a getter, as a plain assignment lasts one message."

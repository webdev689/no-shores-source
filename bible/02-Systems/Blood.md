---
type: system
status: live
code:
  - client/src/combat/blood/spray.ts#DecalRing
  - client/src/combat/blood/spray.ts#ladderRate
  - client/src/combat/blood/spray.ts#sprayPattern
  - client/src/combat/blood/art.ts#buildAtlas
  - client/src/combat/blood/art.ts#driedTint
  - client/src/combat/blood/bleeding.ts#Bleeding
  - client/src/combat/blood/gibs.ts#gibStep
  - client/src/combat/blood/marks.ts#BloodMarks
  - client/src/combat/blood/marks.ts#bloodOn
  - client/src/combat/blood/view.ts#BloodView
  - client/src/testground/blood.ts#TestgroundBlood
  - client/src/testground/blood.ts#surfacesOf
---
# Blood

Blood that a blow leaves where it lands and that stays: DFO's blood marks, brought over exactly as DFO has them, its
numbers, orderings and colours unchanged ([[Struck Figures Flash, and DFO's Blood Comes Over]], [[Pick - Blood]]). It is drawn in the [[Test Ground]]'s fight.

## How it works

- **A blow's spray.** Each hit is measured by its damage over the struck body's whole health, on DFO's rate ladder: up
  to 25 percent is 30, up to 50 is 50, up to 100 is 70, past that 150, and from 175 percent, an overkill, 200. About
  an eighth of the rate reaches a surface, at most 24 drops, thrown from the body's chest (five eighths of its 1.8 m)
  in one to three lobes, the reach and the marks' size growing with the rate. Drop zero is the
  pool under the body. Each drop finds its own surface: a block's side between it and the body, else the ground or a
  block's top below it within 3 m, or, one drop in four, a ceiling above it within 4 m; one that finds none leaves
  nothing. The pool is laid at once; every other drop flies to its mark on an arc solved to end there and is drawn in
  flight. A drop that came down at a slant streaks along its travel; one on a wall runs down it.
- **The throw.** A player's swing leans every drop but the pool the way its blade went, as DFO's swing throw has it:
  DaggerBlood's push for the stroke, taken in the striker's frame along the way it struck, 0.08 m a unit. A cut to the
  left or the right, level or downward, throws it 0.6 m that way, an upward cut 0.4 m back at the striker, and a
  straight chop nowhere, its push being all upward. A shot's blood and a foe's are thrown nowhere.
- **An overkill.** At 175 percent a second, wider spray goes down first, 350's worth, or 450's when a player's
  warhammer struck. A player's warhammer overkill also throws the body apart: ten chunks fly up and out at three times
  gravity, and each sprays where it lands.
- **Bleeding.** Every fighter, foes, other players and the player alike, is seen each frame. Below half its health a
  body drips every 2 to 5 seconds, up to six drops at its feet, more the nearer it is to death, so a wounded body
  leaves a trail. A body seen dying pools once at its feet, the pool spreading from 0.45 m to 1.5 m over 12 seconds
  in eight steps. A foot that comes down in a fresh mark carries the blood for six prints, each fainter.
- **The marks.** Six hundred marks exist and no more; once full, the oldest is reused. Their art is drawn at the start
  from noise and distance fields: pools, spatters, streaks, wall runs and prints, eight of each. Fresh blood is DFO's
  red, a little darker at random, and over three minutes it dries in eight steps to a dark brown.
- **Drawing.** One WebGPU pass in the scene's own render, after the ground and the blocks and before the figures, so
  a body stands over its own blood. Each mark is a film whose thinning rim glows toward orange, lit and fogged as what
  it lies on: the ground is drawn unlit, the blocks by the scene's one light. Chunks and droplets are upright
  billboards.
- **Off.** `?blood=off` in the page's address makes and draws none.

## Limits

- The Test Ground has no ceilings, so no drop finds one.
- The gore dial is fixed at DFO's default: the full amount and 600 marks.

---
type: decision
date: 2026-11-27
status: in force
---
# No Shores (Mobile) Is Rebuilt in Rust, Beside the Browser Game

> "Just spit balling but what if we somehow take what weve built and build a proper mobile game out of it?"

> "I was moreso thinking about rebuilding everything strictly in rust, dialing back scope a little.
>
> Keeping the progression, how the game works, the story, leaning more on the dungeon system. Making movement touch
> based with enemy encounters leaning into  1 on 1 type style encounters with multiple enemies lining up to face.
>
> Its a sort of different vision for the game on mobile and rebuilding the UI to be more mobile friendly, leaning more
> into monotization and pay to win aspects, but still creating an ambitious story driven action experience with our
> unique pipeline"

> Asked what happens to the browser and desktop game: "Both continue". Asked where the rebuild lives: "New repo".
> Asked what its client is built on: "Own engine on wgpu".

> "No Shores (Mobile) keeps the heart of our story and same type of experience.
>
> 1. When in navigation mode, the camera sits slightly above in third person, tapping anywhere allows you to move,
>    interact, etc
>
> 2. Combat mode engages when an engaged and brings the camera into a more 3rd person mode with a first person toggle.
> 3. Players can hold to block, hold to time a parry, tap to attack and swipe to dodge directional based attacks.
>    Combat allows movement across the area as you dodge and reposition. Ranged units can appear with a melee unit
>    already in position, making Ranged a more viable scheme
> 4. The sea becomes strictly overworld navigation with sea combat being a sort of on rails experience where you brace
>    and shoot"

> Asked what starts combat mode: "Foe spots you". Asked how the player moves in a fight: "Dodges only". Asked whether
> the block and parry are as the game's are now, the hold blocking and its start timing the parry: "Yes, as now".
> Asked whether to record it: "Record it seperate from the main work".

## What it settles

- **No Shores (Mobile)** is a mobile game of its own, everything rebuilt strictly in Rust, its scope dialed back a
  little. The browser and desktop No Shores continues beside it.
- It keeps the heart of the story and the same type of experience: the progression, how the game works and the story,
  leaning more on the dungeon system. It stays an ambitious, story-driven action game made with our pipeline.
- It lives in a new repository, its client our own engine on wgpu.
- Its interface is rebuilt to be mobile friendly. It leans more into monetization and pay-to-win.
- **Navigation**: the camera sits slightly above, in third person; tapping anywhere moves, interacts and the like.
- **Combat**: combat mode begins when a foe spots the player and brings the camera into a closer third person, with a
  first-person toggle. Encounters lean to one on one, with more foes lined up to face. Ranged units can appear with a
  melee unit already in position, making ranged a more viable scheme.
- **Touch in a fight**: hold to block, the hold's start timing the parry as [[Combat]]'s guard does now; tap to
  attack; swipe to dodge, directionally. The dodges are the only movement in a fight, moving the player across the
  area to reposition.
- **The sea**: strictly overworld navigation. A sea fight is on rails: the player braces and shoots.
- Kept apart from the main game's work: its notes stand in `08-Mobile`, outside [[Decisions]], until its own
  repository holds them.

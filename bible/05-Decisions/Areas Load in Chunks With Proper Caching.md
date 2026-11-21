---
type: decision
date: 2026-11-21
status: in force
---
# Areas Load in Chunks With Proper Caching

> Seeing a strip pack's pictures fetched one range at a time: "Should we also not cache this? This doesnt look normal
> to me"

> "Anytime areas are switch we also need to use chunks and proper caching"

> Offered a long browser cache for R2's hashed files (marking the files already there writes to R2), fetching each
> picture pack whole, keeping each area's chunks in the browser's own storage, and preloading the next area: "Whatever
> is most detailed and future proofs the game. The game as it stands is too memory heavy, with consistant hitching and
> poor performance"

## What it settles

- Switching areas loads what the area needs in chunks, and what is loaded is cached properly, so it is not fetched or
  made again without need.
- The work takes the most detailed, future-proof form of each offered part: the long browser cache, whole packs, the
  browser's own storage and preloading the next area.
- Memory, hitching and performance are part of the work: the game as it stands uses too much memory and hitches.
- Marking the files already on R2 writes to R2, which is a deploy step: it waits on the owner's yes, as every deploy
  does ([[Rules]]).

## Claude's calls

Under "Whatever is most detailed", the owner's to change:

- Recordings ([[Interface]], "How recordings load"): the short sounds of play fetched as the sound wakes, the
  ambience's and the story's as each is first asked for; a long recording fetched in chunks of 1 MB (about a minute),
  two held at most; the page alone keeping the samples; 192 MB of samples held before the least lately played are let
  go, never one played in the last two minutes nor a sound of play; every file kept in the browser's own storage.

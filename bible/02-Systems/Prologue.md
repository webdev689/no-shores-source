---
type: system
status: planned
code:
  - content/prologue/wreck.json
  - client/src/game/prologue/wreckLayout.ts#readWreck
  - client/src/game/prologue/wreckDecks.ts#deckBlocks
  - client/src/game/prologue/wreckProgress.ts#WreckProgress
  - client/src/game/prologue/wreckRun.ts#WreckRun
  - client/src/game/prologue/wreckScenery.ts#WreckScenery
---
# Prologue

The game's first story mission and the way into the game, as the owner set it
([[The Game Opens With a Story Mission at Sea]]): a tap to start, an intro over the islands, the title over
Saltmere, a storm at sea aboard a brig, character creation at her helm, a fight at sea, a ram, a wreck fought through
on foot to a boss, the deep, and waking on Saltmere's shore. Claude's calls are in [[The Prologue as Claude Shapes It]].

## How it works

Being built.

## The wreck

Where the ram leaves the player: two ships jammed into one, fought through on foot to the boss
(`client/src/game/prologue/`). The cutscenes, the camera's moves, the nameplate, the fire's drawing and the lines
are the story's; the wreck is the level they run.

- **The two ships.** The player's Brig lies east to west, her bow east, her main deck about 2.2 m over the sea. The
  ship that rammed her lies north to south, her bow driven through the Brig's starboard side amidships. Until the
  Tithe Ram and the Frigate are published she is the Brig drawn 1.3 times her size, so her decks stand 1.3 times as
  high. Both lie square to the world's axes, so every block is too.
- **Their decks** are blocks made from each ship's own deck grid in the ships manifest (`deckBlocks`): her cells
  taken in squares half a metre across, each the highest of her cells there, so her rails and bulwarks stand as
  walls; a gap inside a row (a hatch, a mast, a gun) filled level, so no one falls into her hold; runs of one height
  joined into one block. These blocks are hidden under the ships as drawn. The layout cuts away what the ram broke:
  the Brig's deck under the rammer's bow and a stretch across her beam forward of her waist, and the rammer's rail
  where a ramp lands.
- **The layout** is `content/prologue/wreck.json`: where each ship lies and what is cut from her, the blocks that
  show (a fallen mast as a bridge over the broken deck, a ramp of planks up from the Brig onto the rammer's bow,
  crates, broken spars, heaps of rail and tackle, planks up to the rammer's quarterdeck), where the player wakes, the
  path, the zones, the arena and the fires. Fires are places and sizes, for the fire's drawing.
- **The path** runs from the Brig's quarterdeck aft, where the player wakes, forward along her deck, across the fallen
  mast, up the planks onto the rammer's bow and aft along her deck to her quarterdeck. A step takes every rise on it
  but two lips, which a jump takes.
- **Zones.** Six along the path, each an area with a checkpoint: entered, its checkpoint is where the next respawn
  stands the player. Each but the arena holds a wave of Grey Tithe deck crew and pirates, Minor and Major, placed
  facing each other so they are already fighting when the player comes: a zone's wave stands as the player reaches
  the zone before it. At most 6 of the wreck's foes are alive at once; the rest wait their turn.
- **The sea.** A body that falls off the decks (lower than 1.5 m over the sea) is brought back to its last checkpoint
  after 1.2 s, as it was, never killed.
- **The arena** is the rammer's quarterdeck and the end of her waist, about 12 m by 9 m, open. When the boss fight
  begins, a heap of debris closes its way in behind the player, every other foe is sent away, and Captain Brannoc
  Thule stands on the quarterdeck facing the player, three levels over them: their blows land at 0.47 of their
  worth. A player who climbs out over the heap is brought back in.
- **A fight the player cannot win.** It ends when the player falls ("felled"), or when Thule is brought under a third
  of his health or 150 s have passed ("overpowered"); never with Thule dead. Stood by the page, he calls no crew in
  his last phase, so it stays one on one.
- **Played** by `WreckRun` as `Foot` plays a node: the walker and the fight in a room of the page's own on the
  layout's blocks over open sea, the fight's marks drawn by the view on foot, both ships drawn from the Brig's mesh
  with their canvas struck, and the blocks that show in the ships' own timber. A cutscene holds it still. It tells the
  story the zone reached, whether the arena is entered, Thule's health and phase, how the fight ended, and the points
  over every head for barks and emotes. Under `npm run dev`, `?wreck=1` plays it offshore in place of the first node,
  for trying it.

## Limits

- The rammer is a stand-in: the Brig at 1.3 times her size.
- The decks are boxes half a metre across: a deck's camber and the slope of her sheer are steps of 5 cm, a mast or a
  gun inside her deck is walked through, and her hatches are walked over.
- Every wall is climbable ([[Movement]]): the rails keep no one in who climbs them, and the sea brings them back.
- The heap that closes the arena is not in the foes' navmesh; it closes a way no foe is left to walk.

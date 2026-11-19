---
type: system
status: live
code:
  - client/src/game/prologue/prologue.ts#Prologue
  - client/src/game/prologue/storyStart.ts#startStory
  - client/src/game/prologue/stage.ts#Stage
  - client/src/game/prologue/beat.ts#BEATS
  - client/src/game/prologue/tap.ts#tapToStart
  - client/src/game/prologue/intro.ts#Intro
  - client/src/game/prologue/introShots.ts#islandFrame
  - client/src/game/prologue/islands.ts#Islands
  - client/src/game/prologue/storm.ts#StormDive
  - client/src/game/prologue/making.ts#Making
  - client/src/game/prologue/creation.ts#accountStep
  - client/src/game/prologue/creation.ts#lookStep
  - client/src/game/prologue/look.ts#armouredDress
  - client/src/game/prologue/sighted.ts#Sighted
  - client/src/game/prologue/battle.ts#Battle
  - client/src/game/prologue/ram.ts#Calm
  - client/src/game/prologue/ram.ts#Ram
  - client/src/game/prologue/wake.ts#Wake
  - client/src/game/prologue/wreckFight.ts#WreckFight
  - client/src/game/prologue/nameplate.ts#Nameplate
  - client/src/game/prologue/overboard.ts#Overboard
  - client/src/game/prologue/deep.ts#Deep
  - client/src/game/prologue/shore.ts#Shore
  - client/src/game/prologue/beach.ts#findBeach
  - client/src/game/prologue/epilogue.ts#Epilogue
  - client/src/game/prologue/brig.ts#Brig
  - client/src/game/prologue/places.ts#stormPlaces
  - client/src/game/flow.ts#next
  - content/story/prologue.json
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
on foot to a boss who cannot be beaten, the deep, and waking on Saltmere's shore. Claude's calls are in
[[The Prologue as Claude Shapes It]]; how it is drawn and heard is [[Cinema]] and [[Speech]].

## How it works

**The way in.** The page shows black, the game's name and "Click or press any key to start" ("Tap to start" on a
touch screen) at once, and loads the world behind it. The tap wakes the browser's sound. Once both are done the intro
begins. With `?at=<node>` the page goes straight to that node, as before, and plays no story.

**The director** (`Prologue`) plays the beats in the owner's order, each a module of its own, handing each what the
last left: the camera's shot, the ships sighted, where the two ships met. A cutscene's beat is skipped by holding
Space for a second, its remaining moments run at once. Under `npm run dev`, `?prologue=<beat>` starts at that beat.
A player who has played the story to its end (kept in the browser, `overlook.prologue`) sees the intro and the title,
and Begin takes them straight to Overlook's social space.

| Beat | What happens | Played or shown |
|---|---|---|
| `intro` | First light over the cloud; then through the cloud to a highland island in mist, a green one in rain, a desert town where Grey Tithe and pirates fight on the plaza, a tundra town in snow, each with ships under sail off its harbour; last Saltmere, gulls over the harbour, the title, "Press any key to begin" | shown |
| `storm` | The camera pulls up and away over the sea as the storm comes on; a strike's flash covers the leap far out; low over the swell to the Brig, along her side, over her working crew to her helm | shown |
| `creation` | At the helm in the storm: the account, then the look, the whole figure in armour with sword and shield | played |
| `sighted` | The lookout and the bosun cry out with marks over their heads; the camera pulls out as three pirate Sloops come out of the dark; the mate and the gunner speak | shown |
| `battle` | The sea's own fight against the three, the Brig drawn as hers, the crew crying out at hits and sinkings; "Engage" | played |
| `calm` | The wind drops, the rain eases, the camera comes down to her deck; the crew talk | shown |
| `ram` | The lookout cries out; a larger ship comes out of the storm at her side; the crew brace; the impact; black | shown |
| `wake` | First person on the deck: the eyes blinking, the view swimming, the heart and the ringing; up on the feet, looking round; the camera rushes the length of the wreck past its fights and back | shown |
| `wreck` | Fought on foot through the wreck; at its end the push in to Captain Brannoc Thule, his nameplate and his cry; the fight one on one that cannot be won | played |
| `overboard` | Out and back in on the body thrown over the rail, Thule and his crew crying out and dancing | shown |
| `deep` | Sinking past the fallen crew, the fire's light through the surface; the eyes; a flash; a voice; black | shown |
| `shore` | First person on Saltmere's shore; a stranger comes down the beach, kneels beside the player and speaks; the player takes her hand; up, and up the shore together | played |

**The shore.** The player wakes lying on the strand, looking up at the sky while the eyes blink open. The stranger
sets off 3 s in, 12 m up the beach, and walks down to a place 1.1 m up from the player and 0.6 m to their side, where
she kneels (about 11 s in); the head turns to her from 6 s. Once she is down she says her two lines, framed in the
view; then the screen asks the player to take her hand ("Click or press any key to take her hand", "Tap to take her
hand" on a touch screen). Only a press, a click or a tap raises them: the view rises to standing over 2.4 s while she
rises with it, she says one more line, and the camera goes behind the two as they walk up the shore from where they
stood, for 6.5 s, into black. If the coast has no strand, or the land's worker cannot answer the search, the player
wakes on Overlook's plaza by its first spawn instead; if even that cannot be laid, the shore fails and the story ends
played.

**After the shore** the flow's `story-ended` takes the player through the veil to Overlook's social space. The story's
black holds until the veil has risen over it (0.7 s), then goes. The stranger waits behind the veil; she stands 2.2 m ahead of the
player and 1 m to their right (their left where the right is water), facing them, and says her last line once the
veil has fallen, the story's black has gone and she is in the player's view. Then she walks toward the town's middle on dry ground only (she stands where the next step is water or
unknown), and is let go once she is out of the player's view. Leaving Overlook's social space before then ends her
part at once, her words with it. The game is the player's from there.

**Where it happens.** The storm lies 24 km out past Saltmere's harbour, turned until the sea round it is open and
deep (`stormPlaces`), the Brig heading across the swell. The wreck is laid where the ships met. The shore is the
nearest gentle strand to the plaza, low by the water, clear of the city's pads and 260 m from its harbour
(`findBeach`), found on the exact ground behind the deep's black.

**The intro's islands** open one at a time in the land's worker while the camera is in the cloud between them, the
cloud whitened over the change (`Islands`); each shot is laid on its island's own town, harbour and plaza
(`islandFrame`). Saltmere comes back as the game opened it, its drawers kept, and open in the worker again.

**The player** is dressed for the story in steel with no helm, a steel sword and a kite shield drawn (`armouredDress`).
Their look is kept in the browser (`overlook.look`) and dresses them in the game afterwards.

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
  over every head for barks and emotes. Under `npm run dev`, `?prologue=wake` or `?prologue=wreck` starts there.

## Limits

- Every ship is a Sloop by the naval rules, whatever is drawn: the Brig's guns and hull are the Sloop's in the fight.
- The ship that rams is the Brig drawn at 1.3 times her size, darkened, until the Tithe Ram or the Frigate is
  published; the wreck lays her so too.
- The look and whether the story was played are kept in the browser, not with the account.
- Music is cued by beat (`storyCue`) but plays nothing until the music system arrives.
- The decks are boxes half a metre across: a deck's camber and the slope of her sheer are steps of 5 cm, a mast or a
  gun inside her deck is walked through, and her hatches are walked over.
- Every wall is climbable ([[Movement]]): the rails keep no one in who climbs them, and the sea brings them back.
- The heap that closes the arena is not in the foes' navmesh; it closes a way no foe is left to walk.

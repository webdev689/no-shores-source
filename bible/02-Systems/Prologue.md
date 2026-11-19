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
  - client/src/game/prologue/calm.ts#Calm
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
Space for a second, or a touch held on the screen as long, its remaining moments run at once; "Hold Space to skip"
("Hold to skip" on a touch screen) shows faintly whenever there is something to skip, and brightens as the hold fills.
The intro offers no skip once its flight has reached Saltmere. Each beat sets its own weather, sound and lightning at
its start, so under `npm run dev` `?prologue=<beat>` starts at that beat as the story would reach it. A player who
has played the story to its end (kept in the browser, `overlook.prologue`) sees the intro and the title, and Begin
takes them straight to Overlook's social space. While the story plays the menu (I, O) does not open.

| Beat | What happens | Played or shown |
|---|---|---|
| `intro` | First light over the cloud; then through the cloud to a highland island in mist, a green one in rain, a desert town where Grey Tithe and pirates fight on the plaza, a tundra town in snow, each with ships under sail off its harbour; last Saltmere, gulls over the harbour, the title, "Press any key to begin" ("Tap to begin" on a touch screen; Space begins too) | shown |
| `storm` | The camera pulls up and away over the sea as the storm comes on; a strike's flash covers the leap far out; low over the swell to the Brig, along her side, over her working crew to her helm | shown |
| `creation` | At the helm in the storm: the account, then the look, the whole figure in armour with sword and shield | played |
| `sighted` | The camera turns from the player to look down her deck; the lookout and the bosun cry out with marks over their heads and the mate and the gunner speak; the camera pulls out over her stern as three pirate Sloops come out of the dark, and comes down behind her through the fight's own lens | shown |
| `battle` | The sea's own fight against the three, the Brig drawn as hers, the crew crying out at hits and sinkings; "Engage", and how many ships are left until every one is beaten, sunk or struck | played |
| `calm` | The wind drops, the rain eases, the camera eases down from the fight's to her deck; the beaten ships lie where the fight left them, struck ones afloat, sinking ones settling on; the crew talk, the camera looking out over the lookout's shoulder to the nearest wreck while he speaks of it, until he cuts the mate off | shown |
| `ram` | The lookout cries out on the deck the calm left; the camera turns with him, then pulls sharply out as a larger ship comes out of the storm at her side: Captain Brannoc Thule's Frigate at her own size, under sail, in the shade a captain's ship wears in the fight, her stem meeting the Brig's side as their middles come half the Brig's beam and half the Frigate's length apart; the crew brace; the impact; black | shown |
| `wake` | First person on the deck: the eyes blinking, the view swimming, the heart and the ringing; up on the feet, looking round; the camera rushes the length of the wreck past its fights, a pair on the view crying out, and back over the player's shoulder, where play begins | shown |
| `wreck` | Fought on foot through the wreck, each heap across the way clearing as its wave falls; at its end the push in to Captain Brannoc Thule, his nameplate and his cry; the fight one on one that cannot be won; a fade out | played |
| `overboard` | In from black on the body thrown over the rail, Thule and his crew crying out and leaping on the drawn wreck | shown |
| `deep` | Sinking past the fallen crew beside the wreck, its hulls and fires above the surface; the eyes; a flash; a voice; black | shown |
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

**Where it happens.** The storm lies 24 km out past Saltmere's harbour (`stormPlaces`), the Brig heading across the
swell. The sea is sounded every 150 m across the 3 km round it, where every ship of the story sails, and the place is
turned either way, and if need be laid farther out (30 km, then 38 km), until all of it is 40 m deep or more; were
none so, the place with the fewest shallows is taken.

**At sea** (sighted to ram), each beat sets its own weather, sound, lightning and the Brig's way as it begins, so a
page started there plays as it would in turn; `?prologue=battle` takes the ships where they would be sighted
(`inboundAt`) and `?prologue=calm` lays them as wrecks there. Every cry is said with its speaker's head on the view,
and each beat's moments run on its own clock: skipped, its moments left still change the world (the weather, the
impact, the black) but say and sound nothing. The fight begins on the story's clock; a fight that cannot begin, or a
step the rules refuse, is thrown from the beat's frame, so the director goes on past it. The calm's last line is a
scene of its own (`calmCutOff`): the calm ends 1.3 s into it and the ram's first cry cuts it off. The wreck is laid where the ships met. The shore is the
nearest gentle strand to the plaza, low by the water, clear of the city's pads and 260 m from its harbour
(`findBeach`), found on the exact ground behind the deep's black.

**The intro's islands** open one at a time in the land's worker while the camera is in the cloud between them, the
cloud whitened over the change (`Islands`); each shot is laid on its island's own town, harbour and plaza
(`islandFrame`). The worker takes one opening at a time, in the order asked, so it always ends holding the last one
asked for; an island asked for before Saltmere is never drawn over it. Saltmere comes back as the game opened it, its
drawers kept, and open in the worker again. An island that will not open is passed over for the next, behind the
same white; if the first will not open, the dawn rises over Saltmere instead. A skip is final: the flight stops where
it is, the view goes black, no island opens after it, and Saltmere's glide ends under the title. A Saltmere that will
not open is the intro's failure, and the director goes on to the storm.

**The intro's length.** First light 6 s, each of the four islands 13 s, Saltmere's glide 15 s and the prompt 2.4 s
after the title: about 75 s, with a second or more in the cloud for each island to open.

**The helm** (`Making`). The account step comes first ([[Accounts]]): create an account, sign in, sign in with
Discord or play as a guest. A player already signed in is offered "Go on as" their username, or "Go on" for an account
Discord alone keeps; with the accounts out of reach, "Go on without an account", as the game played before. Offline
(no `?room=`) it says "Accounts are kept when you play online." and offers "Go on". A player who leaves for Discord
comes back to the helm at the account step, not the story's start: the tab marks it (`overlook.story.helm`, read once).
The rooms read the session as each connects, so the account signed in to at the helm is the one they keep.
The camera stands far enough back that the whole figure fits the part of the screen the window leaves clear, and
turns so the figure stands in its middle: the left on a screen wider than tall, with the window on the right; the top
on one taller than wide, with the window along the bottom (`creationEye`).

**The player** is dressed for the story in steel with no helm, a steel sword and a kite shield drawn (`armouredDress`).
Their look is kept in the browser (`overlook.look`) and dresses them in the game afterwards.

## The wreck

Where the ram leaves the player: two ships jammed into one, fought through on foot to the boss
(`client/src/game/prologue/`). The cutscenes, the camera's moves, the nameplate, the fire's drawing and the lines
are the story's; the wreck is the level they run.

- **The two ships.** The player's Brig lies east to west, her bow east, her main deck about 2.2 m over the sea. The
  ship that rammed her, Thule's Frigate at her own size, lies north to south, her middle 21.7 m south of the Brig's,
  her bow driven through the Brig's starboard side amidships to the Brig's middle. Her waist stands about 2.6 m over
  the sea, her forecastle about 4 m and her quarterdeck, aft of a breast rail, about 3.6 to 3.9 m. Both lie square to
  the world's axes, so every block is too.
- **Their decks** are blocks made from each ship's own deck grid in the ships manifest (`deckBlocks`): her cells
  taken in squares 0.3 m across, each the highest of her cells there, so her rails and bulwarks stand as walls; a
  square inside a row her grid has no height in (a mast, a gun, a spar, an opening into her hold) a wall a jump does
  not top, as her deck walks at sea; her channels outboard of her rails (her rail the highest of the five squares
  in from each end of a row, a step over its lowest) left out, so a body over her rail falls to the sea; runs of one
  height joined into one block. Where the Frigate's bow stands in the Brig, the Brig's deck gives way to hers. These blocks are hidden under
  the ships as drawn, and both ships are drawn whole, so what is drawn is what holds a body.
- **The layout** is `content/prologue/wreck.json`: where each ship lies, the blocks that show (a spar fallen from
  aloft across the Brig's deck, a stair of planks up from her fore deck over her bulwark and out over the water to the
  Frigate's starboard rail, the last laid over the rail, crates, broken spars, heaps of rail and tackle, planks up
  over the Frigate's quarterdeck's breast rail beside her skylight), where the player wakes, the path, the zones, the
  arena and the fires. Fires are places and sizes, for the fire's drawing.
- **The path** runs from the Brig's quarterdeck, where the player wakes facing forward clear of her wheel, forward
  along her port side past the fallen spar, across her fore deck, up the stair and over the Frigate's rail onto the
  head of her waist, aft along her starboard side and up the planks onto her quarterdeck. A step takes every rise on
  it but the lips a jump takes, and every lane of it is a body wide: nothing stands within a body's radius of it but
  the lips it climbs or drops. Every figure the level stands (the player waking, each checkpoint, each foe, Thule)
  stands a body's radius clear of anything a step over its feet.
- **Zones.** Six along the path (the Brig's quarterdeck, waist and fore deck; the Frigate's bow, waist and
  quarterdeck), each an area with a checkpoint: entered, its checkpoint is where the next respawn
  stands the player. Each but the arena holds a wave of Grey Tithe deck crew and pirates, Minor and Major, placed
  facing each other so they are already fighting when the player comes: a zone's wave stands as the player reaches
  the zone before it. At most 6 of the wreck's foes are alive at once; the rest wait their turn.
- **Heaps across the way.** Each zone but the arena has a heap of debris across the way on from it, standing from the
  start, more than a jump over the way under it; across the Brig's waist and the Frigate's deck each runs from rail to
  rail, her rails under it, and the fore deck's stands on the stair. It is cleared once its zone's wave has stood whole
  and every foe of it has fallen; the room and the page's movement take it from the course together. A player who climbs
  over a heap still standing, into a zone beyond it, is brought back to their last checkpoint. The last heap is the
  arena's: it stands again behind the player when the boss fight begins.
- **The sea.** A body that falls off the decks (lower than 1.5 m over the sea) is brought back to its last checkpoint
  after 1.2 s, as it was, never killed.
- **A death** before the end of the boss fight: the room raises the player at the last checkpoint after 4 s, by
  itself. The HUD shows no death panel and no Respawn; the prompt says "You will rise at the last checkpoint."
- **The arena** is the Frigate's quarterdeck and the end of her waist, 11.15 m by 9.5 m, from the heap across her
  waist to her stern and between her rails' inner faces, no wave in it. When the boss fight
  begins, its heap closes the way in behind the player, every other foe is sent away, and Captain Brannoc Thule stands
  on the quarterdeck facing the player, three levels over them: their blows land at 0.47 of their worth. A player back
  over the heap into the waist is brought back in, and one over her rails falls to the sea, which brings them back;
  anywhere from the heap's face aft, on her deck or up on her rails, is never brought back.
- **A fight the player cannot win.** It ends when the player falls ("felled"), or when Thule is brought under a third
  of his health or 150 s have passed ("overpowered"); never with Thule dead. Stood by the page, he calls no crew in
  his last phase, so it stays one on one. Once it ends, the fight holds still while the screen fades out over 0.6 s.
  Felled there, the player is never told they will rise: that prompt is for a death before the boss fight.
- **The cries.** In the wake's flight the first staged pair the camera holds on the view for 2.4 s cries "For the
  Tithe!" and "Cut them down!"; in the fight the first Grey Tithe foe on the view cries "Survivor! Get that one!",
  once. Thule cries when the player's blows land on him and when his land on them, at most once in 9 s each, and only
  with his head on the view, so a cry unheard spends no gap; he tells the player to kneel again only once they have
  struck him since. The throw overboard is framed so Thule and his crier stand on the view on any screen, a tall one
  from further back.
- **Played** by `WreckRun` as `Foot` plays a node: the walker and the fight in a room of the page's own on the
  layout's blocks over open sea (`LocalRoom.openOverSea`: its foes' navmesh is the decks alone, so every wave fights
  and Thule strikes), the fight's marks drawn by the view on foot. It tells the story whether the arena is
  entered, Thule's health, how the fight ended, the points over every head for barks and emotes (by crew), and the
  shot its camera takes of the player standing, where the wake's flight ends. A cutscene holds it still. Its room is
  let go as the wreck's fight ends. The hints are foot's, without the menu: the story has none.
- **Drawn** by `WreckScenery`, made once from the meshes the story loaded (the Brig's and the Frigate's, each ship by
  her own) and shown by the wake, the fight, the throw overboard and, from below, the deep: both ships with their canvas
  struck, the blocks that show in the ships' own timber, and each heap while it stands. The fires burn in all four.
  Every figure the wake, the throw and the deep stand makes a move the forge draws its clothes in: the deep's fallen
  crew lie in `fallen`, Thule's crew leap and cry out. It lets go of its GPU buffers once the deep ends.
- **Each beat sets its world** at its start (the wreck's storm, fires and sounds, no lightning; the deep's water), so
  under `npm run dev`, `?prologue=wake`, `?prologue=wreck`, `?prologue=overboard` or `?prologue=deep` plays as the
  story does. Leaving the fight hands the HUD back clean (no death, hints, prompt, nameplate or fight's display) and
  frees the pointer.

## Limits

- Every ship is a Sloop by the naval rules, whatever is drawn: the Brig's guns and hull are the Sloop's in the fight.
- Thule's ship is drawn as the Frigate, without the Tithe Ram's iron ram bow ([[Hulls]]): the Tithe Ram is not built.
- The look and whether the story was played are kept in the browser, not with the account.
- Music is cued by beat (`storyCue`) but plays nothing until the music system arrives.
- The decks are boxes half a metre across: a deck's camber and the slope of her sheer are steps of 5 cm, a mast or a
  gun inside her deck is walked through, and her hatches are walked over.
- Every wall is climbable ([[Movement]]): the rails keep no one in who climbs them, and the sea brings them back.
- The heaps are not in the foes' navmesh: a foe that runs at one stops against it until it clears.

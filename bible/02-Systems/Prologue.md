---
type: system
status: live
code:
  - client/src/game/prologue/prologue.ts#Prologue
  - client/src/game/prologue/storyStart.ts#startStory
  - client/src/game/prologue/takeOrGiveBack.ts#takeOrGiveBack
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
  - client/src/game/prologue/wreckView.ts#WreckView
  - tools/wreck/build_wreck.py
  - tools/wreck/light_wreck.py
  - tools/wreck/export_wreck.py
  - tools/wreck/wreck_level.py
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
Space for a second, or a touch held as long anywhere on the view (the dialogue box too: while the story plays no drag
pans or reloads the page), its remaining moments run at once; "Hold Space to skip" ("Hold to skip" on a touch screen)
shows faintly whenever there is something to skip, and brightens as the hold fills. A beat the director moves on
from, at its end or on a failure, lets go of what it holds (the intro its islands, the helm its windows and keys). A
beat that fails is left for the next with what it said stopped and the view cleared before the next begins; a last
beat that fails ends the story with its screen kept, so the black lifts only once the game's veil is up under it.
The intro offers no skip once its flight has reached Saltmere. Each beat sets its own weather, sound and lightning at
its start, so under `npm run dev` `?prologue=<beat>` starts at that beat as the story would reach it. A player who
has played the story to its end (kept in the browser, `overlook.prologue`) sees the intro and the title, and Begin
takes them straight to Overlook's social space. While the story plays the menu (I, O) does not open. At its end the
story lets go of what it alone drew with on the GPU (the Brig's and the Frigate's views, the birds, the fire and any
wreck still drawn); the Frigate's view is made only once a beat draws her, so a player who sees only the intro never
makes it.

A story that cannot begin at all (its cast or scenes refused, a ship's model not loaded, a part failing as it is made)
gives back everything it took, the last first: the screen hands the page back its touches and the canvas its ease,
the dialogue box, the marks, the objective and the nameplate leave the HUD, the GPU lets go of what was made, and the
player wears the look the game gave them. The player then arrives at Overlook.

| Beat | What happens | Played or shown |
|---|---|---|
| `intro` | First light over the cloud; then through the cloud to a highland island in mist, a green one in rain, a desert town where Grey Tithe and pirates fight on the plaza, a tundra town in snow, each with ships under sail off its harbour; last Saltmere, gulls over the harbour, the title, "Press any key to begin" ("Tap to begin" on a touch screen; Space begins too) | shown |
| `storm` | The camera pulls up and away over the sea as the storm comes on; a strike's flash covers the leap far out; low over the swell to the Brig, along her side, over her working crew to her helm, where it ends in the helm's own shot, riding her deck as the helm's camera does (all her rise and fall, a quarter of her pitch and roll), so the cut never jumps; skipped, it leaves the full storm and its lightning without a sound or a flash | shown |
| `creation` | At the helm in the storm: the account, then the look, the whole figure in armour with sword and shield | played |
| `sighted` | From the shot the creation last drew (turned as it was, framed for the screen it was framed for), the camera turns from the player to look down her deck; the lookout and the bosun cry out with marks over their heads and the mate and the gunner speak; the camera pulls out over her stern as three pirate Sloops come out of the dark, and comes down behind her through the fight's own lens | shown |
| `battle` | The sea's own fight against the three, every ship taken up under the sail and way she was sighted with, the Brig drawn as hers, the crew crying out at hits and sinkings; "Engage", "Sink them, or make them strike.", and how many ships are left until every one is beaten, sunk or struck | played |
| `calm` | The wind drops, the rain eases, the camera eases down from the fight's to her deck; the beaten ships lie where and as the fight left them, each in her own settle, trim and list, and her sails furling on from where the fight left them; struck ones lie still, sinking ones go on under as the rules sink them and are gone once under; the crew talk, the camera looking out over the lookout's shoulder to the nearest wreck as he asks about them, then pushing in on her until she reads however far off she lies, until he cuts the mate off | shown |
| `ram` | The lookout cries out on the deck the calm left, the wrecks still lying round her; the camera turns with him, then pulls sharply out as a larger ship comes out of the storm at her side at 6 m/s (about 12 knots), lightning striking past her at 2.3 s and 4.8 s so her masts and sails stand against it: Captain Brannoc Thule's Frigate at her own size, under sail, lighter than a captain's ship in the fight and darker than the Brig; the crash comes as the head of her stem first touches the Brig's side where her hull is broadest (each hull's box in the ships manifest); the crew brace; the impact; black | shown |
| `wake` | First person on the deck: the eyes blinking, the view swimming, the heart and the ringing; up on the feet, looking round; the camera rushes the length of the wreck past its fights, a pair on the view crying out, and back over the player's shoulder, where play begins | shown |
| `wreck` | Fought on foot through the wreck, each heap across the way clearing as its wave falls; at its end the push in to Captain Brannoc Thule, his nameplate and his cry; the fight one on one that cannot be won; a fade out | played |
| `overboard` | In from black on the body thrown over the rail, Thule and his crew crying out and leaping on the drawn wreck | shown |
| `deep` | Sinking past the fallen crew beside the wreck, its hulls and fires above the surface; the eyes; a flash; a voice; black | shown |
| `shore` | First person on Saltmere's shore; a stranger comes down the beach, kneels beside the player and speaks; the player takes her hand; up, and up the shore together | played |

**The shore.** The player wakes lying on the strand, looking up at the sky while the eyes blink open. The stranger
sets off 3 s in, 12 m up the beach, and walks down to a place 1.1 m up from the player and 0.6 m to their side, where
she kneels (about 11 s in); the head turns to her from 6 s. She wears a townswoman's peasant blouse, long skirt and
boots, which the forge draws in every move she makes (walk, kneel and idle; her test reads the forge's own tables), and
the eye looks at her face, 1.15 m over her feet kneeling and 1.63 m standing, the forge's own measures; her words and
feelings stand 0.25 m over the crown of her head. Once she is down she says her two lines, framed in the
view; then the screen asks the player to take her hand ("Click or press any key to take her hand", "Tap to take her
hand" on a touch screen). Only a press, a click or a tap raises them: the view rises to standing over 2.4 s while she
rises with it, drawn standing from the rise's middle, where the eye climbs fastest (the forge draws nothing between
kneeling and standing), she says one more line, and the camera goes behind the two as they walk up the shore from where they
stood, for 6.5 s, into black. If the coast has no strand, or the land's worker cannot answer the search, the player
wakes on Overlook's plaza by its first spawn instead, where her words, which name neither the sea nor the shore, hold as
well; if even that cannot be laid, the shore fails and the story ends
played.

**After the shore** the flow's `story-ended` takes the player through the veil to Overlook's social space. The story's
black holds until the veil has risen under it (0.7 s), then goes. The stranger waits behind the veil; she stands 2.2 m ahead of the
player and 1 m to their right (their left where the right is water), facing them, and says her last line once the
veil has fallen, the story's black has gone and she is in the player's view. Then she walks toward the town's middle on dry ground only (she stands where the next step is water or
unknown), and is let go once none of her, feet to head, is on the player's view, or a minute after she set off if she
still stands in sight, held at the water or at the town's middle. Leaving Overlook's social space before then ends her
part at once, her words with it. The game is the player's from there.

**Where it happens.** The storm lies 24 km out past Saltmere's harbour (`stormPlaces`), the Brig heading across the
swell. The sea is sounded every 150 m across the 3 km round it, where every ship of the story sails, and the place is
turned either way, and if need be laid farther out (30 km, then 38 km), until all of it is 40 m deep or more; were
none so, the place with the fewest shallows is taken.

**At sea** (sighted to ram), each beat sets its own weather, sound, lightning and the Brig's way as it begins, so a
page started there plays as it would in turn; `?prologue=battle` takes the ships where they would be sighted
(`inboundAt`) and `?prologue=calm` or `?prologue=ram` lays them there as struck wrecks. Every hand-off at sea is
whole: the sighting starts from the shot the creation last drew; each ship's rig (`Sailing.rigOf`) is handed to the
fight and back, so her sails go on as they were; the fight's beaten ships are carried to the calm and on to the ram
(`Wreck`, `settledOn`) in the pose the fight left them. Every cry is said with its speaker's head on the view: a
battle cry waits for its speaker to come on the view (the player aiming out over her side looks away from the crew)
for up to 2.5 s, and is let go unsaid after, with no gap spent on it, so the next of its kind is heard. Every scene a
beat waits on either ends it or, refused, is thrown from its next frame,
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
not open is the intro's failure: the director goes on to the storm, or, for a player who has played the story, ends
it there and sends them to Overlook. However the intro is left, no passage still under way shows its island or sets
its weather and sound, and Saltmere is drawn again and asked of the worker once more (drawn even if the worker cannot
open it).

**The intro's length.** First light 6 s, each of the four islands 13 s, Saltmere's glide 15 s and the prompt 2.4 s
after the title: about 75 s, with a second or more in the cloud for each island to open.

**The helm** (`Making`). The account step comes first ([[Accounts]]): create an account, sign in, sign in with
Discord or play as a guest. A player already signed in is offered "Go on as" their username, or "Go on" for an account
Discord alone keeps; with the accounts out of reach, "Go on without an account", as the game played before. An ask
the accounts leave unanswered for 10 s is given up as out of reach, so the way on is offered. A Discord sign-in that
came back is said once, with that offer ("You are signed in with Discord.", or "Discord is linked." before "You are
signed in as" the username); one that did not go through is said under the form, as a refusal is. Offline (no
`?room=`) it says "Accounts are kept when you play online." and offers "Go on". A player who leaves for Discord comes
back to the helm at the account step, not the story's start: the tab marks it (`overlook.story.helm`), read once and
cleared at the next load, and never heeded once the story has been played through. The rooms read the session as each
connects, and the step's end tells the page the account changed, so the menu's mark and banner and the company HUD
follow the account signed in to at the helm.
The camera stands far enough back that the whole figure fits the part of the screen the window leaves clear, and
turns so the figure stands in its middle: the left on a screen wider than tall, with the window on the right; the top
on one taller than wide, with the window along the bottom (`creationEye`).

**The player** is dressed for the story in steel with no helm, a steel sword and a kite shield drawn (`armouredDress`).
Their look is kept in the browser (`overlook.look`) and dresses them in the game afterwards.

## The wreck

Where the ram leaves the player: the Brig broken in two by Thule's Frigate, fought through on foot to the boss. It is a
scene of its own, built in Blender ([[The Prologue Is Brought to Life With Music, Sound and a Wreck Built in
Blender]]); the cutscenes, the camera's moves, the nameplate, the fires and the lines are the story's.

- **The scene** (`tools/wreck/`). The ships tool builds the Brig, the Frigate and the Sloop. The Frigate lies north to
  south, her bow driven into the Brig's starboard side. The Brig is broken in two there, each half pushed aside by
  the Frigate's bow, turned about its far end and settled lower at its break. Her mainmast is down, her waist on the
  struck side fallen into her flooded hold, her foremast standing with its canvas burnt to rags. The Frigate's
  bowsprit is torn away and her mizzen down; her deck is burnt through over her gun deck, her side stove in amidships.
  A pirate Sloop sunk in the fight at sea floats on her beam ends east of the Frigate's bow.
- **The way through.** A torn section of the Brig's deck, her mainmast under it, bridges her two halves. Ramps of
  fallen timber lead from her bow half down onto the Sloop's side, from the Sloop up into the Frigate's waist, down
  into her gun deck and up through her quarterdeck's broken front. Splintered timber stands along every break.
  Wreckage is strewn on the decks, kept off the way through, and flotsam floats all round.
- **The ground** is measured from the model (`wreck_course.py`), as a ship's deck is. A face looking up is ground
  where it is hull or deck, or timber laid as a way. What is solid in the room a body takes over the ground stands as
  a wall 3.2 m over it: past a jump from the deck, a quarterdeck or a rail beside it. Splinters and the heaps that
  close a way for good are walls no body stands on. Sails and lines are neither. The ground is laid in squares 0.3 m
  across, runs of one height joined into blocks.
- **The layout** is `content/prologue/wreck.json`, written by the export: the mesh's and the light's keys on R2, the
  ground's blocks, each heap's block, the fires, the masts still standing, where the player wakes, the path, the
  zones and their waves, the arena, Thule's place and the camera's way back from its flight. Figures stand at the
  middle of their square of ground, never on the edge between two blocks.
- **The path** runs from the Brig's quarterdeck, where the player wakes by her wheel, down through her thrown-down
  breast rail into her waist, along her port gangway past the fallen waist, across the torn deck, over her fore deck
  south of its hatch, down onto the Sloop's side, along it and up into the Frigate's waist east of her boat, past her
  mainmast, down into her gun deck and up onto her quarterdeck. Every lane of it is a body wide, and every figure the
  level stands a body's radius clear of anything a step over its feet.
- **Zones.** Eight along the path: the Brig's quarterdeck, broken waist, the torn deck over the gap, her fore deck,
  the Sloop, the Frigate's waist, gun deck and quarterdeck. Each is an area with a checkpoint; entered, its
  checkpoint is where the next respawn stands the player. Each but the arena holds a wave of Grey Tithe crew and
  pirates, Minor and Major, in pairs already fighting each other. At most 6 of the wreck's foes are alive at once.
- **Heaps across the way.** Each zone but the arena has a heap of wreckage across the way on from it, piled 2.9 m over
  its deck and out over the bulwarks, standing from the start. It is cleared once its zone's wave has stood whole and
  fallen. The Frigate's gangways beside her gun deck are closed for good by heaps on cores of stacked crates, higher
  than her rails. A player who climbs over a heap still standing is brought back to their last checkpoint.
- **The level's check.** The export refuses a level its own ground does not hold, measured twice, the second half a
  square across and along: every zone, checkpoint and foe reached in order, and no standing heap walked, or climbed
  as high as a jump reaches (1.05 m), round.
- **The sea.** A body that falls off the decks (lower than 1.5 m over the sea) is brought back to its last checkpoint
  after 1.2 s, as it was, never killed.
- **A death** before the end of the boss fight: the room raises the player at the last checkpoint after 4 s, by
  itself. The HUD shows no death panel and no Respawn; the prompt says "You will rise at the last checkpoint."
- **The arena** is the Frigate's quarterdeck, 9.8 m by 8.2 m between her rails' inner faces, aft of the heap
  across her quarterdeck's broken front, no wave in it. When the boss fight begins, its heap closes the way in behind
  the player, every other foe is sent away, and Captain Brannoc Thule stands before the wheel facing the player, three
  levels over them: their blows land at 0.47 of their worth. A player back over the heap is brought back in, and one
  over her rails falls to the sea, which brings them back; anywhere aft of the heap, on her deck or up on her rails, is
  never brought back.
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
  layout's blocks over open sea (`LocalRoom.openOverSea`: its foes' navmesh is the wreck's ground alone, so every wave
  fights and Thule strikes), the fight's marks drawn by the view on foot. It tells the story whether the arena is
  entered, Thule's health, how the fight ended, the points over every head for barks and emotes (by crew), and the
  shot its camera takes of the player standing, where the wake's flight ends. A cutscene holds it still. Its room is
  let go as the wreck's fight ends. The hints are foot's, without the menu: the story has none.
- **Drawn** by `WreckScenery` with `WreckView`, shown by the wake, the fight, the throw overboard and, from below,
  the deep: the one mesh built in Blender, each face in its part's picture as a ship's, lit by the light baked into
  it there (`light_wreck.py`): the fires' light, with its shadows and what the timber throws back, flickering through
  space and time as the fires burn, and the storm sky's, which every hollow and overhang darkens. The light is laid in
  blocks, as the game's pixels are. Each heap is its own run of the mesh, drawn while it stands. The mesh and the
  light (about 12 MB) are fetched once the story is past its intro; the wake keeps its eyes shut until they come. The
  fires burn in all four beats. Every figure they stand makes a move the forge draws its clothes in: the deep's
  fallen crew lie in `fallen`, Thule's crew leap and cry out. It lets go of its GPU buffers once the deep ends.
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
- The sea fight has no touch controls, like the rest of the game ([[Interface]]: no gamepad or touch layer yet).
- No figures swim or float in the forge, so no men are drawn in the water by the wrecks; the calm's talk asks only
  about the wrecks the camera shows.

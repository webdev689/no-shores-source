---
type: system
status: live
code:
  - client/src/game/prologue/prologue.ts#Prologue
  - client/src/game/prologue/storyStart.ts#startStory
  - client/src/game/prologue/takeOrGiveBack.ts#takeOrGiveBack
  - client/src/game/prologue/stage.ts#Stage
  - client/src/game/prologue/beat.ts#BEATS
  - client/src/game/prologue/music.ts#sung
  - client/src/game/prologue/tap.ts#tapToStart
  - client/src/game/prologue/intro.ts#Intro
  - client/src/game/prologue/introShots.ts#islandFrame
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
  - client/src/game/prologue/lessons.ts#Lessons
  - client/src/game/prologue/nameplate.ts#Nameplate
  - client/src/game/prologue/overboard.ts#Overboard
  - client/src/game/prologue/deep.ts#Deep
  - client/src/game/prologue/shore.ts#Shore
  - client/src/game/prologue/beach.ts#findBeach
  - client/src/game/prologue/epilogue.ts#Epilogue
  - client/src/game/welcome/welcome.ts#Welcome
  - client/src/game/welcome/walk.ts#WelcomeWalk
  - client/src/game/welcome/afterStory.ts#AfterStory
  - content/story/welcome.json
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
  - client/src/game/prologue/wreckCrew.ts#WreckCrew
  - client/src/game/prologue/wreckCrew.ts#crewSpots
  - client/src/game/prologue/wreckScenery.ts#WreckScenery
---
# Prologue

The game's first story mission and the way into the game, as the owner set it
([[The Game Opens With a Story Mission at Sea]]): a tap to start, an intro over the islands, the title over
Saltmere, a storm at sea aboard a brig, character creation at its helm, a fight at sea, a ram, a wreck fought through
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
from, at its end or on a failure, lets go of what it holds (the helm its windows and keys). A
beat that fails is left for the next with what it said stopped and the view cleared before the next begins; a last
beat that fails ends the story with its screen kept, so the black lifts only once the game's veil is up under it.
The intro offers no skip once it has reached Saltmere. Each beat sets its own weather, sound and lightning at
its start, so under `npm run dev` `?prologue=<beat>` starts at that beat as the story would reach it. A player who
has played the story to its end (kept in the browser, `overlook.prologue`) sees the intro and the title, and Begin
takes them straight to Overlook's social space. While the story plays the menu (I, O) does not open. At its end the
story lets go of what it alone drew with on the GPU (the Brig's and the Frigate's views, the birds, the fire and any
wreck still drawn); the Frigate's view is made only once a beat draws it, so a player who sees only the intro never
makes it.

A story that cannot begin at all (its cast or scenes refused, a ship's model not loaded, a part failing as it is made)
gives back everything it took, the last first: the screen hands the page back its touches and the canvas its ease,
the dialogue box, the marks over heads and the nameplate leave the HUD, the GPU lets go of what was made, and the
player wears the look the game gave them. The player then arrives at Overlook.

| Beat | What happens | Played or shown |
|---|---|---|
| `intro` | First light over the cloud; then down through it to Saltmere, ships under sail off its harbour and gulls over it, the title, "Press any key to begin" ("Tap to begin" on a touch screen; Space begins too) | shown |
| `storm` | The camera pulls up and away over the sea as the storm comes on; a strike's flash covers the leap far out; low over the swell to the Brig, along its side, over its working crew to its helm, where it ends in the helm's own shot, riding its deck as the helm's camera does (all its rise and fall, a quarter of its pitch and roll), so the cut never jumps; skipped, it leaves the full storm and its lightning without a sound or a flash | shown |
| `creation` | At the helm in the storm: the account, then the look, the whole figure in armour, sword sheathed and shield slung | played |
| `sighted` | From the shot the creation last drew (turned as it was, framed for the screen it was framed for), the camera turns from the player to look down its deck; the lookout and the bosun cry out and the mate and the gunner speak; the camera pulls out over its stern as three pirate Sloops come out of the dark, and comes down behind it through the fight's own lens | shown |
| `battle` | The sea's own fight against the three, every ship taken up under the sail and way it was sighted with and sailing in the story's storm wind, never the world's, the Brig drawn as its own, the crew crying out at hits and sinkings; the tracker's task "Defeat their crews", the ships fighting the player still afloat and "No need to sink them", until every one is beaten, sunk or struck; the fight's readout, its keys and DFO's messages as toasts | played |
| `calm` | The wind drops, the rain eases, the camera eases down from the fight's to its deck; the beaten ships lie where and as the fight left them, each in its own settle, trim and list, and its sails furling on from where the fight left them; struck ones lie still, sinking ones go on under as the rules sink them and are gone once under; the crew talk, the camera looking out over the lookout's shoulder to the nearest wreck as he asks about them, then pushing in on it until it reads however far off it lies, until he cuts the mate off | shown |
| `ram` | The lookout cries out on the deck the calm left, the wrecks still lying round it; the camera turns with him, then pulls sharply out as a larger ship comes out of the storm at its side at 6 m/s (about 12 knots), lightning striking past it at 2.3 s and 4.8 s so its masts and sails stand against it: Captain Brannoc Thule's Frigate at its own size, under sail, lighter than a captain's ship in the fight and darker than the Brig; the crash comes as the head of its stem first touches the Brig's side where its hull is broadest (each hull's box in the ships manifest); the crew brace; the impact; black | shown |
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

**The elder's welcome** ([[Elder Maren Hale Welcomes the Player to Overlook]]). Once the stranger has gone, on that
first arrival, Elder Maren Hale of the Lamplighters starts at the lane crossing nearest the player that is at least 15 m
from them, and out of their view where one is, and comes to them by the lanes at 1.5 m/s. She stops 1.8 m before a
player on the lanes, facing them; for a player off them, she stops at the lane point nearest them and greets them there
once they are within 6 m, waiting until then with "Follow" shown. She leads them to the plaza's counters, the nearest
stop first each time: the Mage, the Armorsmith and the Weaponsmith, the Tailor and the Tack, the vault, the
Stormcallers, the Veiled and her own Lamplighters, then walks home. She keeps to the townsfolk's lanes, the counters'
fronts and the parapet's lookers' line, and goes round her counter's end clear of the arcade's columns, so she walks
through no solid and never through Shape (`welcome/lanes.ts`; the lanes are in `content/world/social.json`). Each stop
is where customers stand before its counter (3.1 m out), a pair's the middle of the two. At each she waits until the
player is within 6 m, then says its lines in the dialogue box, some of the keepers she names answering her, with no mark
over a head ([[Speech Blurbs Show Their Text Without Glyphs]]); the HUD says "Follow" over her name past 6 m and clears
it inside 5 m. The player walks freely the whole time: it is no cutscene. What she says (`content/story/welcome.json`)
is the state of the world as Overlook's people know it and what the plaza offers: the Grey Tithe's tenth and the ships
taken whole, Overlook paying the Tithe nothing (the owner's "The Grey Tithe Take a Tenth, and Overlook Does Not Pay", on
pull request #77), three ports standing and ruins no one agrees about (the owner's three port cities, on pull request
#75), and the town's memory (three people name four builders of the beacon). It is due from the story's end until its
last scene is said: the browser keeps the scenes said (`overlook.welcome.said`), so a reload or a leaving takes it up
from there on the next arrival in Overlook's social space, without the greeting; leaving before the stranger has gone
forgoes it. A browser that has played the story and holds no mark of the welcome is welcomed on its next arrival there.
A player more than 40 m from her for a minute ends the walk: she goes home, and it stays due. While the menu or a
keeper's screen is open she stands idle and no stop begins and the Follow prompt is hidden; opening her counter while
she walks ends the welcome there and opens the Lamplighters' whole screen; at her own counter she is the one speaking,
and no mark stands over its place. When it ends she is her counter's keeper again, never two of her at once. Under `npm
run dev`, and on a built page served on `localhost`, `?welcome=1` plays it at once in the social space.

**Where it happens.** The storm lies 24 km out past Saltmere's harbour (`stormPlaces`), the Brig heading across the
swell. The sea is sounded every 150 m across the 3 km round it, where every ship of the story sails, and the place is
turned either way, and if need be laid farther out (30 km, then 38 km), until all of it is 40 m deep or more; were
none so, the place with the fewest shallows is taken.

**At sea** (sighted to ram), each beat sets its own weather, sound, lightning and the Brig's way as it begins, so a
page started there plays as it would in turn; `?prologue=battle` takes the ships where they would be sighted
(`inboundAt`) and `?prologue=calm` or `?prologue=ram` lays them there as struck wrecks. Every hand-off at sea is
whole: the sighting starts from the shot the creation last drew; each ship's rig (`Sailing.rigOf`) is handed to the
fight and back, so its sails go on as they were; the fight's beaten ships are carried to the calm and on to the ram
(`Wreck`, `settledOn`) in the pose the fight left them. Every cry is said with its speaker's head on the view: a
battle cry waits for its speaker to come on the view (the player aiming out over its side looks away from the crew)
for up to 2.5 s, and is let go unsaid after, with no gap spent on it, so the next of its kind is heard. Every scene a
beat waits on either ends it or, refused, is thrown from its next frame,
and each beat's moments run on its own clock: skipped, its moments left still change the world (the weather, the
impact, the black) but say and sound nothing. The fight begins on the story's clock; a fight that cannot begin, or a
step the rules refuse, is thrown from the beat's frame, so the director goes on past it. The calm's last line is a
scene of its own (`calmCutOff`): the calm ends 1.3 s into it and the ram's first cry cuts it off. The wreck is laid where the ships met. The shore is the
nearest gentle strand to the plaza, low by the water, clear of the city's pads and 260 m from its harbour
(`findBeach`), found on the exact ground behind the deep's black.

**The intro** ([[The Intro Goes Straight to Saltmere]]) rises at first light over the cloud above Saltmere, goes
down into the cloud with a rush of air, the white whole for a second, and lifts on Saltmere's glide in from the sea to
the title, each shot laid on the island's own town and harbour (`islandFrame`). Saltmere is the land the game opened,
so nothing loads on the way. A skip brings the black down over the view, and the title shows under it as it lifts.
The title asks to begin once; begun by a key or a tap between frames, the title drawn after does not ask again.

**The intro's length.** First light 6 s, the cloud 1.1 s, Saltmere's glide 15 s and the prompt 2.4 s after the
title: about 25 s.

**The story's day.** The story is told in one day and night, the game's sky drawing each beat's weather at its hour
(`skies.ts`, `storySky.ts`): first light over the cloud at 5:15 and Saltmere's early morning at 6:24; the
storm at evening (18:00), the stillness after the fight at sunset (18:36), the Frigate out of the dusk (19:06); the
wreck and the deep at night (21:00), under a full moon the storm hides; the shore at the next dawn (5:36). Saltmere's
sun rises about 5:05 and sets about 18:55. The day is world day 3, the same for every player, and the clouds drift
and the lightning strikes on the story's own clock. Every bolt the story throws is a strike in that sky: it lights
the clouds and the decks, and its thunder comes as late as its distance makes it.

**The music** is the game's own director playing the story's songs ([[Music]]), one theme told through them. Every
frame each beat asks for its moment (`music()`): the title, whole, over the intro; the storm's song without its peak
as the storm comes on, only its floor and tension at the helm, whole as the pirates come; the sea's own fight song once
the fight is on; the calm's flute; the ram's swell, which the crash cuts off with everything else. The wake is silent
over the ringing and the heart until the camera rushes the wreck. Then the Boarding's first phase plays, tense, and
grows with each fight; Thule's cry wakes his own score, and losing to him plays its end, which rings over the throw.
The deep's song follows, then the shore's, its layers coming in as she comes, as she speaks and as the two rise.

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

**The player** is dressed for the story in steel with no helm, a steel sword sheathed at the hip and a kite shield
slung on the back (`armouredDress`; [[The Player's Sword and Shield Are Holstered]]): they stand at the helm with
their hands free, and on the wreck a swing draws the sword and the shield, as the game's does. Their look is kept in the browser (`overlook.look`) and dresses them in the game afterwards.

## The wreck

Where the ram leaves the player: the Brig broken in two by Thule's Frigate, fought through on foot to the boss. It is a
scene of its own, built in Blender ([[The Prologue Is Brought to Life With Music, Sound and a Wreck Built in Blender]]);
the cutscenes, the camera's moves, the nameplate, the fires and the lines are the story's.

- **The scene** (`tools/wreck/`), spread out at true size ([[The Wreck Is Spread Out Much Larger, True to Scale]]).
  The ships tool builds the Brig, the Frigate and the Sloop, each at its own size. The Frigate lies north to south,
  its bow driven into where the Brig's waist was. The Brig is broken in two, its halves thrown some 35 m apart, each
  turned about its far end and settled a little lower at its break. Its mainmast is down, its waist on the struck
  side fallen into its hold, its foremast standing with its canvas burnt to rags. The Frigate's bowsprit is torn
  away and its mizzen down; its deck is burnt through over its gun deck, its side stove in amidships and abreast its
  gun deck to port, and its port bulwark broken forward. A pirate Sloop sunk in the fight at sea floats on its beam
  ends east of the Frigate's bow, high enough that its side stays out of the swell.
- **The wreckage** (`wreck_fields.py`). Six wide rafts of torn decking, each laid within an ellipse a little over the
  sea, on lengths of mast and casks: the wreckage of the Brig's waist and its torn deck between its halves, one beside
  its fore deck, the wreckage the Sloop drifted into, and two off the Frigate's port bow and port quarter. Broken
  timbers ring each, under its planking.
- **The way through.** Ramps of fallen timber lead off the Brig's stern half onto the wreckage of its waist, from its
  torn deck up onto its bow half, from its fore deck onto the raft beside it and down from it onto the Sloop's side,
  off the Sloop onto the wreckage it drifted into and up from it into the Frigate's stove-in waist, out over its
  port bow, down into its gun deck, up through its quarterdeck's broken front, and out of its gun deck onto the
  wreckage off its port quarter. Splintered timber stands along every break. Wreckage is strewn on the decks and the
  rafts' edges, kept off the way through, and flotsam floats all round.
- **The ground** is measured from the model (`wreck_course.py`), as a ship's deck is. A face looking up is ground
  where it is hull or deck, or timber laid as a way. What is solid in the room a body takes over the ground stands as
  a wall 3.2 m over it: past a jump from the deck, a quarterdeck or a rail beside it. Splinters and the heaps that
  close a way for good are walls no body stands on. Sails and lines are neither. The ground is laid in squares 0.3 m
  across, runs of one height joined into blocks; ground not joined to where the player wakes (flotsam afloat) is
  left out. Over 2,000 m2 of it is walked, across some 75 m by 55 m.
- **Built in CI.** The wreck workflow builds and lights the wreck whenever its tools change, publishes the mesh, the
  light and the model to R2, and keeps the layout it wrote (artifact `wreck-level`), which a commit takes whole: a
  build on another machine can lay the ground a hair differently, and the game walks the ground the mesh was built
  with.
- **The layout** is `content/prologue/wreck.json`, written by the export: the mesh's and the light's keys on R2, the
  ground's blocks, each heap's block, the fires, the masts still standing, where the sea is not drawn (`dry`), where
  the player wakes, the path, the zones with their waves and the Brig's crew, the arena, Thule's place and the
  camera's way back from its flight. Figures stand at the middle of their square of ground, never on the edge between
  two blocks.
- **The path** runs from the Brig's quarterdeck, where the player wakes by its wheel, down through its thrown-down
  breast rail into its waist, along its port gangway past the fallen waist, off its broken end across the wreckage of
  its waist and its torn deck, up onto its fore deck, out onto the raft beside it, down onto the Sloop's side, along
  it and across the wreckage it drifted into, up into the Frigate's waist east of its boat, past its mainmast, down
  into its gun deck and up onto its quarterdeck. Every lane of it is a body wide, and every figure the level stands
  a body's radius clear of anything a step over or under its feet.
- **Zones.** Eight along the path: the Brig's stern, the wreckage of its waist, the torn deck over the gap, its fore
  deck and the raft beside it, the Sloop and the wreckage it drifted into, the Frigate's waist and the wreckage off
  its port bow, its gun deck and the wreckage off its port quarter, and its quarterdeck. Each is an area with a
  checkpoint; entered, its checkpoint is where the next respawn stands the player. The first, where the player
  wakes, is quiet: no wave, nothing across its way on, room to walk, look and swing. Each between it and the arena
  holds a wave of Grey Tithe crew and pirates, Minor and Major, in pairs fighting each other, stood as the player
  enters the zone and standing well across it from where they come in, so no foe of a zone fights before the player
  reaches it; and three spots near the wave on open deck where the Brig's crew stand (`crew`). At most 6 of the
  wreck's foes are alive at once.
- **The Brig's crew** fight on in each zone with a wave, two or three of them
  ([[Allied Crew Fight on the Wreck and Can Fall]]), stood with the zone's first boarder as the player enters, so they
  are fighting from the first. Each stands at one of the zone's `crew` spots in the layout, facing the nearest boarder;
  for a zone that lays none, 1.6 m from one of its first boarders on the same deck within the zone, toward its
  checkpoint where that stands. They are the roster's crew, Minors at the boarders' level, a swordsman and a skirmisher
  in turn, dressed as the Brig's plain hands in the storm with their weapons drawn, named "Crew" over a green bar. The
  boarders fight them and they fight back; they can fall. Neither the music nor a foe's growl on noticing the player
  takes one of them for a foe. The wreck's room holds 24 foes alive, as a node's; no more than 18 of the crew live at
  once, so the boarders always have room. A zone is cleared once its boarders are down, whatever became of its crew.
- **Heaps across the way.** Each zone but the first and the arena has a heap of wreckage across the way on from it,
  piled 2.9 m over its deck and out over the bulwarks (the arena's 3.7 m, past a jump from its quarterdeck), standing
  from the start. It is cleared once its zone's wave has stood whole and
  fallen. The Frigate's gangways beside its gun deck are closed for good by heaps on cores of stacked crates, higher
  than its rails. A player who climbs over a heap still standing is brought back to their last checkpoint.
- **The level's check.** The export refuses a level its own ground does not hold, measured twice, the second half a
  square across and along: every zone, checkpoint, foe and crewman reached in order, each with a body's room round
  it; no standing heap walked, or climbed as high as a jump reaches (1.05 m), round; a wave and three crew in every
  zone but the first and the arena; and at least 2,000 m2 of ground walked.
- **Nothing falls off.** The room over the sea holds a rim round the wreck's ground, a grid of 0.3 m cells, open
  where a block covers a cell and a wall everywhere else, as a ship's deck holds her crew ([[Movement]]): a body
  walks, jumps, vaults and climbs anywhere over the decks and the rafts and is held at their edge, its rails and
  open breaks alike, while what falls or flies over the sea meets it at 0 m. A body hanging on a wall shimmies along
  it no further than the rim. The page's own steps, its walk and its fight's prediction alike, stand on the same rim,
  made by the rules from the blocks (`setRim`), to the bit. A foe found off it is stood again at its post. A player in the sea (lower than 1.5 m over it, with no block of the wreck under them) is brought
  back to their last checkpoint after 1.2 s, as they were, never killed; the wreck's own low ground, her gun deck and
  the Sloop's side, is never the sea.
- **A death** before the end of the boss fight: the room raises the player at the last checkpoint after 4 s, by
  itself. The HUD shows no death panel and no Respawn; a toast says "You will rise at the last checkpoint."
- **The arena** is the Frigate's quarterdeck, 9.8 m across between its rails' inner faces and 8.5 m from its
  quarterdeck's broken front to its taffrail, open but for its wheel (its binnacle and skylight swept away), no wave in
  it. Its heap stands below its front, on the way up out of its gun deck. When the boss fight begins, its heap closes
  the way in behind the player, every other foe is sent away, and Captain Brannoc Thule stands before the wheel facing
  the player, three levels over them: their blows land at 0.94 of their worth (0.47 for the levels, doubled by the
  balance pass). A player back over the heap is brought back in; anywhere aft of the heap, on its deck or up on its
  rails, is never brought back, and its rails hold them.
- **A fight the player cannot win.** It ends when the player falls ("felled"), or when Thule is brought under a third
  of his health or 150 s have passed ("overpowered"); never with Thule dead. Stood by the page, he calls no crew in
  his last phase, so it stays one on one. Once it ends, the fight holds still while the screen fades out over 0.6 s.
  Felled there, the player is never told they will rise: that toast is for a death before the boss fight.
- **The cries.** In the wake's flight the first staged pair the camera holds on the view for 2.4 s cries "For the
  Tithe!" and "Cut them down!"; in the fight the first Grey Tithe foe on the view cries "Survivor! Get that one!",
  once. Thule cries when the player's blows land on him and when his land on them, at most once in 9 s each, and only
  with his head on the view, so a cry unheard spends no gap; he tells the player to kneel again only once they have
  struck him since. The throw overboard is framed so Thule and his crier stand on the view on any screen, a tall one
  from further back.
- **Played** by `WreckRun` as `Foot` plays a node: the walker and the fight in a room of the page's own on the
  layout's blocks over open sea (`LocalRoom.openOverSea`: its foes' navmesh is the wreck's ground alone, so every wave
  fights and Thule strikes), the fight's marks drawn by the view on foot. It tells the story whether the arena is
  entered, Thule's health, how the fight ended, the points over every head for barks (by crew), and the
  shot its camera takes of the player standing, where the wake's flight ends. A cutscene holds it still. Its room is
  let go as the wreck's fight ends. The key strip is foot's, without the menu: the story has none.
- **The tasks** (`Lessons`), in the tracker under the quest "Prologue"
  ([[Quests Get a Task Tracker, and the Placeholder Panel Goes]]). Waking, the task is "Learn the controls", four steps
  each ticked off once the player does it, read from what their body and fight did: Move (W A S D, 2 m walked from where
  they woke), Look round (Mouse, the view turned a radian in all), Attack (Right button, a swing begun) and Block or
  dodge (F and V, a guard, a parry or a dodge). Foes standing further on, fighting the crew, leave it up. Once a hostile
  foe takes the player as its target, or 1.5 s after all four are met, the task is "Fight your way through the wreck",
  counting the hostile foes standing while any do, and it never goes back. The boss fight's task is "Face Captain
  Brannoc Thule". The tracker hides while a cutscene holds the fight.
- **No Art.** The player fights the wreck with no Art ([[The Player Has No Art in the Prologue]]): its room is told
  to forbid them (`Room::forbid_arts`), so no ability bar shows and no cast is taken.
- **Drawn** by `WreckScenery` with `WreckView`, shown by the wake, the fight, the throw overboard and, from below,
  the deep: the one mesh built in Blender, each face in its part's picture as a ship's. Its fires' light is baked into
  it there (`light_wreck.py`), with its shadows and what the timber throws back, flickering through space and time as
  the fires burn, the brightest rolled off softly toward gold. The game's sky lights it as it lights a ship, at the
  story's hour, under its cloud and lightning, darkened in every hollow and overhang the bake found. The light is laid
  in blocks, as the game's pixels are, and kept as its square root, so its dim falloff keeps its steps. Each fire is
  also a lamp of the night, lighting the figures, the ships and the sea round it. The wreck does not ride the swell,
  which rises past its decks: every beat that draws it hands the water its ships' waterlines and its rafts as
  footprints (`dry`, ten ellipses, the water's hull masks), so no sea is drawn inside a hull or over a deck. Each heap is its own run of the mesh, drawn while it stands. The mesh and the
  light (about 12 MB) are fetched once the story is past its intro; the wake keeps its eyes shut until they come. The
  fires burn in all four beats. Every figure they stand makes a move the forge draws its clothes in: the deep's
  fallen crew lie in `fallen`, Thule's crew leap and cry out. It lets go of its GPU buffers once the deep ends.
- **Each beat sets its world** at its start (the wreck's storm, fires and sounds, no lightning; the deep's water), so
  under `npm run dev`, `?prologue=wake`, `?prologue=wreck`, `?prologue=overboard` or `?prologue=deep` plays as the
  story does. Leaving the fight hands the HUD back clean (no death, key strip, task, nameplate or fight's display) and
  frees the pointer.

## Limits

- Every ship is a Sloop by the naval rules, whatever is drawn: the Brig's guns and hull are the Sloop's in the fight.
- Thule's ship is drawn as the Frigate, without the Tithe Ram's iron ram bow ([[Hulls]]): the Tithe Ram is not built.
- The look and whether the story was played are kept in the browser, not with the account.
- The story's songs are written to its beats' lengths, not timed to their moments: a song begins on the director's
  bar line, so a moment can fall up to a bar from its music.
- The decks are boxes half a metre across: a deck's camber and the slope of its sheer are steps of 5 cm, a mast or a
  gun inside its deck is walked through, and its hatches are walked over.
- Every wall is climbable ([[Movement]]): a player climbs a rail, or a heap still standing, and is held at its top by
  the wreck's rim, or brought back by the level.
- The heaps are not in the foes' navmesh: a foe that runs at one stops against it until it clears.
- The sea fight has no touch controls, like the rest of the game ([[Interface]]: no gamepad or touch layer yet).
- No figures swim or float in the forge, so no men are drawn in the water by the wrecks; the calm's talk asks only
  about the wrecks the camera shows.

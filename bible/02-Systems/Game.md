---
type: system
status: live
code:
  - client/index.html
  - client/src/main.ts
  - client/src/gameWorker.ts
  - client/src/game/seaTravel.ts#sailOrTravel
  - client/src/thread/pageHost.ts#PageHost
  - client/src/thread/pageAway.ts#pageAway
  - client/src/thread/audioAway.ts#soundAway
  - client/src/thread/audioHost.ts#AudioHost
  - client/src/game/game.ts#startGame
  - client/src/standIns.ts#standIn
  - client/src/game/drain.ts#Drain
  - client/src/game/drain.ts#DrainView
  - client/src/combat/arrivals.ts#Arrivals
  - client/src/game/gameBoot.ts#bootGame
  - client/src/game/gameFrame.ts#startFrames
  - client/src/game/pageWaters.ts#watersOnce
  - client/src/game/flow.ts#next
  - client/src/game/travel.ts#startTravel
  - client/src/game/tripBack.ts#tripOrBack
  - client/src/game/foot.ts#Foot
  - client/src/game/footView.ts#FootView
  - client/src/game/swingView.ts#SwingView
  - client/src/combat/attackFeel.ts#AttackFeel
  - client/src/combat/worldSounds.ts#WorldSounds
  - client/src/game/foesAsked.ts#foesAsked
  - client/src/game/footGear.ts#useAt
  - client/src/game/footGear.ts#questRings
  - client/src/game/overheadMarks.ts#markedHere
  - client/src/combat/marksOver.ts#marksSeen
  - client/src/game/footGround.ts#standOn
  - client/src/game/plazaLife.ts#PlazaLife
  - client/src/game/zoneFolk.ts#ZoneFolk
  - client/src/game/usePrompt.ts#UsePrompt
  - client/src/game/footTrips.ts#tripAt
  - client/src/game/dungeonTrips.ts#dungeonTrips
  - client/src/game/dungeonDrawers.ts#DungeonDrawers
  - client/src/game/sea.ts#Sea
  - client/src/game/seaView.ts#SeaView
  - client/src/game/landmass.ts#openLandmass
  - client/src/game/landDrawers.ts#landDrawers
  - client/src/game/scene.ts#GameScene
  - client/src/game/groundTiles.ts#groundTiles
  - client/src/terrain/groundColour.ts#GROUND_COLOUR_WGSL
  - client/src/combat/lightLayer.ts#LightLayer
  - client/src/game/depthCopy.ts#DepthCopy
  - client/src/game/renderScale.ts#sceneSize
  - client/src/game/rooms.ts#roomAsked
  - client/src/game/autoScale.ts#AutoScale
  - client/src/game/upscale.ts#Upscale
  - client/src/perfMeter.ts#PerfMeter
  - client/src/gpuTimer.ts#GpuTimer
  - client/src/shadow.ts#ShadowMap
  - client/src/shadowCache.ts#CastRecording
  - client/src/game/figureView.ts#FigureView
  - client/src/game/figureCull.ts#poseEvery
  - client/src/combat/flashes.ts#Flashes
  - client/src/combat/foeFigures.ts#dissolveFoe
  - client/src/combat/overheads.ts#overheadMarks
  - client/src/game/hud.ts#Hud
  - client/src/game/hudLaw.ts#standingOf
  - client/src/game/nodes.ts#windowRect
  - client/src/game/seaLaw.ts#continentToOpen
  - client/src/game/seaLaw.ts#shownScale
  - client/src/game/seaShips.ts#SeaShips
  - client/src/game/passage.ts#Passage
  - client/src/game/seaHelm.ts#clearAhead
  - client/src/game/seaClose.ts#CloseZoom
  - client/src/game/landingAsk.ts#clickAtSea
  - client/src/game/seaLandings.ts#SeaLandings
  - client/src/game/docking.ts#Docking
  - client/src/game/berths.ts#berthOf
  - client/src/game/moorings.ts#shipsLying
  - client/src/game/shipConsole.ts#shipConsoleNode
  - client/src/game/islandWords.ts#islandPanelOf
  - client/src/game/islandPanel.ts#islandScreen
  - client/src/game/aboard.ts#Aboard
  - client/src/game/crew.ts#Crew
  - client/src/game/shipPeople.ts#ShipPeople
  - client/src/game/shipPeople.ts#figureReach
  - client/src/game/shipCompany.ts#companyOf
  - client/src/ships/shipCrew.ts#handsShown
  - client/src/game/shipPanel.ts#shipPanelOf
  - client/src/game/hints.ts#seaStrip
  - client/src/game/hints.ts#footHints
  - client/src/game/rooms.ts#roomsFrom
  - client/src/heldmap/heldMap.ts#HeldMap
---
# Game

The game itself, at the site's root (`/` under `npm run dev`): the world played as the owner decided it after
Destiny 1 ([[Overlook Is a Shared World After Destiny 1]], [[Every Island Is Seen Whole and Reached by Nodes]]). The
player arrives in Overlook, plays on foot in one node at a time, returns to their ship, sails the [[Overworld]]'s sea,
views an island's side from above and lands at another node. Each way between them passes through a veil while the
place loads, as Destiny's orbit does: the loading screen, the logo over a breathing LOADING and the trip's words
([[One Loading Screen Covers Every Trip Until the Place Is Ready]]).

## Threads

The game runs in a thread of its own, a worker, as the owner asked ([[Work Leaves the Main Thread Where It Can]]): its
loop, the rules' prediction, the room's connection and every draw, WebGPU drawing on the page's one canvas handed to
it (`transferControlToOffscreen`). The page keeps what a browser allows nowhere else (`PageHost`): the player's keys,
pointer, wheel and pad, the pointer's lock and capture, typing through `EditContext`, sound, storage, the address and
the screen reader's announcements; in the [[Desktop App]] it hands the shell's bridge to the game and the game's asks
to the shell. The canvas draws at its size on the page times the screen's pixel ratio, shrunk,
keeping its shape, to 8192 pixels a side, the widest texture every GPU device draws into (`canvasSize`); its
interface, the Test Ground's and the editors' panels too, is laid at the ratio it was shrunk to.

- **What the page hears** it sends on as it comes: the interface's input as plain events (`CanvasEvents`), and every
  key, pointer and wheel event the game's code listens for, made again in the worker on the canvas or the window. The
  page keeps a key's own work (scroll, find, the focus moving) from every key of the game's unless words are typed,
  the browser's shortcuts and function keys aside, and a wheel's and a right click's on the canvas always.
- **What the game finds in the worker** stands in for the page (`pageAway`): storage read there and each change sent
  to the page's at once; the page's address, its size, its media queries and its document; the pads, as the page read
  them each frame (`navigator.getGamepads`, which a worker lacks); the canvas, its pointer's lock and capture asked of
  the page. The game's own code runs unchanged: the stand-ins answer as a page's do.
- **Sound** is made on the page's audio, its cues sent ahead by the worker (`soundAway`, `AudioHost`): every node,
  parameter and buffer the game's sound code makes there is a number the page keeps, each call sent with the rest of
  its task's and carried out on the page; the page's clock is sent back now and then, and the worker runs it on
  between. The page makes its audio at the player's first press or key, as a browser lets sound start only then.
- **The room for playing alone** runs in a worker of its own, started by the game's
  ([[The Room for Playing Alone Runs in a Worker of Its Own]]): a node's, a dungeon's, a run's, the sea's and an
  island's room (`LocalRoom`) is opened there, its navmesh baked and its sea laid, and ticked there as the game lets
  its clock run, its snapshots handed back as they come, as a server's are (`RoomThread`, `serveRooms`,
  `roomWorker.ts`). The game's thread only sends the player's inputs and the seconds to run. The prologue's wreck is
  opened there too (`openOverSea`): the story's asks of it (`RoomThread.story`: stand a foe, send one at the player,
  post a crewman, give the arms, a checkpoint, a heap standing or cleared) are made in the worker in the order asked,
  before any tick asked after them, each answered in turn on the same queue as an island's word, a lost room's with
  none. The [[Test Ground]]'s room is still opened in the thread that asks.
- **Measured** headless on SwiftShader at 480 by 270, the world drawn at Overlook's social space for 30 seconds with
  W pressed every two: the page's thread is busy 0.0 ms a frame at the median and keeps 60 frames a second while the
  worker draws, with 4 long tasks (0.26 s in all); the worker is busy 25 ms a frame. SwiftShader draws on the CPU, so
  its frames come seconds apart: only the threads' busy times say anything of a real GPU.

## The flow

`flow.ts` holds where the player is: loading behind a veil, on foot in a node, at sea, or over an island's side
choosing a landing. It is pure: the game hands it what happened and draws what
it answers. `gameBoot.ts` makes the pieces (the rooms, the modules, the scene, the world and the place arrived at),
`game.ts` keeps the flow, the ways into each place and the player's actions, `travel.ts` the travel between places
behind the veil, and `gameFrame.ts` draws each frame of the mode the flow is in, a frame on foot first heeding the
activities' word (`startActivities`: a gate that shut, a company that fell); each mode is its own module.

| From | Happening | To |
|---|---|---|
| Arriving | The ground round the spawn is in | On foot in Overlook's social space |
| On foot | The leave held (M, or the pad's View held, 1.5 s; [[Interface]], "The leave held") | The room's word first: refused while fallen or within 10 s of a foe's blow, said in a toast (`toShip.ts`, [[The Audit's Leftovers Are Fixed as Claude Suggested]]), and no yes while the room joins again or has not sent the gear (a room lost for good is played on alone, and the page goes); else the veil, "Returning to your ship", then at sea |
| On foot, or behind the veil to land | The room's gate shuts to the character, or it came by no way that leads there | The veil, the room's reason and "Returning to your ship", then at sea |
| At sea | A click on a port's icon or its island, or L off a coast, then the confirmation's yes, once the ship lies within reach | Over the island, its tiles up |
| Over the island | A tile clicked, or Enter on the tile lit ([[The Island's Tiles Are Painted Scenes, and Each Patrol Zone Has Three Landing Zones]]) | The veil, "Landing at" the node, then on foot there; an Elite Dungeon's card; or the Playlist |
| Over the island | Escape, or the island's tile's Back | At sea |
| On foot in a patrol | E at an entrance's door, offered as "Enter" and the dungeon's name | The veil, "Entering" the dungeon, then on foot at its way in |
| In a dungeon | E at its exit door, offered as "Leave" | The veil, "Leaving" the dungeon, then before its entrance's door, facing out |
| On foot | E in a gate's basin, or at an instance's way in | The veil, "Entering" the instance or "Returning to" the patrol area, then on foot at the other's way in or gate ([[Layouts]], "Gates") |
| On foot in a patrol zone with passages | E at a run's sealed door, a route and a start chosen on the mouths' card, and the room's yes | Passing to the zone behind the mouth, or to the lamp begun at ([[Passages]], "Played") |
| On foot in a passage zone | Through an open onward mouth | Passing: the way between zones in place of the veil ([[Passages]], "The way between zones"), then on foot at the next zone's way in |
| On foot in a patrol zone | E in the basin of a gate toward another patrol zone, offered as "Go to" and its name | Passing: the way between zones, the dots running from one zone's place to the other's, then on foot at its gate toward the one left ([[Layouts]], "Gates") |
| On foot at a lit lamp | Home | Passing, the way running back to the patrol zone, then on foot there |
| Passing | The way played and the place come | On foot there |
| Passing | The room's gate shuts to the character | The veil, the room's reason and "Returning to your ship", then at sea |

A locked node ([[World Map]], "Seen whole, reached by nodes") is never landed at or entered: its mark and its gate
only say it is locked.

The veil lifts once the place is ready, the exact ground round the player has come, and three frames in a row have
drawn it whole, or 20 s of wall time after the place is ready: the trip's own work (the place opened, the room
joined) comes first, however long it takes. A frame is whole when nothing stood in for the place round the player
(`standIns.ts`): a figure with no frame of its own yet, ground, a city, a dungeon or an entrance still painting, a city
or a ruin's wrecks not yet built, plants or an island's kit still loading, a hull drawn as the Sloop, a place's sound
not yet come. A
figure showing its last frame while its next composes stands in for nothing, nor does one that failed and waits to be
tried again. Behind the veil no frame is seen, so the plants scatter 30 ms of each, not the 6 ms they take in play. Lifted at 20 s, the page warns what was not ready. A
trip that failed with nowhere left to go shows its words without LOADING, waiting on the player; one with a way back
keeps LOADING as it goes back. A travel by the held map ([[Sailing]]) shows the same screen over its black, which waits
on the same whole frames, drawn after the room has moved the ship. Nothing puts the veil up mid-play: the
plants' pipelines are made once per device and format, and the lit keepers' marks and the first-person glow make theirs off the
frame as the game starts, so a continent or an island opened while sailing compiles none.

A trip that fails, its room full or out of reach, puts the player back where they stood before it, joined again:
aboard their ship, on the island's beach (online or alone, [[Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach]]), in the dungeon, or in the node at its
arrival spot ([[The Audit's Leftovers Are Fixed as Claude Suggested]]; `travel.ts`, `tripBack.ts`). Should that fail too, or should
the trip be one that sent them out of where they stood (a gate shut on them, their company fallen), they are taken
to the hub, Overlook's social space, its landmass opened first where another is. The veil says why while they go
("You could not reach The Saltgrass Downs:" and the reason), and once it lifts the same words stand as a toast for
8 s. Only when the hub fails too does the trip stay on the veil, saying why, and Enter tries it again; so does the
first arrival, which has nowhere to go back to. A room past its sockets takes the join only to close it, saying the
room is full, as a browser's WebSocket never reads a refused join's status.

## Arriving

The game reads the world (`loadWorld`: the layout and every continent's edits file) and opens Saltmere, continent 1,
in the [[Land]]'s worker, kept, with the RMB index's blocks, so its city is settled on it as the bake settles it
([[Cities]]). Overlook's plan comes from that worker; its social space is the node `overlook-social`, the plaza beside
the Beacon. The player stands at its first spawn, 4 m inside the seaward parapet, facing out from the landmark and
looking 17° down over the parapet onto the city, the harbour and the sea. Arriving from the story played through, the
stranger's last moment plays there once the veil has fallen ([[Prologue]]); leaving the node ends it.

Where the page has accounts, the character screen stands between the title and all of this ([[Interface]], "The
character screen"): the character chosen there decides whether the story plays and where the player arrives, and a
developer's Test Room launch goes on from that arrival into its test room. A returning player, past the title with the
story played before, goes back where they last left the overworld or a
social space ([[A Player Logs Back In Where They Left the Overworld or a Social Space]], `relog.ts`): the veil says
"Returning to your ship" and they are aboard, the ship where the sea room kept it (offline, where the page kept it);
or "Arriving at" the social space, standing where they left it; online, a dive's passage zone that held them last
takes them back on that dive. Online the accounts say which (`/v1/me`'s `place`),
offline the browser's `noshores.place`; with none, or a social space not open, they arrive at Overlook ([[Accounts]],
"Where a player logs back in").

With `?at=<node id>` in the address the player arrives at that node instead, on its continent (a city's social space
is `<city id>-social`): a way to look round the world. An id the world does not hold arrives at Overlook, and so
does a patrol or mission still locked, played alone too, as the server refuses it
([[The Patrol Audit's Leftovers Are Fixed as the Owner Chose]]), and a social space still locked: only Overlook's opens for now ([[Cities]], "Open and locked"), so a ruined city's is
never arrived at. Should one open, it is named "Ruins of" and the city's name ([[Cities]], "Ruins"), on the veil too
(the game waits for the rules' module to say which cities are ports, `mainPortsOf`), and on foot the line under its
name says "Ruins" (`placeWords`). Online, a node's room lets a kept character in only by a way that leads there
([[Server]], "Where a character comes from"; [[The Server Is the Authority Over Everything]]), so any other room than
Overlook's sends it back to its ship, the veil saying "You cannot reach this place from where you were.". With
`&spawn=<east>,<south>[,<bearing in degrees>]` too, the player stands at that point instead of the node's spawn,
offline (`&offline`): a way to look at one place.

## On foot

`Foot` stands the player in one node, as the [[Player]] plays on the [[Test Ground]]: DFO's controls, first and
third person, the forge's figure and the first person's hands, and the Test Ground's fight.

- **Friendly ships from land.** At any node every friendly ship within 15 km of the eye is drawn on the sea at its
  true size, sails set and filled, posed on the swell, its footprint on the water, as at sea (below); so ships coming
  and going are seen from each port's plaza and harbour. One the seas have taken off its route, as the island's room
  last said (the snapshot's `taken`, [[Server]]), is drawn on it no more. They are lit as the ships layer lights
  every ship, by its own sun, and cast no shadow.
- **Ships lying by the island** (`moorings.ts`; [[A Ship Docks in Sight, Undocks as Its Player Leaves, and Lies Parked Where Others See It]]).
  On every node of the island the player's ship is docked at (for a sea island, its beach alone; never its passage
  zones, which stand apart from its coast) the ship is drawn
  where it lies, and every ship parked there as the land room's snapshot tells (its `ships`, the player's own among
  them, left out where it lies within 5 m of their own as the page draws it, and drawn from the snapshot once the page
  no longer knows it docked, after a reload; none in a passage zone), each in its own hull, its sails furled, riding
  the swell, its footprint still on the water. A dungeon and a Breach's run draw no ship lying by them. At a
  social space the city's sloops lie at its pier, in the places of its plan's moorings no player's ship lies within
  15 m of.
- **The ground.** The node's window of the land, over its ring's bounds and 100 m past them, and its city's boxes
  there, cut by the land's worker and handed to the movement door and the fight's rules, the same ground to the bit
  as the node's room ([[Movement]], [[Server]]). The scene draws the exact ground round the player, sampled every 4 m.
- **The camera** is the player's ([[Player]]), its boom kept clear of the node's boxes and its ground, and held
  0.3 m over the ground, with the Test Ground's 50-degree view. The player's own Anima pushes it in as it is
  released, with a frame of its element round the screen ([[Arts]]).
- **The world goes on.** The body is stepped every frame, with the pointer locked or not; while a menu is open,
  with nothing pressed. Click the view to look round with the mouse.
- **The room.** The node's room is the authority, always. Alone, the room crate runs in the game's worker, ticked by its clock,
  on a node file made from the same window and boxes, as the sea's does ([[Server]]); online, the server's.
- **The fight.** The player fights as on the Test Ground, by its keys and its modules ([[Combat]]): Z readies the
  weapon, 1 draws the Melee loadout and 2 the Ranged, 3 drinks a healing charge ([[Combat]], "Healing charges";
  [[Three Healing Charges, Refilled by Blows and Kills]]), the right button swings or aims, the left button or F
  guards, parries or fires, V or Mouse5 dodges, R, Q and G cast the worn Art's spells ([[Arts]]), and the soft lock
  holds a foe. The fighter is predicted by the room's own rules on the node's land, and the room's word is
  taken. Shots stop on that land, and the aimed shot's crosshair and the player's own arrows meet it. The key strip
  shows only the keys of what the player is doing now, and K opens the sheet of every control ([[Interface]], "The
  key strip"). Every key hint, on foot and at sea, is a key on its keycap, or its mouse button drawn, and its
  action, with no colon. The strip is a compact panel at the bottom right under the moment's name, its words at the
  face's 11 px as the place line's small words under its name are (22 over the held map at the larger step;
  [[Interface]], "Limits"). Escape opens Settings wherever nothing else is over the game
  ([[The Key Strip Is a Compact Panel, a Held Key Leaves, and Settings Has Tabs]]).
- **The foes.** Every foe the room holds stands as a figure in its type's dress ([[Enemies]]), with the Test Ground's
  display: the compass at the top with the boss bar and the target's plate under it, the vitals at the top left, the
  Arts and weapons at the bottom left, each foe's name and bar, the parry rings, the words, the arrows to foes out of
  view, the marks of telegraphed blows, the tracers, where blows land and kills fall, the blood and the flashes. The game's own display stands over it: the
  place's name and the status line at the top right, the key strip at the bottom right, the menus and the veil;
  while a boss's bar shows, the status line stands under it ([[Interface]]).
- **The attack feel.** The [[Test Ground]]'s four effects over the blows play on foot at their defaults: each blow's
  swing arc where its blade goes, its striker's figure hiding what passes behind it (none through the eyes), with the
  smear its strike leaves behind the striker's card; the hit-stop holding the fighters a blow lands on; the camera's
  kick (moving the view but never turning it while a ranged crosshair shows); and the lunge driving a striker's figure into its
  blow. Only the drawing moves, never the rules or their clock (`combat/attackFeel.ts`). A player who asks for reduced
  motion keeps a still view: no kick, no shake, no lunge carrying the eye and no Anima push-in; the Anima's edge frame
  still shows. The feel's light is on too: the brightest marks and arcs light what stands round them ("Drawing").
- **The player's own hits at once.** As the page predicts the player's swing, it judges the blow as the room judges it
  among the fighters the player sees (`room-wasm`'s `hits_of`). On the tick the blow lands, each foe it hits flashes, is
  heard struck and is held, and the room's word on that hit does none of these again (`feltNow`). Its damage, number,
  blood and kick come with the room's word ([[The Drawing Click Swings, and the Player's Own Hits Show at Once]]).
- **A struck figure.** Drawn only, never the rules' body. A foe a blow harms flashes in held frames: its whole figure
  white for two, its outline white for two, then its outline for one in the blow's element's light (steel `#cfe0ff` for
  a plain blow), then nothing; the player's own outline flashes red for four, after two whole frames only for a blow of
  more than a quarter of their health. A foe struck slides along the blow, away from its striker, in whole pixels: 0.12
  m for a hit, 0.35 m for a stagger, out over 6 frames and back over 10 to where the room has it; 0.6 m for a kill,
  which stays. A stagger shakes the figure a pixel either way for its first 6 frames, reels it through its hurt frames
  forth and back every 0.4 s (a flinch plays them once), and circles three gold stars round its head in eighth-turns,
  once a second; a Charge's stagger holds it still. A foe slain dissolves once its fall is over: plain, it greys and
  crumbles from the head down in 2 by 2 cells over 0.6 s, white at the break; a death in an element (the player's own in
  their weapon's glow as their game shows it, any other as the room tells it) dissolves at once in it (Blaze burning up
  from the feet, Volt blinking out in 4 by 4 cells, Cosmic drawn in to the chest in four steps), its finisher round it.
  A player arriving, as they spawn into a place, respawn or are revived, is built from the feet up in 2 by 2 cells
  over 0.6 s, each white as it lands, throwing no shadow until they stand whole, when their weapon glows
  ([[Players Arrive as Destiny's Transmat Does, Unexplained]]): the player as the veil lifts, as they board a deck and
  on each respawn or revive, every other player on respawning or being revived, or when first seen after the player
  arrived. The player sees their own figure begin once their
  view is first open, 0.5 s in. Foes never arrive so.
  A crit's flash keeps its two white frames, then its outline is gold for four. The statuses show on the figures as in
  [[Arts]], and the weapon's glow surges ([[Weapon Glow]]).
- **Sounds.** The world sounds on foot ([[Interface]], "World sounds"): the fight's blows, shots, steps and spells,
  the drops landing and the player standing again, each where it happens, through the World volume once the first
  press or key has woken the interface's sound. A cue not yet picked is silent; nothing new plays while a menu is open.
- **Foes to try.** Under `npm run dev` only, `?offline&spawn=` asks the room played alone for foes as the player lands:
  types by their numbers, each with a rank after a colon (`?spawn=2:2,4,12`). A server's node room takes no such ask.
- **A social space's people** (`PlazaLife`, `life/`): its keepers stand behind their counters and at their stalls and
  work, and its townsfolk walk the plan's ways (the city crate's `life`) from post to post, looking out, browsing,
  drinking, talking or carrying, keeping to the right; each keeps a routine laid on the world clock from the plan and a
  seed, so every browser and every visit has the same people in the same places. Each walk is found by A* over the ways;
  the walk's frames go at the pace they stroll, each in a step of its own. Each walker stands on the ground, or on the
  highest top under them whose underside is within a step of the floor so far, climbed in turn (`floorOver`): a
  podium or a landing, never a roof over them; it is found again only once they have walked a step. Shape, the
  keepers' marks, the stranger and a quest's rings stand on the same floor in a social space. A round's sweeper
  keeps a whole number of the walkers' 600 s loops, staying at the round's first post until it is up, and the walkers
  are drawn clear of the sweeper's walks, so none walks in another however long the clock runs. The fight never takes
  them for targets.
- **A patrol zone's folk** (`zoneFolk.ts`, placed as a social space's people are): no foe holds a hamlet, a farm or a
  mill ([[Bosses Stand Larger, Shields Regrow on More Foes, and Land Hides Plates]]); its layout marks a folk site
  there instead ([[Layouts]]), and Overlook's guards and townsfolk go about their own business on the zone's paths
  within it. The paths through each, 8 m and more from its middle, where they meet, are cut into stretches of 24 m
  with 8 m between; the six nearest its middle are walked, each by one person there and back at the townsfolk's
  stroll, stopping a while at each end facing on along the way, looking about, sweeping or carrying. The farthest out
  is a guard of Overlook, an iron helm and chain over the townsfolk's clothes and a sword at the hip, who stops only to
  look out. Each is dressed and laid on the world clock from the site's middle, so every browser and visit has the
  same folk in the same places. The page alone draws them: the room knows nothing of them, they take no blows and the
  fight never takes them for targets, and they keep their rounds while the Tithe raids their hamlet. None is drawn in
  a dungeon or a Breach's run.
- **Over what a player can use** (`overheadMarks`, `marksOver`; [[What a Player Can Use Wears Its Mark Over It]]),
  drawn among the fight's marks, after DFO's marks over the people who do something: over each keeper who deals with
  the player their own mark as their screen shows it, their sign in its brass diamond (the Harbourmaster's an anchor)
  or a faction's emblem in the diamond edged in its Art's colour; over the bounty board in Overlook's hub its gold "!" in the keepers' diamond, over its
  gable (`countersOf`); over Shape on his spot his own; and, as the room's word on the gear names them online,
  over each chapter of the lore lying there for the player a closed book in a brass binding, 0.9 m over where it
  lies ([[Lore]]); over each chest standing for the player a chest, wood under an arched lid banded in iron with a
  brass lock, over its lid, and over each container they may search a glass in a brass rim on a wooden handle, over
  its top ([[Chests and Searchable Containers as Claude Builds Them]]); and, as the room names them online or alone, over each of a patrol's dungeon entrances a door, an arched door of planks banded in iron with a brass ring, 0.2 m
  over its door's lintel and a mark's width out from its face, once the forged props say where its door is. As DFO's, a mark's foot stands 0.2 m over the crown,
  0.32 m across, turned to the eye, never narrower on the screen than 0.017 radians
  either side so a keeper across the plaza still shows one; it bobs 6 cm once a second on a phase of its own, holding
  still under reduced motion, and fades out over the last fifth of its 30 m, the nearest twelve laid (each mark weighed
  once against the twelve kept, `Nearest`, none sorted). A keeper's mark
  is lit while the keeper has something for the player (`keeperLit`;
  [[A Keeper With Something for You Pulses and Is Seen From Everywhere]]): a step of the quest walked asks to speak with them or to buy one of their wares, once the story and the welcome are
  past (`Quests.wants`), or, the Postmaster's sealed letter, letters wait. A lit mark is laid apart (`litMarksSeen`):
  at any distance, every one of them, whole, beating (a fifth wider and back every 1.3 s), farthest first, and drawn
  over the finished picture after the water with no depth (`MarkDraw.drawAbove`), so it is seen from everywhere in the
  space, through walls and crowds; only the weather's fall and the blows' light are laid over it. Never narrower than
  0.017 radians, it keeps its size on the screen however far. It holds still under reduced motion, goes out once the
  player has spoken with the keeper or taken their letters, and is not lit while its keeper is away from the counter. A whole mark
  gives the fight's light layer no light, so a sign's brass never lights its own diamond. Its colours are laid in
  layers as a drop's are, the widest first, each a little nearer the eye, so a mark is a few dozen quads; a fading one
  is laid flat, so no layer shows through another. Where something stands before a mark, a keeper's stall, the Hall's
  walls or a hill, it is drawn through it, faded to 0.45 and laid flat 3 cm nearer the eye than any layer of the mark,
  after the scene and only where the scene stands a thousandth of its distance nearer still (`marksHidden`,
  `MarkDraw.drawHiddenOver`;
  [[A Mark Over What a Player Can Use Is Seen Through Walls]]).
- **On the ground**: each resource node stands as the forge's picture of its island's resource (`nodeCards`,
  [[Sprite Forge]], [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]), every resource at one scale,
  before the place its resource comes from, while the room stands it for the player, and as it looks spent once they
  gathered it, until it returns for them; a place the room stands no node at shows only its dressing. The picture alone marks a
  node: no ring, no beam, no mark over it. Each chest standing for them in a patrol stands as a public event's plain
  chest and its lid, the owner's chest from DFO built in code ([[Pick - Chest]], `foundChestProps`), its front looking
  the way its place faces; one the room says it paid them for swings its lid open to 77 degrees over 0.6 s, its
  Vestige poured out as its mouth opens ([[Gear]], "Drops"), and stands open 4 seconds before it goes, the interface's open sound and the chest's
  clunk heard as an event chest's; one that moves on goes at once (`finds.ts`). Each drop lying for them, online or alone, hovers, a Vestige as its crystal, under its
  rarity's line (`combat/drops.ts`; [[Gear]], "Drops"), taken by walking over it.
- **E** uses what is within reach, shown as Destiny shows it, a keycap and the deed low in the middle of the view
  (`UsePrompt`): at a counter, or within 3 m of Shape while he is here, it opens the keeper's screen in the menu
  ([[Interface]], "The social space's counters"), and at the bounty board its bounties, offered as "The Bounty Board:
  the day’s bounties"; within 2.5 m of a chapter of the lore lying there for the player it reads "Read" and its
  book's name, and asks the room to find it ([[Lore]]); within 2.5 m of a node it reads "Hold to gather" and its
  resource, and held it asks the room to gather it (`GatherHold`): a ring traced round the keycap's edge fills over the
  two seconds with the menus' build-up sound; that is all, no tool and no move of the figure's. A sea island's nodes
  are offered and drawn as a patrol's ([[Islands]]). Within 2.5 m of a chest it reads "Hold to open the chest", within
  1.5 m of a container's sides "Hold to search the" and its kind (crate, cabinet, cupboard, dresser, shelves,
  wardrobe, sarcophagus or tomb, by its model's family), each within 2 m of its foot up or down; held a second, or a
  second and a half, on the same ring and sound, it asks the room to open it, before any other use but a public
  event's chest (`findUse`). The finds are read from the room's word on the gear online or alone, as a public event's
  chests are, so a page playing alone stands, marks and opens them too. Letting go of E before the ring is full asks the room to stop, as does leaving
  or the page losing its focus; a step or a blow stops it there, and a refusal ends it. A node is not offered on
  horseback, nor while its resource is full, and a chest or a container not on horseback. On a patrol or an Elite Dungeon's node within 2.5 m of an entrance's door
  E goes into its dungeon, and in a dungeon within 2.5 m of its exit door it goes out ([[#A dungeon]]). None is offered while a menu is up or
  the player lies dead, past the edge or felled by a foe.

## A dungeon

A patrol's three dungeons and each Elite Dungeon ([[Dungeons]], [[Activities]]) are entered on foot from their
node's entrances, and a sea island's from its door at sea, each through the Game's veil (`footTrips.ts`,
`dungeonTrips`).

- **The entrances.** The patrol's room says where each stands, among the player's gear (`Gear.dungeons`; alone too,
  where the page's room tells nothing else of the gear). Each is drawn among the patrol's drawers as its forged
  entrance model (`EntranceView`), lifted by the height its Daggerfall dungeon block stands it at and turned as an RMB
  block's yaw turns a model, in the island's climate's pictures through the city's own pipelines, so the sun lights
  it and it casts its shadow. Its door is its door quad's middle, turned and lifted, and wears a door's mark over it
  (above, "Over what a player can use").
- **Going in.** Within 2.5 m of a door E offers "Enter" and the dungeon's name, the room module's own `room_dungeon`
  asked with the patrol's id, its name and the entrance's number, or an Elite Dungeon's node's own name. Taken, it
  opens the entrance's card ([[Interface]], "At a dungeon's entrance"), whose Enter, or E again, goes in; before the
  room module is read it goes straight in. A run Find a Company found is gone into by its own name, and only where it
  is one of that entrance's run's at its tier now. The veil says "Entering" the dungeon; the page leaves the node's room and joins the dungeon's. A patrol's dungeon at
  Normal is its one shared room, `node-<patrol id>--dungeon-<number>`. At Elite or Abyss it is a run: the run of a
  company member already in that dungeon at that tier, found in a fresh Roster, or a new one
  (`node-<patrol id>--abyss--dungeon-<number>--run-<instance>`). An Elite Dungeon's entrance opens the week's Elite or
  Abyss Dungeon's run where its node was reached at that tier and it is this week's (`eliteRun`, by what is on at the
  minute), the veil saying "Entering Saltworm Warrens, the Abyss Dungeon of the week"; otherwise the Elite Dungeon's
  run at Normal. Alone, the shared room opens in the page from the patrol's node file with `room_open_dungeon`, and
  any other from its name with `room_open_run`, a patrol's run with the patrol's node file too. The player stands at its way in, facing into its room. A trip in keeps
  the seas of the room the player stands in, and every way out of a dungeon comes out at its room's own seas, so a
  company stays together at its seas: an Elite Dungeon's run at Normal, gone into from Elite seas, comes out at
  Normal, as a member who came in by the Roster does. "Go to them" for a
  member in a dungeon goes into the very room they are in, at their seas, the veil saying "Joining your company at"
  its name. "Go to them" for a member at sea, online, boards their ship: the page joins the sea asking to travel
  aboard it (`?aboard=<username>`), the veil saying "Boarding Ann's ship", and is sent the captain's ship as its own
  ([[Shipyard]], "Limits"). Let off as the captain leaves the sea (`SeaRoom.letOff`), the page says "Your company
  member left the sea." and goes back to the player's own ship, or, keeping none, to Overlook (`getOff`).
- **A sea island's dungeon** is entered by E at its door on the island ([[Islands]], "The door") by its room's name
  (`enterSeaDungeon(room, back)`, `sea-dungeon-<continent>-<style>-<seed>`), shared at Normal: its tier is its sea's,
  and every sea sails at Normal ([[Friendly Ships Fly the Three Houses' Colours, and Travel Keeps the Hostile Clock]]).
  It is laid by its seed and style and named "The <Style> of the Sea", the veil saying "Entering The Caverns of the
  Sea". Leaving it the veil says "Leaving" it and the player goes back to the sea, at their ship. An island standing a
  player at its door would stand them 1.5 m before it along its bearing out, facing that way (`back`, the door's point
  and the bearing out, as a patrol's entrance stands a player out of it). A company member in one is not joined from the
  Roster: "They are across the sea.".
- **On foot inside.** The player is predicted on the dungeon's own ground, as its room judges bodies: the fight's door
  is handed the dungeon's ask (`fighter_dungeon`), which keeps its rock, jambs and pillars as walls a body stays
  0.35 m off and cannot climb, and for a course an Elite Dungeon's Ascents' pads (none in any other); the movement
  door finds the floor at 0 m. The camera keeps short of the
  rock beside each open cell and under the ceiling over it, and the shots stop on the rock. The place's name on the heads-up
  display is the dungeon's, over "Dungeon" and the island's name. Foes are never asked of a dungeon's room.
- **Going out.** Within 2.5 m of the exit door E offers "Leave", and within 2.5 m of the return portal on the end
  room's far wall while it stands open (while the cache does, once the end foe has fallen). Taken, the veil says
  "Leaving" the dungeon, by the way out kept as the player went in: the node's room is joined at the entrance the
  player went in by, online its address with `?entrance=<number>`, alone the node's room opened again in the page and
  joined with `room_join_at`. The player stands 1.5 m before the entrance's door, facing away from it; online the
  room keeps them there once it keeps their character as come out of that dungeon, else it stands them at a spawn.
- **An Elite Dungeon's encounters.** Its seals, its pads and foul floors, the Court's anchors, the Boss's ward, slam
  and Fury and the Reckoning's light are drawn, its banner and compass marks shown and its moments heard as [[Dungeons]]
  says ("Encounters", "In the Game"), from the layout's plan and each snapshot's `encounter`, held with the cache
  (`heardRun`).
- **An Abyss run.** The place line ends with the revives the company has left, from each snapshot ("5 revives left", "1
  revive left", "No revives left"), and with "Darkness zone" while the darkness holds the player (lying in the Court
  while its Boss stands, or no revive left; [[Revives]]). When the room says this player's company fell (`Wiped`,
  `heardRun`), the page takes them out by the way they came in, even with the menu open, the veil saying "Your company
  fell. Leaving" the dungeon: before its entrance, or from a sea island's back to the sea.

**Its scene** (`DungeonScene`) has no land, sky, sea or sun: the dungeon and what stands in it, in one pass over a
near-black, then the blows' arcs, the see-through marks and their light over the picture, and last death's grey, as
the game's scene draws them. Wherever the player goes that is no dungeon, its pictures and the scene's targets are let go. Its floor's mesh is DFO's Forge's for one floor (`dungeonMesh`): each open cell's floor and ceiling; a
wall wherever an open cell meets rock or the grid's edge, a trim band at its foot (0.4 m) and at its head (0.3 m); a
wall from a lower ceiling up to a higher; each doorway's frame, its jambs exactly the boxes a body runs into and a
lintel from 2.8 m up to the frame's height; a square pillar, trimmed, at each of a great room's corners; the exit
door; the return portal, an arch of the end room's trim standing off its wall round a face of its wall darkened, which
while the portal stands open glows bright, breathing and shimmering, and lights the room as a torch does; and the
forged props the dungeon lays, each standing and turned as the city stands a prop. Every surface wears a picture the procedural
textures paint: the brackets and the cache's bands the textures' ironwork (archive 93), the cache's wood the island's
timber; only a flame and the open portal glow in a colour, as the city's braziers do. Its pictures are filed by role as the Forge files them: a room whose number leaves 2 over three wears the
style's second set and any other its main one, as every corridor does; record 0 for a wall (1 in a room whose number
is odd), 2 the floor, 3 the ceiling and 4 the trim, each set turned to the island's climate and painted by the
procedural textures as the city paints its own ([[Procedural Textures]]). Their UVs run in world metres, one picture to
3.2 m. The exit door wears the door picture its entrance's model wears.

- **The light.** The 32 lights that reach nearest the eye each light round them in their kind's own colour and
  reach, a fire's flickering and a glow's breathing, none in step, fading to nothing at their reach, a face turned
  from one catching half: a torch warm to 8 m, a brazier deep orange to 9 m, candles pale to 4.5 m, crystals a
  breathing blue-green to 7 m, a lantern warm to 8 m, a hearth's fire to 9.5 m, the open portal cold, and the torch
  or lantern in the player's left hand at their hand
  ([[Every Light Is Redesigned and Animated, and Each Casts Light]]). A faint light lies everywhere in the mood of the
  style of each cell (`MOODS`): the crypt's cold grey-blue, the halls' grey, the cells' sickly green, the sanctum's pale gold,
  the caverns' teal and the mines' dusty brown, enough that a room past every light still shows its walls. Each
  torch is an iron bracket off its wall, plate, arm and cup, its flame a fire burning out of the cup, flickering with
  its light ([[Dungeons]], "Its flames"); the props and the fixtures are lit by the same light as the walls.
- **The fixtures** (`dungeonFixtures.ts`), each shaped by where it stands: a brazier, an iron bowl on three legs heaped
  with embers under a fire; three to five candles of wax, each with its small fire; five to eight crystals leaning
  out from where they grow, glowing; a lantern of glowing glass in an iron frame on its chain, a small fire behind the
  glass; a hearth's embers and a fire along them.
- **The ceilings** (`dungeonCeilings.ts`): a room's ceiling flat; a barrel vault across its narrower side, rising up to
  1.6 m over its walls; a dome over its middle, up to 2.2 m; or a cave's rough rock a quarter to over a metre over its
  walls, as are the corridors of the caverns. Where two cells' ceilings differ along their edge, the higher one's side
  is closed up to it. A cave's walls bulge in and out by up to 0.22 m between their edges and meet each edge exactly.
- **The looks.** Each cell wears its own look's pictures (`cellLooks`), so a dungeon whose last block lies in the style
  below changes as the player goes down.
- **Names.** The words under the place's name start with the room the player stands in: "The Ossuary · Dungeon ·
  Saltmere".
- **The figures**, the player's, the foes' and their fight's marks and blood, are drawn as on a node, but each figure
  lit by the light where it stands, at its chest's height, in place of the sun.
- **The cache** is the owner's chest from DFO ([[Pick - Chest]]), wood in the island's timber, its hinge and latch the
  textures' ironwork, where the room's `Snapshot.cache` stands it and facing its way, its lid shut, or open to 77
  degrees while it stands open.
- **The chests to find** are the same chest, each where the room stands it for the player ([[Dungeons]], "In the
  Game"), opened as a patrol's is (above).

## The edge

The node's room judges the body against the node's section each tick ([[Reach]]). Past the edge the screen darkens and
"Return to the area" counts down 10 s; back inside, it ends. At 0, or 60 m past, the player dies: "You died", the
pointer is freed, and Respawn is offered after 4 s (or Enter). A dead body lies still while its standing ticks on. A
player killed in the fight falls and lies there the same way, "YOU DIED" over the view counting down to Respawn, until
they press it or an ally revives them ([[Revives]], "On the page"); a respawn stands them where [[Revives]] says. A
Breach's fallen keep its own times and places ([[Breaches]]).

## At sea

`Sea` is the [[Overworld]] in play. The first return puts the ship off Overlook's harbour: out from the city's middle
through its harbour to water 4 m deep, then 600 m on. Later returns find it where it was left, and a ship left docked
sails out from its berth ("Landings").

- **The ship** is the hull the player sails, in its parts' pictures and the dress they laid on it ([[Shipyard]]), the
  Sloop as built until the room says otherwise.
  Like the World Editor's, it rides the swell the sea draws and heels into its turns ([[Sailing]], "Drawn at sea").
  Its sails are set while it is under way and furled at rest, filled by the weather's wind ([[World Map]], [[Weather]]).
  The Overworld is not to scale: the Sloop is drawn 75 m long (four times its length), so one reads from the raised
  view, and every hull the same four times its own, so a Frigate reads larger than a Sloop. Every other player's ship
  is drawn in its own hull and dress, as the sea's snapshot says; one lying parked while its player is ashore (its pace
  0) lies at rest as any ship still does, its sails furled and no way on its footprint. A captain's ship is drawn as the hull the wire carries for it, in its side's colours, and as the
  Sloop until the wire carries one ([[Sailing]], "Its look"); in a fight and in a fleet room too, each read through
  `hullOfCaptain` (at sea and in a fleet its `hull`, in a fight's view its `hull_kind`). Every hull's model and its
  shell tags are made ready behind the sea's veil (`SeaHull.warm`), so the first of each seen holds no frame. At the
  helm every
  ship is its true size ([[Held Map]]).
- **Its size coming in** (`shownScale`). Every view near the ship (close in, the helm's, Manage's, the walk's and a fight's)
  is laid on it at its true size, and the view eases down to it from the sea's. On the way the ship's share of the picture
  eases from the size the sea's view shows it to its true size on the view near it, by the same ratio each step of
  the way, and every ship is drawn at the scale that gives, never under its true size. So as the eye comes down to sea
  level it grows steadily and never shrinks or jumps: with the camera at its lowest, looking 30 degrees down, the Sloop
  grows from 141 to 383 pixels long on a 720-pixel picture. Every hull
  grows so, whatever size the sea's view draws it at, while its true size at the closest shows it at least as large
  as the sea's view did. A view near the ship that shows it smaller at its true size (Manage with its wheel taken out) is
  eased down to instead. On each view near the ship every ship is its true size, its pose on the swell, its footprint on the
  water and everyone aboard with it.
- **Two views** ([[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]). The Oversea view is DFO's raised camera over the ship (`stepCamera`):
  drag to orbit, the wheel to zoom it between its lowest and highest, the arrow keys to turn. The ship first lies
  facing the island, and the view looks 30 degrees down, so the island stands in it. The Sealevel view
  (`seaClose.ts`) brings the eye down along the camera's own look to 25 m from the point 4.5 m over its waterline that
  the World Editor looks at, every ship drawn as its size coming in has it, from whatever height the Oversea view
  stood at. V (the pad's left) or the console's switch moves between them, eased over about a second; the wheel never
  does, and at sea level it changes nothing. Docking switches to the Oversea view ("Landings"), and going ashore the
  view eases back up as it flies off. Clicks and marks
  are taken on the picture as shown.
- **The pace follows the view** (`easedPace`). In the Oversea view a voyage sails at the pace it was set at: ×200
  planned on the held map, ×60 set by a click (`PLANNED_PACE`, `CLICK_PACE`). Once the view comes down to sea level,
  and at the helm, in Manage and walking the deck, the pace the ship is sailed at eases down the sea room's ladder, 200,
  100, 60, 40, 30, 20, 10 and 5, to 1, the world's own time, a step each 0.15 s, so it sails at its true speed, 12 m/s,
  while watched close; as the view rises it eases back up to the voyage's pace the same way. The voyage's pace itself is
  not changed, and its time left is read at it. Each step goes to the sea room with the ship's
  course; the room takes one course each half second, so it sails the ship at the latest step it has, and the game sails
  the ship at the room's pace until it takes the next. Once the room's word on the ship comes and its pace is not the one the ship is
  sailed at, a step it refused, the game asks it again with the ship's course, until the two agree (`paceToAskAgain`); a
  slower word with a hostile ship within 2.75 km is the room holding the ship, not a refusal. While the pace is eased, and
  the room sails the ship at it, the voyage's line adds "Sailing at true speed while you watch close."
- **Sailing.** In the Oversea view a click on the sea plans a route round the land (`planSeaRoute`): on the open
  landmass's 2 km mask when both ends lie in its window, else on the whole frame's, and sails it at ×60. A destination
  set on the held map sails at ×200. There is no pace to choose. At sea level a click on the sea sets no course: the
  helm's keys sail there. A click on the land, a port's icon or a sea island asks first ("Landings", below). A
  route that cannot be planned says why; resumed, a voyage sails at the pace it was set at.
- **The chase** (`seaChase.ts`). A click on a sighted hostile ship's mark, or Enter while its mark is chosen, sets
  the course to intercept it: where the ship meets the hostile ship at their ways (its rank's way and a ship's 12 m/s, both on
  the voyage's clock), planned round the land as any route, again each half second. The voyage's line says "Chasing
  the Tithe Brig." until it is met, lost from sight, or another course is set (a click, the helm's keys, Stop or
  Resume, going ashore). Its way is the one the room sends with it (`Hostile.way`). The room is told whom the ship
  chases: within 750 m of the hostile ship the fight begins, whatever its temper. Evading is turning away from a bold ship, sighted
  ahead on the ship's course where the bold ship can meet it: held, the course meets the bold ship; turned away, the ship outruns it.
- **The helm's keys**, as in a fight (`passage.ts`, `seaHelm.ts`), in the Sealevel view alone; in the Oversea view they
  do nothing, the click sailing there:
  - A and D turn the ship at the helm's 10 degrees a second. Under way it takes a course straight on along its new
    heading; at rest it turns where it lies, and the room turns it too ([[Server]], "The sea").
  - W sets the ship sailing straight on, at ×60 eased down to its true speed while watched. That course reaches up to 20 km, stops 500 m short of the first coast that way, and
    is set again once under 5 km of it is left. Where a coast stops it short, or less than 200 m lies clear, the ship comes
    to rest facing the coast, and the voyage's line says "Land lies ahead."
  - S heaves the ship to, as Stop does.
  - Shift gives no burst at sea: only a fight's helm has one ([[Naval Combat]], "How it works").
  - Straight on, the voyage's line says "Sailing straight on"; resumed, the ship sails on straight along its heading.
- **The ship's console** (`shipConsole.ts`, `seaScreen.ts`; [[The Sea Is Navigated From the Helm With the Held Map]],
  [[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]), a window of the [[Interface]] at the foot of the screen while the ship is the player's
  to sail. Its head names the ship (its own name, else its class) beside its class, over the switch between the
  Oversea and the Sealevel views (V). Under it: a compass, north up, its brass needle the ship's heading and a pale
  arrow the way the wind blows, with the heading in degrees and the wind ("Wind 6 m/s from the ENE", or "Calm");
  the voyage (under way, hove to or at anchor; its pace, and while eased "×1 (×200 set) · true speed while watched",
  or held near a hostile ship the room's; its speed in m/s at it; where it is bound when it makes for a landing; a bar
  of the way sailed; its line); and the ship
  (hull, canvas and crew as bars of whole, and the water it is in). Its foot holds the view's own presses: in the
  Oversea view Plan a voyage (Map, N), which takes the view down to the helm and raises the [[Held Map]], and Stop or
  Resume voyage (Space); at sea level Sail on (W), Heave to (S), Manage (B) and Leave the helm (H)
  ([[The Ship Is Managed and Walked From the Sea's Panel]]), whose keys act at sea level alone, as the console offers
  them. Narrower than 840 pixels the ship stands under the
  compass and the voyage, its bars side by side. It goes at the helm, aboard, in a fight and on a travel. A stopped voyage keeps its destination: resuming
  plans the way there again from wherever the ship lies, after going ashore and coming back too. A destination
  anywhere at sea, in the ship's own water or another, asks whether to travel there, and yes travels there as the
  picture fades out and in: the flow stays at
  sea throughout, its keys held until the ship has arrived ([[Sailing]], "Travel by the held map").
- **Manage** pans the view down over 1.4 s to the ship at its true size, from its starboard quarter 39 m off,
  looking 0.5 radians down at its middle; a drag turns the view round it, the wheel brings it from 18 m to 78 m. The player
  stands at its wheel, its stand-in hands go about its deck, and a panel of the [[Interface]] shows it: its hull
  and canvas whole (the naval rules' build, read through the room's own module), its guns a side and their loads,
  its length, beam and draught, and its men where it has a crew; and its heading, pace and voyage. B, or the panel's
  Back to the sea, pans back up.
- **Leave the helm** pans the view down to the player behind the ship's wheel, walking its deck as on foot (the same
  controls, first or third person), the sea room the authority on every step ([[Server]], "The sea"). Under way its
  helmsman stands at the wheel and it sails on; at rest the player simply leaves it. At its wheel the offer Take the
  helm (E) takes it again, and once the room agrees the view pans back up. A fight that begins calls the player
  straight back to the helm.
- **Boarding** ([[Naval Combat]], "The fight on a struck deck, on the page"). In a fight, a captain who struck alongside
  (within 30 m, both under 2 m/s) is boarded with E. Once the sea room has the player on the captain's deck the view is theirs
  on foot there, as on land, among the captain's crew and beside every other boarder, the deck riding the captain's ship on the swell; the
  place line names the ship, and once its crew has fallen it shows its minute's seconds left and its hold's take. E, or the
  minute's end, brings the view back to the fight at the player's own helm; beaten aboard, they wash up.
- **Its hands.** Three figures stand in for the ship's hands ([[Crew]]): a human, a felid and a human in plain dress, each walking
  between spots on the Sloop's deck at 1.3 m/s and standing at each 2 to 7 s, on a leg the deck leaves clear and away from
  its wheel; seeded, so they walk the same however the frames fall.
- **Seen from any view** ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Its hands always go
  about its deck. The player stands at its wheel, but at the helm, where the eye is theirs. Off the helm the player
  walks its deck, with its helmsman at the wheel under way. In a fight they all stand on it as the fight lies it.
  Each figure stands where its deck lies on the swell, drawn as large as the Sloop is.
- **Every other ship's people** (`shipPeople.ts`, `shipCompany.ts`, `ships/shipCrew.ts`;
  [[Ships Show Their People, and Captains' Gunners Misjudge]]). Every other ship drawn
  carries its people on its deck as the Sloop does, each standing where its deck lies on the swell and drawn as large as
  the ship is: its captain behind its wheel (the spot its hull's export measures), facing its bow, and its hands
  walking and pausing about its deck as the Sloop's do, clear of the wheel. A hull carries its own number of hands:
  the Sloop 3, the Schooner 4, the Brig 5, the Frigate 6. On a Grey Tithe ship the Tithe-Mate stands at the
  wheel in the roster's dress, and on a Grey Tithe Boss's Captain Brannoc Thule; its hands wear the dress of the deck crew its boarders meet ([[Naval Combat]], "Its deck"),
  its lead first unless the lead is at the wheel, then its plain hands in turn. Everyone aboard keeps their weapons
  sheathed. Another player's ship and a friendly ship, the room's too, carry a plain master and plain hands, as the player's own
  stand-ins look; seen from land, the friendly ships passing carry theirs too. A figure is drawn only while it would
  stand 4 pixels tall or more on the picture (`figureReach`): about 250 m off on a 720-pixel picture through the sea's
  field, as many times farther as its ship is drawn larger. The nearest are drawn first, 40 at most a frame across
  every other ship. In a fight they follow the fight ([[Naval Combat]], "How it looks").
- **No nodes are marked at sea**, nor the Playlist. A port has an icon, over its harbour, with its name and distance,
  once the ship is within 60 km of it, which a click asks to dock at ("Landings"); only a port city's harbour is a port,
  so a ruin's has none (`portOf`). Every hostile ship within
  its own sight of the ship has a mark (`seaHostiles.ts`): its faction's emblem in a ring of its rank's colour, its name
  as its plate gives it (Tithe Brig, Tithe Schooner, ...), its level and its distance, a Miniboss's mark over it. Each
  is held at the picture's edge when off it, its arrow pointing the way; ports too near each other on the picture are
  thinned to the nearest, a hostile ship's mark never.
- **The compass** stands at the top's middle at sea as on foot, turned with the view, the status line under it.
  It marks each hostile ship within its sight of the ship in red, other players' within 900 m in bone, a fight's struck
  captains grey ([[Interface]]). It hides while the held map is up at the helm.
- **The waters.** The game opens the waters once, just after its first frame (`pageWaters.ts`), with the port
  cities from the land files (`portsOf`, which the server reads too); the held map, the friendly ships and the sea all
  read that one opening, the ship's first putting to sea awaiting it. The place's line at sea, at the helm and in
  Manage names
  the water the ship is in, its band and holder ("The Fen Deeps, levels 22-26, Grey Tithe"; "The Lantern Sea, Overlook's
  home waters" within 10 km of its coast, "The Lantern Sea, levels 1-4, Grey Tithe" past it; a ruined city's "The
  Lattice"). A notice (DFO's toast) says for 6 s when the line changes, the ship entering another water or crossing
  the Lantern Sea's 10 km either way ("Entering The Mistwrack, levels 16-19, The Lattice.") and when a hostile ship is first sighted ("A Tithe Brig
  sighted, 12 km off."), the nearest first.
- **The Grey Tithe's ships** sail the sea round the ship from the sea room ([[Naval Combat]], "At sea"), at its
  voyage's pace. As one comes near the voyage eases down, held to ×1 within 700 m of the ship, and the voyage's line says so;
  the game sails its ship at the pace the room sailed it at, drawn to where the room has it. A bold one that comes
  within 750 m meets the ship: the ship heaves to, its voyage kept, and the view pans down to the fight, every ship in it
  easing to its true size as on any view near the ship (above), its plate over it (its faction's emblem, its name over a bar
  of its hull coloured by its rank), then back up when it ends. A bold one that comes on a friendly ship of the traffic
  attacks it, the two drawn at sea where the room has them, the friendly one in its own colours, never as a hostile
  mark; the page draws that ship on its route no more once the room has taken it (its traffic id in the snapshot's
  `taken`). Coming within 750 m of such a fight, or of one with other players in it, joins it the same way, every
  captain in it under their own plate, the friendly one's in the players' blue beside the player's. Afloat after, it
  sails on where the room has it, for its port.
- **The sea's word** (`seaWord.ts`, [[Naval Combat]], "How a fight ends"). Each line stands as a notice (DFO's toast, `plus/notices.ts`)
  for 6 s, several at once: who joins the fight ("Player 4 joined the fight.", "The Tithe Schooner joined the fight.", its hull as the
  room tells it), a captain's colours struck ("The Tithe Brig's colours are down: …"), the boarding ("Boarders away:
  the Tithe Brig's crew stands to meet them."), a piece of what floats gathered that gave nothing ("Gathered a chest:
  nothing you had room for."; what one held goes to the Acquired feed, [[Interface]]), and washing up
  ("Your ship went down: you washed up at Sunspire; your ship lies at its roadstead.", or "Beaten aboard the ship: …").
  Washed up, the fight's view goes back up, the ship lies where the room moored it, and once the landmass of that
  port city is open the player walks into its social space behind the veil, in the same words ("You washed up at
  Sunspire; your ship lies at its roadstead."), standing there as on arriving (`flow.ts`, `wash-up`). Manage's panel
  shows the ship's hull, canvas and men (men only once its build has a crew) as the sea keeps them, its voyage's state under
  "Now", and a Repair part: R asks for its repair, which the panel shows with its seconds left ("Repairing it: 13 s
  left"), "The ship is whole", or where it is had ("Repair: free, lying at rest within 3 km of a port city", the rules' own
  reach from the waters' table; out of the sea, "Repairs are made at sea, by a port city"). The chase's meeting reach
  and the voyage's hold reach come from that table too (`SeaFacts`); it holds every ship's name as well, which the
  page's own names (`shipBars.ts` `shipName`) are tested against. A voyage set at Elite or Abyss sails the one sea,
  `sea`, at Normal, as every voyage does for now; its tier sets the places it lands at. The ship's
  voyage sails at the way its kept canvas leaves it, as the room sails it (`seaLaw.ts` `followed`). Back at sea
  after a session, it lies where the room last kept it.
- **Friendly ships** sail between the three port cities all the time ([[World Map]], "Traffic";
  `friendlyShips.ts`). The game asks the waters' rules where they are at world time, seconds since the Unix epoch by
  the browser's clock (the sea room sends none), four times a second within the sea view's reach of the ship (its far plane),
  and between answers reckons each on along its leg at the pace the waters' table gives (60 m/s); a new answer's gap,
  as at a turn onto its next leg, is closed over about a second. One arrived lies at anchor at its berth off its
  destination's roadstead ([[World Map]], "Berths"), no way on it, until it is gone. A ship the room has taken off its route (the snapshot's `taken`) is
  left out: the sea draws it where the room has it. Of each hull only as many as the ships layer has slots for are drawn,
  16 less the room's own of that hull, the nearest first; only those are rigged, posed and footprinted. Each is drawn
  by the ships layer as its hull in friendly colours, flying the colours of the house it sails for, its sails set and
  filled by the steady wind (furled while it lies at anchor), posed on the swell,
  at the size every ship is drawn: the Overworld's from the raised view and its true size on every view near the player's ship
  (`shownScale`). Its footprint joins the water's with the nearest. The compass marks every one within 900 m in
  Overlook's blue (`#2f5d9a`).
- **Other continents.** Once the ship is nearer another continent's coast than the open one's, within 60 km, that
  landmass opens in the worker, kept, and is drawn and charted in its place.

## Landings

Landing asks first ([[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]];
`landingAsk.ts`, `seaLandings.ts`). A click on a port's icon, or anywhere on its island's land, asks "Dock at
Overlook?"; on a coast with no living port (a ruined city's harbour is no port, `portOf`), "Go ashore on Cairnwatch?";
on one of the sea's islands, its own ground (which a click meets as it meets the land's, `Isles.groundAt`) or the
water within 400 m of its reach, "Go ashore on the cove?", before the open landmass's. L, Enter or the pad's A asks
after what the sea offers where the ship lies. The confirmation stands a little above the middle of the view, clear of
the console, its question in brass and what yes does under it; Enter, the pad's A or its press says yes, Escape, the
pad's B or Cancel no, and a click elsewhere puts it by, as does a fight, the helm, going aboard, a travel or leaving the
sea.

Within 30 km of the open landmass's coast the sea offers a landfall (`landfallOf`): within 20 km of its port's harbour,
to dock there; anywhere else, to go ashore. Yes within reach docks in sight at once, or once nothing else holds the
player (another landmass opening); out of reach the ship makes for the harbour (or the coast nearest the point clicked)
at ×60 and docks in sight once it is within reach, which the console names ("Bound for Overlook's harbour, to dock").
Another course
given meanwhile (a click, W, a chase), a fight, or the player leaving the sea (to join a company member elsewhere, say)
lets the landing go ([[A Ship Docks in Sight, Undocks as Its Player Leaves, and Lies Parked Where Others See It]]);
leaving the sea lets its voyage go with it, so nothing sails on to the berth once the player is back aboard. A stop
keeps the landing with the voyage, to be resumed: a docking resumed sails on through its offing to its berth, as it
set out.

Docking in sight (`docking.ts`, `berths.ts`) is made only from the view over the ship, while nothing else holds the
player: the ship sails at ×60 to its berth (`Sea.sailIn`), planned on water to the berth's offing, on to the offing
itself where the plan ends at the water nearest it, then straight in; lying on that way in already, it sails straight
on in from where it lies. Once it has set sail the view switches to the Oversea view; with no way in it says why on
the voyage's line, and the view stays. At a living port the berth is the first place of its pier (the city's
moorings) with no player's ship within 15 m of it, as the sea shows the ships, come to along the pier from 40 m out
along its bearing; its offing is the port's roadstead (out from the city's middle through its harbour to water 4 m
deep, then 600 m on). Every place taken, or at a port with no pier (Sunspire's and Rimeholt's plans have none), the
ship anchors at the roadstead, or 100 m at a time across the way out from it, either side, where the water is 4 m deep
and no ship lies within 100 m; none of those, 100 m at a time further out along the way out, clear of them. At a
coast with no port the berth is just off the shore nearest the point clicked (or the ship, asked with L): straight out
from the shore, where the water is first 4 m deep and 50 m clear of the room's coast, its offing 600 m on. At a sea
island it is the island's anchorage, or the first place abreast of it, 15 m at a time either side across its way in,
that no ship lies within 7.5 m of (the fifth still within the 30 m the sea lands a player from), from its offing as far
across; every place taken, the anchorage. Once the ship lies at rest within 30 m of its berth
and the view has flown up over the island (the landing kept and tried each frame until it does), the landing is made,
and the ship lies docked there.

Leaving undocks it. Back at sea (back aboard, or back to the sea from the island's tiles), once the room has placed
the ship (its settled word on the ship lying within 2 m of where the page has it, after any `MOORED` word has been
taken) and the player has the helm with nothing else holding them, a ship lying within 30 m of its berth sails out at
×60 straight to the berth's offing (a port's roadstead, 600 m off a coast, a sea island's offing), seen pulling away,
and is the player's to sail from there. A course the player sets first, or the room placing the ship away from its
berth, leaves it as it is; either way it is docked no more.

Landing flies the view up over the island the ship lies docked off (`sideNodes`, `frameSide`, `flyRig`), over 2.5 s,
framed on the nodes of its side, the city's social space among them when docking. No node is marked on the map: the island's tiles hold them ([[Interface]], "The island's tiles",
`islandPanel.ts`, `islandWords.ts`; [[An Island's Places Stand as Even Tiles in a Grid, and the Playlist's Opens Its Screen]]), even rectangles in a grid with space between them. First the
island's own, with its chart and Back to the sea; docked, the port's snapshot and the Playlist's banner; then every
patrol zone, Elite Dungeon, mission, world boss and outpost of the island; gone ashore, the places alone. A click on a
tile does what it does: a place lands there (the player stands at its first spawn, facing inland from the ship, or at a
social space out from its landmark over the city, as on arriving), choosing its node first; an Elite Dungeon opens its
card to go in from the sea ([[Activities]], "The Elite Dungeons"); the Playlist's opens the Playlist. Tab, the arrows
and the pad's cross walk the tiles, and Enter or the pad's A presses the one they reach; else Enter does what the lit
tile does (the one under the pointer, else the first place's). Escape, the pad's B, or Back to the sea, flies back
down.

A sea island's landing docks in sight at once, from wherever the ship lies: it sails for the island's offing, out on
the bearing it is landed on, planned on water as any route and bent round every island in sight, then in to its
anchorage, which the console names ("Bound for a cove, to go ashore"); the same courses, a fight and leaving the sea
let it go. Anchored there, the player walks ashore on its beach, into its room ([[Islands]], "On the page"). A player washed up on a found island walks ashore there.

## Rooms

The game plays online, on the deployed rooms and accounts, unless its address asks otherwise (`roomAsked`,
`roomsFrom`): `?room=` with a whole address names a server (`?room=ws://127.0.0.1:8787` under `npm run server`), any
other value the deployed rooms; `?offline` plays alone, with no accounts, each room run in the page's own worker, as
the pictures and probes of the [[Toolkit]] do.

- **On foot** the player joins the node's room, `node-<node id>`, or at a voyage's harder difficulty
  `node-<node id>--elite` or `--abyss` (a social space is one room at any difficulty), and stands at the spawn the room's
  first word puts them at, each joiner at the next of the node's spawns in turn (until it comes, at the first). The
  room judges the edge. Each tick's controls go to it with the fight's buttons and arms, the figure's look, the dress
  when it changed, the gear's asks and a respawn when asked; the player is predicted on the same ground and corrected
  by each snapshot, held still while the room says they are dead. The warning, the count and death are the room's
  word. Every other player in the room is shown where the room last saw them, in their own dress, and every foe where
  it last stood.
  A room whose socket closes, for a deploy or a dropped network, is joined again by itself ([[Server]], "The
  browser's side"): meanwhile the heads-up display says "Reconnecting…" and the player plays on alone, nothing sent;
  joined again, they are a new player there, standing where the room puts them, their dress and session sent again.
  A room that sends the player away is lost: the display says so and they play on alone. A room whose gate shuts
  to the player's character ([[Activities]]) sends them back to their ship, the veil saying why, as "Abyss seas open
  at level 20. Returning to your ship".
  With accounts ([[Accounts]]; the deployed rooms use the deployed accounts, a local server `?accounts=`), the game
  makes the player a guest or keeps their session, and the node's room keeps their character. A page with no session
  (the accounts out of reach, or a local server with no `?accounts=`) is sent away by each room that keeps characters
  five seconds after it joins, as from a shut gate: "Sign in to play online.". Their gear shows in
  the menu ([[Interface]]), I for Character and O for Inventory, and its presses ride their inputs as asks. Played
  alone, the room in the game's worker keeps no gear.
- **A run's room** ([[Activities]]) is its dungeon's room's name and an instance (`runOf`): eight letters or digits
  the page draws at random (`runInstance`). A company member's run of the same dungeon at the same tier is found
  among the places a fresh Roster gives the company's members (`companyPlaces`, `sharedRun`), so a company enters
  one run. The Roster says where a member plays (`placeWords`): a patrol's dungeon with its difficulty, or "Elite
  Dungeon", "Elite Dungeon of the week" or "Abyss Dungeon of the week".
- **At sea** the player joins the `sea` room, their ship put to sea where it lies, turned as it lies; each voyage's
  course and pace go to it, and every other player's ship is drawn where the room moved it. The room's word on the ship
  is taken 60 ticks after its course is sent, a round trip's allowance of a second: until then the game sails it at the
  pace the room last held it to, then draws it to where the room has it. Where the room has it at rest short of its
  voyage's end, a course it would not take, the game heaves it to there. Leaving the helm while a course waits its turn
  sends the course first, then the leave, so the room takes the course from the helm. While the sea room is joined again
  after its socket closed, the game sails the ship alone and shows none of the room's ships, a fight in it over, and the
  voyage's line says "Reconnecting…"; joined again, the player is called to the helm and the ship puts to sea where it
  lies, on its voyage. A sea room that sends the player away is lost: a fight in it is over, its view going back up, and
  they are called to the helm and sail on alone, the voyage's line saying so. A fight the room no longer lists for the
  player (joined again with no frame between) is over the same way. While the room is well, the line says nothing of it
  (`roomWords`). Playing alone, the same sea room runs in the game's worker, so its hostile ships and fights are the same law.

## Drawing

`GameScene` reads the sky over the eye each frame with the lamps lit round it, a torch or lantern in the player's left
hand and its own fires' (`fires`) among them ([[Sky]]), then draws the open landmass in rings round the eye, the
exact ground round the player or the ship, every drawer into the same pass, then the water's sky, haze and surface over all of it ([[Water]]), then
what a drawer draws over the water: on foot, the blows' arcs, then the fight's see-through marks far to near, each
tested by hand against the scene's depth, so the water's sky and its surface near a coast never cover them.

In the pass the city and the layouts' buildings draw first (`coversGround`): they are opaque and pulled nearer than
the ground they stand on ([[Cities]]), so the ground they cover, the costliest pixels of the pass, fails the depth
test before it is shaded; the land, then the plants, the ships and the figures follow, the plants' shades darkening
the ground already drawn.

The fight's solid marks write depth in the pass with the figures. Then the light layer (`LightLayer`): on foot the
marks and arcs give their light, at sea a fight's puffs, which is added over the picture in blocks of 4 of the
scene's pixels ([[Test Ground]], "The attack feel"), under the first person's hands. Its first pass is begun only once
something draws light into it, so on a frame where nothing gives light none of its four passes is made.

**The resolution.** The scene draws at the resolution chosen in Settings ([[Interface]], "Settings"): Auto (the
first), or 100%, 85%, 75%, 67% or 50% of the canvas's pixels each way, and never more pixels than 3840 by 2160
(`sceneSize`), so a 5120 by 2880 canvas draws at 3840 by 2160 even at 100%, its targets about 365 MB with four samples
a pixel. Smaller than the canvas, the scene draws into a picture of its own, stretched over the canvas with each pixel
blended from the four nearest (`Upscale`); the first person's hands and held map, the blur, the drain and the
interface then draw at the canvas's own size, sharp. At the canvas's own size the scene draws straight onto it, with
no picture and no stretch. A dungeon draws the same way.

**Auto** (`AutoScale`) judges the frames 2 s at a time against the display's frame interval: the lowest median
interval of any 2 s so far (the loading veil and the menus show it), held between 360 and 50 frames a second.

| | With the GPU's clock | Without it |
|---|---|---|
| Steps down a tier | The GPU's mean time a frame is over 90% of the interval | The median time between frames is over 125% of it |
| Steps up a tier | 10 s in which that time, grown by the larger tier's pixels, stays under 70% | 10 s in which the frames meet it (within 110%) |

The 2 s after a step are not judged. A step up undone by a step down within 8 s doubles the wait before the next step
up, to 160 s at most, so the tiers never flicker. It never draws below 50%. With the GPU's clock a raise is made only
where it will fit; without it a raise is tried.

**Measuring.** Where the adapter offers timestamps, the GPU device is made with them (`gpu.ts`). The page's address
asks for a readout with `?perf`: the interface draws it in the top left corner, laid out again every 120 frames from
their means. It says the frame's mean and worst time between frames, the script's mean time a frame, the GPU's mean
time a frame and each zone's, heaviest first, and the scene's size and share of the canvas. The zones are the passes
between the scene's marks: shadows, main, depth, water, over water, weather, light, atmosphere, upscale, hands, blur
and drain, and the interface's own; in a dungeon main, over, light, depth, upscale, hands and drain. Each pass begun
on a timed encoder writes the GPU's clock as it begins and ends (`GpuTimer`), at most 64 a frame; a frame's stamps are
read back in one of a ring of three slots once the GPU has done them, never waited for, and a frame that finds all
three out is not timed. Without timestamps the readout says the GPU was not timed and keeps the CPU's times. The GPU
is timed while the readout shows or Auto is chosen; otherwise nothing is.

**The scene's depth copied.** The scene's depth, many samples a pixel, is averaged into one float a pixel for what
reads it after the pass (`DepthCopy`). In the game's scene the water's haze reads it every frame. In a dungeon it is
copied only on a frame that something drawn over the picture, or its light, begins a pass: what reads it is recorded
into a command buffer of its own after the scene's, and the copy goes into the scene's only if that one began a pass.

The game adds the open landmass's drawers each frame (`landDrawers`). Its city is the city layer's `CityView`
([[Cities]]), drawn in its continent's climate once the forged models' tables and the RMB blocks its plan names have
come from the pages' `world/` folder; the blocks are kept for every later city. Its nodes' layouts within 4 km of the eye are drawn by another `CityView`
([[Layouts]], "In the browser"), and each drawn node's section and spawns are its layout's. Its nature is the nature layer's
`NatureView` ([[Nature]]), grown round the eye from the exact ground round the player, off the city's pads and solids
(`cleared`). Ships and figures are drawn into the same pass; the first person's hands over the finished picture. The
land is tinted with its biome's woods past where its trees are drawn, so forests read from the sea.

**The ground's pictures.** The land wears its climate's ground tiles ([[Procedural Textures]], `groundTiles`), painted
off the game's thread by the city's painter: the terrain set's grass on the low ground, its dirt on the highlands and
roads, its stone on bare rock, its winter grass under snow and the desert's sand on beaches. Each class keeps its
biome's colour and takes its tile's grain over it (`groundColour.ts`), a tile to 6.4 m as Daggerfall laid them, read
again 34 m wide and turned so its repeats do not line up, and cast from three sides on cliffs so a face is not
smeared. One class gives way to the next by their grains' heights (each grain's light, as the tiles are painted lit
from above): stones show through the grass first as a slope steepens, bare rock standing a little proud of it, and
snow settles in the hollows before it covers the rises. A grain is mostly its texel's light over its tile's, with
a little of its hue, so a dark tile's thin channels never speckle the ground with colours it does not show. Bare rock
takes its climate's stone's hue at rock's own light (sandstone in a desert, grey on a temperate coast), and the
layouts' rubble is brought to the same colour. The grain fades into the class's colour with distance as the tile's levels average away. Until a tile is
painted, and in the World Editor, the class is its plain colour. The layouts' paths and streets are painted on it
too ([[Layouts]], "In the browser"), in the dirt's and the town paving's grain.

**The middle ground.** Between the exact ground round the player (2 km, every 4 m) and the 1 km land, the scene keeps
the ground sampled every 16 m over 8 km round the player (`keepMiddle`), sampled again once the player moves 1.5 km,
so a patrol area's canyons, cliffs and mesas stand under its great works and rock as far off as they are drawn. It is
eased in from 150 to 400 m inland of the painted coast, so at the shore the land keeps to the 1 km land the water is
drawn from. Arriving waits for it as for the exact ground.

**The sun's shadows.** Before the pass, what casts draws its depth along the sun into two maps (`shadow.ts`), 2048
texels a side each, every square ahead of the camera and snapped to its own texels so the edges hold still:

| Map | Its square | A texel | What casts into it | Drawn |
|---|---|---|---|---|
| Near | 300 m across, centred 75 m ahead | 0.15 m | The city's solids and near models, the near plants, the figures and the ships | Every frame |
| Far | 2.4 km across, centred 900 m ahead | 1.2 m | The city's solids, and each building's masses, or its hull past where the masses are drawn; the ships | When what it would hold changes |

What casts is found by whether, seen along the sun, its box overlaps a square, those behind the camera and far below
the eye too, so the city under the plaza casts; a ship's is a ball about its middle twice as wide as its farthest point,
for its yards braced round and a mast falling, so a ship out of view still throws its shadow into the view. A caster
whose half-diagonal is under two of a map's texels casts nothing into that map: under 0.3 m in the near one, 2.3 m in
the far, where a crate's shadow would be a texel. The land, the city, the
plants, the figures and the ships (the wrecks too) are then lit through both, softened over eight taps, a ship with the
land's light thrown back onto its sides: the near map's sharp shadows hold inside its square and give way to the far
map's toward its rim, and those fade out toward the far square's own, about 2 km ahead. So from the plaza the city below is
shadowed as far as its masses stand. From more than 400 m over the ground, at sea or over an island's side, no
shadows are drawn, nor anywhere with Settings' Shadows off ([[Interface]], "Graphics").

**The far map is kept** from frame to frame (`shadowCache.ts`). Its square stays where it was drawn until where the eye
would set it is 37.5 m off (32 of its texels: a walk of that far, or a turn of some 2.4 degrees), and its sun until the
sun has turned a texel at the square's corner, 0.04 degrees; only the square's rim, where its shadows have faded out,
moves with them. Its casters draw into a pass that draws nothing, which keeps their calls and signs them: every draw
with what it reads, and what no draw shows, where a ship lies and how far an event's prop has risen. The map is drawn
from those calls when the signature or the view changes, and at least once in 60 frames whatever holds still. A still
city costs no far pass; a ship moving in the far square draws it every frame.

**The figures' shadows.** A figure's card casts turned square to the sun about its feet, its clear texels cut away,
the picture kept the way round the eye sees it; it is drawn into the near map only. The card the eye sees is lit
through the maps, each of its points asked of them from past that turned card, so a figure is darkened in another's
shadow or a wall's and never by its own. Its contact shade stays under its feet where its own shadow is drawn, and
past the near square leans the way the sun throws one, standing in for it.

**The figures each frame** (`figureView.ts`, `figureCull.ts`). A figure is drawn only where a sphere about its feet
meets the view: it holds the card however it turns, the shade however far a low sun leans it, and 0.5 m more for a
shake, an outline or a smear; and it grows for a turning eye by three frames of the last frame's turn (at most
1.2 radians) at the figure's distance. It casts into the near map only where that sphere's box may reach the map's
square, as the city's solids are found. Every card's terms go to one buffer each frame, a slot apart, read at its
slot's offset, and each composed picture has one group, made the first time it is drawn and let go with it, so a
figure stepping to its next frame makes nothing. A figure in the world is posed (its frame chosen and its card
asked of the forge) by its distance along the ground from the eye:

| Distance | Posed |
|---|---|
| Within 10 m | every frame |
| To 25 m | every 2nd frame |
| Beyond, or out of the last frame's view | every 3rd frame |

Each figure is posed on frames of its own (its number sets them apart), so a crowd on one cadence spreads over the
frames; its move's clock runs every frame, so the frame shown when it is posed is the one due then. Between, it keeps
the card it showed, unless it is seen in another view or from its other side, when it is posed at once. The player's
own figure, the people aboard ships and the prologue's actors are posed every frame.

At sea the footprints of the player's ship and the 47 ships nearest it (other players', hostile ships, friendly ships
and a fight's captains) are handed to the water at the size each is drawn; it keeps out of each hull and foams round each bow under
way.
Under way the player's ship stirs the water's ripples at its bow and quarters, as the World Editor's does, and the
ripples follow it.
In death the world drains to grey the moment the player dies, one look for every death
([[Bosses Stand Larger, Shields Regrow on More Foes, and Land Hides Plates]]): a fall in a fight, a fall from a height
(which plays out in grey, the camera holding and turning after the body, no key listed until Respawn is offered) or
straying, and the pointer is freed as it begins but for a fall in a fight. It comes back in colour on respawn, a
revive or on leaving: over 1.4 s each way, eased out, grey to 92%, at 72% of its light and 5% more contrast. The scene draws it last into its own
picture, so the interface the game draws over the world keeps its colour. In the same pass the arriving player's view
blinks open: dark for 0.3 s, open to 15% dark by 0.5 s, shut to 90% by 0.6 s, open by 1 s.

## Limits

- A save the game makes as the tab closes is sent from the worker to the page's storage. A closing test page still
  stored it; whether a real tab's close always does is unchecked.
- The samples of a sound the game fills itself are held twice: copied to the page, not moved. A recording is held
  once, on the page, the worker keeping only its shape and how it measures ([[Interface]], "How recordings load").
- A browser that cannot hand its canvas to a worker says so and does not start.

- Until the city's tables and blocks have come, the land shows without its city.
- A voyage is the browser's word; the sea room refuses a course that touches a coast it judges exactly, and the ship
  then rests short of it, the game drawing it where the room has it.
- Only the open landmass is drawn; another continent appears once the ship is within 60 km of its coast.
- The browser predicts nothing of the edge: a warning, a death or a respawn shows as the room's snapshot says it.
- The land is drawn a little off the ground bodies stand on, so the fight's marks and blood are drawn 0.12 m over
  where they lie. A telegraphed blow's mark is flat: on a slope, part of it lies under the land.
- A frame counts for at most 0.1 s, so below 10 frames a second the world runs slower than real time.
- Without the GPU's clock Auto cannot tell frames held back by the script from frames held back by the GPU, so it
  tries each step down: one that leaves the frames no 10% quicker is taken back, and steps down then wait 30 s, twice
  as long after each that did not help, up to 160 s. A browser may round its timestamps: Chrome rounds them to
  0.1 ms unless its WebGPU developer features are on, so a short pass reads 0 or 0.1 ms and only the means hold.
- The people seen aboard another ship are drawn, not the room's: another player's ship shows plain people, not that
  player's own look, and a captain's hands and captain are not its deck crew until it is boarded. Ships lying by an
  island ashore, the pier's sloops and the players' docked and parked ships, carry no one and are drawn in friendly
  colours, not in their players' dress. A captain's ship met at sea is known by its sea number and in its fight by its
  fight's, which the fight's view does not tie together: its hands are laid out afresh as its fight begins and ends,
  each starting from a spot of its own.
- A figure's shadow is its card as the eye sees it, turned to the sun: the outline of the side facing the eye, not
  of the side facing the sun.
- In a dungeon nothing casts a shadow, and a light lights through a wall a room on its other side within its reach.
- Past the far square, about 2 km ahead of the camera, nothing is shadowed; the plants cast into the near square
  only.

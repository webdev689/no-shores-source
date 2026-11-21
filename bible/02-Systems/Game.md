---
type: system
status: live
code:
  - client/index.html
  - client/src/main.ts
  - client/src/game/game.ts#startGame
  - client/src/game/gameBoot.ts#bootGame
  - client/src/game/gameFrame.ts#startFrames
  - client/src/game/pageWaters.ts#watersOnce
  - client/src/game/flow.ts#next
  - client/src/game/foot.ts#Foot
  - client/src/game/footView.ts#FootView
  - client/src/game/swingView.ts#SwingView
  - client/src/combat/attackFeel.ts#AttackFeel
  - client/src/combat/worldSounds.ts#WorldSounds
  - client/src/game/foesAsked.ts#foesAsked
  - client/src/game/footGear.ts#useAt
  - client/src/game/footGear.ts#groundRings
  - client/src/game/plazaLife.ts#PlazaLife
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
  - client/src/shadow.ts#ShadowMap
  - client/src/game/figureView.ts#FigureView
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
  - client/src/game/aboard.ts#Aboard
  - client/src/game/shipPanel.ts#shipPanelOf
  - client/src/game/hints.ts#seaHints
  - client/src/game/hints.ts#footHints
  - client/src/game/rooms.ts#roomsFrom
  - client/src/heldmap/heldMap.ts#HeldMap
---
# Game

The game itself, at the site's root (`/` under `npm run dev`): the world played as the owner decided it after
Destiny 1 ([[Overlook Is a Shared World After Destiny 1]], [[Every Island Is Seen Whole and Reached by Nodes]]). The
player arrives in Overlook, plays on foot in one node at a time, returns to their ship, sails the [[Overworld]]'s sea,
views an island's side from above and lands at another node. Each way between them passes through a veil while the
place loads, as Destiny's orbit does.

## The flow

`flow.ts` holds where the player is: loading behind a veil, on foot in a node, at sea, or over an island's side
choosing a landing; on foot and at sea a menu may be open. It is pure: the page hands it what happened and draws what
it answers. `gameBoot.ts` makes the pieces (the rooms, the modules, the scene, the world and the place arrived at),
`game.ts` keeps the flow, the travel between places and the player's actions, and `gameFrame.ts` draws each frame of
the mode the flow is in, a frame on foot first heeding the activities' word (`startActivities`: a gate that shut, a
company that fell); each mode is its own module.

| From | Happening | To |
|---|---|---|
| Arriving | The ground round the spawn is in | On foot in Overlook's social space |
| On foot | M, then Return to ship | The veil, "Returning to your ship", then at sea |
| On foot, or behind the veil to land | The room's gate shuts to the character | The veil, the gate's reason and "Returning to your ship", then at sea |
| At sea | Enter, L or the offer to dock or go ashore, off a coast | Over the island's side |
| Over the side | A mark clicked, then clicked again or Enter | The veil, "Landing at" the node, then on foot there |
| Over the side | Escape | At sea |
| On foot in a patrol | E at an entrance's door, offered as "Enter" and the dungeon's name | The veil, "Entering" the dungeon, then on foot at its way in |
| In a dungeon | E at its exit door, offered as "Leave" | The veil, "Leaving" the dungeon, then before its entrance's door, facing out |
| On foot | E in a gate's basin, or at an instance's way in | The veil, "Entering" the instance or "Returning to" the patrol area, then on foot at the other's way in or gate ([[Layouts]], "Gates") |

A locked node ([[World Map]], "Seen whole, reached by nodes") is never landed at or entered: its mark and its gate
only say it is locked.

The veil lifts once the place is ready and the exact ground round the player has come, or after 20 s of wall time.
A way that fails stays on the veil, saying why, and Enter tries it again.

## Arriving

The page reads the world (`loadWorld`: the layout and every continent's edits file) and opens Saltmere, continent 1,
in the [[Land]]'s worker, kept, with the RMB index's blocks, so its city is settled on it as the bake settles it
([[Cities]]). Overlook's plan comes from that worker; its social space is the node `overlook-social`, the plaza beside
the Beacon. The player stands at its first spawn, 4 m inside the seaward parapet, facing out from the landmark and
looking 17° down over the parapet onto the city, the harbour and the sea. Arriving from the story played through, the
stranger's last moment plays there once the veil has fallen ([[Prologue]]); leaving the node ends it.

With `?at=<node id>` in the address the player arrives at that node instead, on its continent (a city's social space
is `<city id>-social`): a way to look round the world. An id the world does not hold arrives at Overlook, and so
does a social space still locked: only Overlook's opens for now ([[Cities]], "Open and locked"), so a ruined city's is
never arrived at. Should one open, it is named "Ruins of" and the city's name ([[Cities]], "Ruins"), on the veil too
(the page waits for the rules' module to say which cities are ports, `mainPortsOf`), and on foot the line under its
name says "Ruins" (`placeWords`). With
`&spawn=<east>,<south>[,<bearing in degrees>]` too, the player stands at that point instead of the node's spawn,
offline: a way to look at one place.

## On foot

`Foot` stands the player in one node, as the [[Player]] plays on the [[Test Ground]]: DFO's controls, first and
third person, the forge's figure and the first person's hands, and the Test Ground's fight.

- **Friendly ships from land.** At any node every friendly ship within 15 km of the eye is drawn on the sea at its
  true size, sails set and filled, posed on the swell, its footprint on the water, as at sea (below); so ships coming
  and going are seen from each port's plaza and harbour. They are lit as the ships layer lights every ship, by its
  own sun, and cast no shadow.
- **The ground.** The node's window of the land, over its ring's bounds and 100 m past them, and its city's boxes
  there, cut by the land's worker and handed to the movement door and the fight's rules, the same ground to the bit
  as the node's room ([[Movement]], [[Server]]). The scene draws the exact ground round the player, sampled every 4 m.
- **The camera** is the player's ([[Player]]), its boom kept clear of the node's boxes and its ground, and held
  0.3 m over the ground, with the Test Ground's 50-degree view. The player's own Anima pushes it in as it is
  released, with a frame of its element round the screen ([[Arts]]).
- **The world goes on.** The body is stepped every frame, with the pointer locked or not; while a menu is open,
  with nothing pressed. Click the view to look round with the mouse.
- **The room.** The node's room is the authority, always. Alone, the room crate runs in the page, ticked by its clock,
  on a node file made from the same window and boxes, as the sea's does ([[Server]]); online, the server's.
- **The fight.** The player fights as on the Test Ground, by its keys and its modules ([[Combat]]): Z readies the
  weapon, 1 draws the Melee loadout and 2 the Ranged, the right button swings or aims, the left button or F guards,
  parries or fires, V or Mouse5 dodges, R, Q and G cast the worn Art's spells ([[Arts]]), and the soft lock holds a
  foe. The fighter is predicted by the room's own rules on the node's land, and the room's word is
  taken. Shots stop on that land, and the aimed shot's crosshair and the player's own arrows meet it. The key strip
  shows the fight's keys and the body's beyond walking, the Arts' (R Anima, Q and G Tenets) only while an Art is worn,
  and how to aim Dusk Daggers only while Shadow is. Every key hint, on foot and at sea, is a key on its keycap and
  its action, with no colon. Where the HUD is wide and not doubled (1500 by 900 and up, under 2400 by 1300), its keys
  stand at 22 px, at the bottom right ([[Interface]]), and the place line's small words under its name at 16 px (20
  px over the held map).
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
- **A struck figure.** Drawn only, never the rules' body. A foe a blow harms flashes in held frames: its whole figure
  white for two, its outline white for two, then its outline for one in the blow's element's light (steel `#cfe0ff` for
  a plain blow), then nothing; the player's own outline flashes red for four, after two whole frames only for a blow of
  more than a quarter of their health. A foe struck slides along the blow, away from its striker, in whole pixels: 0.12
  m for a hit, 0.35 m for a stagger, out over 6 frames and back over 10 to where the room has it; 0.6 m for a kill,
  which stays. A stagger shakes the figure a pixel either way for its first 6 frames, reels it through its hurt frames
  forth and back every 0.4 s (a flinch plays them once), and circles three gold stars round its head in eighth-turns,
  once a second; a Charge's stagger holds it still. A foe slain dissolves once its fall is over: plain, it greys and
  crumbles from the head down in 2 by 2 cells over 0.6 s, white at the break; a death in an element (the player's own in
  their weapon's glow as their page shows it, any other as the room tells it) dissolves at once in it (Blaze burning up
  from the feet, Volt blinking out in 4 by 4 cells, Cosmic drawn in to the chest in four steps), its finisher round it.
  A crit's flash keeps its two white frames, then its outline is gold for four. The statuses show on the figures as in
  [[Arts]], and the weapon's glow surges ([[Weapon Glow]]).
- **Sounds.** The world sounds on foot ([[Interface]], "World sounds"): the fight's blows, shots, steps and spells,
  the drops landing and the player standing again, each where it happens, through the World volume once the first
  press or key has woken the interface's sound. A cue not yet picked is silent; nothing new plays while a menu is open.
- **Foes to try.** Under `npm run dev` only, `?spawn=` asks the room played alone for foes as the player lands: types
  by their numbers, each with a rank after a colon (`?spawn=2:2,4,12`). A server's node room takes no such ask.
- **A social space's people** (`PlazaLife`): its keepers stand behind their counters and its townsfolk walk the
  plaza, seeded by the plaza so they walk the same each visit, online or not; to a counter and back along the
  landward lane, clear of the portico's steps, each in a step of its own, never a crowd in step, the walk's frames at
  the pace they stroll. The floor under each is found again only once they have walked a step. The fight never takes
  them for targets.
- **On the ground** (`footGear`), drawn among the fight's marks: a brass ring at each counter that deals with the
  player, the bounty board's before its face among them (`countersOf`); and at each resource node they may still gather, a sea-green ring under a beam 40 m tall, seen across the
  patrol, so a route can be planned through them. Each drop lying for them stands as its own picture under its
  rarity's line (`combat/drops.ts`; [[Gear]], "Drops"), taken by walking over it.
- **E** uses what is within reach, shown as Destiny shows it, a keycap and the deed low in the middle of the view
  (`UsePrompt`): at a counter, or within 3 m of Shape while he is here, it opens the keeper's screen in the menu
  ([[Interface]], "The social space's counters"), and at the bounty board its bounties, offered as "The Bounty Board:
  bounties for XP and Aurem"; within 2.5 m of a node it asks the room to gather it; on a patrol within 2.5 m of an
  entrance's door it goes into its dungeon, and in a dungeon within 2.5 m of its exit door it goes out
  ([[#A dungeon]]). None is offered while a menu is up or the player lies dead, past the edge or felled by a foe.

## A dungeon

A patrol's three dungeons and each Elite Dungeon ([[Dungeons]], [[Activities]]) are entered on foot from their
node's entrances, and a sea island's from its door at sea, each through the Game's veil (`footTrips.ts`,
`dungeonTrips`).

- **The entrances.** The patrol's room says where each stands, among the player's gear (`Gear.dungeons`; alone too,
  where the page's room tells nothing else of the gear). Each is drawn among the patrol's drawers as its forged
  entrance model (`EntranceView`), lifted by the height its Daggerfall dungeon block stands it at and turned as an RMB
  block's yaw turns a model, in the island's climate's pictures through the city's own pipelines, so the sun lights
  it and it casts its shadow. Its door is its door quad's middle, turned and lifted.
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
  its name.
- **A sea island's dungeon** is entered by E at its door on the island ([[Islands]], "The door") by its room's name
  (`enterSeaDungeon(room, back)`, `sea-dungeon-<continent>-<style>-<seed>`, with `--elite` or `--abyss` after it for
  its tier), shared at Normal and a run above it. It is laid by its seed and style and named "The <Style> of the
  Sea", the veil saying "Entering The Caverns of the Sea". Leaving it the veil says "Leaving" it and the player goes
  back to the sea, at their ship. An island standing a player at its door would stand them 1.5 m before it
  along its bearing out, facing that way (`back`, the door's point and the bearing out, as a patrol's entrance
  stands a player out of it). A company member in one is not joined from the Roster: "They are across the sea.".
- **On foot inside.** The player is predicted on the dungeon's own ground, as its room judges bodies: the fight's door
  is handed the dungeon's ask (`fighter_dungeon`), which keeps its rock, jambs and pillars as walls a body stays
  0.35 m off and cannot climb, with no course; the movement door finds the floor at 0 m. The camera keeps short of the
  rock beside each open cell and under the ceiling over it, and the shots stop on the rock. The place's name on the heads-up
  display is the dungeon's, over "Dungeon" and the island's name. Foes are never asked of a dungeon's room.
- **Going out.** Within 2.5 m of the exit door E offers "Leave", and within 2.5 m of the return portal on the end
  room's far wall while it stands open (while the cache does, once the end foe has fallen). Taken, the veil says
  "Leaving" the dungeon, by the way out kept as the player went in: the node's room is joined at the entrance the
  player went in by, online its address with `?entrance=<number>`, alone the node's room opened again in the page and
  joined with `room_join_at`. The player stands 1.5 m before the entrance's door, facing away from it.
- **An Abyss run.** The place line ends with the revives the company has left, from each snapshot ("5 revives
  left", "1 revive left", "No revives left"). When the room says this player's company fell (`Wiped`, `heardRun`),
  the page takes them out by the way they came in, even with the menu open, the veil saying "Your company fell.
  Leaving" the dungeon: before its entrance, or from a sea island's back to the sea.

**Its scene** (`DungeonScene`) has no land, sky, sea or sun: the dungeon and what stands in it, in one pass over a
near-black, then the blows' arcs, the see-through marks and their light over the picture, as the game's scene draws
them. Wherever the player goes that is no dungeon, its pictures and the scene's targets are let go. Its floor's mesh is DFO's Forge's for one floor (`dungeonMesh`): each open cell's floor and ceiling; a
wall wherever an open cell meets rock or the grid's edge, a trim band at its foot (0.4 m) and at its head (0.3 m); a
wall from a lower ceiling up to a higher; each doorway's frame, its jambs exactly the boxes a body runs into and a
lintel from 2.8 m up to the frame's height; a square pillar, trimmed, at each of a great room's corners; the exit
door; the return portal, an arch of the end room's trim standing off its wall round a face of its wall darkened, which
while the portal stands open glows bright and shimmering and lights the room as a torch does; and the forged props the
dungeon lays, each standing and turned as the city stands a prop. Every surface wears a picture the procedural
textures paint: the brackets and the cache's bands the textures' ironwork (archive 93), the cache's wood the island's
timber; only a flame and the open portal glow in a colour, as the city's braziers do. Its pictures are filed by role as the Forge files them: a room whose number leaves 2 over three wears the
style's second set and any other its main one, as every corridor does; record 0 for a wall (1 in a room whose number
is odd), 2 the floor, 3 the ceiling and 4 the trim, each set turned to the island's climate and painted by the
procedural textures as the city paints its own ([[Procedural Textures]]). Their UVs run in world metres, one picture to
3.2 m. The exit door wears the door picture its entrance's model wears.

- **The light.** The 32 lights that reach nearest the eye each light round them in their kind's own colour, reach
  and flicker, none in step, fading to nothing at their reach, a face turned from one catching half: a torch warm to
  8 m, a brazier deep orange to 9 m, candles pale to 4.5 m, crystals a steady blue-green to 7 m, a lantern warm to
  8 m, a hearth's fire to 9.5 m, and the open portal cold. A faint light lies everywhere in the mood of the style of
  each cell (`MOODS`): the crypt's cold grey-blue, the halls' grey, the cells' sickly green, the sanctum's pale gold,
  the caverns' teal and the mines' dusty brown, enough that a room past every light still shows its walls. Each
  torch is an iron bracket off its wall, plate, arm and cup, under a flame that glows as the city's braziers glow;
  the props and the fixtures are lit by the same light as the walls.
- **The fixtures** (`dungeonFixtures.ts`), each shaped by where it stands: a brazier, an iron bowl on three legs heaped
  with embers under flames; three to five candles of wax, each with its small flame; five to eight crystals leaning
  out from where they grow, glowing; a lantern of glowing glass in an iron frame on its chain; a hearth's embers and
  flames.
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
- **The cache** is a chest of boxes, wood in the island's timber and bands of the textures' ironwork, where the room's
  `Snapshot.cache` stands it and facing its way, its lid shut, or thrown back while it stands open.

## The edge

The node's room judges the body against the node's section each tick ([[Reach]]). Past the edge the screen darkens and
"Return to the area" counts down 10 s; back inside, it ends. At 0, or 60 m past, the player dies: "You died", the
pointer is freed, and Respawn is offered after 4 s (or Enter). The player comes back at the section's spawn nearest
where they fell. A dead body lies still while its standing ticks on. A player killed in the fight falls, the fight's
display counts down 4 s, and the room stands them again at the section's spawn nearest where they fell.

## At sea

`Sea` is the [[Overworld]] in play. The first return puts the ship off Overlook's harbour: out from the city's middle
through its harbour to water 4 m deep, then 600 m on. Later returns find it where it was left.

- **The ship** is the owner's Sloop ([[Sailing]]), in its parts' pictures, flying Overlook's blue at its masthead.
  Like the World Editor's, it rides the swell the sea draws and heels into its turns ([[Sailing]], "Drawn at sea").
  Its sails are set while it is under way and furled at rest, filled by the weather's wind ([[World Map]], [[Weather]]).
  The Overworld is not to scale: the Sloop is drawn 75 m long (four times its length), so one reads from the raised
  view, and every hull the same four times its own, so a Frigate reads larger than a Sloop. Every other player's ship
  is the Sloop too. A captain's ship is drawn as the hull the wire carries for it, in its side's colours, and as the
  Sloop until the wire carries one ([[Sailing]], "Its look"); in a fight and in a fleet room too, each read through
  `hullOfCaptain` (at sea and in a fleet its `hull`, in a fight's view its `hull_kind`). Every hull's model and its
  shell tags are made ready behind the sea's veil (`SeaHull.warm`), so the first of each seen holds no frame. At the
  helm every
  ship is its true size ([[Held Map]]).
- **Its size coming in** (`shownScale`). Every view near the ship (close in, the helm's, Manage's, the walk's and a fight's)
  is laid on it at its true size, and the view eases down to it from the sea's. On the way the ship's share of the picture
  eases from the size the sea's view shows it to its true size on the view near it, by the same ratio each step of
  the way, and every ship is drawn at the scale that gives, never under its true size. So as the eye comes in it grows
  a steady step each notch and never shrinks or jumps: with the camera at its lowest, looking 30 degrees down, the Sloop
  grows from 141 to 157, 201, 270, 346 and 383 pixels long on a 720-pixel picture over the five notches in. Every hull
  grows so, whatever size the sea's view draws it at, while its true size at the closest shows it at least as large
  as the sea's view did. A view near the ship that shows it smaller at its true size (Manage with its wheel taken out) is
  eased down to instead. On each view near the ship every ship is its true size, its pose on the swell, its footprint on the
  water and everyone aboard with it.
- **The camera** is DFO's raised one over the ship (`stepCamera`): drag to orbit, the wheel to zoom, the arrow keys
  to turn. The ship first lies facing the island, and the view looks 30 degrees down, so the island stands in it.
- **Close in** (`seaClose.ts`, [[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Past the camera's
  lowest the wheel keeps coming in, a fifth of the way a notch. The eye comes down along the camera's own look to
  25 m from the point 4.5 m over its waterline that the World Editor looks at, every ship drawn as its size coming in
  has it. Out goes back from close first; going ashore, it eases out as the view flies off. Clicks and marks are taken
  on the picture as shown.
- **The pace follows the view** (`easedPace`). From the raised view a voyage sails at the dial's pace. Once the eye
  comes in past the camera's lowest, and at the helm, in Manage and walking the deck, the pace the ship is sailed at eases
  down DFO's ladder, the dial's step, then 60, 40, 30, 20, 10 and 5, to 1, the world's own time, a step each 0.15 s, so
  it sails at its true speed, 12 m/s, while watched close; as the view rises it eases back up to the dial the same way.
  The dial itself is not changed, and the voyage's time left is read at it. Each step goes to the sea room with the ship's
  course; the room takes one course each half second, so it sails the ship at the latest step it has, and the page sails
  the ship at the room's pace until it takes the next. Once the room's word on the ship comes and its pace is not the one the ship is
  sailed at, a step it refused, the page asks it again with the ship's course, until the two agree (`paceToAskAgain`); a
  slower word with a hostile ship within 1.7 km is the room holding the ship, not a refusal. While the pace is eased, and
  the room sails the ship at it, the voyage's line adds "Sailing at true speed while you watch close."
- **Sailing.** A click on the sea or the land plans a route round the land (`planSeaRoute`): on the open landmass's
  2 km mask when both ends lie in its window, else on the whole frame's. The ship sails it at the pace dial's step,
  `[` and `]` or the panel's buttons, ×60 to start. A click on the port's icon sails for it. A route that cannot be
  planned says why.
- **The chase** (`seaChase.ts`). A click on a sighted hostile ship's mark, or Enter while its mark is chosen, sets
  the course to intercept it: where the ship meets the hostile ship at their ways (its rank's way and a ship's 12 m/s, both on
  the voyage's clock), planned round the land as any route, again each half second. The voyage's line says "Chasing
  the Tithe Brig." until it is met, lost from sight, or another course is set (a click, the helm's keys, Stop or
  Resume, going ashore). Its way is the one the room sends with it (`Pirate.way`). The room is told whom the ship
  chases: within 750 m of the hostile ship the fight begins, whatever its temper. Evading is turning away from a bold ship, sighted
  ahead on the ship's course where the bold ship can meet it: held, the course meets the bold ship; turned away, the ship outruns it.
- **The helm's keys**, as in a fight (`passage.ts`, `seaHelm.ts`), in the sea's own view, close in or not:
  - A and D turn the ship at the helm's 10 degrees a second. Under way it takes a course straight on along its new
    heading; at rest it turns where it lies, and the room turns it too ([[Server]], "The sea").
  - W sets the ship sailing straight on. That course reaches up to 20 km, stops 500 m short of the first coast that way, and
    is set again once under 5 km of it is left. Where a coast stops it short, or less than 200 m lies clear, the ship comes
    to rest facing the coast, and the voyage's line says "Land lies ahead."
  - S heaves the ship to, as Stop does.
  - Straight on, the voyage's line says "Sailing straight on"; resumed, the ship sails on straight along its heading.
- **The navigation panel** ([[The Sea Is Navigated From the Helm With the Held Map]]), a window of the [[Interface]]
  at the foot of the screen in three groups, Navigation, Pace and Ship, holds Map (N), which takes the
  view down to the helm and raises the [[Held Map]], where a destination is set; Stop while under way and Resume
  voyage once stopped short (both Space); the pace dial; and Manage (B) and Leave the helm (H)
  ([[The Ship Is Managed and Walked From the Sea's Panel]]). A stopped voyage keeps its destination: resuming
  plans the way there again from wherever the ship lies, after going ashore and coming back too.
- **Manage** pans the view down over 1.4 s to the Sloop at its true size, from its starboard quarter 39 m off,
  looking 0.5 radians down at its middle; a drag turns the view round it, the wheel brings it from 18 m to 78 m. The player
  stands at its wheel, three stand-in hands go about its deck, and a panel of the [[Interface]] shows it: its hull
  and canvas whole (the naval rules' build, read through the room's own module), its guns a side and their loads,
  its length, beam and draught; its heading, pace and voyage; and Cargo and Crew, marked Later. B, or the panel's
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
- **Its hands.** Stand-ins until crew management comes: a human, a felid and a human in plain dress, each walking
  between spots on the Sloop's deck at 1.3 m/s and standing at each 2 to 7 s, on a leg the deck leaves clear and away from
  its wheel; seeded, so they walk the same however the frames fall.
- **Seen from any view** ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Its hands always go
  about its deck. The player stands at its wheel, but at the helm, where the eye is theirs. Off the helm the player
  walks its deck, with its helmsman at the wheel under way. In a fight they all stand on it as the fight lies it.
  Each figure stands where its deck lies on the swell, drawn as large as the Sloop is.
- **No nodes are marked at sea.** A port has an icon, over its harbour, with its name and distance, once the ship is
  within 60 km of it; only a port city's harbour is a port, so a ruin's has none (`portOf`). Every hostile ship within
  its own sight of the ship has a mark (`seaHostiles.ts`): its faction's emblem in a ring of its rank's colour, its name
  as its plate gives it (Pirate Brig, Tithe Schooner, ...), its level and its distance, a Miniboss's mark over it. Each
  is held at the picture's edge when off it, its arrow pointing the way; ports too near each other on the picture are
  thinned to the nearest, a hostile ship's mark never.
- **The compass** stands at the top's middle at sea as on foot, turned with the view, the status line under it.
  It marks each hostile ship within its sight of the ship in red, other players' within 900 m in bone, a fight's struck
  captains grey ([[Interface]]). It hides while the held map is up at the helm.
- **The waters.** The page opens the waters once, just after its first frame (`pageWaters.ts`), with the port
  cities from the land files (`portsOf`, which the server reads too); the held map, the friendly ships and the sea all
  read that one opening, the ship's first putting to sea awaiting it. The place's line at sea, at the helm and in
  Manage names
  the water the ship is in, its band and holder ("The Fen Deeps, levels 22-26, Grey Tithe"; "The Lantern Sea, Overlook's
  home waters"; a contested one or the seam "contested"). A notice (DFO's toast) says for 6 s when the ship enters another
  water ("Entering The Mistwrack, levels 16-19, Pirates.") and when a hostile ship is first sighted ("A Tithe Brig
  sighted, 12 km off."), the nearest first.
- **Pirates and the Grey Tithe** sail the sea round the ship from the sea room ([[Naval Combat]], "At sea"), at its
  voyage's pace. As one comes near the voyage eases down, held to ×1 within 700 m of the ship, and the voyage's line says so;
  the page sails its ship at the pace the room sailed it at, drawn to where the room has it. A bold one that comes
  within 750 m meets the ship: the ship heaves to, its voyage kept, and the view pans down to the fight, every ship in it
  easing to its true size as on any view near the ship (above), its plate over it (its faction's emblem, its name over a bar
  of its hull coloured by its rank), then back up when it ends. Ships of two factions that meet fight each other, drawn
  at sea where the room has them; coming within 750 m of such a fight, or of one with other players in it, joins it the
  same way, every captain in it under their own plate.
- **The sea's word** (`seaWord.ts`, [[Naval Combat]], "How a fight ends"). Each line stands as a notice (DFO's toast, `plus/notices.ts`)
  for 6 s, several at once: who joins the fight ("Player 4 joined the fight.", "The Pirate Schooner joined the fight.", its hull as the
  room tells it), a captain's colours struck ("The Tithe Brig's colours are down: …"), the boarding ("Boarders away:
  the Tithe Brig's crew stands to meet them."), each piece of what floats gathered and what it held ("Gathered a chest:
  a Rare Vestige, an Ammo box.", "an Atheric Vestige"; what found no room, "nothing you had room for"), and washing up
  ("Your ship went down: you washed up at Sunspire; your ship lies at its roadstead.", or "Beaten aboard the ship: …").
  Washed up, the fight's view goes back up, the ship lies where the room moored it, and once the landmass of that
  port city is open the player walks into its social space behind the veil, in the same words ("You washed up at
  Sunspire; your ship lies at its roadstead."), standing there as on arriving (`flow.ts`, `wash-up`). Manage's panel
  shows the ship's hull, canvas and men (men only once its build has a crew) as the sea keeps them, its voyage's state under
  "Now", and a Repair part: R asks for its repair, which the panel shows with its seconds left ("Repairing it: 13 s
  left"), "The ship is whole", or where it is had ("Repair: free, lying at rest within 3 km of a port city", the rules' own
  reach from the waters' table; out of the sea, "Repairs are made at sea, by a port city"). The chase's meeting reach
  and the voyage's hold reach come from that table too (`SeaFacts`); it holds every ship's name as well, which the
  page's own names (`shipBars.ts` `shipName`) are tested against. A voyage set at Elite or Abyss sails in that
  difficulty's sea room (`sea--elite`, `sea--abyss`), the page leaving one for the other as the voyage sets out. The ship's
  voyage sails at the way its kept canvas leaves it, as the room sails it (`seaLaw.ts` `followed`). Back at sea
  after a session, it lies where the room last kept it.
- **Friendly ships** sail between the three port cities all the time ([[World Map]], "Traffic";
  `friendlyShips.ts`). The page asks the waters' rules where they are at world time, seconds since the Unix epoch by
  the page's clock (the sea room sends none), four times a second within the sea view's reach of the ship (its far plane),
  and between answers reckons each on along its leg at the pace the waters' table gives (5 m/s); a new answer's gap,
  as at a turn onto its next leg, is closed over about a second. One arrived lies at anchor at its destination's
  roadstead, no way on it, until it is gone. Of each hull only as many as the ships layer has slots for are drawn,
  16 less the room's own of that hull, the nearest first; only those are rigged, posed and footprinted. Each is drawn
  by the ships layer as its hull in friendly colours, its sails set and filled by the steady wind (furled while it
  lies at anchor), posed on the swell,
  at the size every ship is drawn: the Overworld's from the raised view and its true size on every view near the player's ship
  (`shownScale`). Its footprint joins the water's with the nearest. The compass marks every one within 900 m in
  Overlook's blue (`#2f5d9a`).
- **Other continents.** Once the ship is nearer another continent's coast than the open one's, within 60 km, that
  landmass opens in the worker, kept, and is drawn and charted in its place.

## Landings

Within 30 km of the open landmass's coast the ship is offered a landfall (`landfallOf`): within 20 km of its port's
harbour, to dock there ("Dock at Overlook"); anywhere else, to go ashore. A ruined city's harbour is no port
(`portOf`): off it the ship is offered only to go ashore, and its social space, locked for good, shows no mark among
the side's nodes. Either one, by Enter, L or the offer's own
button, flies the view up over the island's side the ship lies off (`sideNodes`, `frameSide`, `flyRig`), over 2.5 s;
the ship heaves to, its voyage kept to be resumed. The side's nodes are marked by kind with names and distances from
the ship; docking keeps the city's social space among them. A click chooses one; a second click on it, or
Enter, lands there: the player stands at its first spawn, facing inland from the ship, or at a social space out from
its landmark over the city, as on arriving. Escape flies back down.

Off one of the sea's islands the ship is offered to go ashore on it instead: it sails round to its anchorage and the
player walks ashore on its beach, into its room ([[Islands]], "On the page"). A player washed up on a found island
walks ashore there.

## Rooms

With `?room=` in the address the game plays online (`roomsFrom`): a whole address names a server
(`?room=ws://127.0.0.1:8787` under `npm run server`), any other value the deployed rooms.

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
  With accounts ([[Accounts]]; the deployed rooms use the deployed accounts, a local server `?accounts=`), the page
  makes the player a guest or keeps their session, and the node's room keeps their character. Their gear shows in
  the menu ([[Interface]]), I for Character and O for Inventory, and its presses ride their inputs as asks. Played
  alone, the room in the page keeps no gear.
- **A run's room** ([[Activities]]) is its dungeon's room's name and an instance (`runOf`): eight letters or digits
  the page draws at random (`runInstance`). A company member's run of the same dungeon at the same tier is found
  among the places a fresh Roster gives the company's members (`companyPlaces`, `sharedRun`), so a company enters
  one run. The Roster says where a member plays (`placeWords`): a patrol's dungeon with its difficulty, or "Elite
  Dungeon", "Elite Dungeon of the week" or "Abyss Dungeon of the week".
- **At sea** the player joins the `sea` room, their ship put to sea where it lies, turned as it lies; each voyage's
  course and pace go to it, and every other player's ship is drawn where the room moved it. The room's word on the ship
  is taken 60 ticks after its course is sent, a round trip's allowance of a second: until then the page sails it at
  the pace the room last held it to, then draws it to where the room has it. Where the room has it at rest short
  of its voyage's end, a course it would not take, the page heaves it to there. Leaving the helm while a course
  waits its turn sends the course first, then the leave, so the room takes the course from the helm. While the sea
  room is joined again after its socket closed, the page sails the ship alone and shows none of the room's ships, a fight in it
  over, and the voyage's line says "Reconnecting…"; joined again, the player is called to the helm and the ship puts to sea
  where it lies, on its voyage. A sea room that sends the player away is lost: they are called to the helm and sail
  on alone, the voyage's line saying so. While the room is well, the line says nothing of it (`roomWords`). Playing alone, the same sea room runs in the page, so its pirates and
  fights are the same law.

## Drawing

`GameScene` reads the sky over the eye each frame with the lamps lit round it, a torch or lantern in the player's left
hand among them ([[Sky]]), then draws the open landmass in rings round the eye, the exact ground round the player or
the ship, every drawer into the same pass, then the water's sky, haze and surface over all of it ([[Water]]), then
what a drawer draws over the water: on foot, the blows' arcs, then the fight's see-through marks far to near, each
tested by hand against the scene's depth, so the water's sky and its surface near a coast never cover them.

The fight's solid marks write depth in the pass with the figures. Then, on foot, the light layer (`LightLayer`): the
marks and arcs give their light, which is added over the picture in blocks of 4 screen pixels ([[Test Ground]], "The
attack feel"), under the first person's hands. Off foot, or with no mark or arc to draw, it is not run.

The game adds the open landmass's drawers each frame (`landDrawers`). Its city is the city layer's `CityView`
([[Cities]]), drawn in its continent's climate once the forged models' tables and the RMB blocks its plan names have
come from the pages' `world/` folder; the blocks are kept for every later city. Its nodes' layouts within 4 km of the eye are drawn by another `CityView`
([[Layouts]], "In the browser"), and each drawn node's section and spawns are its layout's. Its nature is the nature layer's
`NatureView` ([[Nature]]), grown round the eye from the exact ground round the player, off the city's pads and solids
(`cleared`). Ships and figures are drawn into the same pass; the first person's hands over the finished picture. The
land is tinted with its biome's woods past where its trees are drawn, so forests read from the sea.

**The ground's pictures.** The land wears its climate's ground tiles ([[Procedural Textures]], `groundTiles`), painted
off the page's thread by the city's painter: the terrain set's grass on the low ground, its dirt on the highlands and
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

| Map | Its square | A texel | What casts into it |
|---|---|---|---|
| Near | 300 m across, centred 75 m ahead | 0.15 m | The city's solids and near models, the near plants, the figures and the ships |
| Far | 2.4 km across, centred 900 m ahead | 1.2 m | The city's solids, and each building's masses, or its hull past where the masses are drawn; the ships |

What casts is found by whether, seen along the sun, its box overlaps a square, those behind the camera and far below
the eye too, so the city under the plaza casts; the few ships in a frame all cast into both. The land, the city, the
plants, the figures and the ships (the wrecks too) are then lit through both, softened over eight taps, a ship with the
land's light thrown back onto its sides: the near map's sharp shadows hold inside its square and give way to the far
map's toward its rim, and those fade out toward the far square's own, about 2 km ahead. So from the plaza the city below is
shadowed as far as its masses stand. From more than 400 m over the ground, at sea or over an island's side, no
shadows are drawn.

**The figures' shadows.** A figure's card casts turned square to the sun about its feet, its clear texels cut away,
the picture kept the way round the eye sees it; it is drawn into the near map only. The card the eye sees is lit
through the maps, each of its points asked of them from past that turned card, so a figure is darkened in another's
shadow or a wall's and never by its own. Its contact shade stays under its feet where its own shadow is drawn, and
past the near square leans the way the sun throws one, standing in for it.

At sea the footprints of the player's ship and the 47 ships nearest it (other players', pirates, friendly ships and
a fight's captains) are handed to the water at the size each is drawn; it keeps out of each hull and foams round each bow under
way.
Under way the player's ship stirs the water's ripples at its bow and quarters, as the World Editor's does, and the
ripples follow it.
In death the world drains to grey, and comes back in colour on respawn or on leaving.

## Limits

- Until the city's tables and blocks have come, the land shows without its city.
- A voyage is the browser's word; the sea room refuses a course that touches a coast it judges exactly, and the ship
  then rests short of it, the page drawing it where the room has it.
- Only the open landmass is drawn; another continent appears once the ship is within 60 km of its coast.
- The browser predicts nothing of the edge: a warning, a death or a respawn shows as the room's snapshot says it.
- The land is drawn a little off the ground bodies stand on, so the fight's marks and blood are drawn 0.12 m over
  where they lie. A telegraphed blow's mark is flat: on a slope, part of it lies under the land.
- A frame counts for at most 0.1 s, so below 10 frames a second the world runs slower than real time.
- A figure's shadow is its card as the eye sees it, turned to the sun: the outline of the side facing the eye, not
  of the side facing the sun.
- In a dungeon nothing casts a shadow, and a light lights through a wall a room on its other side within its reach.
- Past the far square, about 2 km ahead of the camera, nothing is shadowed; the plants cast into the near square
  only.

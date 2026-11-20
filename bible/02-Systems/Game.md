---
type: system
status: live
code:
  - client/index.html
  - client/src/main.ts
  - client/src/game/game.ts#startGame
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
  - client/src/game/sea.ts#Sea
  - client/src/game/landmass.ts#openLandmass
  - client/src/game/landDrawers.ts#landDrawers
  - client/src/game/scene.ts#GameScene
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
it answers. `game.ts` wires the rest and keeps the flow; each mode is its own module.

| From | Happening | To |
|---|---|---|
| Arriving | The ground round the spawn is in | On foot in Overlook's social space |
| On foot | M, then Return to ship | The veil, "Returning to your ship", then at sea |
| At sea | Enter, L or the offer to dock or go ashore, off a coast | Over the island's side |
| Over the side | A mark clicked, then clicked again or Enter | The veil, "Landing at" the node, then on foot there |
| Over the side | Escape | At sea |

The veil lifts once the place is ready and the exact ground round the player has come, or after 20 s of wall time.
A way that fails stays on the veil, saying why, and Enter tries it again.

## Arriving

The page reads the world (`loadWorld`: the layout and every continent's edits file) and opens Saltmere, continent 1,
in the [[Land]]'s worker, kept, with the RMB index's blocks, so its city is settled on it as the bake settles it
([[Cities]]). Overlook's plan comes from that worker; its social space is the node `overlook-social`, the plaza beside
the Beacon. The player stands at its first spawn, 4 m inside the seaward parapet, facing out from the landmark and
looking 17° down over the parapet onto the city, the harbour and the sea.

With `?at=<node id>` in the address the player arrives at that node instead, on its continent (a city's social space
is `<city id>-social`): a way to look round the world. An id the world does not hold arrives at Overlook. A ruined
city's social space is arrived at as any other, empty, and named "Ruins of" and the city's name ([[Cities]], "Ruins"),
on the veil too: arriving at a city's social space other than Overlook's, the page waits for the rules' module to
say which cities are ports (`mainPortsOf`); if it does not come, the city is named alone.

## On foot

`Foot` stands the player in one node, as the [[Player]] plays on the [[Test Ground]]: DFO's controls, first and
third person, the forge's figure and the first person's hands, and the Test Ground's fight.

- **Friendly ships from land.** At any node every friendly ship within 15 km of the eye is drawn on the sea at her
  true size, sails set and filled, posed on the swell, her footprint on the water, as at sea (below); so ships coming
  and going are seen from each port's plaza and harbour. They are lit as the ships layer lights every ship, by its
  own sun, and cast no shadow.
- **The ground.** The node's window of the land, over its ring's bounds and 100 m past them, and its city's boxes
  there, cut by the land's worker and handed to the movement door and the fight's rules, the same ground to the bit
  as the node's room ([[Movement]], [[Server]]). The scene draws the exact ground round the player, sampled every 4 m.
- **The camera** is the player's, held 0.3 m over the ground, with the Test Ground's 50-degree view. The player's
  own Anima pushes it in as it is released, with a frame of its element round the screen ([[Arts]]).
- **The world goes on.** The body is stepped every frame, with the pointer locked or not; while a menu is open,
  with nothing pressed. Click the view to look round with the mouse.
- **The room.** The node's room is the authority, always. Alone, the room crate runs in the page, ticked by its clock,
  on a node file made from the same window and boxes, as the sea's does ([[Server]]); online, the server's.
- **The fight.** The player fights as on the Test Ground, by its keys and its modules ([[Combat]]): Z readies the
  weapon, 1 draws the Melee loadout and 2 the Ranged, the right button swings or aims, the left button or F guards,
  parries or fires, V or Mouse5 dodges, R, Q and G cast the worn Art's spells ([[Arts]]), and the soft lock holds a
  foe. The fighter is predicted by the room's own rules on the node's land, and the room's word is
  taken. Shots stop on that land, and the aimed shot's crosshair and the player's own arrows meet it. The keys listed
  name the fight's, the Arts' line ("R Anima · Q G Tenets") adding how to aim Dusk Daggers only while Shadow is worn.
  Where the HUD is wide and not doubled (1500 by 900 and up, under 2400 by 1300), the keys stand at 22 px a line,
  over the vitals and the buffs above them.
- **The foes.** Every foe the room holds stands as a figure in its type's dress ([[Enemies]]), with the Test Ground's
  display: the compass at the top with the boss bar and the target's plate under it, the vitals at the bottom left, each
  foe's name and bar, the parry rings, the words, the arrows to foes out of view, the marks of telegraphed blows, the
  tracers, where blows land and kills fall, the blood and the flashes. The game's own display stands over it: the
  place, the keys (over the vitals), the menus and the veil; while a boss's bar shows, the place's name gives it the
  top of the screen, and the status line stands under the place's name, under the boss's bar ([[Interface]]).
- **The attack feel.** The [[Test Ground]]'s four effects over the blows play on foot at their defaults: each blow's
  swing arc over its striker (none through the eyes), with the smear its strike leaves behind the striker's card; the
  hit-stop holding the fighters a blow lands on; the camera's kick (moving the view but never turning it while a
  crosshair shows); and the lunge driving a striker's figure into its blow. Only the drawing moves, never the rules or
  their clock (`combat/attackFeel.ts`). A player who asks for reduced motion keeps a still view: no kick, no shake, no
  lunge carrying the eye and no Anima push-in; the Anima's edge frame still shows. The feel's light is on too: the
  brightest marks and arcs light what stands round them ("Drawing").
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
  landward lane, clear of the portico's steps, each in a step of its own, never a crowd in step. The floor under each
  is found again only once they have walked a step. The fight never takes them for targets.
- **On the ground** (`footGear`), drawn among the fight's marks: a brass ring at each counter that deals with the
  player; and at each resource node they may still gather, a sea-green ring under a beam 40 m tall, seen across the
  patrol, so a route can be planned through them. Each drop lying for them stands as its own picture under its
  rarity's line (`combat/drops.ts`; [[Gear]], "Drops"), taken by walking over it.
- **E** uses what is within reach, shown as Destiny shows it, a keycap and the deed low in the middle of the view
  (`UsePrompt`): at a counter it opens its screen in the menu (the Reader the inventory's Vestiges, the vault and each
  vendor their own; [[Interface]]); within 2.5 m of a node it asks the room to gather it. Neither is offered while a
  menu is up or the player lies dead, past the edge or felled by a foe.

## The edge

The node's room judges the body against the node's section each tick ([[Reach]]). Past the edge the screen darkens and
"Return to the area" counts down 10 s; back inside, it ends. At 0, or 60 m past, the player dies: "You died", the
pointer is freed, and Respawn is offered after 4 s (or Enter). The player comes back at the section's spawn nearest
where they fell. A dead body lies still while its standing ticks on. A player killed in the fight falls, the fight's
display counts down 4 s, and the room stands them again at the section's spawn nearest where they fell.

## At sea

`Sea` is the [[Overworld]] in play. The first return puts the ship off Overlook's harbour: out from the city's middle
through its harbour to water 4 m deep, then 600 m on. Later returns find it where it was left.

- **The ship** is the owner's Sloop ([[Sailing]]), in her parts' pictures, flying Overlook's blue at her masthead.
  Like the World Editor's, she rides the swell the sea draws and heels into her turns ([[Sailing]], "Drawn at sea").
  Her sails are set while she is under way and furled at rest, filled by the weather's wind ([[World Map]]).
  The Overworld is not to scale: the Sloop is drawn 75 m long (four times her length), so one reads from the raised
  view, and every hull the same four times her own, so a Frigate reads larger than a Sloop. Every other player's ship
  is the Sloop too. A captain's ship is drawn as the hull the wire carries for her, in her side's colours, and as the
  Sloop until the wire carries one ([[Sailing]], "Her look"); in a fight and in a fleet room too, each read through
  `hullOfCaptain` (at sea and in a fleet her `hull`, in a fight's view her `hull_kind`). Every hull's model and its
  shell tags are made ready behind the sea's veil (`SeaHull.warm`), so the first of each seen holds no frame. At the
  helm every
  ship is her true size ([[Held Map]]).
- **Her size coming in** (`shownScale`). Every view near her (close in, the helm's, Manage's, the walk's and a fight's)
  is laid on her at her true size, and the view eases down to it from the sea's. On the way her share of the picture
  eases from the size the sea's view shows her to her true size on the view near her, by the same ratio each step of
  the way, and every ship is drawn at the scale that gives, never under her true size. So as the eye comes in she grows
  a steady step each notch and never shrinks or jumps: with the camera at its lowest, looking 30 degrees down, the Sloop
  grows from 141 to 157, 201, 270, 346 and 383 pixels long on a 720-pixel picture over the five notches in. Every hull
  grows so, whatever size the sea's view draws her at, while her true size at the closest shows her at least as large
  as the sea's view did. A view near her that shows her smaller at her true size (Manage with its wheel taken out) is
  eased down to instead. On each view near her every ship is her true size, her pose on the swell, her footprint on the
  water and everyone aboard with her.
- **The camera** is DFO's raised one over the ship (`stepCamera`): drag to orbit, the wheel to zoom, the arrow keys
  to turn. The ship first lies facing the island, and the view looks 30 degrees down, so the island stands in it.
- **Close in** (`seaClose.ts`, [[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Past the camera's
  lowest the wheel keeps coming in, a fifth of the way a notch. The eye comes down along the camera's own look to
  25 m from the point 4.5 m over her waterline that the World Editor looks at, every ship drawn as her size coming in
  has it. Out goes back from close first; going ashore, it eases out as the view flies off. Clicks and marks are taken
  on the picture as shown.
- **The pace follows the view** (`easedPace`). From the raised view a voyage sails at the dial's pace. Once the eye
  comes in past the camera's lowest, and at the helm, in Manage and walking the deck, the pace she is sailed at eases
  down DFO's ladder, the dial's step, then 60, 40, 30, 20, 10 and 5, to 1, the world's own time, a step each 0.15 s, so
  she sails at her true speed, 12 m/s, while watched close; as the view rises it eases back up to the dial the same way.
  The dial itself is not changed, and the voyage's time left is read at it. Each step goes to the sea room with her
  course; the room takes one course each half second, so it sails her at the latest step it has, and the page sails
  her at the room's pace until it takes the next. Once the room's word on her comes and its pace is not the one she is
  sailed at, a step it refused, the page asks it again with her course, until the two agree (`paceToAskAgain`); a
  slower word with a hostile ship within 1.7 km is the room holding her, not a refusal. While the pace is eased, and
  the room sails her at it, the voyage's line adds "Sailing at true speed while you watch close."
- **Sailing.** A click on the sea or the land plans a route round the land (`planSeaRoute`): on the open landmass's
  2 km mask when both ends lie in its window, else on the whole frame's. The ship sails it at the pace dial's step,
  `[` and `]` or the panel's buttons, ×60 to start. A click on the port's icon sails for it. A route that cannot be
  planned says why.
- **The chase** (`seaChase.ts`). A click on a sighted hostile ship's mark, or Enter while her mark is chosen, sets
  the course to intercept her: where the ship meets her at their ways (her rank's way and a ship's 12 m/s, both on
  the voyage's clock), planned round the land as any route, again each half second. The voyage's line says "Chasing
  the Tithe Brig." until she is met, lost from sight, or another course is set (a click, the helm's keys, Stop or
  Resume, going ashore). Her way is the one the room sends with her (`Pirate.way`). The room is told whom she
  chases: within 750 m of her the fight begins, whatever her temper. Evading is turning away from a bold ship, sighted
  ahead on the ship's course where she can meet it: held, the course meets her; turned away, the ship outruns her.
- **The helm's keys**, as in a fight (`passage.ts`, `seaHelm.ts`), in the sea's own view, close in or not:
  - A and D turn her at the helm's 10 degrees a second. Under way she takes a course straight on along her new
    heading; at rest she turns where she lies, and the room turns her too ([[Server]], "The sea").
  - W sets her sailing straight on. That course reaches up to 20 km, stops 500 m short of the first coast that way, and
    is set again once under 5 km of it is left. Where a coast stops it short, or less than 200 m lies clear, she comes
    to rest facing the coast, and the voyage's line says "Land lies ahead."
  - S heaves her to, as Stop does.
  - Straight on, the voyage's line says "Sailing straight on"; resumed, she sails on straight along her heading.
- **The navigation panel** ([[The Sea Is Navigated From the Helm With the Held Map]]), a window of the [[Interface]]
  at the foot of the screen in three groups, Navigation, Pace and Ship, holds Map (N), which takes the
  view down to the helm and raises the [[Held Map]], where a destination is set; Stop while under way and Resume
  voyage once stopped short (both Space); the pace dial; and Manage (B) and Leave the helm (H)
  ([[The Ship Is Managed and Walked From the Sea's Panel]]). A stopped voyage keeps its destination: resuming
  plans the way there again from wherever the ship lies, after going ashore and coming back too.
- **Manage** pans the view down over 1.4 s to the Sloop at her true size, from her starboard quarter 39 m off,
  looking 0.5 radians down at her middle; a drag turns it round her, the wheel brings it from 18 m to 78 m. The player
  stands at her wheel, three stand-in hands go about her deck, and a panel of the [[Interface]] shows her: her hull
  and canvas whole (the naval rules' build, read through the room's own module), her guns a side and their loads,
  her length, beam and draught; her heading, pace and voyage; and Cargo and Crew, marked Later. B, or the panel's
  Back to the sea, pans back up.
- **Leave the helm** pans the view down to the player behind her wheel, walking her deck as on foot (the same
  controls, first or third person), the sea room the authority on every step ([[Server]], "The sea"). Under way her
  helmsman stands at the wheel and she sails on; at rest the player simply leaves it. At her wheel the offer Take the
  helm (E) takes it again, and once the room agrees the view pans back up. A fight that begins calls the player
  straight back to the helm.
- **Her hands.** Stand-ins until crew management comes: a human, a felid and a human in plain dress, each walking
  between spots on her deck at 1.3 m/s and standing at each 2 to 7 s, on a leg the deck leaves clear and away from
  her wheel; seeded, so they walk the same however the frames fall.
- **Seen from any view** ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]). Her hands always go
  about her deck. The player stands at her wheel, but at the helm, where the eye is theirs. Off the helm the player
  walks her deck, with her helmsman at the wheel under way. In a fight they all stand on her as the fight lies her.
  Each figure stands where her deck lies on the swell, drawn as large as she is.
- **No nodes are marked at sea.** A port has an icon, over its harbour, with its name and distance, once the ship is
  within 60 km of it; only a port city's harbour is a port, so a ruin's has none (`portOf`). Every hostile ship within
  her own sight of the ship has a mark (`seaHostiles.ts`): her faction's emblem in a ring of her rank's colour, her name
  as her plate gives it (Pirate Brig, Tithe Schooner, ...), her level and her distance, a Miniboss's mark over it. Each
  is held at the picture's edge when off it, its arrow pointing the way; ports too near each other on the picture are
  thinned to the nearest, a hostile ship's mark never.
- **The compass** stands at the top's middle at sea as on foot, turned with the view, the status line under it.
  It marks each hostile ship within her sight of hers in red, other players' within 900 m in bone, a fight's struck
  captains grey ([[Interface]]). It hides while the held map is up at the helm.
- **The waters.** The page opens the waters as the ship first puts to sea, with the port cities from the land files
  (`portsOf`, which the server reads too), and the place's line at sea and at the helm names
  the water she is in, its band and holder ("The Fen Deeps, levels 22-26, Grey Tithe"; "The Lantern Sea, Overlook's
  home waters"; a contested one or the seam "contested"). The voyage's line says for 6 s when she enters another
  water ("Entering The Mistwrack, levels 16-19, Pirates.") and when a hostile ship is first sighted ("A Tithe Brig
  sighted, 12 km off."), the nearest first.
- **Pirates and the Grey Tithe** sail the sea round the ship from the sea room ([[Naval Combat]], "At sea"), at her
  voyage's pace. As one comes near the voyage eases down, held to ×1 within 700 m of her, and the voyage's line says so;
  the page sails its ship at the pace the room sailed her at, drawn to where the room has her. A bold one that comes
  within 750 m meets her: the ship heaves to, her voyage kept, and the view pans down to the fight, every ship in it
  easing to her true size as on any view near her (above), her plate over her (her faction's emblem, her name over a bar
  of her hull coloured by her rank), then back up when it ends. Ships of two factions that meet fight each other, drawn
  at sea where the room has them; coming within 750 m of such a fight, or of one with other players in it, joins it the
  same way, every captain in it under her own plate.
- **What a fight leaves** (`seaAfter.ts`, [[Naval Combat]], "How a fight ends"). The sea's status line says, for 6 s
  each, who joins the fight ("Player 4 joined the fight.", "The Pirate Schooner joined the fight."), a captain's
  colours struck ("Her colours are down."), the boarding, each piece of what floats gathered and what it held
  ("Gathered a chest: a Rare Vestige, an Ammo box."; what found no room, "nothing you had room for"), and washing up
  ("Your ship went down: you washed up at Sunspire, your ship moored at its roadstead.", or "Beaten aboard her: …").
  Washed up, the fight's view goes back up, the ship lies where the room moored her, and once the landmass of that
  port city is open the player walks into its social space behind the veil ("Washed up at Sunspire. Your ship lies at
  its moorings."), standing there as on arriving (`flow.ts`, `wash-up`). Manage's panel shows her hull, canvas and men
  as the sea keeps them and a Repair part: R asks for her repair, which the panel shows with its seconds left
  ("Repairing her: 13 s left"), "She is whole", or where it is had. Her voyage sails at the way her kept canvas
  leaves her, as the room sails her (`seaLaw.ts` `followed`). Back at sea after a session, she lies where the room
  last kept her.
- **Friendly ships** sail between the three port cities all the time ([[World Map]], "Traffic";
  `friendlyShips.ts`). The page asks the waters' rules where they are at world time, seconds since the Unix epoch by
  the page's clock (the sea room sends none), four times a second within the sea view's reach of her (its far plane),
  and between answers reckons each on along her leg at 5 m/s; a new answer's gap, as at a turn onto her next leg, is
  closed over about a second. Each is drawn by the ships layer as her hull in friendly colours, her sails set and
  filled by the steady wind, posed on the swell, at the size every ship is drawn: the Overworld's from the raised view
  and her true size on every view near hers (`shownScale`). Her footprint joins the water's with the nearest. The
  compass marks those within 900 m in Overlook's blue (`#2f5d9a`).
- **Other continents.** Once the ship is nearer another continent's coast than the open one's, within 60 km, that
  landmass opens in the worker, kept, and is drawn and charted in its place.

## Landings

Within 30 km of the open landmass's coast the ship is offered a landfall (`landfallOf`): within 20 km of its port's
harbour, to dock there ("Dock at Overlook"); anywhere else, to go ashore. A ruined city's harbour is no port
(`portOf`): off it the ship is offered only to go ashore, and its social space, "Ruins of" its name, is among the
side's nodes as any other. Either one, by Enter, L or the offer's own
button, flies the view up over the island's side the ship lies off (`sideNodes`, `frameSide`, `flyRig`), over 2.5 s;
the ship heaves to, its voyage kept to be resumed. The side's nodes are marked by kind with names and distances from
the ship; docking keeps the city's social space among them. A click chooses one; a second click on it, or
Enter, lands there: the player stands at its first spawn, facing inland from the ship, or at a social space out from
its landmark over the city, as on arriving. Escape flies back down.

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
  A room that sends the player away is lost: the display says so and they play on alone.
  With accounts ([[Accounts]]; the deployed rooms use the deployed accounts, a local server `?accounts=`), the page
  makes the player a guest or keeps their session, and the node's room keeps their character. Their gear shows in
  the menu ([[Interface]]), I for Character and O for Inventory, and its presses ride their inputs as asks. Played
  alone, the room in the page keeps no gear.
- **At sea** the player joins the `sea` room, their ship put to sea where it lies, turned as she lies; each voyage's
  course and pace go to it, and every other player's ship is drawn where the room moved it. The room's word on her
  is taken 60 ticks after her course is sent, a round trip's allowance of a second: until then the page sails her at
  the pace the room last held her to, then draws her to where the room has her. Where the room has her at rest short
  of her voyage's end, a course it would not take, the page heaves her to there. Leaving the helm while a course
  waits its turn sends the course first, then the leave, so the room takes the course from the helm. While the sea
  room is joined again after its socket closed, the page sails her alone and shows none of its ships, a fight in it
  over, and the voyage's line says "Reconnecting…"; joined again, the player is called to the helm and she puts to sea
  where she lies, on her voyage. A sea room that sends the player away is lost: they are called to the helm and sail
  on alone, the voyage's line saying so. Playing alone, the same sea room runs in the page, so its pirates and
  fights are the same law.

## Drawing

`GameScene` draws the open landmass in rings round the eye, the exact ground round the player or the ship, every
drawer into the same pass, then the water's sky, haze and surface over all of it ([[Water]]), then what a drawer
draws over the water: on foot, the blows' arcs, then the fight's see-through marks far to near, each tested by hand
against the scene's depth, so the water's sky and its surface near a coast never cover them. The fight's solid marks
write depth in the pass with the figures. Then, on foot, the light layer (`LightLayer`): the marks and arcs give
their light, which is added over the picture in blocks of 4 screen pixels ([[Test Ground]], "The attack feel"), under
the first person's hands. Off foot, or with no mark or arc to draw, it is not run. The game adds the
open landmass's drawers each frame (`landDrawers`). Its city is the city layer's `CityView` ([[Cities]]), drawn in
its continent's climate once the forged models' tables and the RMB blocks its plan names have come from the pages'
`world/` folder; the blocks are kept for every later city. Its nature is the nature layer's `NatureView`
([[Nature]]), grown round the eye from the exact ground round the player, off the city's pads and solids
(`cleared`). Ships and figures are drawn into the same pass; the first person's hands over the finished picture.
The land is tinted with its biome's woods past where its trees are drawn, so forests read from the sea.

**The sun's shadows.** Before the pass, what casts draws its depth along the sun into two maps (`shadow.ts`), 2048
texels a side each, every square ahead of the camera and snapped to its own texels so the edges hold still:

| Map | Its square | A texel | What casts into it |
|---|---|---|---|
| Near | 300 m across, centred 75 m ahead | 0.15 m | The city's solids and near models, the near plants, the figures and the ships |
| Far | 2.4 km across, centred 900 m ahead | 1.2 m | The city's solids, and each building's masses, or its hull past where the masses are drawn; the ships |

What casts is found by whether, seen along the sun, its box overlaps a square, those behind the camera and far below
the eye too, so the city under the plaza casts; the few ships in a frame all cast into both. The land, the city, the
plants, the figures and the ships (the wrecks too) are then lit through both, softened over eight taps, a ship with the
land's light thrown back onto her sides: the near map's sharp shadows hold inside its square and give way to the far
map's toward its rim, and those fade out toward the far square's own, about 2 km ahead. So from the plaza the city below is
shadowed as far as its masses stand. From more than 400 m over the ground, at sea or over an island's side, no
shadows are drawn.

**The figures' shadows.** A figure's card casts turned square to the sun about its feet, its clear texels cut away,
the picture kept the way round the eye sees it; it is drawn into the near map only. The card the eye sees is lit
through the maps, each of its points asked of them from past that turned card, so a figure is darkened in another's
shadow or a wall's and never by its own. Its contact shade stays under its feet where its own shadow is drawn, and
past the near square leans the way the sun throws one, standing in for it.

At sea the footprints of the player's ship and the seven ships nearest her (other players', pirates, friendly ships and
a fight's captains) are handed to the water at the size each is drawn; it keeps out of each hull and foams round her bow under
way.
Under way the player's ship stirs the water's ripples at her bow and quarters, as the World Editor's does, and the
ripples follow her.
In death the world drains to grey, and comes back in colour on respawn or on leaving.

## Limits

- Until the city's tables and blocks have come, the land shows without its city.
- A voyage is the browser's word; the sea room refuses a course that touches a coast it judges exactly, and the ship
  then rests short of it, the page drawing her where the room has her.
- Only the open landmass is drawn; another continent appears once the ship is within 60 km of its coast.
- The browser predicts nothing of the edge: a warning, a death or a respawn shows as the room's snapshot says it.
- The land is drawn a little off the ground bodies stand on, so the fight's marks and blood are drawn 0.12 m over
  where they lie. A telegraphed blow's mark is flat: on a slope, part of it lies under the land.
- A frame counts for at most 0.1 s, so below 10 frames a second the world runs slower than real time.
- A figure's shadow is its card as the eye sees it, turned to the sun: the outline of the side facing the eye, not
  of the side facing the sun.
- Past the far square, about 2 km ahead of the camera, nothing is shadowed; the plants cast into the near square
  only.

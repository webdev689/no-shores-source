---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

- The scaffold: the TypeScript client on WebGPU, the Rust repo checks, CI, this vault.
- The [[Pick List]] of DFO Online, and the owner's decisions on it ([[Decisions]]).
- The co-dev's toolkit, installed by each session's first step ([[Toolkit]]). Its SkillsMP key is a network secret
  on the personal Default environment, with `SKILLSMP_API_KEY` set there to `proxy-injected`; Context7 runs on its
  anonymous tier there. Kit fixes are logged with task-observer for the co-dev; the log lives in `~/toolkit-data` and
  outlives the container on the orphan branch `toolkit-data` (`tools/claude-toolkit/toolkit-data.sh`). Its first
  review is done: claude-mem installs with its
  provider, Serena gets every language at the repo's root, and the rules template passes the kit's own checks.
- The [[World Map]]'s layout file and its rules, and the [[World Editor]], published on GitHub Pages
  ([[The World Editor Is on GitHub Pages]]). The owner has drawn all nine continents; continent 1 is the main social
  space, with the port city.
- The [[Land]], on `main`: generated relief, erosion and water from the painted coasts; sculpting brushes; carved
  rivers, roads, towns and ports; and the ground anywhere to the metre, for the runtime. The World Editor's Land mode
  shows it in 2D and 3D, close up at true scale, and on foot, carved by the nodes' layouts as the game stands on it,
  with each layout's areas, paths, section and sites drawn over both views.
- The [[Water]], on `main`: the shared swell in the land crate, breakers that shoal and break on every shore, a
  stylised-realism surface over the sea, lakes and rivers, ripples, and wading, swimming and diving with an underwater
  view ([[The Water Is Stylised Realism]]). Its pass for jaggies put the coast on its painted line, lakes and banks on
  the ground's own contours, and every edge of land and water at each pixel, at any distance. The sea's reflection
  blurs the sky's clouds by the roughness of waves too small to draw.
- The [[Sprite Forge]], on `main`, exactly as DFO had it, with its 130,407 pictures on R2. The [[Test Ground]] plays a
  forge figure with every move, in first and third person, with DFO's controls, Daggerfall's colours and the
  [[Three Races]].
- Gameplay has begun, in the owner's order ([[Gameplay Starts With the Shared Rules]]). [[Movement]], on `main`: the
  Test Ground's moves in the Rust `movement` crate, stepped in ticks of 1/60 s through WebAssembly, agreeing to the bit
  wherever it runs.
- [[Sailing]], step 1 of the naval port, on `main`: the `sailing` crate (Come Sail Away's helm under DFO's responsive
  helm, the swell's pose, grounding on the land), stepped through `land-wasm`, and the owner's Sloop put to sea and
  sailed in the World Editor, the water parting round her. Her model and mesh are on R2 (`content/ships/ships.json`).
- [[Naval Combat]], step 2, on `main`: the `naval` crate (DFO's ballistics, swivel
  and shot kinds, gunnery, damage, the shot field and a pirate captain's AI, and the `Fight` that steps both ships),
  a stateful fight door in `land-wasm`, and the fight in the World Editor (`F` while sailing; the right mouse aims and
  fires). The Sloop's guns and hit boxes come from her model through the export.
- The servers run on Cloudflare ([[Servers on Cloudflare]]) and messages are FlatBuffers
  ([[Messages Are FlatBuffers]]). On `main`: the [[Server]]'s room and its messages, with Google's `flatc` installed
  by the schema step itself; the room hosted by a Cloudflare Durable Object in `server/`; the browser's connection and
  prediction; and the Test Ground played together (`?room=<name>`). Deployed with the owner's yes:
  `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`, measured live at 60 ticks a second, the room agreeing
  with each prediction to the bit.
- On `main` and deployed: other players shown in their own dress, with their weapon drawn, swings, casts, panel moves
  and horse, checked live with two browsers on the deployed rooms.
- The world after Destiny 1, on `main` and published to GitHub Pages with the owner's yes
  ([[Every Island Is Seen Whole and Reached by Nodes]], [[The World as Claude Shapes It]]): a port city on each of
  the nine continents, planned by the `city` crate on World 2.0's stages from Daggerfall's RMB blocks, each with its
  motif's landmark and a social space the size of the Tower ([[Cities]]); nodes walked one section at a time, with
  the warning, death and respawn past a section's edge in the `reach` crate, offline and in the rooms ([[Reach]]);
  the Overworld's sea and an island's side seen from above ([[Overworld]]); DFO's procedural textures, forged models
  and nature; and the [[Game]] page that plays it from arriving in Overlook to landing at another node. Its AAA pass
  is on the same pull request: the sun's shadows round the eye, the Tower's courtyard on every plaza, landmarks
  dressed as built stone, woods coloured on the land from afar, and the fixes four code reviews found. Then the
  shadows across the view ([[Game]]): a far map 2.4 km across where the city's solids and its buildings' masses or
  hulls cast, so the city below the plaza is shadowed; and the figures cast, each card turned to the sun, and are lit
  through both maps. The game keeps at most one frame waiting on the GPU, so a slow machine gets fewer frames rather
  than a stalled browser, and the far map casts masses, not models (302k shadow triangles a frame from the plaza,
  against 448k for the view; tested offline). The owner has tested it and builds on it.
- The sea navigated from the helm, on `main` and published (#49), as the owner decided it
  ([[The Sea Is Navigated From the Helm With the Held Map]]): no nodes marked at sea, a port's icon within 60 km;
  off a coast the offer to dock (within 20 km of the harbour) or go ashore, either flying into the side's overview;
  the navigation panel (Map, Stop and Resume voyage, the pace dial), a stopped voyage resumable from anywhere; and the
  [[Held Map]], DFO's ported ([[Pick - Held Map]]): the view down to the helm in first person, the owner's
  parchment raised in the gauntlets worn, the discovered world inked on it by the GPU, a click setting the
  destination. Discovery is kept in the browser. Tested offline in headless Chromium end to end: the map raised, a
  point of the sea chosen, Set sail, the ship under way.
- The Sloop painted, under DFO's sails, at sea, with pirates and the pan to combat, on its pull request (#50), as
  the owner decided it ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]): her model UV-mapped and
  sorted into parts that wear the procedural painter's pictures; DFO's animated sails on her own corners; the
  Overworld's ship; pirates from DFO's director in the sea room, which also runs in the page when playing alone; a bold
  one meeting her starts a fight in the room, and the view pans down to it at true scale ([[Naval Combat]], "At sea").
  Tested offline: the full check, the room traced in Node, and headless pictures of her and of a fight beginning.
- On `main`: the forge renders DFO's audit branch had and Overlook did not, published to R2
  ([[The Audit Branch's Forge Renders Come Over]]); the rest of that branch's forge work was already here, newer.
- On `main` and deployed: the fight
  ([[Combat Is Soulframe's, With DFO's Enhanced AI]]). [[Combat]]: DFO's swings and strokes, Soulframe's guard, parry,
  riposte, dodge with its perfect stretch and counter, stamina, poise and the soft lock, foes' telegraphed blows and
  shots in flight, in the Rust `combat` crate. [[Foes]]: DFO's Enhanced AI in the `foes` crate, five kinds, built upon
  to guard, parry and dodge. The [[Navmesh]], DFO's, in Rust. The [[Server]]'s rooms run them all, judging each blow
  as its defender saw it; the [[Test Ground]] fights them alone or together, predicted to the bit. Then audited end to
  end (the rules, the foes against DFO's source, the room and its host, the browser) and every finding fixed with a
  test; the timings set against shipped games and a person's reaction ([[Combat]], "Why these numbers"); third-person
  attacks strike as fast as their blow lands. Deployed with the owner's yes, and tested live: two browsers on the
  published Test Ground fought one brute together in a deployed room.
- The owner's playtest notes, on pull request #48 from branch `ccr-73003efa-gnnnqf`, tested offline: the naval aim
  as DFO's ([[Ship Guns Keep Square Broadsides]]); a closing parry ring ([[Foes Show a Closing Parry Ring]]); struck
  figures flash, clashes spark, and DFO's [[Blood]] whole ([[Struck Figures Flash, and DFO's Blood Comes Over]]);
  facing the locked foe ([[Locked On, the Figure Faces Its Foe]]); foes drawn without stutter; and ranged weapons that
  aim and fire ([[Ranged Weapons Aim and Fire]]): no guard, quick and aimed shots, over the shoulder and ADS, a
  crosshair, and tracers.
- Ships in the rooms, on `main` (pull request #51), tested offline
  ([[Server]], "A fleet"; [[Naval Combat]], "The fight", "Ramming", "In a fleet room"): the naval `Fight` holds many
  ships by number, each sailed by a player's orders or a captain's mind, a captain choosing whom she fights among the
  players' ships; a fleet room (`/room/fleet-<name>`) where up to 16 players put their Sloops to sea, call up to four
  captains and fight them together, each browser predicting her own ship through `room.wasm` to the bit; DFO's ram
  and hull push; and the World Editor sailing there with `?room=`. A golden trace showed the one-captain fight
  unchanged line for line. Two players and a captain ran 480 s on the local Cloudflare runtime at 57.8 snapshots a
  second, both predictions equal to the room's ships to the bit.
- The sea's new work, merged to `main` with the owner's yes (#59), which deploys the page and the rooms together,
  each part as the owner decided it:
  - The ship's two new buttons ([[The Ship Is Managed and Walked From the Sea's Panel]]): the [[Interface]]'s Enhanced
    Plus kit and the sea bar in it; the Sloop at true scale at the helm; Manage, the view over her deck with her panel
    and stand-in hands; and Leave the helm, the player walking her deck ([[Sailing]], "Her deck") with the sea room
    the authority on every step ([[Server]], "The sea").
  - The Sloop about 18 m long, her quarterdeck opened with steps down ([[The Sloop Is About 18 m Long]]); her model on
    R2 is the one the `ships` workflow shaped and published. Her deck's walls stand where a body cannot walk, so her
    steps and her stair aft are the ways off her quarterdeck, and her helm is 0.45 m behind her wheel.
  - Pirates met at sea ([[Pirates Must Be Met at Sea]]): they sail on the voyage's clock and hold a voyage as they come
    near, each sea on a seed of its own ([[Naval Combat]], "At sea").
  - The helm's keys in the Overworld's view, her crew and the player seen from any view, and the wheel all the way in
    to her at full detail with the World Editor's motion
    ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]; [[Game]], "At sea").
  - Three independent audits and a ponytail review of the whole pull request, every finding checked and the real
    ones fixed with tests; tested offline.
- The [[Test Ground]]'s third-person aim placed by hand, DFO's next forge work with its dodge roll, and faster strikes,
  merged to `main` with the owner's yes (#62) and deployed; the live Test Ground serves the aim's panel:
  - the aim's sliders, kept in the browser and shown as numbers;
  - the forge's code exactly but for the were-creatures' ([[DFO's Next Forge Work Comes Over, With Its Dodge Roll]]),
    and its 118,158 redrawn and new pictures and the roll's 1,200 published to R2 by a helper session on the
    `overlook-source` environment;
  - the owner's blows, the bow's own holds and the roll, played by the player and foes alike, and strikes about
    twice as fast, landing with the blow; [[Own Work]] widened to the forge's CC0 motion from Quaternius and KayKit.
- The enemy system, merged to `main` with the owner's yes (#61), which deployed the page, the accounts and the rooms
  (the first rooms deploy under the deploy filter, which made the `rooms` environment), tested offline and on the
  local Cloudflare runtime, as the owner decided it ([[Enemies Come in Five Ranks, After Destiny]],
  [[Enemy Factions Start With the Grey Tithe]], [[project-final's AI Comes Over Onto DFO's]],
  [[The Enemies as Claude Builds Them]], [[The Bars and the Fight Wear the Plus Kit]],
  [[The Rooms Deploy When Their Code Changes]], [[Foes Leash to Their Posts and Fall With Their Boss]],
  [[Plates Stay Light and Bars Do What Enhanced Plus Does]]):
  - [[Enemies]]: a fighter's side is the players' or a faction's, and factions fight each other; the Grey Tithe (land
    and sea) and the pirates (sea); five roles, a roster of 18 types, five ranks scaling health, poise, might,
    reaction, defence and telegraphed blows; a Miniboss's second phase; Captain Brannoc Thule's three phases at sea and
    High Assessor Corvane's three on land, each calling foes; a Grey Tithe garrison in every node but the social
    spaces, standing again 120 s after it falls; the Game fighting them on foot as the Test Ground does.
  - The bars, after the owner's reference, in the [[Interface]]'s Enhanced Plus kit: each foe's faction emblem, name
    and thin rank-coloured bar, never overlapping; the boss bar and the soft lock's plate at the top; the vitals panel;
    captains' ships' plates at sea.
  - [[Foes]]: project-final's awareness and noises (muffled through blocks), its combat director, shooters at posts in
    cover costed by route, waiting foes flanking; no foe left idle before a guard, shooters kiting rather than
    punching, rival factions hearing each other out to 60 m.
  - [[Navmesh]]: baked over any ground, ramps standing on it, firing spots probing the ground's rises, a node's room on
    its land; faster to bake and to search.
  - [[Naval Combat]]: captains of a faction and a rank (hull, guns, reload, aim, crew, way, temper), the Tithe Sloop
    beside the pirates, rival captains meeting and fighting at sea with no player, the wary reckoning a ship's whole
    rank.
  - [[Server]]: pages rejoin a room by themselves after a deploy or a dropped network; the rooms deploy only when
    their code changed; a stopped ball's last segment carries its muzzle; old pages read new rooms and the reverse.
    Two headless pages in one room on the local runtime held the same foes at every shared tick.
  - [[Hulls]]: new ships in the Sloop's style, planned, not built
    ([[New Ships Are Planned in the Sloop's Style, After the System]]).
  - A third audit and design pass, tested offline: a Miniboss strikes more often, a Boss's called foes fall with it,
    garrison foes leash to their posts (a leashing Boss resets whole) and walk home after a search; foes no longer
    shake at a guard, a range's edge or a mesh's edge; a body no longer sticks in a block's corner ([[Movement]]);
    sea fights' views read across a deploy, and figures glide after a rejoin; the fight display's layers, outline,
    veils and overlaps with the Game's own display; at sea the Sloop is never drawn larger than she is as the view
    comes in or a fight begins, and pirates cut the water.
  - The bars do what DFO's Enhanced Plus does with them ([[Pick - Enhanced Plus UI]], read at DFO's fc2a8e6): a
    hit's piece breaks off and falls, each foe's health is remembered, the poise track says Iron, Staggered and Open,
    the target plate follows the foe last struck and fades after 6 s, the vitals rest when whole, ships' plates read a
    hit the same way; and plates stay light: never larger, never through a block, none past 60 m (which plates show,
    and their sizes: [[Fewer Plates Show, Sized by Rank, After Destiny]]).
  - DFO's compass across the top, with the boss bar and the target's plate under it; the vitals kept in their window
    at the bottom left ([[The Vitals Keep Their Panel Under DFO's Compass]]); the plates just over a foe's head.
  - The gear loop fitted in, `main` with #60 merged into #61: the garrisons stand at their island's levels raised by
    the seas, one Minor, Major or Elite foe in five shielded, never a Boss or a Miniboss, kills paying as #60's camps
    did, and the camps give way ([[Garrisons Take the Gear Loop's Levels and Shields]]).
- First-person aiming zooms the weapon with the view, and its muzzle with it, as the owner chose from pictures
  ([[First-Person Aiming Zooms the Weapon With the View]]), merged to `main` with the owner's yes (#64), which deploys
  the page and the rooms; tested offline, with a test and a headless Test Ground run.
- #65 sets the owner's third-person aim, 0.8 m out, 3 m back, 0.25 m up and 1.3 times zoom, as the game's own
  ([[The Third-Person Aim Stands 0.8 m Out and 3 m Back]]), brings the attack feel to the [[Test Ground]] (the swing
  arc, the hit-stop, the camera kick and the lunge, each a switch and a slider;
  [[The Attack Feel Is Tried in the Test Ground]]), eases third-person strikes back to about a third faster than DFO's
  ([[Third-Person Strikes Run Faster Than DFO's]]), and keeps a drawn sword and its sheath on their own sides in a
  mirrored view where the forge draws their twins. Merged to `main` with the owner's yes, which deploys the page and
  the rooms.

- On `main` (#63), merged and deployed with the owner's yes, as the owner decided it
  ([[Patrol Areas Are Laid Out With RMB, and Missions Run Through Them]]): every patrol area and instance laid out
  ([[Layouts]]) from its brief (all 90 written): places scored on the land, a loop of tracks and footpaths, RMB
  hamlets, farms, ruins, keeps, graveyards, covens and caves seated building by building, set pieces of forged props
  and stone, sites for events, beacons, resources and foes; the land carved into basins and canyons under stepped
  cliffs with mesas and spires, the bounds rock, after the Cosmodrome; a great ruined wall with its breach, a viaduct
  with a fallen span, retaining walls and talus; every shop, hall, temple, tavern and house walked into, lined,
  floored, stair'd and furnished; each instance moved beside its patrol area behind a gate the player goes through on
  foot (E). The bake and the land's worker settle them alike; native and WebAssembly runs over a carved patrol
  area agree to the bit. Movement blocks gained an underside, so a body walks under decks and lintels and up stairs
  ([[Movement]]). Deeper detail since: talus heaps, leant slabs and scree at every cliff's foot and rubble pillars round
  each mesa and spire; along every way signposts, milestones, wayside scenes, lanterns near settlements and drystone
  walls by the farms and hamlets; the land wearing its climate's painted ground tiles instead of flat colour, its
  classes meeting by their grains ([[Game]], "The ground's pictures"); the paths and streets painted into the terrain
  with worn, wandering edges in place of hard quads; a middle ground (8 km every 16 m) so the carving shows as far as
  the layouts are drawn; every piece re-seated on the ground as the roads lay it; ruins of an older frontier on the
  cliff tops, a natural arch over a canyon; climbs cut up the cliffs to lookouts, so a patrol area has heights; a
  pocket off its path for each resource, and beacons, ore, salvage, herbs and timber each standing as a place.
  After the owner's look: rock lies on the floor at each face's foot, nothing stuck into the hillsides; walk-in
  buildings' doorways are open from outside too (they were cut from just behind the door's face, so the wall in its
  plane stayed); a room shows its building's windows; carved ground samples about six times faster; no lamp, post
  or resource stands on a path (a sweep of three continents finds none); each climate's cliffs and rubble take its
  own stone's colour, the ground's grain no longer speckles a dark tile's colours, and lanterns are iron and glass.
  From the movement worker: a spatial index under the movement rules (same answers to the bit, a tick 2.5 times
  faster natively), the third-person camera kept off walls and inside rooms, `&view=first` for pictures, and rooms
  every body can walk into and up (`crates/room/tests/rooms_walked.rs`). From the editor worker: the World Editor
  opens each landmass carved as the game does and draws every layout's areas, paths, section and sites, in 2D (over
  tiles of the exact carved ground) and in 3D, where the layouts near the camera stand with their buildings,
  props and solids drawn by the city layer ([[World Editor]]).
- Also on #63, from a worker branch: the flora baked from detailed Blender models ([[Flora Is Baked From Detailed
  Models]], [[Flora]], [[Nature]]): textured near meshes and impostor sprites to 6 km, on R2. A second pass gave the
  swamp's cypresses distinct drooping tiers, the rainforest giants buttress fins with thickness, firs their full
  width, umbrella pines their flat crowns far off and the rainforest a closed canopy from above, and made the drawing
  cheaper; its frame on SwiftShader is now 1.3 to 1.6 times the frame before the bake (the goal was no slower), and
  the cost on a real GPU is unchecked. Still wrong ([[Nature]]): near cypresses look thinner since the cards shrank,
  the rainforest seen 2 km off from 90 m up shows bare trunks between 300 m and 1 km, tundra spruces read as dark
  dots far off. The next steps for the cost: indexed near meshes and fewer cards.
- The first story mission, the [[Prologue]], on `main` (#74), merged and deployed with the owner's yes; it brought #71's
  ships with it, so #71 shows as merged too. It is as the owner set it ([[The Game Opens With a Story Mission at Sea]]),
  with Claude's calls in [[The Prologue as Claude Shapes It]], brought to life as the owner then asked
  ([[The Prologue Is Brought to Life With Music, Sound and a Wreck Built in Blender]]). The default page opens on it:
  the intro at first light, down through the cloud to Saltmere's title; the storm at evening and the Brig; creation at
  her helm; the sighting, the sea fight, the calm at sunset, and Thule's Frigate out of the dusk; waking on the wreck at
  night and fighting through it to Thule; overboard, the deep, and the shore at the next dawn, where a stranger walks
  the player into Overlook. The wreck is built in Blender (`tools/wreck`), its fire and sky light baked in; its fires
  are drawn in the game's pixel look. The story is told under the game's own sky ([[Sky]], a told sky), heard in the
  game's own soundscape ([[Ambience]]), and scored by #73's director with six songs of its own on one theme ([[Music]]).
  The player's sword and shield are holstered ([[The Player's Sword and Shield Are Holstered]]). Tested offline: the
  full check, and headless pictures of the storm, the calm, the wake on the wreck, the shore and the intro, each started
  on its own with `?prologue=<beat>`. Tested live, headless: the page opens on the way in, and a click starts the intro
  over the cloud at first light.
- The prologue's follow-ups on `main` (#94), merged with the owner's yes after they played it live: the title's prompt
  goes once the story begins; the intro goes straight to Saltmere ([[The Intro Goes Straight to Saltmere]]), about 25 s;
  the story's sea fight sails in the story's wind, so the Brig makes way in the storm drawn round her; and the sea's 27
  sounds from Freesound ([[The Sea's Sounds Come From Freesound]]), the open sea's, the story's, the sea fight's and the
  shore's, the owner's picks from the sea sound sheet, https://claude.ai/artifact/4bFEQMrE6vYy2sHcszKdfC (private to
  them; its store's `picks` collection holds each cue's Freesound number), published on R2 and in
  `content/audio/sounds.json`. The seven long beds play their steadiest minute, mono.
- **#95, fewer plates, sized by rank, after Destiny**, merged to `main` with the owner's yes ([[Fewer Plates Show, Sized
  by Rank, After Destiny]]): the cone round the crosshair shows one plate, the foe whose body the crosshair is on (the
  nearest of them), else the one nearest it, measured to its body with its breadth (whole within 4°, none past 6°; a
  Boss there takes the cone and shows none over its head); the soft lock's foe and the foes fought in the last 6 s show
  wherever they are; a Minor's bar three fifths long and 6 px, an Elite's and up 176 px and cut in thirds over a figure;
  the land hides plates. Not yet seen on a real GPU or with blows traded. Found in passing: the compass writes its
  marks' place and visibility every frame, changed or not (`client/src/plus/compass.ts`).
- **#96, the kit's first review**, merged with the owner's yes: workers' worktrees made ready to test; the observation
  log kept on the branch `toolkit-data`; `cargo xtask check` naming the commit it checked; Toolkit rows for web
  research and for measuring text before sizing a box. Its fidelity reviewer is taken out, at the owner's word (#105).
- **#102, foes fight in groups that lead, break and give ground, after Bungie**, merged with the owner's yes ([[Foes
  Fight in Groups That Lead, Break and Give Ground, After Bungie]]; Claude's calls in [[Foe Groups as Claude Builds
  Them]]): every garrison group's leader, whose fall breaks the rest (to cover, or running or huddling in the open, one
  raging); a group's breaking point at half, defending its post, a standoff lasting a foe's patience; a mission's or a
  dungeon's garrison falling back halfway at three quarters standing and gathering at its last stand at half; the Grey
  Tithe's leader screened behind a shield-bearer of its lower ranks; and a mission's two waves, hunting the players. No
  blurbs pop over foes, as the owner asked. Tested offline: the full check, 32 new tests (each rule broken once and seen
  to fail) and a simulation of 72 scripted fights. Not yet seen: a group fight played by hand on a real GPU.
- **#107, the audit's fixes to #95 and #96**, merged with the owner's yes ([[Plates as Claude Shows Them]]): a plate
  fading out of the cone lifts none over it; plates are kept hidden for their next showing; a word pushed down clear of
  a plate stays down; the log's save keeps lines both sessions appended, moves on a number both took and restores once a
  container; the check names its own checkout's commit; the log is saved last at a session's end. Tested offline: the
  full check, and each fix's test seen to fail without it.

- **The prologue's follow-ups and the sea's sounds**, on `main` (#94), merged and deployed with the owner's yes: the
  title's prompt no longer stays over the storm and creation once begun; the intro goes straight to Saltmere
  ([[The Intro Goes Straight to Saltmere]]), about 25 s; the story's sea fight sails in the story's wind, not the
  world's; and all 27 sounds of the sea are the owner's Freesound picks, the sea fight's guns, hits, splashes and
  break-ups new. Tested live, headless: the intro rises at first light over the cloud, the title over Saltmere asks to begin,
  and a key hides the prompt.
- **The second playthrough**, on `main` (#98), merged with the owner's yes ("Merge and deploy"), which deploys the
  page and the rooms: the owner's thirteen points (the wreck spread out at true size, the Brig's crew fighting on the
  players' side, no Art in the prologue, the whole game's balance pass, sea fights half again as fast and as hard, a
  task tracker for every quest, the placeholder lines gone), the animations' strips fetched ahead, the blurbs without
  glyphs, the plates held still on board through a 64-bit matrix, and a last audit's fixes. Tested offline: the full
  check. Not yet seen on a real GPU, nor played through by hand.

## In progress: Overlook's hub (branch `claude/game-experience-factions-94un6s`, draft #113)

The owner's words are in [[Overlook Becomes a Hub of Courts and Ways, After the Tower]] ("Build this to perfection
... Return when this is 100%"; then wall adornments and banners); every call is in [[Overlook's Hub as Claude Shapes
It]]. Nothing is audited or seen whole in the page yet.

Built on the branch, `main` merged in (#98, #102, #107):
- **The hub** (`crates/city/src/hub/`, Overlook's own social plan; other cities keep the courtyard): the seaward walk
  and spawns, the Watch Court (obelisk, two vault houses, the Mage's study, the notice board's landing
  `hub::BOARD_LANDING_M` for the activities session's board), two stone ranges with arched passages, the West Court
  (Tailor, fountain, bandstand, well) and the Forge Yard (Weaponsmith, Armorsmith, anvil yard), the Beacon Walk with
  its market lane and the portico, the Hall of the Arts inside the Beacon's hollow base (the three factions' chapels,
  the war table), the Stair Yard round the base's east side (the Tack's stable at the Harbour Stair's head), sealed
  gates, and the harbour way down the city's switchback and ramps to the quay (Harbourmaster, chandler) and the pier,
  with two ships moored there. The ring is the outline of every walked rectangle (`hub/ring.rs`).
- **Its modules** (`tools/modules`, [[Modules]]): every keeper's stall, the chapels, ranges, gates, war table,
  bandstand, fountain, market stalls and props, and the 29 adornments `hub/adorn.rs` hangs and stands
  (`tools/modules/adorn.py`), each rendered and looked at in Blender. The bake now writes each group sorted, so it
  makes the same bytes each run (the chapels' exact booleans did not). A piece the manifest lacks fails the hub's
  tests (`debug_assert` in `Laid`).
- **Ramps** for every city's avenues (`crates/city/src/ramps.rs`), a switchback at each avenue's head and a flight
  onto the quay; walked in a room test.
- **The fall**: in a social space a fall of 6 m or more kills at once; dead bodies fall on; the camera holds and turns
  after the body; "You fell." once it lands. Going over the edge in the air starts no warning until the feet are down
  (`crates/reach`).
- **Townsfolk on ways** (`crates/city/src/life.rs`, `client/src/game/life/`): A* over the plan's ways, keeping right,
  routines on the world clock, the band heard by distance, Maren on the ways. `life/check.rs` walks every way and
  every post a walker comes to; a kept post (a market keeper, a smith) is checked standing clear, not walked to.

Tested offline: the full `cargo xtask check`. Seen headless in the built page (morning, in rain), twelve views: the
Watch Court from the walk and from above, the east passage, the West Court, the Forge Yard, the Beacon Walk and its
market, the portico, the Hall from its door and from the war table, and a sealed gate. Banners, lanterns, bunting,
ivy, planters, the well, the rug, the war table and the townsfolk all stand where placed. The views are taken with
`webgpu-shot.cjs`, a `views` list (the hub's middle is east 2809214, south 1201297; seaward is north, bearing 0),
`?at=overlook-social&spawn=2809214,1201241,180`, an `init` shifting `Date.now` to the hour wanted (a day is one real
hour from `EPOCH_UNIX_MS`; `Date.now` pinned to 1795217100000 ms brings rain over the hub), and `routes` to a local
bake's meshes until CI publishes them.

Since then, under the owner's [[The Hub's Fidelity Goes Beyond the Limits, by Procedural Textures]]: no rain, wet,
puddle or snow under anything a body meets overhead ([[Weather]], "Shelter"); the city's iron, gold, bone and cloth
painted texel by texel and each flame flickering ([[Cities]]); the Hall paved wall to wall round its rug, which lies on
the levelled land so it shows; and a module bake that CI makes byte for byte (signed zeros dropped), its meshes
published to R2 by CI. Seen in the built page under rain pinned by the clock: no rain or puddles in the Hall, rain on
the courts and before the portico, the rug crimson from first and third person.

Then, under the owner's [[The Hub Feels Lively, Its Ground Populated]] ("Populate everything"): every court filled
by `hub/dress.rs`, each court's own pieces on a seeded scatter clear of every way and post (about 290 pieces, eleven
of them new in `tools/modules/dress.py`), each new stall's keeper at work, a walker's place at each piece (246 places,
77 kept posts), and up to 48 walkers. A test pins it (`every_court_is_filled_and_its_pieces_have_walkers_places`).

Left to do, in order:
1. Look at the filled courts in the page from the ground and from above, and at how the page holds some 125 figures
   and 290 more pieces: a frame's cost on a real GPU is unmeasured.
2. More fidelity by procedural textures: the pictured materials (stone, timber, plaster, roof, paving) are still one
   picture a material for the whole hub, and grime at a wall's foot or under a sill would need the ground's height
   in the shader. A thin piece laid over a face tens of metres wide can still lose to it: the city's 5 cm pull toward
   the eye bends across such a face (`clip_of`).
3. Pictures not yet taken: the Harbour Stair, the road and the pier, a stall's sign close up, the fall, the townsfolk
   at work, a patrol area's walk-in building in rain.
4. Bible notes for the hub, ramps, the fall and the townsfolk (Cities, Reach, Movement, Navmesh, Ambience, Interface,
   Code Map), independent audits, then the draft pull request's description for the owner.
- Coordination: the activities session (#97) reads `Social.board` from its branch and checks its board against the
  ways; whichever merges second sets `Social.board` from `hub::BOARD_LANDING_M`. It keeps `gear::clock`'s moves.

## Waiting on the owner

- **#98's open points**, merged, in its description: the crew's bars under the fewer plates; when the HUD is drawn
  without HTML; whether the welcome's "Follow" moves onto the tracker, and whether the keepers' marks come back as
  something else; the wreck's rebuilt look and its zones' size; whether a fire burns half again; and Thule's fight now
  that a player's blows land at 0.94 of their worth.
- **#102's and #107's open points**, both merged, in their descriptions: whether defending foes should hold their ground
  longer than a foe's patience; whether any lower rank screening any leader under a Miniboss is the screen meant by
  "Minors screening an Elite"; whether a wave is enough without a drop; whether a wave the room's limit has no room for
  should come later; whether "no blurbs" also rules out a break's sound and the plate's alert mark; whether ships'
  plates come under "enemy health bars" (Claude's recommendation: they stay as they are); whether a fought foe's plate
  should stay whole the full 6 s; and whether a plate fading out of the cone may overlap the one taking it.
- **Switchbacks** ([[Zones Rise and Fall, Above and Below Ground]] approved "ways that switch back down cliffs"):
  none is built. Read as ways too short for their climb, no Saltmere way needs one: none is graded past what its
  places allow, and none is carved steeper than a track (`map_planned.rs`). The owner's to say whether switchbacks
  are wanted as a cliff climb of their own, beside the ledges' stairs, and where.
- The Dungeons session (#82, the owner's loop decisions) plans to move each patrol's procedural dungeon entrances
  onto the layouts' places, and will coordinate before it touches the layout code.
- **#95's and #96's open points**, both merged: the target's own plate over its head is to be looked at again once the
  owner has played with which plates show, and #95's calls (in its description) are the owner's to change; for #96,
  where the claude-mem store lives (an archive, kept out of git).
- **The prologue's calls** are in [[The Prologue as Claude Shapes It]], the owner's to change: among them the story's
  day and night, its music and its sound.
- **The sea's sounds** ([[The Sea's Sounds Come From Freesound]]): none yet heard in the game, nor their level judged
  by ear. The main sound sheet (YT29RAFbgdPRLByLUVC7nh) could not be read from the session that made the sea sheet.
- **The lore on #77 and #75**: the intro no longer visits the other islands, so #75's ruins do not touch it. Nothing in
  the prologue names the Cube or a crystal, and the voice in the deep is not named.
- **#92, Overlook's factions, faction gear, Art levels, keepers, Shape, appearance and Elder Maren Hale's welcome**, on
  `main`, merged with the owner's yes ("Merge and deploy"), which deploys the page and the rooms. The owner named the
  factions and the elder, said yes to faction gear "with its own unique color" and chose its colours: the Stormcallers
  "#1 with color accents" (storm grey and silver; the storm blue of the accents is Claude's), the Lamplighters "White
  and gold", the Veiled "Black and silver"; then their look, "Top strip, fixes kept". The owner also decided that
  characters made before the Arts' levels start every Art at level 1, that no save-keeping lands on `main` first (so a
  rollback of the rooms after the merge loses this round's progress), that the page publishes only after the rooms
  deploy, and that Maren keeps her ruins line before the ruins are drawn. Every call made under the owner's "autonomy"
  is in [[Factions and Vendors as Claude Shapes Them]], the owner's to change. Tested offline: the full check. Tested in
  a local room (`npm run server`, the built page headless): Shape present with his six wares, "From level 20" and the
  right time left; the vault keeper's two sides at 1920x1080; a faction piece's card naming its colour; Maren greeting a
  browser that had played the story before, the keys' hints giving way while she speaks. Not yet seen: anything on a
  real GPU or the deployed rooms, two players seeing each other's dyes, horses and faction gear, a faction set worn in
  the page (composed offline from the published strips), and Maren's whole walk (her start and her coming by the lanes
  are tested offline; headless frames take about a second each). The open questions are in [[Open Questions]]. The
  Wraith Mist barding's first-person ride strips on R2 are blank: a forge re-render. Sunspire's and Rimeholt's ports are
  #75's; this round only locks their social spaces.
- **The wreck on R2**: the `wreck` workflow builds, bakes and publishes the wreck when `tools/wreck` changes, with the
  repository's Cloudflare token, as the ships workflow does. Each run keeps the `content/prologue/wreck.json` it
  wrote as the artifact `wreck-level`: commit that file whole, its keys with its level, as a build elsewhere can lay a
  slightly different ground from the published mesh.
- fight-life's voice blurb system, which the owner named for [[Speech]]: its repository could not be read from the
  session that finished the prologue, so the likeness is unchecked.
- Touch: the sea fight and the wreck need a keyboard and mouse, as the rest of the game does ([[Interface]], "No touch
  layer yet"). A touch player can start the story but not play its fights.
- Without `?room=` the page has no accounts, so creation's account step only says accounts are kept online. The online
  default is the owner's.
- #68, a draft with the owner's asks, built and audited four times (a deep audit with a design pass, a last audit,
  then an audit of everything since with a detail pass on the display), with #69 merged in, tested offline, waits on
  the owner's yes to merge: foes show their level, patrol
  beats, climb by the navmesh's links, spread out, answer at the fight's pace, chase a target walking away, fight as
  a group (one blow at a target each 1.2 s beat, one going in, a line on their side, one flanker) and share
  themselves out across players ([[Foes Spread Across the Players They Fight]]); melee swings a quarter faster and
  strikes every foe in reach; the soft lock lets go past 70 degrees; a click during a swap swings as it ends; a
  locked-on dodge rolls the way it goes; a slot's grid closes off hover; the inventory holds Aurem alone and its
  stacks in Destiny's grid; a full Ammo box says Ammo full; and the display's vitals stand at the top left and its
  Arts and weapons at the bottom left, after the owner's two pictures
  ([[The Vitals Go Top Left and the Arts and Weapons Bottom Left]], Claude's choices in
  [[The Display as Claude Lays It Out]]). The display was looked at headless in the Test Ground at three sizes and a
  pixel ratio of 2, on the game's page at a patrol and in Overlook, and in every state on a page running the real
  display; not yet on a real GPU, in a fight with the player's own swing, or beside the owner's pictures, which stayed
  in the session that took them. Its open choices, each in #68's description: the group's numbers; the display's
  numbers; a locked-on backstep turning round or not; the vitals' frames over a night sky; starving foes in a crowd
  of sixteen; a lone crossbowman drawn long; a foe under a ledge; a flanker changing hands; ripostes not held to the
  beat; patience at one over the cap; sixteen foes about 1.4 m apart; node rooms baking no boxes; no height cap on
  climbs. `tools/install-flatc.sh` is missing from the rooms' deploy filter, a workflow edit for the owner. Its known
  limits, left open with reasons in the description: a crowd of many dresses composed ahead only as room comes
  (keeping more needs a GPU measurement), small objects made each frame, and the Test Ground's panels running the
  room on while the pointer is free.
- The enemy system's open choices (#61, merged): whether the sea's pirates become the Grey Tithe; the roster's names and
  Corvane, Claude's for now; which hulls the ranks of ships sail, and who builds them; whether presence shifts over
  time; whether project-final's crystal faction comes over ([[Open Questions]]). Claude's tuning is the owner's to
  change: a captain strikes from losing men at about 80% of her hull at every rank, and the foes' numbers are in
  [[Foes]].
- Pirates at sea: nothing stops them, on `main` or #61; they are rare by the numbers ported from DFO (a roll every
  60–140 s, 0.24 of rolls a pirate, the wait starting again at each return to the ship), so about half of players
  see none in their first 5–7 minutes. Measured options were offered and the owner skipped them for now: hostiles
  taking the cut ships' share, DFO's faster rolls, both (about 1 minute to the first), pirates ahead on voyages, the
  port's label giving way, and DFO's other ships back.
- The bars' proposals, the owner's to choose: a foe's alert "!" showing its plate through the cone for a second;
  a setting to switch the vitals' rest off; near plates growing (DFO's own law grows them to 1.5×, ours caps them);
  ships' plates fading with distance; a soft-locked Boss shown once; a mark for
  a Major; the display scaled with the screen; one look for both kinds of death in the Game. DFO's blade face is
  left out: its pictures are another person's ([[Own Work]]).
- The attack feel plays in the game on #69 at the [[Test Ground]]'s defaults, with the light layer on, as Claude's call
  under the owner's "Attack visuals should go beyond the limits" ([[Attack Visuals Go Beyond the Limits]]). Which
  effects stay, and at what settings, is the owner's to say; each is one line in `combat/attackFeel.ts` (`FEEL`).
- A drawn sword, dagger or mace still changes hands in a mirrored view through the walk, the rest and a blow: the forge
  draws none in the left fist there. Whether the forge should, is the owner's to say.
- The Cloudflare token is the repository's Actions secret `CLOUDFLARE_TOKEN`, which the `ships` and `rooms` workflows
  read; the one the owner gave in the chat should be rotated. A cloud session cannot deploy the rooms itself: its proxy
  writes the stored token over the upload token Cloudflare hands back. The rooms deploy from CI after a merge into
  `main` that changes their code ([[The Rooms Deploy When Their Code Changes]]); the `rooms` workflow can still be run
  by hand.
- #62's: no weapon is seen through a roll, as DFO drew none in it; the forge's index has grown to 13.3 MB, and
  `r2.dev` limits its rate.
- #59's open choices: the keys (B, H, E), the stand-ins' number and dress, Manage's view, what a walker who goes
  overboard should meet (the deck keeps them aboard for now), and whether DFO's Travel Options encounter (a journey
  stopped near an enemy) or wary pirates falling on a ship they outgun should come over.
- #50's open choice: where another player's colour goes on the Sloop. Her drawn size at sea, 75 m, is settled
  ([[The Sloop Is About 18 m Long]]).
- #48, #50 and #51 are merged and deployed. Walking or sprinting that does not happen on demand was not reproduced
  playing alone; when it happens is the owner's to say.
- Which cloud environment sessions run on. The personal Default (unrestricted) holds the SkillsMP key, and
  check-tools passes there with no FAIL. Whether a second Default and a personal `overlook-source` environment still
  exist is unchecked: none is listed to a session on the personal Default. A Context7 key, if wanted, goes on the
  environment the same way.
- Names for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- #60's audit calls are made, under the owner's "All decisions are yours" ([[The Audit's Calls Are Claude's]]); the
  owner can change any. What stays theirs: the Workers plan (a password sign-in takes about 50 ms of CPU, the Free plan
  allows 10); a domain of the game's own, since every Pages project of `lattymoy.github.io` shares one origin and its
  storage, the session's token among it; Cloudflare's rate-limiting rules over the accounts, for floods past one
  address's limits; and a protected environment over the deploy jobs, with required reviewers.
- #60's keys: the Discord app's redirect (`/v1/discord/callback` on `overlook-accounts`) and the repository secrets
  `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`; and the Cloudflare token's leave to edit D1, which CI needs to
  make the accounts' database.
- For the elements and shields: whether named weapons keep an element of their own rather than rolling one; whether a
  shield comes back after a while; and which foes beyond the patrols' carry them.
- **#69, the Arts round, is on `main`**, merged and deployed with the owner's yes. Every number and call the owner
  left open is Claude's, in [[Arts and Loadouts as Claude Shapes Them]], the owner's to change: the
  cooldowns, the fragments, the new perks' columns and rules (Marked Shot an opener, Exploit for the spec's
  Opportunist), the R, Q and G keys, a new Art starting empty, the Sunwell's sun 3.5 m up and 1.5 m along its
  caster's aim, the Armsmith's wares, the seven named armour pieces that gave Bulwark and now give another armour
  perk, and how every attack looks ("How attacks look"): a crit's 0.11 s hold and a kill's 0.16 s, the chips'
  leather ramp, the view held still for reduced motion. Left to the owner by the screens' critique: emptying a Core
  slot, and resting the ability bar with the vitals. The forge's gun puff is blue in its art
  (`tools/forge/tools/sprite-forge/guns3p.py`); a re-render would change it.
- **Every world sound is the owner's pick**, over seven passes on the sound sheet
  ([[The World Sounds From the Sound Picker]]): 63 Freesound recordings, DFO's own steps and Voidrend
  ([[DFO's Own Sounds Join the Sound Sheet]]), the Duskraven's fire
  ([[The Duskraven Sounds With Fire Under Its Raven]]); Exposed, Charged and Haste make none
  ([[Exposed, Charged and Haste Make No Sound]]). Claude's calls in the layer, the
  owner's to change: a gun's ball on a body plays `hit.blunt`, a step sounds every 2.5 m, `step.wood` only on the
  [[Test Ground]]'s crate, and up to 16 sounds at once within 40 m.
- **#73, the music and the ambience, is on `main`**, merged and deployed with the owner's yes
  ([[Music and Ambience Come From DFO's Synthesiser]], [[Music]], [[Ambience]]). The owner kept every piece on the
  sound sheet, Landfall as made again after their "Less jolly" ([[Landfall Is Kept as Made Again]]), and picked the
  seven recordings. Claude's calls, the owner's to confirm: Thule plays the Boarding, Corvane the Reckoning, any other Boss
  the Wrath; the climates' families and each family's key, metre and tempo; Saltmere's theme as written; the sounds
  nearest "no glass" (wet's kalimba drips, cold's high tremolo, Landfall's soft bell, the fights' reverse-cymbal
  risers).
- **#76, the weather and day and night, and #79, every shader checked offline, are on `main`**, merged and deployed
  with the owner's yes ([[Weather and Day and Night Come From DFO, Much Improved]], [[A Day Lasts One Real Hour]],
  [[Sky]], [[Weather]], [[Every Shader Is Checked Offline]]).
  Claude made the calls the owner left open ([[Weather and Day as Claude Shapes It]]), the owner's to change. The
  owner judged the weather's first sounds and picked the gutters and both thunders from Freesound
  ([[The Weather's Gutters and Thunder Come From Freesound]]); those picks are on R2.
- The Roster and emblems are built on Claude's calls ([[The Roster and Emblems as Claude Shapes Them]]); the owner
  can change any. Open for the owner: a join that loads another landmass, to reach a company member across the sea;
  names over other players' heads, green for the company, as Destiny 1 shows them; the Guild tab's own page; more
  emblems and where they come from; whether Overlook should have text chat, which mute would need.
- A check for [[Plain Text]], like DFO's word limits, would need the owner's agreement; it is held in review for now.
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).
- The cleanup audit (#70, merged and deployed with the owner's yes): its description lists what it found in #63's,
  #68's and #69's files, to clear once they merge, and 37 old branches that can be deleted; whether the Overworld's
  rise and fall, ported but never wired, stay out is the owner's to say ([[Pick - Overworld]]).
- The sea's open choices ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]): being the pirate, the opening voyage
  (to be talked through first), and which of DFO's companion systems the crew comes from ([[Open Questions]]).

- **#86, #87, #89 and #90 are on `main`**, merged and deployed with the owner's yes. #86 forges the Arts' birds in
  Blender in eight directions ([[The Arts' Birds Are Forged in Blender]]); its `forge` workflow renders them on main
  and adds them to the forge's renders on R2. #87 splits the sea's view and the held map out of `sea.ts` and `game.ts`
  and lights the Sloop's deck with a carried torch. #89 cuts the sky's and the water's haze's work per pixel, with the
  same colours. #90 fixes what pictures across the islands showed in the weather: stars through a closed storm deck,
  fresh snow that never settled below the snow line, a flash that lit the sky and not the land, bolts hanging over a
  fogged sea, a sandstorm's grey ground and a thin snowfall. Not yet seen: any of them on a real GPU.
- **The kit's observation log** has had its first review: all five observations are actioned, their fixes merged with
  #96. The log is on the orphan branch `toolkit-data` (`toolkit-data.sh`). The earlier review's four changes to the instructions, and one
  closing, were lost with their container; only that session's report has them.

- From a worker branch (`wt-bodies`), tested offline: the movement rules find a body's blocks through a grid
  ([[Movement]], "The blocks near a body"), every answer the same to the bit, a tick among a patrol area's boxes
  about two and a half times cheaper natively and twice through WebAssembly; the third-person camera's boom eased in
  off every block and the ground, so indoors it shows the room from inside ([[Player]]); `&view=first` and
  `&view=third,<metres>` in the address, and the QA driver's `hold` and `anyPort` ([[Toolkit]]); and the rooms fixed
  where a body could not walk them: a stair laid in front of a door, a stairwell a head going up could hit, planks the
  land showed through ([[Layouts]]). Seen in pictures but not fixed, as it is the drawing's: an open building's door
  leaf is still drawn from outside, though bodies pass it.
- #63's readings the owner left to Claude: the answer "3. A" was read as (a) of where RMB layouts go; the flora's
  look (textured, not palette-snapped) was Claude's call.
- **Climbing over gates.** A body pressed square into a wall too high to grab climbs it, as `main`'s climbing has it.
  So a gate's palisade and arch can be climbed, as can a rampart's walls. Whether a gate should keep bodies out is
  the owner's to say.
- Also on #63: the runs ([[Patrol Zones Stay as Built and Gain Linear Combat Areas]], [[Layouts]], "Runs"), three
  in each of Saltmere's zones, for the owner to look at before the other 24 zones get theirs; the client audit's
  fixes (far paths' tint, the ground paint swapped mid-frame, fine detail stepped by single precision, plate tiles);
  the World Editor drawing the layouts' buildings and runs; the well house's posts. Tested offline, with a body
  walked through every run, and headless pictures of eight of the nine.
- Private mission instances with invites ([[Patrol Areas Are Laid Out With RMB, and Missions Run Through Them]]):
  an instance's room is still a node's shared room until the server makes rooms per party.

## Next

- **The garrison agreement run kills no foe** (`crates/room-wasm/src/garrison_door_tests.rs`,
  `server/garrison.test.ts`): its 13 foes stand all 1500 ticks and its player falls about tick 900, run straight into
  the wall #63 gave its node, steered round it, or with the starting sword asked for; its swings seem never to land.
  So nothing after a foe's fall (drops, a group's break, fallback and last stand, waves) is checked natively against
  WebAssembly: their agreement rests on `clippy.toml`'s banned maths methods and on ordered maps. Next: a scripted
  player that turns to its nearest foe and lands its blows, and a guard that needs a foe to fall.
- **The height rework of Saltmere's zones ([[Zones Rise and Fall, Above and Below Ground]]) is on `main` (#63),
  tested offline, for the owner to look at.** All three zones take heights (each brief's `heights`): places at their
  kinds' levels on raised floors, every way graded between them as one network, walked without a step and carved no
  steeper than a track; a hamlet's blocks stepping up its hillside on terraces of their own, as the owner chose; a
  ruin's spokes on tiers; a terraced massif top in plateaus that follows the floors ([[Land]]); ledges with cliff
  stairs between heights; stone bridges over the Vale's river; the Hollow Coven's cavern under real rock, its roofs
  resting on rock that stands whole beside the cave; gates in clefts; dead rock answered by climbs to lookouts and by
  valleys at their floors' levels; foes on floors under roofs ([[Navmesh]]); and the handcrafted [[Modules]] scripted
  in Blender ([[Handcrafted Playspaces Are Scripted in Blender]]), each walked by a body
  (`crates/room/tests/modules_walked.rs`). A third audit found what the second missed, each fixed at its cause with a
  test (the pull request lists them). On a cloud session's machine continent 1's layouts settle in about 2.3 s
  natively, and the World Editor's whole settle of continent 1 takes about 3.5 s. Left: switchbacks (waiting on the
  owner, above), and the other 24 zones take heights once the owner has looked at Saltmere's.
- The other 24 zones' runs, once the owner has looked at Saltmere's. A swamp's massif is 12 m high, so its faces are
  low enough to climb in places: its runs will need their end arenas cut deeper or walled.
- The client audit's findings left: trees and water past 1 km stand on the uncarved 1 km ground (the middle ground
  is the terrain's only), and the land texts and the city's assets fetch the same files twice.
- The layouts' open ends ([[Layouts]], "Limits"): replanning only the layouts a change touches, and the activities
  that will stand on the sites (public events, beacons, resource nodes, foes).
- **After #92**: reputation from bounties and activities when they exist; Shape at Sunspire and Rimeholt when their
  social spaces open; a hide and mane mask from the forge for coats (the ride's `_uv` strips are one); the Elite and
  Abyss tiers' names on the voyage's card (#82), where Shapes are found; a faction set worn and two players seen in
  the page on a real GPU; the welcome and the prologue's marks kept per character rather than per browser, if the
  owner wants it.
- **The prologue, not yet seen or heard**: on a real GPU; any of its music, sound or voices listened to; played
  through in one run (headless, each beat was started on its own and a frame takes seconds); the wreck's frame time
  with its mesh, its ground and every fire. Headless frames of the wreck at night read dark: on a real screen, judge
  whether its foes can be seen well enough away from the fires.
- **The weather and day and night (#76, on `main`)**, tested offline: the full check, the weather's statistics per
  climate and its fingerprint native against WebAssembly, and the built game headless in Saltmere at noon, under
  cloud, at sunset and dawn, by moonlight and on a moonless night, in rain, fog and a storm, with no shader failing to
  compile. Four audits (the Rust, the sky, the sound, the notes) found and fixed, among others: sails drawn by the old
  wind, a fleet sailing in the map's middle's wind, clouds that raced as the eye moved, a key light that swapped sun
  for moon in daylight, rain and snow that raced as the wind changed, thunder that silenced the birds, and a recording
  held under its synthesised sound's peak. Pictures across the islands (#90) have since shown bolts at Mistfall by day
  and night, snow on the tundra and at Rimeholt, a sandstorm, dawn fog and clear nights; `?at=<node id>` lands the
  page at any node, and the pictures' steps are made by freezing the page's clock at a moment. Not yet: ships and
  marks under the lamps, a real GPU's frame time, and a person playing through an hour's day.
- **The music and the ambience (#73, on `main`)**, tested offline: every piece rendered and measured, and the built
  game headless in Saltmere (its theme, its calls, every recording loaded) and in a fight on the Saltgrass Downs (the
  green score in as three foes attacked). Not yet: a person listening in the game, a real GPU's frame time with both
  running. Left open, now done on #74: the story's songs and its hearing in the director. #76 gives the night
  ambiences their time of day, plays the four sea songs while sailing, and sets each recording at the loudness of the
  synthesised sound it replaces.
- **Its third round (#69, on `main`)**: DFO's #1687 forge work ([[DFO's Blows on the Move Come Over Before the Merge]]),
  its renders on R2 (125 moves); figures act on the move where every layer draws the walking version; the world's sound
  layer (`combat/worldCues.ts`, `combat/worldSounds.ts`), its picks on R2, tested offline. Not yet: any world sound
  heard in the game, the layer on foot in a browser, the walking blows looked at frame by frame.
- **Publishing the world's picks**: read the sheet's `marks` with ArtifactData; set each Freesound pick as the cue's
  `picked` in `content/audio/freesound.json`, and a redone cue's heard numbers in its `skip`; let the `freesound`
  workflow run, then `tools/freesound/publish.py <download>`. A pick of DFO's own (`dfo:<name>` on the sheet) sets
  the cue's `dfo` to its name and goes in by `tools/freesound/own.py`. DFO's steps are in DFO's `vendor/cc0-sounds`
  at its commit `b59b6d2` (branch `ccr-301db909-jfymaq`): a surface's six files go in as one cue's variants. DFO's
  synthesised sounds come from its `tools/{climb,gather,lock,storefront,naval}Sfx.mjs`: import their `CLIPS` and
  render each `make()` at 44.1 kHz 16-bit, from a scratch folder, since `navalSfx.mjs` writes `public/sfx` on import.

- **The Arts round (#69, on `main`)**, tested offline: the weapon glow, Melee and Ranged loadouts, the statuses and
  verbs with foes' debuff icons, the Arts in the room and drawn in the browser, the Art's screen and the ability bar,
  the verb perks, loot drops seen on the ground and limited ammo ([[Arts]], [[Gear]], [[Combat]], [[Weapon Glow]]). Not
  yet seen: any of it on a real GPU, and another player's Veiled figure and cast colour, which need two clients in a
  live room. Spells look through walls, and their pictures stand upright like the figures ([[Arts]], "Limits").
- **Its second round, attack visuals beyond the limits (#69, on `main`)**, tested offline in the Test Ground, and the
  game's own page headless at 960x540: swing arcs, struck figures, impacts, crits and kills with elemental finishers,
  damage words, guns, tracers, telegraphs, every spell landing, the Anima moment, the light layer, marks drawn in depth
  ([[Arts and Loadouts as Claude Shapes Them]], "How attacks look"). Not yet seen: a fight in the game's own view with
  the player's swing (headless has no pointer lock), the water's order at a coast, any GPU timing (the light's 0.4-0.5
  ms is an estimate). Left for later: one particle system for `Sparks`, `Bits` and the shots' bits; the marks still
  copied into new arrays each frame (about 0.4 MB in a busy fight); emitters under the sea still light; `camera.ts`
  `shifted` keeps the HUD matrix's translation in float32 (about 0.25 m off far out); whether a bow or gun drawn can
  punch, and in what element.
- Unchecked: in a headless Test Ground run, the pistolet and the thunderlock showed no first-person pictures within ten
  seconds while the crossbow did, with a 404 in the console. Whether their pictures are missing on R2 or were slow is
  not yet known.
- **The gear loop**, which the owner handed over in full ([[Gear and Power Follow Destiny 1 Vanilla]], with Claude's
  choices in [[Gear as Claude Shapes It]]), is on `main` (#60, merged with the owner's yes); its patrols' camps give
  way to #61's garrisons, now on `main` too. On it: the `gear` crate ([[Gear]]); gear held by the
  rooms, blows by Attack, level and Defense, kills paying XP, Aurem and Vestiges; perks trimming the fight
  ([[Combat]]); accounts on Cloudflare D1 keeping a character between visits ([[Accounts]]); the gear screens after
  Destiny on Enhanced Plus ([[The Gear Screens Follow Destiny, on Enhanced Plus]], [[Interface]]); gear on the
  figure; island levels and the voyage's seas ([[Voyages Choose a Difficulty, Overlook Lives Like the Tower]]);
  patrols with camps and resource spots ([[Server]]); Overlook's stations, vendors, keepers and townsfolk
  ([[Cities]]); the fight on foot in the game; and on the ground, beams over the nodes and Vestiges, with E to use a
  counter or gather ([[Game]], "On foot"). Then two full audits and two design passes of the gear screens, every
  finding fixed with a test where it could be ([[The Audit's Calls Are Claude's]] for the calls they left): a
  session sent only where it belongs and lapsing for an account with a way back in, Discord by one-time code, the
  loot's seed secret and apart from the foes', an arrow striking as it was loosed, asks queued in turn and a change to
  how a player fights sent at once, the welcome carrying the schema's hash, leaving saves retried through an outage,
  and the screens on Enhanced Plus's fit law, frames, nodes and keycaps, with Destiny 1's gear shelf. Tested offline.
  Its open ends: **the patrols' look is the next pull request**: camps with tents, fires and goods, which the bake and
  the room must place alike, so the layout of camps moves to a crate both use (the owner wants patrols extremely
  detailed); a voyage's seas are the client's to name, so a signed ticket from the sea room should name the node and
  the seas a player may join at; Breaches, Elite Dungeons and Missions as loot sources; the wardrobe; a ranged
  weapon's fight on foot untested headless.
- **The owner's next round is on #60 too**: Pixelify Sans as the one face, its sizes on its 11 px grid and its
  misreading glyphs mended ([[Pixelify Sans Is Overlook's Font]], [[Interface]], "The face"); the menu's seven tabs,
  the vault and the vendors moved to their counters, and friends on the Social tab, which became the Roster
  ([[The Menu Follows Destiny, the Vault and Vendors in the Social Space]], [[Accounts]], "The Roster"); the Plain Text
  rule, with progress shown on icons and nodes instead of XP counts ([[Text Is Plain]]); and weapon elements with
  foes' shields ([[Weapons Carry Blaze, Volt or Cosmic, and Foes Carry Shields]], [[Gear]], "Elements and
  shields"). Tested offline: the full check, headless pictures of every page at 1280×720 and 1920×1080 against
  local accounts and rooms, the friends list against the local accounts, and a shielded foe in the Test Ground. Not
  yet seen headless: a blow on a shield in the game, its words and its breaking (the room's tests cover them).
  A third audit of this round is fixed on #60: friends asked by both at once make one friendship, a list counts only
  its own asks and friends, and a name no one holds answers as any other; a blow the shield holds whole fills no
  poise; the menu lets go of a held press and stops the game under it; focus goes back to the tile an item's page came
  from; and the mended glyphs sit on the grid at weight 500.
- **The owner's answers to the third audit are on #60 too**
  ([[The Face Is Mended Whole, and the Gauge Counts Upgrades]], [[The Roster Follows Destiny 1, With Blocking]],
  [[Cosmetics Follow Destiny, Shown in Many Places]]): the face's 5, Z, brackets and symbols drawn in code and made into
  a font in the page; the gauge counting nodes bought; the room serving each ask only at its counter; the Social tab as
  Destiny 1's Roster with blocking, companies, guilds, reports and details; and 25 emblems, kept and worn, sold by the
  Tailor, shown on the Roster, the header, the HUD and the Emblem slot. A group of players is a company, as the owner
  named it ([[A Group of Players Is a Company]]). The menu's tabs share its whole top, and under them the player's
  banner runs its full width, drawn to that width so none of it is cut off
  ([[The Menu's Tabs Fill Its Top, Its Banner Under Them]]).
- **A fourth audit and design pass are on #60 too**, every finding checked before it was fixed: a leaving player's
  last save kept; blocks holding against a whole company; no stranger shown a player's place; the report limit, the
  Roster's races and its query over every account fixed; the Reader's Open shown where it works; Gilded earned only by
  a Legendary or Atheric piece; Escape giving the Roster's panel and details their own step; a join travelling only when
  nothing else is under way; the menu's words at the names' size, the Roster fitted to the screen, long icons on the
  diagonal, the banner kept once shown. Tested offline: the full check, and headless at 1920×1080 and 1280×720.
- **The owner's answers to the fourth audit are on #60 too**
  ([[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]],
  [[Names Follow Guidelines, Checked by the Accounts]]): names, guild names, tags and mottos judged by one module
  of the accounts, with own-written blocked words, reserved names and look-alikes refused, and the owner's way to rename
  in [[Names]]; the HUD's "In the room" line gone; no join from a fight at sea or a fall; letter spacing in whole
  pixels and the Character page's words at 22 on a wide screen; the menu doubled past 1440p; Destiny 1's three-by-three
  gear shelf; a held weapon's picture whole, grip and all; a glyph of its own for each material; and DFO's profile mark
  at the menu's top right, the player's face in a brass well, opening Settings. Tested offline: the full check, and
  headless at 1920×1080, 1280×720 and 2560×1440.
- **The owner's next asks are on #60 too**
  ([[The Inventory Keeps Vestiges, Holds Charge, Gains Show and the Menu Sounds]]): the inventory without gear, its
  Vestiges under the currencies, ten places as Destiny 2's engrams are; dismantling held over a tile (F) or on an
  item's page, longer the rarer, the item charging until it breaks into shards; feeding a Fruit held, the item
  charging; what is gained shown at the right, in play and over the menu; and every interaction sounding, made by the
  browser's synthesiser, with a volume in Settings. Tested offline: the full check, a dismantle by F against the local
  rooms (the feed showed its Aurem and fragments), and pictures at 1920×1080 and 2560×1440. The sounds were counted as
  they played, not heard: the owner should listen for their level and character. A ware bought at the
  Quartermaster's counter, and a Vestige opened at the Reader's, were not walked to headless.
- **Sounds come from Freesound** ([[Sounds Come From Freesound, Judged on a Test Sheet]]): the owner judges every
  sound and piece of music on the sound sheet, https://claude.ai/artifact/YT29RAFbgdPRLByLUVC7nh (private to them, in
  four tabs: Interface, World, Music, Ambience),
  marking each Keep, Redo or a candidate picked, with a note; the marks are its store's `marks` collection, read with
  ArtifactData. Candidates come from the `freesound` workflow on GitHub's machines, with no key: it reads Freesound's
  public pages for the cues in `content/audio/freesound.json` and keeps each cue's first four CC0 or Attribution
  previews as the run's download; a cue the owner settled names its pick, keeps the game's own sound or is made by
  the synthesiser, and is searched no more, and `skip` lists what they already heard. The picks are on R2 and in the
  game: `tools/freesound/publish.py <download>` reads a run's `picks.json` and pick files (each pick read from its own
  page for its exact licence), puts each on R2 by its hash and writes `content/audio/sounds.json`, whose credits
  Settings lists. All thirteen cues are settled: six recordings, the gains' Brass bells and a hold's Shimmer made by
  the synthesiser, and the tab, close and refusal kept as the synthesiser's own.
- **A fifth audit and design pass are on #60 too**, each finding checked against the code before its fix: F dismantles
  the piece last pointed at or focused, never one focused earlier; Ctrl, Cmd or Alt with F, leaving the window, or the
  pointer leaving the piece lets go; the shards fly whole; the focus stays near a dismantled piece; a tab opened lets go
  of a hold; the feed counts nothing in the ten seconds after a room first gives the gear, while the player's character
  is claimed, and stands low and under the card over the menu; sound wakes only on a press or key, so none waits to play
  at once; a quick tap's build-up is silent; recordings levelled by loudness as well as peak; credits say CC BY 4.0 and
  which recordings vary in pitch; the Freesound tools refuse a page that links two licences, check each pick before it
  goes to R2, and keep each pick's own page in the run. The design pass: the hover card above the footer, the footer and
  the item page at the names' size on a wide screen, empty Vestige places as dark Vestiges, the vault's rows of ten
  where the menu is wide, three wares a row, glyphs at whole multiples. Left as they are: the Roster's rows and its
  count, and a shelf of more than six gains showing only its last six. The `freesound` workflow runs on this push: if it
  ends red with "Picks not read whole", Freesound's own pages link more than one licence, and `pages/pick-*.html` in its
  download shows where.
- Proposed to the owner, not done: the comments check also catching a comment that names a note ("see the X note"),
  as the rule already says; and whether her deck's grid, which `deck.py` measures, stays in the manifest or goes to
  R2 as a bake.
- A whole-repo audit's findings are all fixed and deployed, with the owner's yes: the smaller with #51, then the five
  larger (a flood of messages from one socket, costly courses at sea, a deploy script that built nothing, the look's
  wrap on foot, and the session kit's unpinned downloads). The rooms' fixes were tested on the local Cloudflare
  runtime; a cloud session's proxy cannot open a WebSocket, so none was tested live in a deployed room.
- Step 1 of [[Gameplay Starts With the Shared Rules]] is done. Step 2, sailing, is under way: [[Sailing]] and
  [[Naval Combat]] are on `main`, with the sea's pirates and fights, and ramming and the fleet room. The rest of
  the pick's step 3 is boarding, crew, quays and ports ([[Pick - Sailing and Naval Combat]]); and at sea a fight's
  hurts kept after it, ports' waters and the land a fight is fought over. Boarding waits on the owner: which foe kinds
  crew a boarded ship, the Sloop's deck as a place to walk, and what a taken prize becomes. A body on a moving deck,
  which boarding needs, is the `movement` crate's grid of heights, walked on the player's own Sloop.
- The water's open ends ([[Water]]): a body for the walker, and the weather driving the swell (on #76 the weather's
  wind drives the sails, the chop and the whitecaps; the long swell is still one swell).
- Swimming, which the water has in TypeScript, moves into the `movement` crate, so a body on foot meets the water by
  the same rules everywhere.
- The fight's open ends ([[Combat]], [[Foes]]): running's stamina, casting's harm. Whether players may harm one another
  is the owner's to decide.
- The enemies' open ends ([[Enemies]], [[Naval Combat]], [[Server]]): a garrison stands within its room's 70 m
  navmesh, not across its whole section; a player waiting near a fallen group holds it from standing again; a rejoin
  loses the player's place, any fight and its foes; the planned hulls ([[Hulls]]); and the boarding fight on a deck
  that the deck crews are for. None of it is tested in a deployed room yet.
- The Test Ground's open ends: the shield, torch and lantern in first person, weapon wear, and riding speeds of
  Overlook's own.
- The world's open ends ([[Game]], [[Cities]]): colliders for the city's blocks before any node walks among them
  (no node comes within 2 km of a city's wall yet); the World Editor's 3D view without the city, the layouts'
  buildings, woods and shadows the game draws (its worker now settles the city and the layouts as the game's does,
  but the city layer that draws them may not be imported by the editor's); flats and lit windows in the cities, which wait on more than code: the RMB table counts each block's flats
  but keeps no places for them, their archives are not paintable, and lit windows want a night.
- Browser QA of the game: `tools/claude-toolkit/webgpu-shot.cjs` takes its pictures headless ([[Toolkit]]), of a
  built page under `vite preview`, never the dev server, which reloads on an edit; a frame there takes seconds, so a
  fight is seen beginning, not fought through.
- The held map's open ends ([[Held Map]]): discovery kept by the server for each character, quests tracked on the
  map, the charted sea's wash laid while the map is up.
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

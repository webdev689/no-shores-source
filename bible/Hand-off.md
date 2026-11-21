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
  shows it in 2D and 3D, close up at true scale, and on foot.
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
  sailed in the World Editor, the water parting round it. Its model and mesh are on R2 (`content/ships/ships.json`).
- [[Naval Combat]], step 2, on `main`: the `naval` crate (DFO's ballistics, swivel
  and shot kinds, gunnery, damage, the shot field and a pirate captain's AI, and the `Fight` that steps both ships),
  a stateful fight door in `land-wasm`, and the fight in the World Editor (`F` while sailing; the right mouse aims and
  fires). The Sloop's guns and hit boxes come from its model through the export.
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
  the owner decided it ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]): its model UV-mapped and
  sorted into parts that wear the procedural painter's pictures; DFO's animated sails on its own corners; the
  Overworld's ship; pirates from DFO's director in the sea room, which also runs in the page when playing alone; a bold
  one meeting it starts a fight in the room, and the view pans down to it at true scale ([[Naval Combat]], "At sea").
  Tested offline: the full check, the room traced in Node, and headless pictures of it and of a fight beginning.
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
  ships by number, each sailed by a player's orders or a captain's mind, a captain choosing whom it fights among the
  players' ships; a fleet room (`/room/fleet-<name>`) where up to 16 players put their Sloops to sea, call up to four
  captains and fight them together, each browser predicting its own ship through `room.wasm` to the bit; DFO's ram
  and hull push; and the World Editor sailing there with `?room=`. A golden trace showed the one-captain fight
  unchanged line for line. Two players and a captain ran 480 s on the local Cloudflare runtime at 57.8 snapshots a
  second, both predictions equal to the room's ships to the bit.
- The sea's new work, merged to `main` with the owner's yes (#59), which deploys the page and the rooms together,
  each part as the owner decided it:
  - The ship's two new buttons ([[The Ship Is Managed and Walked From the Sea's Panel]]): the [[Interface]]'s Enhanced
    Plus kit and the sea bar in it; the Sloop at true scale at the helm; Manage, the view over its deck with its panel
    and stand-in hands; and Leave the helm, the player walking its deck ([[Sailing]], "Its deck") with the sea room
    the authority on every step ([[Server]], "The sea").
  - The Sloop about 18 m long, its quarterdeck opened with steps down ([[The Sloop Is About 18 m Long]]); its model on
    R2 is the one the `ships` workflow shaped and published. Its deck's walls stand where a body cannot walk, so its
    steps and its stair aft are the ways off its quarterdeck, and its helm is 0.45 m behind its wheel.
  - Pirates met at sea ([[Pirates Must Be Met at Sea]]): they sail on the voyage's clock and hold a voyage as they come
    near, each sea on a seed of its own ([[Naval Combat]], "At sea").
  - The helm's keys in the Overworld's view, its crew and the player seen from any view, and the wheel all the way in
    to it at full detail with the World Editor's motion
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
    veils and overlaps with the Game's own display; at sea the Sloop is never drawn larger than it is as the view
    comes in or a fight begins, and pirates cut the water.
  - The bars do what DFO's Enhanced Plus does with them ([[Pick - Enhanced Plus UI]], read at DFO's fc2a8e6): a
    hit's piece breaks off and falls, each foe's health is remembered, the poise track says Iron, Staggered and Open,
    the target plate follows the foe last struck and fades after 6 s, the vitals rest when whole, ships' plates read a
    hit the same way; and plates stay light: only near the crosshair or for foes fought in the last minute, never
    larger, never through a block, none past 60 m.
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
- The sea as the owner decided it, on pull request #75 (branch `claude/waters-from-islands`, stacked on #71's
  ships), tested offline and not yet merged ([[The Waters Come From the Islands]],
  [[Three Port Cities Remain, and the Others Are Desolate and Destroyed]],
  [[The Sea's Fights, Waves and Close Views Get a Detailed Pass]],
  [[The Held Map Colours Each Water's Name by Its Difficulty]]). Every call the owner left open is Claude's, in
  [[The Sea as Claude Shapes It]]:
  - The waters: nine, each the sea nearest an island, with its holder and its island's levels, and a contested seam
    ([[World Map]], "Waters").
  - Hostile ships by water: rank by the water's band, hull by rank, sighted half a minute out at any pace, bold ships
    coming where they can meet a voyage, and a click on a ship's mark to chase it ([[Naval Combat]], "At sea").
    Measured at x60 over 10 minutes in hostile waters: a fight for 30 to 65% of players sailing on and 70 to 85%
    chasing; ships in sight 37 to 59 s on average.
  - Friendly ships on three lanes between Overlook, Sunspire and Rimeholt, seen from land and sea; the other six
    cities are ruins ([[Cities]], "Ruins").
  - Every hull sails and fights as itself, each rank lasting as long under a captain's fire ([[Hulls]]); drawn in its
    side's colours, its square sails braced, every ship in the scene's light and shadow.
  - Close in, the pace eases to the world's own time and the ship grows a steady step each notch ([[Game]], "At sea").
  - The sea by the weather, every ship riding the swell, wakes and bow waves that read from above ([[Water]]).
  - The fights' ends: sinking and what floats, striking, losing (washed up at the nearest port city by sea), damage
    kept until repaired at a port, fights for many players, sails torn away and masts falling ([[Naval Combat]]).
  - Boarding: E on a struck ship alongside, then the fight on its deck on foot among its crew, the deck riding its
    ship; won, its hold's take and a minute to go back aboard ([[Naval Combat]], "Boarding").
  - The fight's look from the room's own events on every fight path: flash and smoke that thins, splashes of water,
    splinters and holes, torn sails, falling masts, a sinking's foam, and what floats under gold marks.
  - The held map tinted by holder, each water's name coloured by its difficulty; the tiers renamed Normal, Elite and
    Abyss.

- Ships' own power, modules and crew, from pull requests #99 and #103 (its Enhanced Plus round), merged into #75's
  branch and tested offline ([[Ships Have Their Own Power, Modules and Crew Who Fight Beside You]], [[Ship Power]],
  [[Crew]]): a ship's level, Attack, Defense and Prestige by the character's law; four modules with the gear's grid,
  ship materials, salvage, the Shipwright and infusion; officers at posts that change its fight, ashore as companions,
  recruited at a pledged faction's counter or taken from won decks; ten hands who load its guns and board with the
  player. The sea's fights measured by ship level are in #99's description. Every kit-framed surface has a border,
  officers' pages name their perks, and rarity names hold 4.5:1 (`rarityContrast.test.ts`).
- The sea's procedural [[Islands]], from draft PR #101, merged into #75's branch and tested offline: coves
  and rarer guarded isles built from a seed by the `isle` crate (the same bits natively and in the page), dressed with
  95 Blender modules ([[Island Modules]]) and drawn by the islands layer ([[Island Drawing]]), with a World Editor
  Islands mode; rolled by each tier's sea room in hostile waters, sighted, found, marked on the held map, faded; landed
  on through an `isle-<number>-<seed>` room; wrecks paid out through the ship's salvage; a beaten player washing up at
  a found island.

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

- **Overlook's hub**, on `main` (#113), merged with the owner's yes ("Merge and deploy"), which deploys the page and
  the rooms, after a comprehensive audit whose findings were each measured and fixed
  ([[Overlook Becomes a Hub of Courts and Ways, After the Tower]], every call in [[Overlook's Hub as Claude Shapes
  It]], [[Cities]]): Overlook's social space as courts and ways after the Tower, every keeper in a stall of their own,
  29 adornments, each court a scene, flagstone walks curved at every corner over lawn and earth, the land's own oak
  and gorse in its beds, no rain indoors, procedural iron, gold, bone, cloth and water, ramps on every city's avenues,
  the fall that kills in a social space, townsfolk on the plan's ways, and the harbour way to the pier with its two
  moored ships. Tested offline with the full check; CI baked its modules byte for byte. Not yet seen on a real GPU.
- **The held map on land**, on `main` (#128), merged with the owner's yes ("Merge and deploy"), which deploys the page
  ([[The Held Map Comes to the Social Spaces and Every Land Area]], [[Held Map]]): N anywhere on foot raises it from the
  player's eyes, only to look at, the world going on; a social space's plan, a patrol area's or an island's ground, in
  the map's inks and washes, every keeper and site an icon glyph from the game's own devices, and a table that says
  what each is. Audited by two independent reviewers and every finding fixed with a test. Tested offline with the
  full check; seen headless at Overlook and the Saltgrass Downs. Not yet seen: an island's map, a real GPU, a fall
  while it is up.

- **The perk pass**, on `main` (#119), merged with the owner's yes ("Merge and deploy"), which deploys the page and the
  rooms ([[Atheric Gear Plays Like Destiny's Exotics, and Every Model Is Worn]], [[The Perk Pass as Claude Shapes It]]):
  ten Atheric weapons, each with an intrinsic and an own node (Gullwing's lightning leaping foe to foe, the owner's
  example); six weapon and eleven ship perks that give and take; the ship's near-duplicate perks merged; the four
  Atheric modules as exotics in the naval fight; every forge weapon and armour model worn on both bodies, named pieces
  each their own look and rolled ones climbing the ladders with rarity and level; the 145 large weapon pictures
  published (`content/forge/renders.json`). Audited twice, then by four area auditors and a design pass, and every
  open item fixed after ("Fix anything"), each with a test: kept pieces keep the perks they bought, never a trade-off
  pressed on them; chain blows strike once and only from the living; a shot takes its own bow's perks; Snare reaches
  the oars; an Atheric's two perks head its page, a trade-off's cost reads as a cost. The `forge` workflow can draw
  figure strips (`figures`), the repository's key being an Actions secret ("Key is in the repo"). Tested offline with
  the full check; Gullwing seen headless in the Test Ground. Not yet seen on a real GPU.

## Waiting on the owner

- **The controls and the marks are on `main`**, merged with the owner's yes ("Yes start the merges and deploys"),
  each after an independent audit whose findings were all fixed ("Fix all"): the key strip that follows the moment and
  K's sheet of every control (#130, [[The Key Strip Follows the Moment, and K Opens Every Control]]); every control
  rebound and kept with the account, the pad as Destiny's, the pad's cursor in windows and DFO's gauntlet as the
  pointer (#133, [[Every Control Can Be Rebound, and the Pad Plays as Destiny's]],
  [[The Pad Moves a Cursor in Windows, and the Gauntlet Is the Pointer]]); a mark over each keeper and usable thing in
  place of the rings on the ground (#134, [[What a Player Can Use Wears Its Mark Over It]]). Tested offline with the
  full check. Not yet: a real controller, the mouse's gauntlet seen in Chromium and Firefox (headless pictures never
  show the system cursor), the binds' D1 migration and route live, the marks on a real GPU.
- **The dungeons-to-mail stack** (#72 → #88 → #97 → #122 → #123): a second and third audit's findings are all fixed,
  and each layer passes the full check on its head (64ca61c6, 4878453b, ad1c2084, 1b7dab08, b87ffb3e). It conflicts
  with `main` since #118, #126, #119, #130, #133 and #134, so it needs a catch-up before it merges, with the owner's
  yes. #122's move of the asset workflows to `R2_TOKEN` waits on the owner's named yes. Meeting #134, the Postmaster's
  letter mark should beat while mail waits (his ring did), the board wear a gold "!", an entrance a door.
- **The picture driver and the game's worker**: main draws in a worker, so `webgpu-shot.cjs` fails headless ("A valid
  external Instance reference no longer exists"); the owner: "The headless issue is due to us moving away from html.
  So not really an issue per say." A driver that patches the worker too is on the branch `ccr-130008df-u4ahst-headless`
  (cfd75bba), unmerged; the marks were pictured with it.
- **#119's open items.** The Thunderlock at port arms is held trigger to the front in the forge, as drill holds it,
  after the owner's "fix the thunderlock idle hold. Currently its held backwards" (`gunplay.PORT`), but its rest, walk
  and sprint are not drawn again, the owner's "Blades only for now": the arms move, so every layer in those three
  moves, every set and both bodies, must be, about 27,000 solid frames a body with its cloth, some 400 Actions minutes
  through the `forge` workflow's `figures`. Until then the game holds it as before. And the design note's calls: the
  Atheric armour pieces keep their one signature; a rolled Rare reaches daedric at level 20; a faction's shield and
  bow keep one make; whether named weapons keep an element of their own (a leap is Volt on any Gullwing); a blow on a
  foe four or more levels above sets off no chain blow, since the blow itself does nothing.
- **#118, every sound from Freesound and the music's pass** (`ccr-c504a08b-gyns6o`), the owner's words in
  [[Every Sound Comes From Freesound, and the Music Rests Between Pieces]], is on `main`, merged with the owner's yes
  ("Merge and deploy"), which deploys the page and the rooms. Every sound effect and ambience sound plays the owner's
  Freesound pick (`content/audio/sounds.json`, 185); the synthesiser behind them is deleted but the four the owner
  kept (the gains' chimes, a hold's build-up, the menu's refusal, the spoken voice). Each recorded bed and thunder
  keeps the synthesiser's measured level (`recordings.ts` `BED_LOUD`, `player.ts`). No hyena, no separate wave crash;
  the ice's creak plays the ice's crack, a ship going down the sea's Breaking wood, the story's rain, gulls and
  thunder the world's picks. Music: calm pieces now and then everywhere with each place's silences, fourteen new calm
  pieces (`calm.ts`), no note over B5, no FM partial past 6 kHz, no ringing drum, no pitched swell in a fight, held by
  tests; the owner kept every piece on the sheet (https://claude.ai/artifact/PBSynEeW37HPSvX89EYUbA). Tested offline:
  the full check, every song rendered and measured headless, the sheet's players. Not yet: anything heard in a running
  game or on a real GPU.
- **#120, three healing charges, is on `main`**, merged with the owner's yes ("Merge and deploy"), which deployed the
  rooms and the page ([[Three Healing Charges, Refilled by Blows and Kills]]): built to the owner's picks, then a
  five-part audit (rules and room, wire and prediction, tests and notes, balance against the roster, a design pass
  with pictures) and a last verification audit, every finding fixed or named in the decision page. Tested offline
  with the full check. Not yet seen or heard in a browser on a real GPU, nor played in a company: the diamonds under
  the vitals, the drink on `3`, the green word and its sound, and charges coming back in a fight. Left as named in
  the decision: a heal and a blow judged in the same tick or two can both stand, and dying or rejoining refills all
  three.
- **The held map on land's fog of war**: on land the sheet has none, so all of a land shows the first time the map is
  raised there; whether it should be fogged as the sea is.
- **Overlook's hub's flora**: whether "any flora like bushes or trees" also covers the wall ivy and the cut flowers
  sold at the flower stall and cart, which are the hub's own (the world grows no climber; cut flowers are goods).
- **This session's three changes are on `main`, merged with the owner's yes ("Approved and audit"), each audited
  first and its findings fixed, which deploys the page and the rooms:** aiming faces straight ahead (#115,
  [[Aiming, the Figure Faces Straight Ahead]]); the crosshair's shapes, reload ring, hit marks and melee reach (#116,
  [[The Crosshair Shows Each Weapon, Its Reload, Its Hits and Melee's Reach]]); and the weapons forged large with
  their element glyphs (#117, [[Weapons Are Forged Large for the Weapon Rows and Gear Screens]]), its 99 pictures
  published by the forge workflow from its branch, with SciPy pinned among that workflow's packages, which the owner
  approved. Tested offline with the full check; the large pictures loaded through the page's own code from R2
  headless. Not yet seen: any of it on a real GPU, the weapon rows in a running game, or a fight with the new
  crosshair. Left as they are: a greatsword shows its metal's sword until it has a model of its own; the forge
  workflow does not run again when a weapon's model changes, only when `weaponart.py` or its packages do; at a steep
  downward look the aiming camera can still show the figure's diagonal back view.
- **The third playthrough's notes**, on `main` (#121), merged with the owner's yes ("Merge and deploy"), which
  deploys the page and the rooms: the prologue's fights heard three times as loud
  ([[The Prologue's Fights Are Heard Louder]]); the story fight's aim and see-through puffs drawn, and a held aim kept
  on its side
  ([[A Held Aim Keeps the Camera on Its Side]]); in every sea fight ships sail 1.8 times the sea's pace and turn twice
  as fast, Shift bursts the player's ship for 4 s with 12 s to recharge, shown as a ring on its plate, and no ship rows
  sideways ([[Ships Sail Faster, Turn Twice as Fast and Burst on Shift in Sea Fights]]); on the wreck no one climbs
  ([[Climbing Is Off in the Prologue]]), the player fights with the story's sword and shield, its elites are a Major's
  toughness ([[The Prologue's Elites Are as Hard to Bring Down as a Major]]) and its boarders one side
  ([[The Wreck's Boarders Are One Side]]); and the storm's run and the wake's flight stand clear and go slower
  ([[The Prologue's Camera Flights Stand Clear and Go Slower]]). Tested offline: the full check, the client's story
  fight over the real land rules for 15 minutes of play, and the storm's run and the wake's flight pictured headless.
  Not yet seen on a real GPU, nor played through by hand; the burst's ring not yet seen at all. The gun deck's
  Tithe-Mate is in the wreck's own level too (`tools/wreck/wreck_level.py`), rebuilt by the wreck workflow with the
  owner's yes ("Do it"): only its Blender source is new. Open: the fleet room has no burst; and this session's
  toolkit could not be installed (its installer was refused by the session's permission check).
- **#126, the wreck opened by teaching the player, is on `main`**, merged with the owner's yes ("Please do that"),
  which deploys the page and the rooms ([[The Wreck Opens by Teaching the Player]]): the gun deck's Tithe-Mate in the wreck's level; the waking eyes as an
  almond under shaped lids, an uneven fringe of lashes and the fires' light through them, the blur clearing a step at
  each beat; the wake's flight dropped, the camera easing out of the eyes to over the shoulder; and the teaching on
  the quiet deck: the sword and shield, drawn on the deck as the item itself, found and equipped from the Character
  page and then held as worn, the feet found, the
  player readied (a swing, a guard, a healing charge drunk), and a Tithe boarder met one on one, its first blow frozen
  until F parries it and its next until V dodges it, the world held still and greyed while frozen, the waves held
  until it falls. Audited before merge (the room and its door, the client's teaching, the rules and the notes) and
  given a design pass with pictures of the lids, the prompts and the tracker; every finding is fixed in the branch or
  named here. Tested offline: the full check, and the freeze against the real room (a press there parries, and
  dodges, each at its first freeze). Not yet seen or played in a browser: the eyes over the scene, the arms on the
  deck, the menu over the story, the frozen frame. Open: the owner's "teaching them the inventory" is taught on the
  Character page (I), where gear is worn, which the owner may want otherwise; the wreck's tool still writes the
  flight's masts and way back into its layout, which the page no longer reads (removing them rebuilds and publishes
  the wreck); the step up to where the player wakes is too high for foes, so a player who stays up there is not
  reached until they come down; the game's headless pictures cannot draw the game since it draws in a worker.
- **#75, the sea as the owner decided it**, on `main`, merged with the owner's yes ("Merge and deploy"), which deploys
  the page and the rooms from CI: waters, ships by water, the three ports, hulls, waves, fights, boarding, ship power
  and crew, the procedural islands and their plants, the Enhanced Plus readout and ships as "it", with main through
  #98 merged in. The owner's last two calls are in it: the sea fight's ship plate wears the vitals' thin bars
  ([[The Sea Fight's Ship Plate Wears the Vitals' Thin Bars]]), at the top left with its chips and rose under them, and
  a sea fight's wind holds from its start (Claude's call under "Whatever is best", [[The Sea as Claude Shapes It]]).
  Tested offline: the full check, and the game's HUD with a sea fight on it pictured headless at 1280x720, 1920x1080
  and 2560x1440. Not yet seen: a real sea fight on a real GPU, or anything of it in the deployed rooms. The cloud
  sessions that built on the sea branch (islands, ship power, activities) take `main` now; bounties count in the sea
  room through `Sea.minute`, and the island dungeon trip is one line once #88's stack meets `main`.
- **The whole plan of the owner's four points, on branch `ccr-3320a365-bzwp4s`, merged with `main`, audited and
  tested offline (the full check) and live headless (the menu holding the keys at ratios 1 and 1.25), in #127,
  which supersedes #112**: no HTML
  anywhere in the interface ([[The Interface Uses No HTML, Now or Later]]): the HUD, the fight's display, the menu and
  every page of it, the story's screens, the held map's marks, the Test Ground and the World Editor drawn by the game,
  each page one canvas and its script, and a repo check (`html`) refusing new HTML with no way round it; the game in a
  worker of its own ([[Work Leaves the Main Thread Where It Can]], [[Game]], "Threads"), the page's thread busy 0.0 ms
  a frame where it was 41 (SwiftShader, 480 by 270); the network packed and sent as changes
  ([[The Network Is Made Smaller and Readied for WebTransport]]). The owner's "make the best decision" let Claude make
  the open calls ([[Claude Makes the Four Points' Open Calls]]): one pull request; Chromium's password store for
  sign-ins; no relay outside Cloudflare; the files' own address once the owner has a domain; the layers' widening
  stands; no shared memory. Five audits (the drawn interface, the screens, the thread, the network, the repo's rules)
  found an input that stalled a room (verified now under tight limits), a pointer off at a fractional ratio, a Discord
  sign-in's return that stopped the game, keys leaking past the menu, Space and Backspace lost in a field, no modal
  scope, silent or ducking sounds in the worker, and smaller ones; each is fixed with a test. Needs the owner's yes:
  the `html` check by name (a new check), and the merge. Playing alone at sea is now sent the per-player cut of the
  snapshot, as with others.
- **The co-dev's `webgpu-shot` cannot picture the game now**: it reads the page's WebGPU canvas, and the game draws
  from its worker. Its picture runs work for the Test Ground and the World Editor, which stay on the page; for the
  game, a worker-aware measure is in the session's notes (it times the worker's frames through Playwright's worker
  handle). The kit is kept as shipped, so its fix is the co-dev's (observation 0068 logs the port lesson).
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
  Corvane, Claude's for now; whether presence shifts over
  time; whether project-final's crystal faction comes over ([[Open Questions]]). Claude's tuning is the owner's to
  change: a captain strikes from losing men at about 80% of its hull at every rank, and the foes' numbers are in
  [[Foes]].
- **#99, ship power and crew**, is in #75 through the Ship & Seas session; #103 follows it there. Recruiting needs #92's pledge
  (`room::crew::pledge_of`); every call beyond the design note is listed in #99's description, the owner's to change.
- **#75, the sea, waits on the owner's yes to merge**, after #71, which deploys the page and the rooms. Left open
  there: the sky and the light do not follow the weather yet; off the helm the room now takes a change of pace (a
  rule of the server's); under a player's fire a Frigate lasts about 5% longer than a Sloop of its rank; one voyage in contested
  water held a ship in sight 89 s, unexplained.
- The bars' proposals, the owner's to choose: a foe's alert "!" showing its plate through the cone for a second;
  a setting to switch the vitals' rest off; near plates growing (DFO's own law grows them to 1.5×, ours caps them);
  ships' plates fading with distance; land, not only blocks, hiding plates; a soft-locked Boss shown once; a mark for
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
  stopped near an enemy) should come over.
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
- **#69, the Arts round, waits on the owner's yes to merge**, which deploys the page and the rooms. Every number and
  call the owner left open is Claude's, in [[Arts and Loadouts as Claude Shapes Them]], the owner's to change: the
  cooldowns, the fragments, the new perks' columns and rules (Marked Shot an opener, Exploit for the spec's
  Opportunist), the R, Q and G keys, a new Art starting empty, the Sunwell's sun 3.5 m up and 1.5 m along its
  caster's aim, the Armsmith's wares, the seven named armour pieces that gave Bulwark and now give another armour
  perk, and how every attack looks ("How attacks look"): a crit's 0.11 s hold and a kill's 0.16 s, the chips'
  leather ramp, the view held still for reduced motion. Left to the owner by the screens' critique: emptying a Core
  slot, and resting the ability bar with the vitals. The forge's gun puff is blue in its art
  (`tools/forge/tools/sprite-forge/guns3p.py`); a re-render would change it.
- **Every world sound on #69 is the owner's pick**, over seven passes on the sound sheet
  ([[The World Sounds From the Sound Picker]]): 63 Freesound recordings, DFO's own steps and Voidrend
  ([[DFO's Own Sounds Join the Sound Sheet]]), the Duskraven's fire
  ([[The Duskraven Sounds With Fire Under Its Raven]]); Exposed, Charged and Haste make none
  ([[Exposed, Charged and Haste Make No Sound]]). Claude's calls in the layer, the
  owner's to change: a gun's ball on a body plays `hit.blunt`, a step sounds every 2.5 m, `step.wood` only on the
  [[Test Ground]]'s crate, and up to 16 sounds at once within 40 m.
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

## Next

- **Overlook's hub** ([[Overlook's Hub as Claude Shapes It]]): a frame's cost on a real GPU with some 125 figures and
  the courts' pieces; the audit's risks left open (a walker's step to the side of a post's line or round a sharp turn
  is not walked against the real hub's boxes, kept posts' people are not booked against walkers, routines' maths may
  round differently by engine, puddles form on lawn as on flat stone); pictures of the Harbour Stair and the road, the
  fall, and the townsfolk at work. The activities session (#97) reads `Social.board` and sets it from
  `hub::BOARD_LANDING_M` when it merges.
- **The islands** ([[Islands]]): the door's trip into its dungeon, once the Dungeons session pushes its
  `sea-dungeon-…` room and trip (the page names the room; until then E at the door says it is not open); the
  islands' trees, shrubs and grass from the Flora pipeline once #63 is on main (through `ScatterGround.planted`, with
  its own height, turn and size); pictures of the landfall offer, E's prompts and washing up in the game itself (staging at sea
  headless outran its budget here).
- **The sea after #75**: the friendly ships' port factions (deferred by the owner); ships' own upgrade materials,
  planned only ([[Ships Have Their Own Upgrade Materials, From Ships and Island Wreckage]]); the sky and light
  following the weather; the long contested hold, to explain. #82's decisions (the owner's loop) wait to be built
  and overlap this sea: flotsam stays the gear loop's drops, and the seas chosen bring their own weather.
- **The ships** ([[The Ships as Claude Shapes Them]], [[Hulls]]): the Schooner, the cabin, the Brig and the Frigate have
  the owner's yes, and the three ships are published. The owner asked for the Frigate as one more model "and call its
  there", so the Tithe Ram and the Fluyt wait until the owner asks for them. No ship opens its cabin in the game yet
  ([[Hulls]], "What the code needs"). Splitting each ship into
  parts for upgrades (hull, cannons, sails and wheel), and the cabin's decoration from DFO's `decor/`, were raised and
  set aside by the owner for now. A change to the shared builder is checked by rebuilding each published ship and
  comparing its dry-run mesh hash with the manifest's. The manifest is 388 KB with the two new decks (77 KB on `main`
  before), and the client imports it and the room embeds it whole: loading each ship's deck on its own may be wanted
  before more ships join. Of the sea the owner approved, #75 builds the waters, the ships sighted and the fights'
  ends; still to come are the opening voyage as the first sea strike, the ship as gear, then merchantmen, bounties,
  public events and fleets ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]).
- **Its third round (#69)**: DFO's #1687 forge work ([[DFO's Blows on the Move Come Over Before the Merge]]), its
  renders on R2 (125 moves); figures act on the move where every layer draws the walking version; the world's sound
- **After the four points**: the game's frame time on a real GPU, in and out of the worker; a sound heard by a person
  from the worker's cues; holding a press with the pad's A, which waits on an "A held" signal from the interface (main
  had no pad holds either).
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

- **The Arts round (#69)**, tested offline: the weapon glow, Melee and Ranged loadouts, the statuses and verbs with
  foes' debuff icons, the Arts in the room and drawn in the browser, the Art's screen and the ability bar, the verb
  perks, loot drops seen on the ground and limited ammo ([[Arts]], [[Gear]], [[Combat]], [[Weapon Glow]]). Not yet
  seen: any of it on a real GPU, and another player's Veiled figure and cast colour, which need two clients in a live
  room. Spells look through walls, and their pictures stand upright like the figures ([[Arts]], "Limits").
- **Its second round, attack visuals beyond the limits (#69)**, tested offline in the Test Ground, and the game's own
  page headless at 960x540: swing arcs, struck figures, impacts, crits and kills with elemental finishers, damage
  words, guns, tracers, telegraphs, every spell landing, the Anima moment, the light layer, marks drawn in depth
  ([[Arts and Loadouts as Claude Shapes Them]], "How attacks look"). Not yet seen: a fight in the game's own view
  with the player's swing (headless has no pointer lock), the water's order at a coast, any GPU timing (the light's
  0.4-0.5 ms is an estimate). Left for later: one particle system for `Sparks`, `Bits` and the shots' bits; the
  marks still copied into new arrays each frame (about 0.4 MB in a busy fight); emitters under the sea still light;
  `camera.ts` `shifted` keeps the HUD matrix's translation in float32 (about 0.25 m off far out); whether a bow or
  gun drawn can punch, and in what element.
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
  sound and piece of music on the sound sheet, https://claude.ai/artifact/YT29RAFbgdPRLByLUVC7nh (private to them),
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
  which recordings vary in pitch; the Freesound tools refuse a page that links two licences, check each pick before its
  goes to R2, and keep each pick's own page in the run. The design pass: the hover card above the footer, the footer and
  the item page at the names' size on a wide screen, empty Vestige places as dark Vestiges, the vault's rows of ten
  where the menu is wide, three wares a row, glyphs at whole multiples. Left as they are: the Roster's rows and its
  count, and a shelf of more than six gains showing only its last six. The `freesound` workflow runs on this push: if its
  ends red with "Picks not read whole", Freesound's own pages link more than one licence, and `pages/pick-*.html` in its
  download shows where.
- Proposed to the owner, not done: the comments check also catching a comment that names a note ("see the X note"),
  as the rule already says; and whether its deck's grid, which `deck.py` measures, stays in the manifest or goes to
  R2 as a bake.
- A whole-repo audit's findings are all fixed and deployed, with the owner's yes: the smaller with #51, then the five
  larger (a flood of messages from one socket, costly courses at sea, a deploy script that built nothing, the look's
  wrap on foot, and the session kit's unpinned downloads). The rooms' fixes were tested on the local Cloudflare
  runtime; a cloud session's proxy cannot open a WebSocket, so none was tested live in a deployed room.
- Step 1 of [[Gameplay Starts With the Shared Rules]] is done. Step 2, sailing, is under way: [[Sailing]] and
  [[Naval Combat]] are on `main`, with the sea's pirates and fights, and ramming and the fleet room; #75 adds a fight's
  hurts kept after it, the ports' waters and boarding. The rest of the pick's step 3 is crew and quays
  ([[Pick - Sailing and Naval Combat]]), and the land a fight is fought over.
- The water's open ends ([[Water]]): a body for the walker.
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
  (no node comes within 2 km of a city's wall yet); the World Editor's 3D view without the city, woods and shadows
  the game draws (its worker opens a landmass without the RMB index, and its city would be built again after every
  stroke); flats and lit windows in the cities, which wait on more than code: the RMB table counts each block's flats
  but keeps no places for them, their archives are not paintable, and lit windows want a night.
- Browser QA of the game: `tools/claude-toolkit/webgpu-shot.cjs` takes its pictures headless ([[Toolkit]]), of a
  built page under `vite preview`, never the dev server, which reloads on an edit; a frame there takes seconds, so a
  fight is seen beginning, not fought through.
- The held map's open ends ([[Held Map]]): discovery kept by the server for each character, quests tracked on the
  map, the charted sea's wash laid while the map is up; on land, the relief read off the worker's exact ground past the
  2 km the camera keeps (a patrol area's far side reads the 1 km grid), and lakes, which only the 1 km grid holds.
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

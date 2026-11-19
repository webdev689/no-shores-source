---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

- The scaffold: the TypeScript client on WebGPU, the Rust repo checks, CI, this vault.
- The [[Pick List]] of DFO Online, and the owner's decisions on it ([[Decisions]]).
- The co-dev's toolkit, installed by each session's first step ([[Toolkit]]). Its SkillsMP and Context7 keys are
  network secrets the session's environment must hold: in one that holds none, check-tools fails SkillsMP and
  Context7 runs on its anonymous tier. Kit fixes are logged with task-observer for the co-dev; the log lives
  in `~/toolkit-data`, which a container loses at its end. Its first review is done: claude-mem installs with its
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

## Waiting on the owner

- **#72, the dungeons, is finished and waits on the owner's yes to merge**: DFO's Dungeons 2.0 within the patrol
  areas, perfect and insanely varied as the owner asked ([[The Dungeons Are Perfect and Insanely Varied]], Claude's
  calls in [[Dungeons as Claude Builds Them]], [[Dungeons]]). Six styles, two to five blocks, a deeper last block in
  about half, rooms shaped, purposed, named, furnished and lit by their style, vaults, domes and caves, cave mouths
  for the caverns and the mines. Tested offline: `cargo xtask check`, and headless pictures of every room of six
  dungeons, one of each style. Two reviews' findings are fixed, each with a test; #72 lists them. Not tested live: a
  deployed dungeon room.

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
  stopped near an enemy) or wary pirates falling on a ship they outgun should come over.
- #50's open choice: where another player's colour goes on the Sloop. Her drawn size at sea, 75 m, is settled
  ([[The Sloop Is About 18 m Long]]).
- #48, #50 and #51 are merged and deployed. Walking or sprinting that does not happen on demand was not reproduced
  playing alone; when it happens is the owner's to say.
- Which cloud environment sessions run on. Two are named Default: the kit's SkillsMP and Context7 keys are on the
  unrestricted one; the other holds none, so a session there fails check-tools' key lines and cannot reach the forge's
  renders. A personal `overlook-source` environment allows only the renders' R2 host and GitHub Pages.
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
- The cleanup audit (#70): dead code out of the overworld, naval and player, and the Overworld note, its pick and the
  [[Code Map]] brought in line with the code, in files no open pull request changes. Its description lists what it
  found in #63's, #68's and #69's files, to clear once they merge, and 37 old branches that can be deleted. Whether the
  Overworld's rise and fall, ported but never wired, stay out is the owner's to say ([[Pick - Overworld]]).

## Next

- **#72 once the owner says yes**: squash-merge it, which deploys the page and the rooms, then play a dungeon in a
  deployed room (tested live): a band's fight, the Reeve's fall, the cache's Vestige and the portal out.
- **Picturing a dungeon headless** needs no walk: `tools/claude-toolkit/dungeon-qa-build.sh` and
  `dungeon-plan.ts` picture every room of one dungeon in a page load ([[Toolkit]], Browser QA).
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
  map, the charted sea's wash laid while the map is up.
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

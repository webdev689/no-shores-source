---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

- The scaffold: the TypeScript client on WebGPU, the Rust repo checks, CI, this vault.
- The [[Pick List]] of DFO Online, and the owner's decisions on it ([[Decisions]]).
- The co-dev's toolkit, installed by each session's first step ([[Toolkit]]). Its SkillsMP and Context7 keys are
  network secrets on the Default environment. Kit fixes are logged with task-observer for the co-dev; the log lives
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
- The [[Sprite Forge]], on `main`, exactly as DFO had it, with its 130,407 pictures on R2. The [[Test Ground]] plays a forge figure with every
  move, in first and third person, with DFO's controls, Daggerfall's colours and the [[Three Races]].
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

## Waiting on the owner

- The Cloudflare token is the repository's Actions secret `CLOUDFLARE_TOKEN`, which the `ships` and `rooms` workflows
  read; the one the owner gave in the chat should be rotated. A cloud session cannot deploy the rooms itself: its proxy
  writes the stored token over the upload token Cloudflare hands back. The rooms deploy from CI after each merge into
  `main` ([[The Rooms Deploy on Each Merge]]); the `rooms` workflow can still be run by hand.
- Each merge deploys the rooms, even one that changes only notes, and each deploy drops everyone in a room: the browser
  does not rejoin on its own. Whether to deploy only when the rooms' code changed, or to rejoin by itself, is the
  owner's to say.
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
  blow shows its element (a trail, a hit's colour) beyond the shield's words; whether a shield comes back after a
  while; and which foes beyond the patrols' carry them.
- The Roster and emblems are built on Claude's calls ([[The Roster and Emblems as Claude Shapes Them]]); the owner
  can change any. Open for the owner: a join that loads another landmass, to reach a fireteam member across the sea;
  names over other players' heads, green for the fireteam, as Destiny 1 shows them; the Guild tab's own page; more
  emblems and where they come from; whether Overlook should have text chat, which mute would need.
- A check for [[Plain Text]], like DFO's word limits, would need the owner's agreement; it is held in review for now.
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).

## Next

- **The gear loop**, which the owner handed over in full ([[Gear and Power Follow Destiny 1 Vanilla]], with Claude's
  choices in [[Gear as Claude Shapes It]]), is built on pull request #60 and waits on the owner's yes to merge; a
  merge deploys the accounts, the rooms and the page together. On it: the `gear` crate ([[Gear]]); gear held by the
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
  the vault and the vendors moved to their counters, and friends on the Social tab
  ([[The Menu Follows Destiny, the Vault and Vendors in the Social Space]], [[Accounts]], "Friends"); the Plain Text
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
  [[Cosmetics Follow Destiny, Emblems First]]): the face's
  5, Z and symbols drawn in code and made into a font in the page; the gauge counting nodes bought; the room serving
  each ask only at its counter; the Social tab as Destiny 1's Roster with blocking, fireteams,
  guilds, reports and details; and 25 emblems, kept and worn, sold by the Tailor, shown on the Roster, the header, the
  HUD and the Emblem slot. A group is a fireteam, as the owner named it. The menu's tabs share its whole top, and under
  them the player's banner runs its full width, drawn to that width so none of it is cut off
  ([[The Menu's Tabs Fill Its Top, Its Banner Under Them]]). Tested offline: the full check, and headless at 1920×1080
  and 1280×720 against local rooms and accounts seeded with sixteen players.
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
- The water's open ends ([[Water]]): a body for the walker, and the weather driving the swell and the wind.
- Swimming, which the water has in TypeScript, moves into the `movement` crate, so a body on foot meets the water by
  the same rules everywhere.
- The fight's open ends ([[Combat]], [[Foes]]): running's stamina, casting's harm, foes that
  flank or seek a line around a block, and the navmesh baked over the [[Land]]. Whether players may harm one another
  is the owner's to decide.
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

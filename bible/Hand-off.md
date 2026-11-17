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

## Waiting on the owner

- The Cloudflare token: the owner gave it in the chat, so it should be rotated, and the new one saved as the
  repository's Actions secret `CLOUDFLARE_API_TOKEN` (no environment or secret holds it), for the `ships` workflow and
  the rooms' deploy.
- #50, her painted model and mesh published to R2: to test and say yes to merging and publishing. Its open choices: where another
  player's colour goes on the Sloop, her 75 m drawn size at sea.
- Deploying the world's rooms (`npm run server:deploy`, which bakes the node files first) needs the owner's yes and
  the token. The deployed rooms keep the speed hack and the two socket faults until that deploy, and have no pirates.
- Which cloud environment sessions run on. Two are named Default: the kit's SkillsMP and Context7 keys are on the
  unrestricted one; the other holds none, so a session there fails check-tools' key lines and cannot reach the forge's
  renders. A personal `overlook-source` environment allows only the renders' R2 host and GitHub Pages.
- Names for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).

## Next

- Step 1 of [[Gameplay Starts With the Shared Rules]] is done. Step 2, sailing, is under way: [[Sailing]] and
  [[Naval Combat]] are on `main`, the sea's pirates and fights on #50. Next is the pick's step 3: boarding, ramming,
  crew, quays and ports ([[Pick - Sailing and Naval Combat]]); and at sea a fight's hurts kept after it, ports' waters
  and the land a fight is fought over.
- The water's open ends ([[Water]]): a body for the walker, and the weather driving the swell and the wind.
- Swimming, which the water has in TypeScript, moves into the `movement` crate, so a body on foot meets the water by
  the same rules everywhere.
- The fight's open ends ([[Combat]], [[Foes]]): gear power by metal, running's stamina, casting's harm, foes that
  flank or seek a line around a block, and the navmesh baked over the [[Land]]. Whether players may harm one another
  is the owner's to decide.
- The Test Ground's open ends: the shield, torch and lantern in first person, weapon wear, and riding speeds of
  Overlook's own.
- The world's open ends ([[Game]], [[Cities]]): colliders for the city's blocks before any node walks among them
  (no node comes within 2 km of a city's wall yet); the World Editor's 3D view without the city, woods and shadows
  the game draws (its worker opens a landmass without the RMB index, and its city would be built again after every
  stroke); flats and lit windows in the cities, which wait on more than code: the RMB table counts each block's flats
  but keeps no places for them, their archives are not paintable, and lit windows want a night.
- Browser QA of the game: `tools/claude-toolkit/webgpu-shot.cjs` takes its pictures headless ([[Toolkit]]); a frame
  there takes seconds, so a fight is seen beginning, not fought through.
- The held map's open ends ([[Held Map]]): discovery kept by the server for each character, quests tracked on the
  map, the charted sea's wash laid while the map is up.
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

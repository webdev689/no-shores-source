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
  in `~/toolkit-data`, which a container loses at its end.
- The [[World Map]]'s layout file and its rules, and the [[World Editor]], published on GitHub Pages
  ([[The World Editor Is on GitHub Pages]]). The owner has drawn all nine continents; continent 1 is the main social
  space, with the port city.
- The [[Land]], on `main`: generated relief, erosion and water from the painted coasts; sculpting brushes; carved
  rivers, roads, towns and ports; and the ground anywhere to the metre, for the runtime. The World Editor's Land mode
  shows it in 2D and 3D, close up at true scale, and on foot.
- The [[Water]], on `main`: the shared swell in the land crate, breakers that shoal and break on every shore, a
  stylised-realism surface over the sea, lakes and rivers, ripples, and wading, swimming and diving with an underwater
  view ([[The Water Is Stylised Realism]]). Its pass for jaggies put the coast on its painted line, lakes and banks on
  the ground's own contours, and every edge of land and water at each pixel, at any distance.
- The [[Sprite Forge]], on `main`, exactly as DFO had it, with its 130,407 pictures on R2 (the token is a network
  secret for `api.cloudflare.com` on the Default environment). The [[Test Ground]] plays a forge figure with every
  move, in first and third person, with DFO's controls, Daggerfall's colours and the [[Three Races]].
- Gameplay has begun, in the owner's order ([[Gameplay Starts With the Shared Rules]]). [[Movement]], on `main`: the
  Test Ground's moves in the Rust `movement` crate, stepped in ticks of 1/60 s through WebAssembly, agreeing to the bit
  wherever it runs.
- [[Sailing]], step 1 of the naval port, on `main`: the `sailing` crate (Come Sail Away's helm under DFO's
  responsive helm, the swell's pose, grounding on the land), stepped through `land-wasm`,
  and the owner's Sloop put to sea and sailed in the World Editor, the water parting round her. Her model and mesh are
  on R2 (`content/ships/ships.json`).
- The servers run on Cloudflare ([[Servers on Cloudflare]]) and messages are FlatBuffers
  ([[Messages Are FlatBuffers]]). On `main`: the [[Server]]'s room and its messages, with Google's `flatc` installed
  by the schema step itself; the room hosted by a Cloudflare Durable Object in `server/`; the browser's connection and
  prediction; and the Test Ground played together (`?room=<name>`). Deployed with the owner's yes:
  `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`, measured live at 60 ticks a second, the room agreeing
  with each prediction to the bit.
- On `main` and deployed: other players shown in their own dress, with their weapon drawn, swings, casts, panel moves
  and horse, checked live with two browsers on the deployed rooms.
- On `main`: the forge renders DFO's audit branch had and Overlook did not, published to R2
  ([[The Audit Branch's Forge Renders Come Over]]); the rest of that branch's forge work was already here, newer.
- On branch `ccr-23284246-hmc57z` until its pull request merges: the fight
  ([[Combat Is Soulframe's, With DFO's Enhanced AI]]). [[Combat]]: DFO's swings and strokes, Soulframe's guard, parry,
  riposte, dodge with its perfect stretch and counter, stamina, poise and the soft lock, foes' telegraphed blows and
  shots in flight, in the Rust `combat` crate. [[Foes]]: DFO's Enhanced AI in the `foes` crate, five kinds, built upon
  to guard, parry and dodge. The [[Navmesh]], DFO's, in Rust. The [[Server]]'s rooms run them all, judging each blow
  as its defender saw it; the [[Test Ground]] fights them alone or together, predicted to the bit, with its display
  and the ground's marks. Tested offline, in a headless browser and on a local server with two players; not deployed.

## Waiting on the owner

- A yes to merge the fight's pull request, and to deploy `overlook-rooms` right after: the published Test Ground and
  the deployed rooms must speak the same messages, so `?room=` play breaks between the merge and the deploy.

- Names for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).

## Next

- Step 1 of [[Gameplay Starts With the Shared Rules]] is done. Step 2, sailing, has begun: [[Sailing]]'s first step
  is on `main`. Next is the naval combat core, broadsides between the Sloop and one captain
  ([[Pick - Sailing and Naval Combat]]); her six cannons are named in her model (`Cannon`,
  [[Ship Models Live on R2]]), for the export to read her muzzles.
- The water's open ends ([[Water]]): a body for the walker, and the weather driving the swell and the wind.
- Swimming, which the water has in TypeScript, moves into the `movement` crate, so a body on foot meets the water by
  the same rules everywhere.
- The fight's open ends ([[Combat]], [[Foes]]): gear power by metal, running's stamina, casting's harm, foes that
  flank or seek a line around a block, and the navmesh baked over the [[Land]]. Whether players may harm one another
  is the owner's to decide.
- The Test Ground's open ends: the shield, torch and lantern in first person, weapon wear, and riding speeds of
  Overlook's own.
- The game itself: the client drawing the world from the land's door, and the server reading the same land crate.
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

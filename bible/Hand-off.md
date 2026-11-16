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
- The [[Sprite Forge]], on `main`, exactly as DFO had it, with its 122,537 renders on R2 (the token is a network
  secret for `api.cloudflare.com` on the Default environment). The [[Test Ground]] plays a forge figure with every
  move, in first and third person, with DFO's controls, Daggerfall's colours and the [[Three Races]].
- Gameplay has begun, in the owner's order ([[Gameplay Starts With the Shared Rules]]). [[Movement]], on `main`: the
  Test Ground's moves in the Rust `movement` crate, stepped in ticks of 1/60 s through WebAssembly, agreeing to the bit
  wherever it runs.
- The servers run on Cloudflare ([[Servers on Cloudflare]]) and messages are FlatBuffers
  ([[Messages Are FlatBuffers]]). On `main`: the [[Server]]'s room and its messages, with Google's `flatc` installed
  by the schema step itself. On its pull request: the room hosted by a Cloudflare Durable Object in `server/`, the
  browser's connection and prediction, and the Test Ground played together (`?room=`). Run locally with
  `npm run server`; two browsers saw each other, and the room agreed with each prediction to the bit. Not deployed.

## Waiting on the owner

- Names for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).

## Next

- With the thin server merged and deployed, step 1 of [[Gameplay Starts With the Shared Rules]] is done.
- Swimming, which the water's pull request has in TypeScript, moves into the `movement` crate once both are merged,
  so a body on foot meets the water by the same rules everywhere.
- The Test Ground's open ends: the shield, torch and lantern in first person, weapon wear, and riding speeds of
  Overlook's own.
- The game itself: the client drawing the world from the land's door, and the server reading the same land crate.
- Then sailing, bringing over DFO's sailing and combat systems, each pick approved by the owner first
  ([[Porting from DFO]]).
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

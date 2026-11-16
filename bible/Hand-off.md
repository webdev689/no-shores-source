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
- The [[Sprite Forge]], on `main`, exactly as DFO had it, with its 122,537 renders on R2 (the token is a network
  secret for `api.cloudflare.com` on the Default environment). The [[Test Ground]] plays a forge figure with every
  move, in first and third person, with DFO's controls, Daggerfall's colours and the [[Three Races]].
- Gameplay has begun, in the owner's order ([[Gameplay Starts With the Shared Rules]]). [[Movement]], on `main`: the Test Ground's moves in the Rust `movement` crate, stepped in ticks of 1/60 s through WebAssembly, and
  agreeing to the bit with the crate run natively.
- The servers run on Cloudflare ([[Servers on Cloudflare]]) and messages are FlatBuffers
  ([[Messages Are FlatBuffers]]). On `main`: the [[Server]]'s room, its core: players' inputs in order, their bodies
  stepped tick by tick, never faster than the room's clock; and the messages, their schema and the code `flatc` makes
  from it, Google's `flatc` pinned by its checksum. Nothing hosts the room yet.

## Waiting on the owner

- Names for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- Moving `daggerfalljs.dev`'s DNS to Cloudflare, when the renders should leave `r2.dev`
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).
- Which of Cloudflare's runs the rooms ([[Servers on Cloudflare]]): Durable Objects, as Claude recommends, or
  Containers.

## Next

- The water's open ends ([[Water]]): a body for the walker, the weather driving the swell, and the breakers and
  ripples for ships once ships sail.
- The thin server, the rest of it: the room hosted on Cloudflare, ticking 60 times a second; each browser sending its
  controls over WebSocket, predicting its own player and corrected by the room; and two browsers seeing each other on
  the Test Ground ([[Gameplay Starts With the Shared Rules]]).
- Swimming, which the water has in TypeScript, moves into the `movement` crate, so a body on foot meets the water by
  the same rules everywhere.
- The Test Ground's open ends: the shield, torch and lantern in first person, weapon wear, and riding speeds of
  Overlook's own.
- The game itself: the client drawing the world from the land's door, and the server reading the same land crate.
- Then sailing, bringing over DFO's sailing and combat systems, each pick approved by the owner first
  ([[Porting from DFO]]).
- Isles: how many, how big and how they are placed are the owner's to decide; the layout and its rules hold them
  already.

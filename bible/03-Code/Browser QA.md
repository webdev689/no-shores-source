---
type: reference
code:
  - tools/claude-toolkit/webgpu-shot.cjs
  - client/src/game/qaViews.ts
  - client/src/game/runAsked.ts
  - client/src/game/footNode.ts
  - client/src/editor/isleEditor.ts
  - tools/modules/render.py
---
# Browser QA

How a session tests the game in a browser and takes pictures of it headless. The [[Toolkit]] lists the other tools.

## Testing a page

- Playwright with the preinstalled Chromium; never run `playwright install` in a cloud session.
- To test or measure, make no HTML page ([[HTML Is Avoided Where It Can Be]]): open a non-HTML URL of the dev server
  and import a module there.
- Before a PR, drive an interactive feature once in the real editor with Playwright's keys and mouse.
- Poll the panel for state, not the clock: headless frames run the sim at about a fifth of real time.
- Pin a random outcome with an `addInitScript` stub of `crypto.getRandomValues`.
- Before fixing a box's width to fit a text, lay the real element on the built page, its sheets and face loaded, and
  compare `scrollWidth` with `clientWidth` for the longest text it holds: write the width only from that.

## The picture driver

Page screenshots of a WebGPU canvas are blank, and presenting to one loses the device headless.
`node tools/claude-toolkit/webgpu-shot.cjs <steps.json>` gives the game's canvas a texture of its own, in the game's
worker as on the page, and writes each picture from it (a page without that worker, laid under the HUD). Its header
says the steps. Run it on an idle machine, never beside cargo builds.

- **Serving.** Capture a built page, `npm run build` then `npx vite preview --port 5173`, never the dev server: an
  edit reloads a dev server's page mid-run and loses the rest of it. Port 5173 is the only origin R2 answers; where
  another checkout holds it, serve on another port and give the plan `"anyPort": true`, and the driver fetches R2
  for the page. Behind a cloud session's proxy (`HTTPS_PROXY`) it launches the browser on it, localhost bypassed.
- **One run at a time.** The driver holds a lock (`webgpu-shot.lock` in the temporary folder) and refuses to start
  while another run holds it. It refuses a server on the plan's port that serves another checkout. Take no picture
  beside a cargo build: both slow to a crawl.
- **Stopping the server.** `npx` starts Vite under a wrapper, so `kill $!` stops the wrapper and leaves Vite serving.
  Start `node_modules/.bin/vite preview --port 5173 &` and stop it by that pid, never by `pkill -f`.
- **The game's own interface.** The page has no HTML to read: `waitFor`, `clickText` and `press` (a node's id) read
  the game's interface through `__ui()` ([[Interface]], "Read and driven headless"). While the arrival's veil stands
  they find nothing, its own words (the place's name) included, so a step after one acts on the place itself.
  `{ "ui": "<file>.json" }` writes what it shows, each node's id, words and box, to read instead of a picture.
- **What it prints.** Each console error with the address of the resource that failed; each shader that fails to
  compile, which WebGPU reports only as a warning, and each WebGPU validation error, which loses a frame without a
  word (`cargo xtask shaders` checks every shader offline first, [[Checks]]). A `frames`, `waitFor` or `views` wait
  that times out says what the interface showed instead. At the end, each of the plan's `routes` never served.
- **Steps that drive.** `eval` and `frames` run in the game's worker, where `__play`, the `__qa` hooks and `self`
  are. A `{ "move": [x, y] }` step brings the pointer there without a button, as a hover; `{ "down": [x, y,
  "right"] }` then `{ "up": "right" }` press a button and let it go, a `move` between them a drag. A wheel step's
  fourth number sends that many notches a frame apart; `{ "hold": ["w", seconds] }` holds a key.

## Rehearse without the GPU

Give the plan `"noGpu": true` to check what the game does rather than how it looks: nothing reaches the GPU, so the
game runs every frame at full speed, its interface still laid and read; it takes no picture.

- Before a GPU picture of a moment deep in a flow, run the same plan with `noGpu` and `ui` dumps first: it reaches
  the moment in minutes and names what stops it (a start screen, a refused hook).
- Count the frames a GPU picture waits by the game time a frame steps under SwiftShader, not by wall time: a camera's
  2.4 s flight needs some 36 frames.
- A timed hold (a chest's 1 s search) finishes only `noGpu`: with the GPU a headless frame moves the game too little.

## The QA hooks

A page playing alone (`&offline`) with `&spawn=` in its address lends the driver its hooks; a development build
(`NODE_ENV=development npx vite build`) lends the rest. A player's page has none. Each answers whether it did, and
one that did nothing says why on the console, which the driver prints.

- `&spawn=<east>,<south>[,<bearing in degrees>]` says where the arrival stands; `&view=first` or `&view=third,<m>`
  its camera. `&foes=` asks the room played alone for foes ([[Game]]).
- `__qaView(view)` arrives again in the node at a point as a fresh character: the gear's Aurem and resources start
  over, and a chest opened stands again. The room stands the body clear of boxes, so check `__qaWhere()` against the
  point before reading a prompt, and try another side.
- `__qaWhere()` gives the body's `x`, `y`, whether it lies `dead`, and whether the place is drawn `whole`: a layout's
  city is built a few steps a frame after the arrival, minutes headless. A `views` step waits for `whole`.
- `__qaEye([east, south, up, bearing, degrees down])` stands the camera anywhere, on foot, at sea and in the story;
  `__qaEye(null)` lets it go. At sea it takes the sea's own metres.
- `__qaLook(view)` turns the camera to a view without arriving again (development).
- `__qaSea()` sets out for the ship as "Return to ship" does, only from on foot: under the arrival's veil it answers
  false. A sea plan asks it again until `self.__qaGame.flow.mode === 'sea'`, and pictures only then.
- `__qaShip({ hull, dress, emblem })` dresses the own ship as a page alone cannot, holding no gear; `null` lets go.
- `__qaSky({ cloud: 1, falling: 1 }[, worldS])` tells the sky that weather over its own, its clouds held still;
  `null` gives the world's back. A plan's shifted `Date.now` never reaches the weather.
- `__qaGame` is the game's state (`flow`, `sea`, `helmMap`) for an `eval` to read and drive.
- `&minute=<Unix minute>` stands the clock of a node's room played alone, and the page's, at that minute. The world's
  day lasts a wall hour, so the hour of minute `m` is `((m - 29891520) mod 60) × 0.4`; hold a clear one for a
  before-and-after pair. Public events run on that clock ([[Public Events]]): with `&public=raid` the raid starts at
  once from it.
- `&run=<room>` goes into that run once on foot: an Elite Dungeon's, or a Breach's alone
  (`node-<zone>--breach-normal--run-<8 letters>`).
- Playing alone, `Foot.gear` is null: what the room alone says of the player's gear is `held.alone`. A state handed
  to `held.alone` lasts one room message; wrap the field in a getter that lays the state on each.

## Places and how to reach them

- **The sea.** A development page offline with `&spawn=` (`/?at=overlook-social&spawn=&offline`): `__qaSea()`, then wait
  for `flow.mode === 'sea'`. Place a ship staged on the water ahead of the camera's bearing. Watch the driver's exit, or
  a line only it prints, never a grep for "Error", which matches the plan's own text.
- **Many views in one load.** `{ "views": "target/shots/saltmere.json", "zone": "<id>", "into": "<folder>",
  "settle": 15 }` arrives the body at each `[east, south, bearing, "first" | "third,<m>", "name"]` and writes
  `<into>/<name>.png`; a view outside the loaded node is refused. `cargo test -p room --test shots_listed shot_list
  -- --ignored` writes the list from the layouts as laid (rerun it before taking pictures).
- **Content not yet on R2.** Map each new mesh (`modules/<hash>.mesh` from the manifest) to the local bake with the
  plan's `routes`, hold the world at a clear hour with `&minute=`, and `waitFor` the HUD (`All controls`) before the
  first picture: the first frames are black.
- **The story.** `?prologue=<beat>` starts a beat only under `npm run dev`, so run that dev server in a worktree of
  its own, where no edit or merge reloads it, and run that worktree's own driver: the driver refuses a server that
  serves another checkout than its own. Click past "Click or press any key to start" first. `__qaEye` stands its
  camera, and `self.__prologue.ahead(seconds)` plays the story on that far before the next frame is drawn, once the
  beat shows.
- **A sea island's plants.** The World Editor's Islands mode with `&islePlants=game`
  (`?mode=islands&isleSeed=7&isleClimate=<climate>&islePlants=game`) draws the land's plants as the game does.
- **A Blender module.** `tools/modules/render.py <module> <png> --no-ground` leaves the ground out, so a module seen
  from below (an airship overhead) is pictured as players see it. Render "before" pictures from a `git archive` copy
  of the base, never from the worktree being edited. `tools/modules/bake.py <out> --only <prefix>` bakes only the
  modules named so and rewrites only their manifest entries; CI's whole bake stays the check. Its folder then holds
  only those meshes, so `publish.py` cannot publish from it.
- **A dungeon.** `dungeon-qa-build.sh` builds a scratch room module that joins before an entrance and moves the
  player, and `dungeon-plan.ts` writes the plan that pictures a patrol's dungeon storey by storey: it goes in by the
  address's `&run=` (a page of this checkout's Vite, `npm run dev`), stands each view on its storey's floor with
  `__qaEye`, and pictures each room, each flight from its head and foot, a gallery and its hall, and the map on each
  storey ([[Toolkit]], Encounter pictures).

## Staging a picture

- Stage every input from one staged target: the lay, the aim, the card and the hull all come from the same ship, so
  the picture shows a state the game can reach. Say in the report what each picture staged.
- Keep staging files under `target/`.
- For a visual defect, patch one shader layer off per run at `GPUDevice.prototype.createShaderModule`, measure a
  crop, and look at one montage per round.

## Reading a picture

Read each picture twice: once for the change, and once as a player would see it. List every fault in the frame
(light, weather, clipping, missing or floating pieces), whether or not the change caused it, and say which ones the
change predates. A UI change is judged beside its target (the owner's reference picture or the approved twin
surface), in a picture made with the real code, assets and container.

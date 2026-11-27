---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end: a merged pull request
leaves it, its questions for the owner going to [[Open Questions]] and its work left to Next. How each part works is
in its system note ([[Systems]]); history stays in git and the pull requests.

## Open pull requests

- **For the owner's yes once CI passes on its head**: #234 (the owner's answers to the Open Questions, recorded and
  built: the sea, foes and fighting, the patrol zones' folk, the Drowned Vale, the lore, the page, and the repo's
  rate limit, workflows and two new checks). A merge deploys the page, the site, the rooms and the bot, and releases
  the desktop app.
- **Merging on the owner's yes once CI passes on its head**: #236 (a player's feedback: M the map and N the leave,
  Tab and the side buttons bound anywhere, the controls sheet's words first, a master volume and an interface size, the
  held map's legend hidden on L, a landing icon's card on hover, the mouse back as a window shuts, and the sea map's
  names laid out far less often and faster; [[M Is the Map, N the Leave, and the Players' First Asks Are Built]];
  `main` taken in). A merge deploys the page, the site, the rooms and the bot, and releases the
  desktop app.
- **Merging on the owner's yes ("merge and deploy all") as CI passes**:
  - #235: hostile ships come out 1 km off at the helm, still seen and kept from 5 km.
  - #242: helpers capped at two, their briefs corrected, `headroom learn` suggesting only (review 4, 5, 13).
  - #243: the game's test hooks and the picture tools work everywhere or say why not (review 10).
  - #244: the review's lessons in CLAUDE.md, Testing, the Toolkit and the procedures (review 11, 12).
  - #245: new repo checks, each landing with what it refuses fixed (review 8).
- **For the owner's yes**: #159 (the rooms' worker tests wait for what they check; it conflicts with `main` in
  `roomThread.test.ts`).
- **To come, after those merge**: the owner's 120-character line check for the bible and code comments, with every
  longer line rewrapped (observation #53); the record is in `toolkit-data`'s `reviews/2026-11-27/REVIEW.md`.
- **Merge order**: #235 and #245 both move the sea clash pin: whichever merges second moves its line in
  `content/fingerprints.txt`. #242 and #244 share lines in `install-all.sh`, `check_tools.py`, CLAUDE.md
  and the Toolkit.
- **Drafts**: #224 (the walk's left arm, the healing drink's move and swirl, the Thunderlock's hold drawn), #93 (the toolkit's first review) and #114 (the gear message carries the pledge once).

## Built

All on `main` and deployed: a merge deploys the page, the site, the rooms and the bot, and releases the desktop app
when its code changed ([[The Rooms Deploy When Their Code Changes]], [[The Discord Bot Deploys on Each Merge]],
[[The Desktop App Releases With Each Merge That Changes It]]).

- **The scaffold**: the client on WebGPU, the Rust repo checks, CI, this vault, the [[Pick List]] and [[Decisions]],
  the [[Toolkit]]; the [[World Map]] with the owner's nine continents, and the [[World Editor]].
- **The land and sky**: [[Land]], [[Water]], [[Nature]], [[Flora]], [[Meadow]], [[Procedural Textures]], [[Weather]]
  and the [[Sky]].
- **The player**: the [[Sprite Forge]]'s figures, [[Movement]] in the `movement` crate, [[First Person]], every
  control rebound and the pad played as Destiny's ([[Player]]), the [[Test Ground]].
- **The server**: rooms on Cloudflare Durable Objects, messages in FlatBuffers, prediction in the browser, the server
  the authority over arrivals, sailing and rooms ([[Server]], [[Servers on Cloudflare]]); [[Accounts]] on D1 with four
  characters each.
- **The world**: three living port cities and six ruins overtaken by the Lattice, Overlook's hub, nodes walked a
  section at a time, the [[Overworld]] ([[Cities]], [[Reach]], [[Layouts]], [[Modules]], [[Islands]], [[Held Map]]).
- **The fight**: [[Combat]], [[Foes]], [[Enemies]] (the Grey Tithe and the [[Lattice]], territories and arrivals by
  airship and crown), [[Navmesh]], [[Arts]], [[Factions]], [[Revives]].
- **Gear**: [[Gear]], Vestiges and [[Item Pictures]], house pieces dropping in the world and its dungeons, the
  keepers' screens after Destiny 2's, the [[Shipyard]], [[Guilds]] and [[Outposts]].
- **The sea**: [[Sailing]], [[Naval Combat]], [[Hulls]], [[Ship Power]], [[Crew]].
- **Story and activities**: the [[Prologue]], [[Quests]] with the houses' roads, the welcome's gifts, the hordes,
  the riding escort and the riding and sailing lessons, [[Dungeons]], [[Breaches]] (the
  Drowned Vale), the [[Passages]], [[Activities]], [[Public Events]], [[Lore]].
- **Sound**: [[Music]] and [[Ambience]], every recording the owner's Freesound pick but four synthesised ones.
- **The interface**: [[Interface]], drawn without HTML; the game in a worker of its own ([[Game]]).
- **Outside the game**: the [[Website]] at noshores.online, the [[Discord Bot]] and the server it lays out, the
  [[Desktop App]].

## Not yet seen, heard or played

Sessions test offline and picture headless. Headless Chromium can lose the game's WebGPU device when other jobs share
the cores, and SwiftShader is too slow to show the world, so these wait on a real GPU, an ear or a hand. Nothing is
yet played by hand or with other players in a deployed room.

- **Timed on a real GPU**: the game in and out of its worker; the hub with some 125 figures; the wreck with every
  fire; the light layer of the attack visuals; ships and marks under the lamps; the meadow (some 180,000 tufts on open
  grass); the curved wake; the loading screen; everything the performance pass changed ([[Game]], "Limits").
- **Seen on a real GPU**: Overlook's walks where they meet and the paving's seams beside the plaza, and a ship's
  stern on the water, the Frigate's under way (pictured headless only, #227).
- **#232's**: the held map at sea on a real GPU (its frame time with a voyage inked, the route's tiles, the arrow's
  repaint leaving no trace); a ship's flag flying on a settled rig and coming down its mast when struck; the far
  shadow map with traffic offshore; the bot panel's sign-in in a real browser with its new cookie.
- **Heard**: the music, the ambience, the world's, sea's and menu's sounds and their levels; the prologue's music and
  voices; the seams between a long recording's chunks; whether a browser drops an MP3's 25 to 40 ms of padding, as
  ffmpeg does, so each hoofbeat plays to its cut.
- **Played by hand**: the prologue in one run; an hour's day; a ranged weapon's fight on foot; the travel's fade
  from the helm; a hostile ship coming out 1 km off at the helm (#235); a clash of a Tithe ship and a merchant, joined;
  the welcome's tour with its 400 Aurem and a starter
  piece bought; the key strip, the leave held and a real pad's View held; the hit fixes; the Passages (every deal, a dive's way across zones, a public round, the held
  map's public way, the sea's new ranks and salvage, the week's Abyss Dungeon run again); the escort on its horse and
  the hulk at sea.
- **Live, once deployed**: a dungeon of each style; the Journal and the board (a bounty taken, counted and turned in,
  a sea bounty at sea); an arrival of each kind; a Vestige left lying and taken from the Postmaster; the accounts'
  migration of each character's room; a lore chapter found; two players reviving; the heroic raid with players; the live flow into a Test
  Room and its Discord role check; a sea fight in the deployed rooms.
- **Seen**: two players seeing each other's dyes, horses, faction gear and Veiled figure; the held map's dots for
  other players, the held map on an island, or a fall while it is up; the sun through a building's panes; a blow on a
  shield; a faction set worn; the crown's crack and break; the forge's figures on the character screen; a ruin up
  close and its wrecks from the sea; the sea fight's burst ring; healing charges in a company; the crosshair in a fight
  and the weapon rows; the walking blows frame by frame; the display beside the owner's two pictures (#68); a ware
  bought at the Quartermaster's and a Vestige opened at the Reader's; the water's order at a coast; the travel's hover
  and prompt on the pad; a road walked end to end; the plants' sway in a high wind; the Drowned Vale's light, tuned on
  SwiftShader pictures; a keeper's lit mark beating.
- **The desktop app**: a Windows or Mac installer run, an update installed, a Discord sign-in in its window, the
  AppImage on Ubuntu 23.10 or later.
- **Unchecked**: whether the Escape that frees a locked mouse also reaches the game; whether the faction blades'
  first-person frames pair with the published hands; the pistolet's and the thunderlock's first-person pictures (a
  404 at the Test Ground: missing on R2, or slow); whether #70's dead code is cleared; a public event's chest
  (`public/chest.rs`) and a grant (`grants.rs`) still go through `pick_up`, which hauls a Vestige where the player
  stands in a passage zone; a Vein's nodes under ground, never pictured; whether the wreck scene's sunk Sloop still
  wears the pirates' colours.

## Waiting on the owner

The owner's decisions are in [[Open Questions]]. These are the owner's to do:

- **Keys**: rotate the Cloudflare token given in a chat (the Actions secret `CLOUDFLARE_TOKEN`) and the Porkbun key
  posted in an earlier chat (never stored or used).
- **The Discord**: set the application's interactions endpoint to the bot's `/v1/discord/interactions` and its two
  redirects (unchecked whether done); press Build in the panel's Server layout and follow its checklist in #staff,
  first a fuller invite (the bot's first lacks Manage Threads, Mute Members and the two thread permissions). The
  Developer role appears once the layout is built again.
- **Branches**: delete `ccr-9e470c58-pm6nyz` (#211, merged) and `ccr-c7c30290-wwnvc5` (#221, merged); a session
  cannot.
- **Security and deploys found by the tooling audit** (each needs the owner's named approval, as a rule on keys,
  security or deploys does): any branch's push runs the asset workflows (`modules.yml`, flora, ships, wreck, freesound,
  dungeon-modules, island-modules; lattice on every branch but main) with `CLOUDFLARE_TOKEN`, which writes the bucket
  the desktop app's update feed (`desktop/latest*.yml`) is read from, so a branch could replace the feed: the feed
  wants a bucket of its own whose token is a `desktop` environment's secret, main only. `lattice.yml`'s publish job
  runs pip-installed code holding the token, and `server/r2Token.test.ts` checks only workflows naming
  `tools/r2.py upload`. The hash-named builds install unpinned Pillow and NumPy and keep checkout credentials. Workflow
  paths missing inputs: `forge.yml` (most of `tools/forge/tools/sprite-forge/`, `forge_publish.py`, `r2.py`) and
  `desktop.yml` (root `package.json`, `package-lock.json`, `.github/deploy-ready.sh`); `server:bundle` dry-runs
  neither the bot's nor the site's Worker before a merge. Eight workflows' header comments still say "the
  repository's R2 token".
- **Limits that are the owner's trade-off** (the server audit): any 64-hex string counts as a signed socket before the
  keeper answers, so the per-address cap on unsigned sockets stops applying, and each check is a D1 write (`liveAccount`
  is an `UPDATE`), unthrottled, in the rooms, the chat and Find a Company; guests are capped at 500 an hour game-wide
  (50 addresses use it up) and a username's password sign-in at 100 tries in 10 minutes from all addresses, so both
  can be locked out on purpose. The sea room takes any number of players (`Sea::join`), where a node's takes
  `PLAYERS_MOST`: a cap is a number for the owner.
- **A decision names a deleted file**: [[Chests and Searchable Containers as Claude Builds Them]] names
  `tools/modules/chest.py`, gone; the owner's to reword.
- **Reports**: a screenshot of the thin black vertical line across the world (the canvas fills the page); the
  browser's console (F12) the next time a frame throws (`FrameGuard` logs each error once) or a public event is not
  drawn (it names the meshes that failed); when walking or sprinting fails to happen on demand.
- **The DFO Pick rows** for heraldry and for halls, works and decor: `proposed` until the owner approves them.
- **Writes to R2 that need the owner's named yes**: a test upload for R2's own `Cache-Control`; the Lattice's armour,
  on hold, whose 48,000 renders publish with the repository's Cloudflare key.

## Next

- **After #234** ([[The Open Questions' Answers as Claude Builds Them]]): a friendly ship in a fight still flies
  Overlook's blue; travelling aboard another's ship has no getting off at will, no fight of the captain's shown, the
  helm's controls still offered, no going ashore together, and no way back for one keeping no ship let off far from
  Overlook; a Breach checkpoint moved less than a second before its last player leaves may not be stored. Its new
  questions for the owner are in [[Open Questions]]. Not yet seen in a running game, on a real GPU or in a deployed
  room: all of it, the sign-in limit's Cloudflare binding and a run's storage alarm among it.
- **A Breach space's paths after its seal opens**: a space's navmesh is baked as it is first reached and never again,
  so no foe paths through a seal opened since, in a run restored or not (found by #234's audit, as it was before it).
  Baking a space again as its seal opens would change how foes move: the owner's to say.
- **The players' first asks** (#236), tested offline only: the mouse taken back as a window shuts is unchecked in a
  browser where the player freed it with Escape first (Chrome may refuse; the desktop app takes it); the interface at
  2x and above is unseen; the sea map still lays its names out each frame a drag or the wheel moves its view (about
  13 ms at 1920 x 1080, measured natively), and its picture's repaint and upload (4 to 18 MB) are unmeasured; lighting
  the water under the pointer takes some 14 ms each time it crosses into another (`litCells`); the sea map's own
  marks (islands, hostile ships) say nothing under the pointer, the landings' tiles alone do; the Legend has no pad
  button until one is bound. Its audit's leftovers: the sea's summed tables (`CellSums`) take some 2.6 MB each, the
  land and each continent asked, kept for the page's life; Firefox's keeping of a side button from going back is
  unchecked.
- **The deeper dungeons (#229) on a real GPU and by hand**: storeys, flights, galleries and light by storey, the
  third-person camera on a flight, the 3D map's ink and its frame cost, the published stair and balustrade pieces;
  a walk through a three-storey dungeon and its vault. Headless pictures of three (`dungeon-plan.ts`) were taken before
  the audit's fixes and show every room, flight, gallery and map drawn; seen from its head in a dim flight the treads'
  edges merge. The audit's 31 findings, a navmesh bridged-hole bug, a lamp guard that never stood under ground and a
  vault left no chest place are fixed on the branch (tested offline). Its notes' Limits name what is left (sight under
  a flight's slope, a landmark's storey by its first solid). Whether passages go deeper than one storey is the
  owner's call.
- **The toolkit's barriers** (observations 0040, 0116, 0117, each seen a third time): a worker's run ending before the
  2-hour kill with its edits committed, its target/ deleted once merged, and no picture run driving another
  checkout's server.
- **#221's sea map, travel and locked seas**, merged: not yet pictured headless, played by hand, on a real GPU or in a
  deployed room; the chart's marks' bytes are not measured against [[Server]]'s load figures.
- **A body lying still**: the page's intent for it is one number short (`client/src/combat/fighting.ts`, `lying`,
  17 where `INTENT_FLOATS` is 18), found by the review's checks and offered as its own task.
- **The ships' footprints** (#227's audit): a friendly ship's footprint is laid a moment before its model has come,
  on a hull's first load, as an empty cut in the water (`friendlyShips.ts`; the sea draws such a ship as the Sloop
  stands in, `ShipModels.shown`); a footprint sits up to 0.37 m inside its hull near the ends, hidden by its sides.
- **After #216** ([[A Ship Docks in Sight, Undocks as Its Player Leaves, and Lies Parked Where Others See It]] and the
  four decisions before it): the three landing zones of Saltmere's patrol zones, the zone's map and their fast travel,
  not built; ships ashore drawn in friendly colours, not their dress; going back aboard after a page reload ashore
  does not sail out from the berth; parked ships kept in the sea rooms' memory alone, so a deploy loses them; a ship
  ashore vanishes up to 15 s after it sails; the island's Elite Dungeon scene and the website's gate alike but not
  shared; the port's tile paints Overlook wherever it is docked. Not yet seen in a running game, on a real GPU or in
  a deployed room: docking and undocking, parked ships ashore and at sea, the tiles and their icons, the console, the
  Playlist's crests.

- **The lights at sea and in the city** (#228 on #233's lights): not pictured on a real GPU or played by hand; the
  hub's city does not draw in the headless QA page, so Overlook's lights after the fold are unpictured; each lit ship
  lights up to four lamps, which may crowd the nearest sixteen in a big night fight; the pad's Continue is untested;
  a keeper's screen says its lines on its own 1.6 s.

- **The lights under ground and on land, the islands' textures, the passages' polish** (#233, #241): not seen on a
  real GPU or played by hand; not pictured: a dungeon with many torches (`dungeon-plan.ts`'s steps still drive the
  page, but evals run in the game's worker), a ship's lantern (no offline way into a sea fight at night); not
  measured: a night sea fight's frame (the probe dies on the battle beat) and the fires' GPU cost. Known: the
  passages' lamp glass shows two dark marks like a face; a hollow's sky is pale at 1 a.m.; map labels can sit over
  route lines; a strand's hull stands tilted; an open mouth's daylight is a flat pale sheet; islands' modules sample
  the rock texture on every fragment; f32 time in the shaders drifts from the CPU's flicker after hours.

- **The five longest system notes**: Interface (1,881 lines), Server (1,003), Game, Gear and Naval Combat (905 to
  978) want splitting or tightening, once the open pull requests that edit them have merged (the owner's "After they
  merge").
- **DFO's newest site.** `MckaySea/website.df.source`, a fork pushed after `Lattymoy/website.df.source`, stays unread:
  attaching it was refused as another account's. The second pass followed `Lattymoy/website.df.source` at 375ba209.
- **The cloud environment.** A cloud session runs on the `no-shores-source` environment (personal, set up with the
  owner's approval): its network allows R2's public bucket (`ships.base`), which `client/src/ships/shipTags.test.ts`
  fetches meshes from, and its setup script runs `npm ci` (unproven until a fresh session starts on it). Run the check there as `NODE_USE_ENV_PROXY=1 cargo xtask
  check`: Node's `fetch` ignores `HTTPS_PROXY` without it. On the Default environment those four tests fail with
  "fetch failed" and xtask stops before the build, the bundle and the repo checks; run `cargo xtask repo` beside it.
  The Context7 and SkillsMP keys are on neither environment.
- **Workflows**: `tools/install-flatc.sh` joins `CODE` in `.github/workflows/rooms.yml` (a deploy change, the owner's
  yes); the `modules` workflow bakes with the four Blender chests taken out of the manifest by hand; the forge's
  renders leave `r2.dev`, which limits its rate, once `daggerfalljs.dev`'s DNS moves to Cloudflare
  ([[The Forge's Renders Will Use daggerfalljs.dev]]); whether Cloudflare takes the accounts' binding to the bot's
  `Members` before the bot deploys it (if not, the accounts' deploy is tried again after the bot's).
- **The forge**: the Drowned horse renders only by a hand forge run (`figures` =
  `horseidle,horsewalk,horsegallop|horse_drowned`, a write to R2), its first-person frames in no workflow; the
  Scrivener and the Steward wear the Idol's and the Heart's bodies until their own are drawn; the Wraith Mist barding's
  blank ride strips on R2; a hide and mane mask for coats.
- **The Lattice's armour and weapons in Daedric's place**, on hold by the owner's word
  ([[The Lattice's Armour and Weapons Take Daedric's Place]]). The armour is built after the owner's reference and the
  owner likes it (`tools/lattice/armoury.py`, drawn standing still on the man's and the woman's bodies). Still to do
  when it resumes: the woman's body; every move, about 48,000 renders, in a workflow that renders in parallel and
  publishes to R2; first person; the weapons and shields; and the game's own names (gear tiers, dyes, outfits, first
  person's metals, the swing's tint, their tests) from Daedric to Lattice.
- **Foe arrivals' leftovers**: tests that tell a smaller group by its make-up, a test of the airship's roll's sign,
  the quest guide pointing at a foe still arriving; the scripted pair in the door test loses the heroic raid's last
  wave, pinned as it is.
- **The welcome's live pictures**: the header's 400 Aurem after the stranger's gift, the tracker's first task, a
  starter piece bought at the Weaponsmith and the Character page with it worn. A local room runs (`npm run server`),
  but under `tools/claude-toolkit/webgpu-shot.cjs` the game's worker opens no socket to it (the driver rewrites the
  worker's script); the `/editor/` page, which has no game worker, reaches it. Fix the driver, then picture them
  (`?arrival=1` begins at the arrival under `npm run dev`; `__qaGame` is lent in a live room too). Also unpictured:
  the wreck's ability bar just after the engulfing, the shore and the deep in plain clothes (the shore's taking of her
  hand does not advance headless), and the Mount flyout at 960x540.
- **Pictures**: a picture plan cannot set the weather (observation 201): a dev hook lending the sky would fix it. The
  hub's buildings never draw headless (no picture of the Harbourmaster's stall or the gate). The encounters' dungeon
  driver (`tools/claude-toolkit/dungeon-plan.ts`) waits on the game's own drawn "Enter" through `__ui()`; a dungeon has
  not been pictured with it since, nor the entrances' two WebGPU fixes on a node.
- **The public events' last pictures**, left for later by the owner: the raid's waves marching, a store plundered,
  Marrow, the Tithe giving up and a failed raid; the Fissure's growth sinking, the Warden, the last minute, the seal
  and a failed Fissure; the chest, the result and the reward feed; night; the banner at 1280x720, 1000x600, 390x844
  and 844x390. Pictured and still wrong: a store's bar shows through a house's wall (the bars are interface marks with
  no depth). Headless frames took 11 to
  30 s, so a pass needs several runs under the 2-hour limit (observation 0095). Dev play: `&public=`, `&speed=`,
  `&bots=`. #97's one clock can replace the events' own schedule.
- **The boxing's cost**: a leaning spire of the cities keeps within 13 m only, as boxes square to the world stack up a
  lean; boxing a city takes 0.03 to 0.5 s natively where it took a millisecond, and WebAssembly's cost (the land
  worker boxes a node's city on entry) is unmeasured.
- **The patrol audit's risks left** (#170's description, each with its file in the audit): run lines against the
  section's ring (the ways measured: 4 of some 14,800 samples outside, by 1.8 m at most) and rock beside a run inside
  it, against [[A Run on the Rock's Top Is Held by Out of Bounds]]; `runs_everywhere` checks the wing from the ring,
  not the claim; the map draws a run's connections straight; caverns' chambers turned by quarters, building runs off a
  raised area, a rampart draw at a slope of 0.602, cave roofs over low rock; a kill goal's road group never sent away;
  a rejected post dropping the points near it; a leashed foe off the navmesh walking straight home; a far-off shot
  still filling an empty threat; the page's per-player and per-foe maps over a long stay; a trip that throws after
  its room joined leaving the socket open; one throw every foot frame keeping the veil up; a site's first stand
  baking its navmesh a slice a tick; room memory with every site stood; a cavern over 4 m below the surface unchecked
  for followers' places; the page's bots failing about 10 of 12 heroic raids.
- **Hitching in the prologue**: the shore's return to Saltmere rebuilds its city, unmeasured. A fleet room's lagging
  player has their held lay begun again by the room's standing orders while their page keeps counting.
- **Hitching, after DFO's performance work** ([[DFO's Performance Work Comes Over, Measured First]]): a landmass
  cannot be prepared before it opens, as the land's worker holds one; the main city and the layouts' city may build at
  once, up to 48 ms a frame behind the veil; a layouts rebuild re-scatters every tile. Every deploy waits on R2
  answering, as `client/src/ships/shipTags.test.ts` fetches ship meshes from `r2.dev`. Memory to measure: the figure
  cards' 4000-texture budget (`player/cards.ts`).
- **After the performance pass**: a node's room opens in 0.7 to 0.9 s natively on the roads' nodes, about 95% of it
  navmesh bakes (the node's own square 370 to 510 ms). Baking a node's meshes with `npm run bake` would open a room at
  once but ship larger node files: the owner's call, not asked yet. The bake's whole-field slices (some 15 ms each
  natively) could be cut finer; their cost in WebAssembly is unmeasured. The GPU audit's other ideas wait on a real
  GPU's timing. A 10 s window at the hub 30 s after loading still allocated some 400 MB while the hub streamed in:
  measure later after loading before taking it on.
- **Browser QA** ([[Toolkit]]): run `tools/claude-toolkit/webgpu-shot.cjs` and `webgpu-perf.cjs` on an idle machine,
  as beside a cargo build the world may not draw for minutes and R2's meshes fail to come (observation 312);
  `tools/uiShot.mjs` draws the menu whole through the real renderer.
- **A raised shield's walk**, which the owner asked for and chose to defer: walking with the guard up shows the still
  `block` frame. It needs a `blockwalk` from the forge (the block's arms and shield over the shield march's legs, as
  `onthemove.py` lays an action over a walk, held for the stride's four frames) for every body and gear layer that
  draws the block, published to R2, then the figure's guard on the move playing it (`playerMoves.ts` `fightMove`).
- **The Thunderlock's hold**: the forge holds it trigger to the front (`gunplay.PORT`), but its rest, walk and sprint
  are not drawn again ("Blades only for now"), so the game holds it as before: about 27,000 frames a body, some 400
  Actions minutes of the `forge` workflow's `figures`.
- **The garrison agreement run kills no foe** (`crates/room-wasm/src/garrison_door_tests.rs`,
  `server/garrison.test.ts`): its 13 foes stand all 1500 ticks, so nothing after a fall is checked natively against
  WebAssembly. Next: a scripted player that turns to its nearest foe and lands its blows, and a guard that needs a foe
  to fall.
- **The hub** ([[Overlook's Hub as Claude Shapes It]]): its audit's open risks (a walker's side step or sharp turn not
  walked against the hub's boxes, kept posts' people not booked against walkers, routines' maths rounding by engine,
  puddles on lawn as on flat stone); pictures of the Harbour Stair, the road, the fall and the townsfolk at work. The
  tour's keepers read small behind their counters.
- **The islands** ([[Islands]]): coming out of a door's dungeon back onto its island, before the door, rather than at
  the ship (the trip takes the door's point already, `SeaBack`); pictures of the landfall offer, E's prompts and
  washing up, in the game itself.
- **The sea**: the fleet room has no burst (`crates/protocol/src/fleet.rs` sends `boost: false`); no ship opens its
  cabin yet, and the Tithe Ram has no ram bow ([[Hulls]]); quays, and the land a fight is fought over;
  [[Pick - Sailing and Naval Combat]]'s step 3 still lists boarding and crew as waiting; merchantmen, bounties, public
  events and fleets at sea ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]). Before any gear has come a tier's
  seas show open, the server still refusing them. Unexplained: one voyage in
  contested water held a ship in sight 89 s; under a player's fire a Frigate lasts about 5% longer than a Sloop of its
  rank. Ships start and stop at 60 m/s at once; a ship behind an island still wears its mark; a ship's aim moves with
  the eye in uneven steps when the room's answers come unevenly.
- **The ships' manifest** (660 KB) is imported by the client and embedded whole by the room: load each deck on its own
  before more ships join. A change to the shared builder is checked by rebuilding each published ship and comparing
  its dry-run mesh hash with the manifest's.
- **The wreck**: the step up to where the player wakes is too high for foes, so a player who stays there is not
  reached until they come down.
- **The houses and looks**: reputation from bounties and activities once they exist; Shape at Sunspire and Rimeholt
  when their social spaces open.
- **The gear loop**: a signed ticket from the sea room naming the node and the seas a player may join at; Breaches,
  Elite Dungeons and Missions as loot sources; the wardrobe ([[Clothing Is Armour, With a Wardrobe Later]]).
  Characters past the prologue before its plain clothes came have none; playing alone walks no road, as it keeps no
  gear; a rollback past the welcome loses a new character's welcome ([[Gear]]).
- **Known and left**: at a steep downward look the aiming camera can show the figure's diagonal back view; a crowd's
  dresses are composed ahead only as room comes, small objects are made each frame, and the Test Ground's panels run
  the room while the pointer is free; `server/outpostReload.test.ts`'s three tests misreported once in a full parallel
  run and passed alone and on the next run.
- **Zones**: the other islands' eight patrol zones' runs once the owner has looked at Saltmere's; a swamp's massif is 12 m high, low
  enough to climb in places, so its runs' end arenas need cutting deeper or walling. The layouts' open ends
  ([[Layouts]], "Limits"): replanning only the layouts a change touches, and the activities on the sites; moving each
  patrol's dungeon entrances onto the layouts' places (#82's plan). Some
  retaining walls near Overlook's plaza may be dropped whole (low confidence).
- **Latent layout flaws a re-roll exposes** (#207's description): five re-rolls of the Saltgrass Downs' brief, the same
  failures on main's code and #207's. The Tithe Barns, a keep run beyond the claim, gets a beat inside the section in
  four of five, failing four of `runs_planned`'s checks; a track grazes a building's lining corner
  (`clearing::round_rooms` samples in tenths and bends at most three times); a gate's palisade stops 11.3 m short of
  the rock; and with the Barrow Field removed, loose rock lies in the Beacon Stair's stone and a run raises the Broken
  Causeway's claim 2 mm. Each wants its cause found before an area is added or moved there. The 7 x 4 x 11 m block once
  seen on a Chalk Adit beat has not shown since; its source is unfound.
- **Attack visuals**: one particle system for `Sparks`, `Bits` and the shots' bits; the marks copied into new arrays
  each frame (about 0.4 MB in a busy fight); emitters under the sea still lighting. A Grey Tithe figure's telegraphed
  blow snaps to idle after its tell.
- **The client audit's finding**: trees and water past 1 km stand on the uncarved 1 km ground, the middle ground being
  the terrain's only. A city built before its module meshes come draws none of them.
- **Fight-life's voice blurb system**, which the owner named for [[Speech]], could not be read, so the likeness is
  unchecked.
- **The rules on foot**: swimming, which the water has in TypeScript, moves into the `movement` crate; the walker gets
  a body in the water ([[Water]]); running's stamina and casting's harm ([[Combat]]).
- **The enemies** ([[Enemies]], [[Server]]): a garrison stands within its room's 70 m navmesh, not its whole section;
  a player waiting near a fallen group keeps it from standing again; a rejoin loses the player's place, any fight and
  its foes; the boarding fight on a deck that the deck crews are for. None is tested in a deployed room.
- **The Test Ground**: the shield, torch and lantern in first person, weapon wear, riding speeds of Overlook's own.
- **The world** ([[Game]], [[Cities]]): colliders for the city's blocks before any node walks among them (none comes
  within 2 km of a city's wall yet); the World Editor's 3D view without the city, woods and shadows (its worker opens a
  landmass without the RMB index); flats and lit windows in the cities (the RMB table keeps no places for flats, and
  their archives are not paintable).
- **The held map** ([[Held Map]]): a quest's goals beyond the keepers it names tracked on it; on land, the relief past
  the camera's 2 km read off the worker's exact ground, and lakes, which only the 1 km grid holds.
- **Touch**: no touch layer yet, so the sea fight and the wreck's fights need keys or a pad, and no card shows by touch
  ([[Interface]], "Limits").
- **The Lattice's other props**: its sixteen props are pictures only; four of the events' modules are built from
  their parts, and the rest wait on where its corrupted areas lie.
- **The audit's findings left** (the audit's pull request lists each with its evidence), each needing the owner's word
  or more than a fix:
  - A player who opens sockets and never sends fills a room's 16 places (the sea's 64); #122 dismisses unsigned ones,
    but a signed idle player is never let go: whether an idle player is sent away is the owner's call. The roster's
    and a player's reads have no rate limit.
  - A Guns module's Prestige climbs past Ship Power's caps (the weapon grid's five upgrades), and a ship four levels
    under still burns a captain with heated shot though its balls do nothing: the owner's to say which way each goes.
  - Binds: Use rebound to R is never heard walking the deck, where Repair keeps R; F held to dismantle can be taken by
    a rebound Details or Character. The clash finder sees neither.
  - A coward's flight is cancelled for good by a stagger (`foes/tactics.rs`).
  - The terrain's painted paths are sampled at window coordinates in f32 (3 to 6 cm steps far out), and `RoomHost`
    (`server/worker.ts`) has no test.
  - Workflows: the wreck's and the ships' workflows miss inputs they import (`tools/ships`, `shipPictures.ts`); a
    failed accounts deploy still lets the rooms record a deploy and the page publish.
  - Repo checks that still let things through: the html check misses `.after(` and `.before(` (the game has methods
    of those names, so they need types to tell apart) and an element's style held under another name
    (`const look = canvas.style;`, where `.style` before `;`, `,` or `)` stands in game code: `hair.style`).
- **#232's audits' findings left** (its description holds each with its evidence):
  - Per frame (the client perf audit): every water pixel loops over up to 48 hulls twice (`water/hullMask.ts`
    `hull_cover`, `water/wakes.ts` `wake_at`), the ships within the far plane, not the view: culling them on the CPU
    must keep each one's wake trail; line-of-sight scans walk the node's whole box list several times a frame
    (`playerCamera.ts` `rayHit`, `boom.ts`, `hudPlace.ts`, `tracers.ts`) and `plazaLife.ts` `floorOver` filters it
    each call: one grid of boxes would serve all; new Dress objects each frame defeat `Cards`' caches (Lattice foes'
    `withoutLayers`, `walker.ts`'s fight dress, `otherHand`, `spare`, quest looks); the city's lamps weighed every
    frame at night; the rain shelter's grid rebuilt over every box each 16 m; passage pieces stringified twice a frame.
  - The held map: a name the ship's arrow pushed off stays off after it sails on, until the view changes (the
    owner's call whether it should come back).
  - The rooms: the host should send an older socket of the same unkept session away before `Sea::own`, which now
    refuses a second owner of one account, so a fast reload at sea while the accounts are down keeps its flotsam;
    `power::aimed` tells an aimed shot from a quick one by comparing damage, so a bow loosed on the draw's first tick
    counts as quick (carry the flag from `combat::step::draw`); a stop pressed before the ship is at sea is
    ignored, as the course held for the keeper's answer keeps no empty one (`hold_course`). Test-only public items (`Room::set_lore`, `place_grounds`, `Sea::fight_mut`, `Brain::fights_for`,
    `seen_coming`, `Board::tokens_out`, `Web::ways_in`, the navmesh's `find_path_ignoring` and `reachable_from`) and
    most of `gear::band`, used by its tests alone: kept or cut is the owner's call.
  - The server: room WebAssembly calls outside `guarded` in `RoomHost.openRoom` and `joined`, so a trap there leaves
    the instance poisoned rather than the object reset.
  - The client: three copies of keeping trim, arms and arts from a gear word (`roomConnection.ts`, `roomThread.ts`,
    `localRoom.ts`); the console names a heading on sixteen winds and the ship's panel on eight, so 22 degrees reads
    NNE on one and NE on the other.
  - Repo checks: the vault check reads a call split over lines, or a struct literal's field, as a definition
    (`checks/vault.rs`); the comments check loses track after a Python string assigned over several lines; the html
    script check reads `.append(`'s receiver by its last name only; a bare package import that resolves to CSS
    (`@fontsource-variable/pixelify-sans`) and `.pcss`, `.postcss`, `.sss`, `.stylus` pass as scripts.


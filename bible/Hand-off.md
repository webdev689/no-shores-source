---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end: a merged pull request
leaves it, its questions for the owner going to [[Open Questions]] and its work left to Next. How each part works is
in its system note ([[Systems]]); history stays in git and the pull requests.

## Open pull requests

- **For the owner's yes**: #159 (the rooms' worker tests wait for what they check; it conflicts with `main` in
  `roomThread.test.ts`).
- **Other sessions' work under way**: #221 (hostile ships and islands on the sea map, travel anywhere at sea; it
  shares the sea's files with #216, merged, so it takes `main` in again).
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
- **Gear**: [[Gear]], Vestiges and [[Item Pictures]], house pieces dropping in the world, the keepers' screens after
  Destiny 2's, the [[Shipyard]], [[Guilds]] and [[Outposts]].
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
- **Heard**: the music, the ambience, the world's, sea's and menu's sounds and their levels; the prologue's music and
  voices; the seams between a long recording's chunks; whether a browser drops an MP3's 25 to 40 ms of padding, as
  ffmpeg does, so each hoofbeat plays to its cut.
- **Played by hand**: the prologue in one run; an hour's day; a ranged weapon's fight on foot; the travel's cinematic
  from the helm; a clash of a Tithe ship and a merchant, joined; the welcome's tour with its 400 Aurem and a starter
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
- **Branches**: delete `ccr-9e470c58-pm6nyz` (#211, merged); a session cannot.
- **Reports**: a screenshot of the thin black vertical line across the world (the canvas fills the page); the
  browser's console (F12) the next time a frame throws (`FrameGuard` logs each error once) or a public event is not
  drawn (it names the meshes that failed); when walking or sprinting fails to happen on demand.
- **The DFO Pick rows** for heraldry and for halls, works and decor: `proposed` until the owner approves them.
- **Writes to R2 that need the owner's named yes**: a test upload for R2's own `Cache-Control`; the Lattice's armour,
  on hold, whose 48,000 renders publish with the repository's Cloudflare key.

## Next

- **The owner's answers to the Open Questions**, walked through one at a time, each to build as its decision says:
  - The prologue's chart that disagrees with the coast, and the lore's Tithe sails marked
    ([[The Prologue Shows the Chart That Disagrees, and the Grey Tithe Sail Under Their Colours]]).
  - At sea ([[Friendly Ships Fly the Three Houses' Colours, and Travel Keeps the Hostile Clock]]): friendly ships
    for the three houses; the seas' Elite and Abyss tiers removed; travel aboard a company member's ship; a Sloop
    able to flee a Boss; travel keeping the hostile clock, and its three small faults; the week's run only from a
    port docked at; a parked ship's plate following its player's username and guild tag. The locked seas are #221's.
  - The lore and the factions
    ([[The Mystery Is Called the Axis, the Keepers Are Named, and Each Bounty Carries a Line of Its Tale]]): the Axis
    in the lore, the Pearl Tomb's brief to cliffs, Captain Tamsin Rook and The Quiet One (Ysolde) in the game, and a
    line of its tale on each bounty's card.
  - Foes ([[Bosses Stand Larger, Shields Regrow on More Foes, and Land Hides Plates]]): Minibosses and Bosses drawn
    larger; the Court dark at Elite; places in a patrol zone holding only civilians and guards (which, Claude's
    call); the arrivals' sound sheet; shields that regrow, carried by dungeon and Breach foes too; other players'
    damage numbers seen from far away; one look for both deaths.
  - The Drowned Vale ([[A Breach Run Follows Its Company From Checkpoint to Checkpoint, and Forged Weapons Climb]]):
    the run following the company; a checkpoint at each encounter's start, reset from the Playlist; the gate kept
    over a deploy; the Ways waiting on every living player; Forged weapons climbing to Hard's Prestige.
  - Fighting and gear
    ([[Volt's Boost Lights the Character, House Pieces Drop in Dungeons, and a Lip Hangs as Caught]]): Volt's boost
    lighting the character; Exposure halving the drink; a lip hung as caught; old saves given the Ranged weapon;
    house pieces dropping in the dungeons and the Breaches.
  - The page
    ([[The Story's Mark Stays With the Character, the Page Plays Online, and a Join Reaches Any Landmass]]): the
    story's mark with the character; the room deciding the garments; Graphics' own settings; the pad's chat and
    report buttons; a join to any landmass; online by default.
  - The repo ([[Sign-In Is Rate-Limited, Three Checks Join the Repo, and Comments Stop Saying Who Chose]]): a
    sign-in rate limit at Cloudflare; the workflows' and that audit's seven points; the 158 comments; three new
    checks; the ship meshes cached in CI; the dungeon crate in the bake.
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

- **The five longest system notes**: Interface (1,668 lines), Gear, Server, Game and Naval Combat (850 to 907) want
  splitting or tightening, once the open pull requests that edit them have merged (the owner's "After they
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
  no depth), and the banner reads "Stores 100%" with a store at 99% (the sum rounds up). Headless frames took 11 to
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
- **Hitching in the prologue**: the aim's view (`AimView`) is made again for every sea fight; the shore's return to
  Saltmere rebuilds its city in one go. A fleet room's lagging player has their held lay begun again by the room's
  standing orders while their page keeps counting.
- **Hitching, after DFO's performance work** ([[DFO's Performance Work Comes Over, Measured First]]): a landmass
  cannot be prepared before it opens, as the land's worker holds one; the main city and the layouts' city may build at
  once, up to 48 ms a frame behind the veil; a layouts rebuild re-scatters every tile. Every deploy waits on R2
  answering, as `client/src/ships/shipTags.test.ts` fetches ship meshes from `r2.dev`. Memory to measure: the figure
  cards' 4000-texture budget (`player/cards.ts`) and the item pictures' cache, uncapped (`player/itemPictures.ts`).
- **After the performance pass**: a node's room opens in 0.7 to 0.9 s natively on the roads' nodes, about 95% of it
  navmesh bakes (the node's own square 370 to 510 ms). Baking a node's meshes with `npm run bake` would open a room at
  once but ship larger node files: the owner's call, not asked yet. The bake's whole-field slices (some 15 ms each
  natively) could be cut finer; their cost in WebAssembly is unmeasured. The GPU audit's other ideas wait on a real
  GPU's timing. A 10 s window at the hub 30 s after loading still allocated some 400 MB while the hub streamed in:
  measure later after loading before taking it on.
- **Browser QA** ([[Toolkit]]): run `tools/claude-toolkit/webgpu-shot.cjs` on an idle machine, as beside a cargo
  build the world may not draw for minutes; `?face=<degrees>` is not an address flag (patch a built copy's
  `askedArrival` to face a way); `tools/uiShot.mjs` draws the menu whole through the real renderer.
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
  each frame (about 0.4 MB in a busy fight); emitters under the sea still lighting; `camera.ts` `shifted` keeping the
  HUD matrix's translation in float32 (about 0.25 m off far out). A Grey Tithe figure's telegraphed blow snaps to idle
  after its tell.
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
  - The terrain's painted paths are sampled at window coordinates in f32 (3 to 6 cm steps far out), an island room's
    hauls are kept and never told, and `RoomHost` (`server/worker.ts`) has no test.
  - Workflows: the wreck's and the ships' workflows miss inputs they import (`tools/ships`, `shipPictures.ts`); a
    failed accounts deploy still lets the rooms record a deploy and the page publish.
  - Repo checks that still let things through: the html check misses `.after(` and `.before(` (the game has methods
    of those names, so they need types to tell apart) and an element's style held under another name
    (`const look = canvas.style;`, where `.style` before `;`, `,` or `)` stands in game code: `hair.style`).

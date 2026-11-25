---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

All of this is on `main`; a merge deploys the page, the site, the rooms and the bot
([[The Rooms Deploy When Their Code Changes]], [[The Discord Bot Deploys on Each Merge]]). How each part works is in
its system note.

- **The scaffold**: the client on WebGPU, the Rust repo checks, CI, this vault, the [[Pick List]] and [[Decisions]];
  the [[Toolkit]]; the [[World Map]], all nine continents drawn by the owner, and the [[World Editor]] on GitHub Pages.
- **[[Land]]**: relief, erosion and water from the painted coasts, sculpting, carved rivers, roads, towns and ports,
  the ground to the metre, dressed by [[Nature]], [[Flora]] and [[Procedural Textures]].
- **[[Water]]**: the shared swell, breakers, the stylised-realism sea, lakes and rivers; wading, swimming, diving.
- **[[Sprite Forge]]** as DFO had it, with its next work and dodge roll, its pictures on R2; the [[Test Ground]] plays
  a forge figure in first and third person ([[First Person]], [[Blood]]).
- **[[Movement]]** in the Rust `movement` crate, stepped in ticks of 1/60 s, agreeing to the bit everywhere.
- **The server**: rooms on Cloudflare Durable Objects, messages in FlatBuffers, prediction in the browser, other
  players shown whole; deployed ([[Server]], [[Servers on Cloudflare]], [[Messages Are FlatBuffers]]).
- **The world after Destiny 1**: a port city on each continent, Overlook, Sunspire and Rimeholt living and six in
  ruins, only Overlook's social space open; nodes walked a section at a time; the Overworld; the [[Game]] page from
  arriving in Overlook to landing at another node ([[Cities]], [[Reach]], [[Overworld]]).
- **Patrol areas and Saltmere's three zones**, laid out with RMB blocks, heights, ledges, caverns and handcrafted
  modules ([[Layouts]], [[Modules]]).
- **Overlook's hub** ([[Overlook Becomes a Hub of Courts and Ways, After the Tower]]): keepers in stalls, townsfolk.
- **The fight on foot**: Soulframe's guard, parry, riposte and dodge over DFO's blows, the player's swings chaining
  side cut, overhead and thrust; DFO's Enhanced AI with project-final's, in groups that lead, break and give ground,
  walking and running at three quarters of a player's pace; three healing charges; the aim, the crosshair and ranged
  weapons ([[Combat]], [[Foes]], [[Navmesh]], [[The Player's Swings Chain Side Cut, Overhead and Thrust]],
  [[Foes Walk and Run at Three Quarters of a Player's Pace]]). Resource nodes worked by holding E, each island's own
  ([[Material Nodes Stand Where They Are Dressed, Worked by Holding E]], [[Islands]]).
- **[[Enemies]]**: factions starting with the Grey Tithe, five ranks, two bosses, a garrison in every node but the
  social spaces, and the Enhanced Plus bars and plates.
- **[[Gear]]** after Destiny 1: levels, Attack and Defense, perks, Atheric exotics, elements and shields, the gear
  screens, inventory and vault; accounts on D1; the Roster with companies and emblems ([[Accounts]], [[Names]]).
- **[[Arts]]** with loadouts, statuses, loot drops, ammo and attack visuals ([[Weapon Glow]]); **[[Factions]]**: the
  three houses, faction gear in its colours, the keepers, Shape and Elder Maren Hale's welcome.
- **The sea**: [[Sailing]] from the helm, nine waters, hostile ships by water, friendly lanes between the three ports,
  the fights' ends, boarding and fleet rooms ([[Naval Combat]]); the Sloop, Schooner, Brig and Frigate ([[Hulls]]);
  a ship's level, modules, materials, officers and hands ([[Ship Power]], [[Crew]]).
- **[[Islands]]**: coves and guarded isles from a seed, dressed by [[Island Modules]] and [[Island Drawing]] with their
  climate's plants, landed on through a room of their own.
- **The [[Held Map]]**, at the helm and on foot anywhere on land; **[[Weather]] and day and night**, with the [[Sky]].
- **The [[Prologue]]**: the intro to Saltmere, the storm, creation, the sea fight, the wreck that opens by teaching the
  player, the deep and the shore, the Brig's crew regrouping ahead ([[The Crew Still Standing Regroup Ahead]]); the
  wreck built and published by its workflow.
- **[[Music]] and [[Ambience]]**: every sound the owner's Freesound pick but the four synthesised ones kept; recordings
  load as wanted, held once within 192 MB and kept in the browser's storage.
- **The [[Interface]] without HTML**, held by the `html` check; the game in a worker of its own ([[Game]]); the
  network packed and sent as changes; an error in a frame no longer stops the game's loop.
- **Keys and the pad**: every control rebound and kept with the account, the pad played as Destiny's, the key strip
  following the moment, K for every control, the pad's cursor and DFO's gauntlet as the pointer ([[Player]],
  [[Every Control Can Be Rebound, and the Pad Plays as Destiny's]]); a mark over each keeper and usable thing in place
  of the rings on the ground ([[What a Player Can Use Wears Its Mark Over It]]).
- **The houses' roads**: after the intro the player pledges to a house, whose road of eleven tasks gives its Art, its
  Tenets and three fragments, with six step kinds any mission can use: escort, tail, defend, puzzle, unseen and race
  ([[Each House Has Its Own Road to Its Art]], [[Missions Are Varied, Not Only Simple Tasks]], [[Quests]]).
- **Dungeons and the days after Destiny 1**: DFO's Dungeons 2.0 in the patrol areas, six styles each with its own
  Blender pieces ([[Dungeons]], [[Dungeon Modules]]); the clock, gates, the dungeon of the day, Elite and Abyss, the
  week's two, private runs and Find a Company, bounties and the Journal drawn by the game ([[Activities]]); the server
  the authority over where a player arrives, where a ship sets out and what a room opens
  ([[The Server Is the Authority Over Everything]]); the Postmaster's mailbox for what a player would lose
  ([[A Mail Vendor Keeps Lost Items and the Game's Mail]]); areas loaded in chunks and kept by the browser
  ([[Areas Load in Chunks With Proper Caching]]).
- **Vestiges as project-final's crystals**, every drop popping, bouncing, settling and hovering as its loot, and the
  item pictures baked in Blender (`tools/item-pictures/`), a first pass for the owner to judge
  ([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]], [[Item Pictures]]).
- **Arrivals, first person and the parry ring** (#144): every spawn and respawn builds the player's figure from the
  feet up, white as each cell lands, and blinks the arriving player's view open
  ([[Players Arrive as Destiny's Transmat Does, Unexplained]]); first person sees 65° tall, foes stand 1.5 m off its
  eye, its weapon sways; the parry ring stands round the attacker's head, kept on the screen, bold, its window a faint
  band edged by a gold line ([[First Person Widens and Its Weapon Sways, and the Parry Ring Reads Bolder]]). Open for
  the owner: aiming in first person sees 43° (1.6 times from 65°, was 32.5°), and the iron blow's small red mark.
  Impeccable's design hook is on in every session, at v4.10.0 ([[Toolkit]]).
- **The balance pass halfway back, loot in Destiny 1's order, and a whole-codebase audit** (#141, with the owner's
  yes): on land a player's blow ×1.5 and a foe's ×0.75; Vestiges by rank, Minor 2 in 100 to a Boss always, each
  colour half or less of the one below; items from Bosses, Minibosses and a dungeon's clear; clears that pay; Shapes
  from the week's Abyss Dungeon alone; eleven bugs the audit found, each with a test that fails without its fix
  ([[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]],
  [[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]]). Tested offline, the full
  check passing on `main` with it merged (117fa21e); not yet played by hand or in a deployed room.
- The world's lore and its first crystal faction, #77, merged with #124 on the owner's "Merge and deploy". The owner's
  decisions: Raum's lore adapted into one mystery ([[Raum's Lore Is Adapted Into One Mystery]]), shown and hardly told
  ([[The Game Shows the Mystery and Explains Almost None of It]]); an ageless world with quiet nods to DFO and
  Daggerfall; three ports left, the rest ruined; the Grey Tithe's tenth, which Overlook does not pay; and the Lattice,
  the ruined ports' people overtaken by the crystal ([[The Lattice Are the Ruined Ports' People, Overtaken]]). The six
  Lattice foes are drawn by the [[Sprite Forge]] through `tools/lattice/` ([[Lattice]]), each with its look and moves,
  after a detailed pass and a full audit of every frame, its code and these notes
  ([[The Lattice Is Drawn Whole Before It Comes Into the Game]], [[The Lattice as Claude Shapes It]]). Then each foe's
  flinch and stagger, and in place of deaths one wave of crystallized energy for all, the owner's pick
  (`tools/lattice/wave.py`). Tested offline: every move posed numerically (feet on the ground, blades, maul and anchor
  clear of the ground and the body) and rendered. Then the Lattice's props, made in Blender, as the owner asked: sixteen
  across the owner's four kinds, each on its own patch of corrupted ground, drawn as pictures in both crystals
  ([[The Lattice Has Props of Its Own, Made in Blender]], `tools/lattice/props.py`); tested offline, every one rendered
  in red and purple and looked at.
- **The public events**, #124 (with #77 beneath it), merged on the owner's "Merge and deploy": built in full on Claude's
  autonomy ([[Public Events Are Built in Full, on Claude's Autonomy]]) after the owner's decisions
  ([[Public Events Run on a Clock, After Destiny 1]]), the system in [[Public Events]] and every call of Claude's in
  [[Public Events as Claude Builds Them]]. On Saltmere's three zones, on a clock: the Fissure in each wilds, beside its
  battlefield's obelisk, and the Grey Tithe raid in each hamlet, each with its heroic task, a bonus, and a chest for
  each player who took part (XP, faction reputation, a Vestige, materials). The Lattice is in the rules (faction 3,
  types 39 to 44) beside the Grey Tithe's Tithe-Taker (type 45), and in the game: its five event foes rendered and
  published by `lattice.yml` and laid into main's forge tables (`content/forge/renders.json`), their moves and death
  wave drawn. Thirteen new modules made in Blender through the modules pipeline and published by `modules.yml`, four of
  them (the fissure, its scar, the growth and the shard) built from the Lattice's props' own shards, clusters, crusts
  and boulders; a crystal material and chalk, turf and canvas. The page's banner, marks, props, lights and sounds;
  offline play; dev-only `&public=`, `&speed=`, `&bots=`, `&heroic=0`. Paced by scripted players at Saltmere's levels; a
  first read-only audit, its findings each tested first and fixed. Then the owner's "comprehensive audit and deep detail
  pass": five read-only audits (the rules and server, the page, the assets and pipelines, the bible's truth, the
  design's detail), whose rules, page, assets and bible fixes are merged into #124. Then the owner's third ask, "Do one
  more comprehensive audit. Ensure this is perfect": six read-only audits (the rules, the page, the assets, the bible,
  regressions outside the events, the tests), every fix merged; the tests found and fixed two bugs (the next event's
  line said "in 1 min" for one starting that minute; the tithe-taker stuck on a navmesh corner). Then a picture pass on
  the real page, which stopped at its time limit; the owner chose to merge what it fixed (a carried shard seen on
  another player, one bonus wording, the banner's rows full width, the picture driver reaching the game in its worker)
  and leave the rest of the pictures for later (see "Next"). Tested offline: `cargo xtask check` passes at the head of
  #124, native and WebAssembly agreeing; the raid and the heroic Fissure pictured on the built page in part; not tested
  live. The `modules` workflow published the 13 event modules, and all their groups answer on R2, the sealed scar's
  rubble since its run on 3e1bf535. The events' banner, store bars and compass marks are drawn as nodes of the game's
  own interface.
- **The third codebase audit, the Grey Tithe in the pirates' place, travel by the held map and the overtaken ruins**
  (#155, merged on the owner's "I really want to merge the code fixes we did"): an audit of every module and an audit of
  it, each finding tested before its fix; then, built on it, [[Pirates Are Replaced by the Grey Tithe]] (clashes are a
  Tithe ship attacking a merchant of the traffic, which a player joins beside),
  [[The Ruined Cities' Waters Are the Lattice's, and Their Ruins Are Overtaken]] (the held map's Lattice waters, the six
  ruins grown through with crystal) and [[The Held Map Takes the Ship to Other Waters, Seen Sailing Away]]; Claude's
  calls in [[The Grey Tithe's Sea, Travel and the Overtaken Ruins as Claude Builds Them]]. Each feature reviewed on its
  own and its findings fixed; tested offline, the ruins pictured headless; the travel's cinematic not pictured.
- **The game is No Shores** (#157, merged on the owner's "Merge and deploy"; [[The Game Is Named No Shores]]): the
  title, the bible and the game's note with the owner's premise; Overlook stays the port city. The owner's logo is
  the title on the tap to start and the intro, a pixel picture written from the owner's PNG by `tools/logo/write.py`
  (the PNG stays out of git with its C2PA credentials; [[Cinema]]). The repository and page are `no-shores-source`;
  the browser's keys move once from `overlook.` to `noshores.` (`keptNames.ts`); No Shores is a reserved name. The
  Workers, the D1 database, the R2 bucket, the code's own names and the download cache keep Overlook's. This
  session's git proxy answers only at `github.com/Lattymoy/overlook-source`, which GitHub redirects: keep that remote.
  Merged as `c0db6fc7` and deployed (CI run 45068542964's second attempt, after the first was cancelled at its last
  step): the page live at `lattymoy.github.io/no-shores-source/` with the logo, the rooms and the accounts answering.
- **The picture driver reads the drawn interface** (#165, merged on the owner's "Yes"): `__ui()` lists what the
  game's interface shows, the driver's `waitFor`, `clickText` and `press` read it, and a plan's `"noGpu": true` runs
  the game at full speed with nothing drawn ([[Toolkit]], Browser QA). Tested offline: the title, the story's skip and
  its "begin" driven with no GPU. Proposed next, not yet asked for: a cloud environment whose setup script installs and
  builds, and a CI check that boots the game and finds its HUD.
- **The prologue reworked, horses in a Mount slot and the stranger's welcome to Overlook** (#172, merged on the owner's
  "Deploy whenever youre finished", which deploys the page and the rooms; carried over from `ccr-06efd4d0-ffd79v` with
  `main` merged in). Built on the owner's "take some autonomy" from
  [[The Prologue Is Reworked With Real Armour, a Bow, the Storm and No Elites]],
  [[Horses Are Items Worn in a Mount Slot]] and
  [[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]]; every call of Claude's in
  [[The Prologue, Horses and the Welcome to Overlook as Claude Builds Them]]. The wreck dresses the player in the
  story's steel as real gear, a parry window of 15 ticks everywhere, no Elite but Thule, the first boarder's bow and
  its lesson, the wisp that circles and engulfs the player and gives the Storm, the Storm's lesson, and the story's
  gear and Art taken at the prologue's end; horses are items worn in the Mount slot, the Appearance screen draws no
  horse, the Tack always sells the Bay; a new character starts with nothing, the stranger's tour of Overlook with its
  gift of 400 Aurem, the smiths' starter stock, and the opening quest round the vendors to the houses. Elder Maren
  Hale's welcome walk is gone, so #163's reload bug in it (no greeting, "Follow" before it, a walk left behind hiding
  the houses' roads) cannot happen: the tour holds the keys while she speaks, and a character still owed her gift
  after a reload is paid it on arriving in a social space (read in the code and its tests, not seen live). Five
  independent audits, every finding fixed with a test that failed first or written down. With `main` merged in, the
  room keeps the prologue's own armour's steel in what others see (`gear::looks`, as the page draws it, held by
  `modelsWorn.test.ts`), the smiths' stock is built in `standing_wire.rs`, and the wreck's re-export keeps its mast and
  rank 2 waves. Tested offline: `cargo xtask check` at 8bfe6951 (run with `NODE_USE_ENV_PROXY=1`, so the ship tests
  reach R2 through a cloud session's proxy); the wisp, the Mount tile and flyout, the Appearance screen and every stop
  of the tour pictured headless before the merge. Not seen: the 400 Aurem, the tracker and a starter piece bought,
  pictured live (see Next); the shore's plain clothes (its key beat does not advance headless; tested); anything on a
  real GPU or played by hand. Known and left: the tour's keepers read small behind their counters (each stall is
  framed whole); a rollback past this round loses a new character's welcome (Gear).
- **The website at noshores.online and the Discord bot** (#194, merged on the owner's "Yes";
  [[The Website Is at noshores.online, After DFO's]], [[DFO's Discord Bot Comes Over, Its Panel on the Website]],
  [[noshores.online Is Served From Cloudflare, and the Game Is Played There]], [[The Discord Bot Deploys on Each Merge]],
  [[The Panel's Sign-in Asks for a Person's Servers]], [[The Website's Words and the Bot's Month Are Approved]]).
  - The [[Website]]: Home, The World, The Game, the panel and a 404, telling a newcomer plainly what the game is, every
    line matched to a decision or to what is built (a read-only audit checked each claim against these notes); every
    picture drawn by code to DFO's detail, Overlook's court and a duel and a dungeon's gate among them; share cards; the
    Discord invite that never expires (`RdDURveYus`, tested live). Served by `site.yml` from Cloudflare: the site at
    `noshores.online`, the game under `/play/`, `www` redirected, hashed files cached a year. `noshores.online`'s
    nameservers are Cloudflare's (tested live).
  - The [[Discord Bot]] (`server/bot/`): the core and all 19 modules, deployed by `bot.yml` on each merge when its code
    changed, writing its slash commands to Discord; the panel's sign-in lists only the servers a person is in. Five
    read-only audits (the bot's core and security, its modules, the deploys, the notes and tests, the site) and a final
    review of the merged fixes: every finding fixed with a test that failed first, or recorded as a limit in its note;
    the two high ones were auto-mod's link allow-list bypassed by `?` or `#` in a host, and a temporary ban's expiry
    lifting a later ban made by hand.
  - The deploys: the accounts keep their own deploy record, so a failed accounts deploy is tried again; one tested
    script decides the rooms', the accounts' and the bot's deploys.
  Tested offline at the head: 638 server and site tests, lint, types, format and `cargo xtask repo`; both Workers'
  `wrangler deploy --dry-run`; the site served by `wrangler dev` (404, redirects, caching); `cargo xtask check` in CI
  on the PR's head. `server/outpostReload.test.ts`'s three tests misreported once in a full parallel run and passed
  alone and on the next run. Tested live after its deploy at dfb9217e: the four pages, the game at `/play/` (its
  canvas), `/world` sent to `/world/`, an unknown address answered 404 by the site's page, `www` sent to the bare
  domain with a 301, hashed files cached a year; the bot's `/health` answering from dfb9217e, and 24 slash commands
  written to the application (its log). That deploy's `www` check failed in CI only because it looked the new name up
  1.3 s after it was made and the runner kept the miss; `site.yml` now reaches `www` at the bare domain's address.
- **Not yet seen or heard.** Sessions test offline and picture headless. Headless Chromium has lost the game's WebGPU
  device about 2 s in when other jobs shared the cores; on an idle container at b81f0c40 the title and the social
  space kept it 80 s. SwiftShader is too slow to show the world, so these wait on a real GPU, an ear or a hand:
  - Timed on a real GPU: the game in and out of its worker, the hub with some 125 figures, the wreck with every fire,
    the light layer of the attack visuals (0.4 to 0.5 ms is an estimate), ships and marks under the lamps.
  - Heard in the game: the music, the ambience, the world's, sea's and menu's sounds and their levels, the
    prologue's music and voices, a sound from the worker's cues, the seams between a long recording's chunks.
  - Played by hand: the prologue in one run (and whether the wreck's foes show away from its fires at night), the
    playthroughs' changes, an hour's day, a ranged weapon's fight on foot.
  - Seen: the sea fight's burst ring; healing charges in a company; the new crosshair in a fight and the weapon rows;
    the held map on an island, or a fall while it is up; a sea fight in the deployed rooms; two players seeing each
    other's dyes, horses, faction gear and Veiled figure; Maren's whole walk; a blow on a shield; the walking blows
    frame by frame; the display beside the owner's two pictures (#68); a ware bought at the Quartermaster's, a
    Vestige opened at the Reader's; a faction set worn in the page; the water's order at a coast.
  - #155's, played by hand: the travel's cinematic from the helm to the arrival, the hover and the prompt on the pad;
    a clash of a Tithe ship and a merchant, joined; a ruin up close (its buildings' veins and sheets) and its wrecks
    from the sea at the sea's size.
  - Known and left: at a steep downward look the aiming camera can show the figure's diagonal back view; a crowd's
    dresses are composed ahead only as room comes, small objects are made each frame, and the Test Ground's panels
    run the room while the pointer is free (#68).

## Waiting on the owner

The decisions in [[Open Questions]] are not repeated here.

- **The passages and the regions** (#204, a draft on `ccr-9b9e80b0-5e314s-passages`), built on the owner's
  autonomy ("this is where I give you autonomy and make this your baby") and audited on "I want to do a comprehensive
  audit and detailed design pass on this entire arc": not merged until the owner's yes. Every call is in
  [[Passages as Claude Builds Them]]; how it works in [[Passages]]. Two for the owner to agree:
  - `passage` now uses `gear`, for the week's modifiers its currents keep clear of (`crates/xtask/src/checks/crates.rs`,
    [[Code Map]]): a widened check. Without it, the week's modifiers are passed into `Web::of` by its callers.
  - A passage foe's kill share (`lamps::KILL_SHARE`, 0.75) also scales the officer and boon XP that follow its kill;
    Bountiful's more Vestiges are not shared.
- **The Discord server, built by the bot** (#205, merged on the owner's "Deploy"), on the owner's "push the discord to
  its limit ... This is your baby" ([[The Discord Is Claude's to Build, Organised and Unbloated]]; every call in
  [[The Discord Server as Claude Builds It]]; how it works in [[Discord Bot]], "The server layout"). The bot's new
  Server layout module plans and builds the whole server from the panel: 8 roles, 6 categories and 16 channels with
  their permissions, topics and forum tags, the server's settings and icon, 16 modules set, the guide, the rules and
  the buttons posted, Founder for the owner, and a checklist in #staff of what only the owner can do. House roles
  follow each linked member's pledge (`gameHouses.ts`, the accounts' `pledges`); posting the tickets button again
  updates it in place; the server icon is drawn by the site's art (`server-icon`). The same PR carries the site's
  `www` check fix. Tested offline: the server and site tests, the layout's against a fake server (a first build, a
  second, hand changes, Discord's own new server, Community, a bot lacking permissions, the plan), the icon's round
  crop. Not tested live: no build has run on the real server. After the merge, the owner presses Build in the panel
  and follows the checklist; the bot's first invite lacks Manage Threads, Mute Members and the two thread permissions,
  so the checklist's first item is a fuller invite.
- **The Discord application's settings** ([[Discord Bot]], "One Discord application"): its interactions endpoint
  set to the bot's `/v1/discord/interactions` and its two redirects (unchecked whether done; the bot was invited).
  The words still Claude's: the auto-mod rules' prefix `No Shores: ` and "The bot" on the bot's own cases. The
  Porkbun key posted in an earlier chat should be rotated; it was never stored or used.
- **An extreme performance pass, quality unchanged** (#203, merged on the owner's "merge and deploy", which deploys
  the page and the rooms), on the owner's "do an extreme performance pass while not reducing quality". Measured first:
  the page headless with the new performance probe ([[Toolkit]]), the rooms natively. The page: each frame's culls and
  draw lists, the interface, figures' terms, marks and a ship's canvas laid into kept lists (the hub's and a patrol's
  garbage cut some 60 to 80%, a patrol's mean frame halved, headless with no GPU); the plants' list a slice a frame
  (its worst frame 52 to 14 ms in Node, [[Nature]]); textures' views and bind groups kept; shaders branching past work
  multiplied by zero, foam's lace only in quads that show it, the city drawn before the ground it covers ([[Game]]).
  The rooms: a place's navmesh baked a slice a tick, not in one tick of 130 to 390 ms (some 45 ticks, each 15 to 19 ms
  at most natively, [[Navmesh]]), the watershed and the ear-clip touching only what can change, and the land's course
  search passing far segments by, every mesh of the first landmass's 77 squares the same to the bit before and after;
  the rooms' load measurements running again. Tests that read a stand in the tick a player came near now wait for the
  mesh; the patrol site's agreement fingerprint is `4e39f0f0`, native and WebAssembly agreeing. Tested offline: `cargo
  xtask check` on e3ea41eb, with main merged in; the sea's foam pictured headless. Not timed on a real GPU, nor the
  rooms' slices in WebAssembly; not played.
- **The inspect panel after Destiny 1's weapon page** (#202, merged on the owner's "merge and deploy", which deploys
  the page and the rooms). Built on the owner's "take some autonomy" from
  [[The Inspect Panel Follows Destiny's Weapon Page, Its Stats Shown and Its Nodes Square]]; Claude's calls in
  [[The Inspect Panel as Claude Shapes It]]. Fight numbers from the room's own rules (`room::stats` through the room's
  WebAssembly) as Destiny's stat bars on every item's page and card, a node hovered previewing its change in green and
  red, a node's card with its costs as have over need, square nodes and a square growth band, the art large, Compare
  (its press or C) and every card set beside the piece worn, Inspect beside the player's own ([[Interface]], [[Gear]],
  "Stats"). Five read-only audits (the rules, the page, the design, the bible, the tests) and each finding tested
  before its fix: the fire rate a tick fast per reload, Impact without a player's ×1.5, a finish's drawn trims unseen,
  a module's card set against the worn sword, locked nodes' cards never reachable, italic breaking the face's letters,
  among them. The owner's next asks are in too: hints as plain verbs ("Hold, Buy", "Click, Choose", and a held
  consumable's "Hold, Use"), no "frees a hand" line, Impact named Damage
  ([[The Inspect Panel's Hints Are Plain Verbs, and Impact Is Damage]]); a Fruit of Dagon no longer fed from an item's
  page but held from the inventory's Consumables, growing every piece worn 5,000 XP each, the owner's two answers
  ([[A Fruit of Dagon Is Used From the Inventory and Grows Everything Worn]]; the wire's Feed ask now carries no item).
  Main (#196, the chests; then #194, the website) merged in. Then the owner's two answers
  ([[A Hover Card's Perks Are Their Icon and a Short Line, and Plain Text's Growth Is a Square]]): [[Plain Text]]'s
  example is the square now, and a hover card's perk is its icon and a short line, Claude's line for each of the 139
  perks (`short`, and `short_takes` for a cost, in `content/gear/traits.json`) waiting on the owner's check. Tested
  offline: the full `cargo xtask check` on f0240671 (the short lines, before #194 merged in), and CI on the PR's head;
  pictures rendered headless at 1280 by 720, 1600 by 900 and 1920 by 1080; not played by hand or on a real GPU.
- **The bounty board after the Bounty Tracker, and faction bounties** (#196, merged), on the
  owner's "take autonomy and focus on overhauling the bounty menu and bounty design" with Destiny 1's Bounty Tracker
  ([[Standard and Faction Bounties Each Wear One Design, on a Board After the Bounty Tracker]]; every call in
  [[The Bounty Board as Claude Shapes It]]). Each faction posts three of its own four bounties a day, taken only by
  those pledged to it, counting only with its cape worn, paying XP and its reputation (2,500, 3,750, 5,000 by tier),
  kept in the day's record under keys of their own so a rollback of the rooms keeps them; the wire carries each
  bounty's place and faction, so the merge deploys the page and the rooms together. The board is laid as a keeper's
  screen, the board drawn where a keeper stands; every town bounty wears one writ, every faction's its emblem, 52 px
  tiles (were 80), the card floating beside the tile pointed at, the refresh under the tiles; the Journal's column
  takes the same. Then, on the owner's "Do a comprehensive audit on this", main (#179's guilds, #191) merged in and
  five read-only audits, every finding measured first and fixed (the PR lists them). Tested offline: the full check
  on the PR's head (the commit named there), the rules', wire's, room's and page's tests, pictures through the real
  renderer at five sizes. Not yet: the board in the live game (the picture driver reaches no local room and the
  offline page keeps no gear), a real GPU, a hand. Known: no card shows by touch, as none in the menu does. For the
  owner ([[Open Questions]]): the faction bounties' design, one icon for every faction's bounties or each faction's
  emblem as built, and whether a card gains a line of tale.
- **The island view in rain, the Playlist over the island and the ships at a roadstead** (#191, merged on the owner's
  "Deploy", which deploys the page and the rooms). The owner's three reports:
  - "When its cloudy and raining. The overworld pan over the island is shrouded and you can only see the nodes": the
    weather's fog was charged along the whole line of sight, kilometres from the island view. It now lies under the
    cloud deck's base: an eye under it (on foot, at the helm) is hazed as before; one risen to twice the base only
    along the part under it ([[Sky]], "Seen from over the deck"; Claude's call in
    [[Weather and Day as Claude Shapes It]]). Pictured headless under a told heavy rain: before, solid grey with only
    the nodes; after, the island seen through the rain.
  - "The Playlist node should be in the overworld view of the island itself, not only at sea": recorded as
    [[The Playlist Shows Over Its Island, Not Only at Sea]]. It shows over a port's island docking or ashore, beside
    its city's mark (from that height it fell on it), held at the picture's edge when far off. Pictured docking at
    Overlook.
  - "When leaving the social space, ships are seen overlapping and bunched up in one area": every course's ships lay
    on the roadstead's one point (two or more hulls together a third of the time at Overlook, measured). Each course
    now has berths of its own off each roadstead ([[World Map]], "Berths"); a day at each port holds no lying ship
    within 150 m of another. The scripted Tithe clash's course was re-aimed and its fingerprint pinned anew (Rust and
    `server/roomDoor.test.ts`). A rooms change: its merge deploys the rooms.
  - Found and left, for the owner: on docking, the city's mark (and now the Playlist beside it) is framed at the
    picture's foot, under the sea's bar, which stays up over the island view; the frame could keep the nodes above the
    bar. A picture plan cannot set the weather (observation 201): a dev hook lending the sky would fix it.

- **Guilds** (#179), merged on the owner's "Merge and deploy when ready", which deploys the page and the rooms and
  applies five migrations. The owner asked for guild names and banners with the tag on nameplates and in the social
  menu, descriptions, bounties and levelling, and outposts on any island for a cost whose structures give guild buffs,
  passive income, guild dungeons, guild bosses and housing decoration
  ([[Guilds Gain Banners, Levels, Bounties and Outposts]]). All of it is built ([[Guilds]], [[Outposts]],
  [[Guilds and Outposts as Claude Shapes Them]]): the banner and its editor, the Guild tab after Destiny 2's clan
  screen, levels, weekly contribution and bounties, the treasury, an outpost site on each island with its own room for
  each guild, thirty-eight structure models in three tiers, the strongbox and stores, the boons, decoration placed in
  the world, the War Horn's guild boss and the guild dungeon behind the Delve Gate. Three deep audits ran; every real
  finding is fixed with a test or pictures. The third found a give-back lost when a reload or a sailing off came before
  the accounts' answer (the errand now rides in the character's save under its id, settled once by whichever room next
  holds it), a deposit that could be done twice, idle plot reads eating the errands' limit, guests sent out when their
  member stepped away, and the plan drawn over the menu when scrolled. Tested offline, not live; the PR names the commit
  its last full check covered. Waiting on the owner: playing it; marking the DFO Pick rows for heraldry and for halls,
  works and decor approved (`proposed` now). Known limits: the players on an abandoned outpost stand on bare ground
  until they leave; an errand the accounts never answer at a claim holds that player's outpost asks until a later claim
  answers it; the accounts keep every errand's answer for good, one row an errand; the guild boss is lost if everyone
  leaves its room before it falls; a member can push older ledger lines out with many small deposits, each line naming
  who moved it; the banner cloth takes no sky light, so it reads pale at night.
- **Every objective has a waypoint on the compass, on land and at sea**, for the owner's yes to merge, on the owner's
  "for any and all objectives we need to utilize waypoints utilizing our compass with land and sea, I dont want players
  to feel lost" and their four answers ([[Every Objective Has a Waypoint on the Compass, on Land and at Sea]]; Claude's
  calls in [[Waypoints as Claude Builds Them]]). A playtester on "Tail a collector" did not know what to do: the step
  works (its walk on the baked Saltgrass Downs is tested) but its mark stood only inside Saltgrass Downs and its words
  name no place. Now the page points step by step (`client/src/game/quests/waypoint.ts`): in the goal's zone at the
  goal, in a gating patrol at the gate, elsewhere on land and at sea at the landing of the zone it is landed at, with
  "Hold M to return to your ship" or "Sail to" under the step; a goal with no zone of its own at the nearest place to
  do it; one done anywhere says so. The distance stands under the compass's diamond, and the tracker shows the quest
  at sea. No rules change. Tested offline; not seen in the game or played.
- **A foe's plain swing at seven eighths of its time**, for the owner's yes to merge, on the owner's "We recently
  adjusted parry timing and actually made it harder where I wanted to make it slighty easier"
  ([[A Foe's Plain Swing Takes Seven Eighths of Its Time]]). The longer parry window (15 ticks) forgave only an early
  press; the swings made a quarter faster had sped foes' swings too, so a foe's sword blow landed 0.3 s after its
  swing began. Now 0.35 s (21 ticks, `FOE_SWING_PACE`); a player's and their companions' swings as they were, and the
  foes' plan of when a blow lands follows (`Fighter::swing_ticks`). The scripted runs moved both ways: the rules' pair
  holds the heroic raid again, the dev page's bots now lose the plain raid's stores in its third wave, and the road's
  test player, facing north while foes struck from its sides, fell before a kill (it now turns to the nearest foe).
  A lone player is felled about as fast as before (`measure_blows`). Tested offline; not played.
- **What a body meets keeps to what is drawn, and the owner's meadow** (#186, merged on the owner's "Merge and deploy
  when ready", which deploys the page and the rooms). The owner: "In patrol zones there are invisible bounds of
  some props that can be climbed" and "Implement the handcrafted grass texture we have from DFO"
  ([[What a Body Meets Keeps to What Is Drawn]], [[The Owner's Handcrafted Meadow Grows Over the Grass]], Claude's calls
  in each).
  - The bounds: a layout's prop was the box round its turned footprint to its highest point (a beached boat at a
    slant a block twice its size as tall as its mast), a turned or tilted solid the box round its turned corners (a
    25 m rail at a slant 11 by 23 m). Now no box stands more than 0.45 m off what is drawn, nor leaves more of it out
    (`city::hug`, used by cities and layouts alike): props are the parts their forged mesh fills in 0.25 m columns
    (`content/forged/parts.json`, written by `node tools/forgedParts.mjs`, held to the mesh by a test), a turned
    prop's strips within 0.2 m of them; solids are cut to the faces the page draws (a round's polygon, a dome's
    rings), turned pieces in strips, tilted ones halved however far they turn ([[Layouts]], "Boxes";
    [[Forged Models]], "Parts"). What a solid or a turned prop may cost is held (64 boxes a 2 m cell, a box a square metre,
    at least 256, a prop twice its loosest strips; looser a quarter at a time past that): 99.3 % of solids and 97 %
    of laid props keep that close. Against the merge base on one machine: 1,433,893 boxes over every landmass where
    271,789 were, the rooms' files 50 MB where 16.4 MB were, a tick 8.0 µs where 3.4 µs. A puzzle's point now stands
    on ground a walk reaches from its place. The node runs' fingerprint moved with the boxes, native and WebAssembly
    agreeing on the new one.
  - A deep audit on the owner's "Do a deep audit on this" (five read-only audits by part) found and fixed: a mill's
    sails rolled past a half-turn boxed 37 m off (a tilt's reach is now its chord); halving that stopped short of its
    keep reported as fitting; rounds kept to a smooth shape where the page draws polygons and rings; large props'
    0.5 m columns standing 0.7 m off their mesh; turned props' strips adding a full 0.45 m; a test that passed
    without a raised place; the meadow on the layouts' paths and through thin walls, drawing grassless cells, its
    card light law dimming all light where DFO's dims the sun's; and notes that said more than the code does. The
    full check then caught the movement grid missing a block stacked out over a wall's face (fixed in `wall_top`),
    and the boxes mended a known failure: the Lion Grasslands' Test Ledge's door is no longer walked round.
  - The meadow ([[Meadow]], [[Pick - Meadow Grass]]): the owner's five sprites written from DFO's PNGs by
    `tools/meadow/write.py` (pixel for pixel DFO's bake), DFO's atlas, chain, pick, sizes and colour law, 16 m cells
    of 576 tufts drawn by the GPU to 160 m over the grass of every grass biome.
  - The owner's answers
    ([[The Meadow Art Is the Owner's, Its Tables Stay in Git, and the Grass Takes the Trees' Rain]]): the sprites
    are the owner's own; `parts.json` and `meadowArt.ts` stay in git by exception; the boxes' budget stands; and the
    meadow takes the trees' rain fix (#185: no sky's glare in rain, the plants' slower `SWAY`), sharing the plants'
    light in `natureShader.ts`. Still the owner's: whether the plants' baked grass stays under the meadow, and whether
    Graphics gains a grass setting.
  - Tested offline: the full check on the head (the commit named in the pull request), `main` merged in; the meadow pictured headless through the real
    renderer in the Saltgrass Downs. Not seen on a real GPU or played: the meadow's cost there is unmeasured (some
    180,000 tufts on open grass), and so is the boxing's in WebAssembly.

- **Patrol chests, the same chests in every dungeon, and searchable containers** (#192, merged on the owner's "Merge
  and deploy", which deploys the page and the rooms). The owner's ask ([[Patrols and Dungeons Hold Chests, and Their Containers May Be Searched]]), built on "Take
  autonomy", every call in [[Chests and Searchable Containers as Claude Builds Them]] after Destiny 1's loot chests. A
  patrol's layout marks 12 to 24 chest places tucked against something tall (`layout::chests`); its room stands one
  chest for every five, two to four, each moving to another place every 5 minutes, staggered; every dungeon (a
  patrol's, an Elite Dungeon's at every tier, the playlists', a sea island's) stands one a block against a room's
  wall, drawn again as its garrison stands again; one container in six (a dungeon's one in four) is searchable, 16
  at most, none a body cannot stand beside. E held 1 s opens a chest, 1.5 s searches; each player opens each once,
  kept for their account. A chest pays 30 Aurem at level 5, 2 to 4 of the island's resource and a Vestige one time in
  four; a search 8 Aurem, the resource one time in two and a Vestige one time in twenty; no XP. Then the owner's
  second word ([[Every Chest Is DFO's Chest, and Its Vestige Pours Out as project-final's Cache Pours]]): every chest
  (the finds, the cache, the events' plain and heroic) is the owner's chest from DFO, its 50 points ported and built
  in code (`models/chest.ts`, [[Pick - Chest]]), the Blender event chests gone; a chest's Vestige (a find's, the
  cache's, an event chest its player opens) is poured out of it as its lid opens, as project-final's cache pours; Aurem
  and materials still go straight to the player, and a search pours nothing. A patrol's chest looks the way its place
  faces, and a page playing alone draws the drops lying for the player. The page draws a mark over each chest and searchable container, the feed's
  "Chest" or "Searched the wardrobe", and plays alone as online. A read-only audit's
  findings were each tested first and fixed. Tested offline: `cargo xtask check` on its head (the commit named in the
  pull request); in the running game headless with no GPU, a chest opened (21 Aurem, 4 Brineglass) and a crate
  searched (5 Aurem, 1 Brineglass) by holding E; pictured through the renderer (sent to the owner with the session's
  report, not in git). Not yet: played by hand, a real GPU, a deployed room, the feed's lines in a live room. For the
  owner: the bake may now read the dungeon crate's families (`crates.rs`'s list for `bake` gains `dungeon`); the
  chest's source in DFO is named `Low_Poly_Chest_Mimic.fbx`, recorded there as the owner's supplied model; and the
  `modules` workflow bakes on this branch with the four Blender chests taken out of the manifest by hand.
- **Revives, respawns near the fall or at a checkpoint, and logging back in where the player left** (#184, a draft for
  the owner's yes). The owner's three asks ([[Fallen Players Are Revived as in Destiny]],
  [[Activities Keep Checkpoints, and Patrol Zones Respawn the Player Near Where They Fell]],
  [[A Player Logs Back In Where They Left the Overworld or a Social Space]]), built on "take autonomy", every call in
  [[Revives, Respawns and Relogs as Claude Shapes Them]] with the Destiny research behind it ([[Revives]], [[Accounts]],
  "Where a player logs back in"). A fallen player lies until an ally holds Use 2 s beside them or they press Respawn
  after 4 s; a respawn stands them at the activity's checkpoint, near the fall in a patrol zone (43 m at most on
  Saltmere's three zones, where the landing stood up to 1.5 km off), else at a spawn; the Court's cells while its Boss
  stands and an Abyss run with no revive left are darkness zones; a company all down while the Court's Boss stands falls
  back to its checkpoint. Only a dungeon run holds the ground its bands' falls won. The character keeps its last sea or
  social-space place, `/v1/me` says it, and the page resumes there after the title, the social room standing the player
  where they left only on that `?relog=1` join (offline from the browser, the spot across but not its height). Tested
  offline: the full check at the PR's head (the commit named there), the rules' tests on Saltmere's real zones, the
  agreement runs natively and in WebAssembly. Not yet: played by hand, two players reviving in a deployed room, a real
  GPU. For the owner: [[Open Questions]], "Revives, respawns and relogs".
- **The playtest's seven notes** (#185, #187, #188), merged on the owner's "Merge and deploy when ready", which
  deploys the page and the rooms. The owner's notes, and answers where asked, are in three decisions, Claude's calls
  in their tables: [[The Harbourmaster Stands in the Market, Rain Spares the Trees, and Patrol Nodes Always Stand]]
  (the Harbourmaster's stall in the Beacon Walk market and the harbour way sealed at its head; rain spares the trees'
  crowns and the far woods, fewer and finer puddles, a slower sway; every patrol node standing, one gathered spent for
  its gatherer alone for 9 minutes of wall-clock time),
  [[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]] (other
  players' marks over their ships, no fog on the sea map, the stranger's Bay, a rider's jump boosting the horse 1.5x
  for 4 s with 12 s to recharge, the burst's spray and every rider's boost dust, 14 horse cues) and
  [[The Lattice Is Shaded Darker, With Detailed Attacks and Projectile Tracers]] (the Lattice darker with only its
  crystal's points glowing, its blows drawn through tell, strike and landing, its shots as crystal tracers). Eight
  read-only reviewers audited the three before they merged, each finding fixed (the pull requests list them). Tested
  offline: the full check on each head; pictured headless only the rain, the sea's marks and map, and the Lattice's
  layers. Not yet: played by hand, a real GPU, a deployed room. For the owner:
  - **The invisible public event**: its likely cause, found in the code and not seen live, is fixed in #188. The page
    fetched all 512 module meshes at once from R2's rate-limited `r2.dev` address, never asked again for one that
    failed, and drew no module missing a mesh; the event's 42 are the burst's last. Now fetches are retried and 8 go
    at a time. If it is seen again, the browser's console (F12) names the meshes that could not be drawn.
  - Whether Haste and the horse's boost should stack (they do).
  - **The horse cues' candidates** come from the `freesound` workflow on #187's branch, but this session's network
    refused GitHub's artifact store (`productionresultssa14.blob.core.windows.net`), so the Overlook Sound Sheet does
    not list them yet. A session that can reach that host adds them to the sheet; until the owner picks, the horse is
    silent.
  - Left as the pull requests say: a ship behind an island still wears its mark, the hub's buildings never draw
    headless (no picture of the stall or the gate), a Grey Tithe figure's telegraphed blow snaps to idle after its
    tell, a city built before its module meshes come draws none of them.
- **The key strip, the leave held and Settings in tabs** (#181), merged on the owner's "Merge and deploy", which
  deploys the page (the rooms' code is untouched). The owner's three asks
  ([[The Key Strip Is a Compact Panel, a Held Key Leaves, and Settings Has Tabs]], Claude's calls listed there): the
  key strip a compact panel at the bottom right under the moment's name, its words at 11 px, fitting under the
  Acquired feed and the tracker; the M menu gone, M or the pad's View held 1.5 s on foot returning the player to their
  ship, Escape opening Settings; Settings in tabs down a rail (Graphics, Audio, Controls, Account; stacked on a phone),
  Exit to Menu and Exit to Desktop held at its foot, the sound credits behind a press, Controls binding as the sheet K
  opens does ([[Interface]], "The key strip", "The leave held", "Settings"). Before the deploy, on the owner's "Please
  do an audit on this before we deploy", four read-only audits (input and flow, Settings, the strip's layout, tests and
  the notes), each finding checked against the code and fixed, the code's with a test that fails without its fix.
  Tested offline: the full check on its head with `main` merged in (the commit named in the pull request), driven
  headless in the real game (`noGpu`: Escape, every tab, the credits, a short and a full hold of M to the sea) and
  pictured through the real renderer. Not yet: a real GPU, a hand, a real pad's View held, and Exit to Desktop in a
  desktop app (there is none yet). Unchecked in a browser: whether the Escape that frees a locked mouse also reaches
  the game. For the owner: whether Graphics gains settings of its own (it holds the resolution alone, none invented),
  and whether the strip's 11 px reads well enough on the owner's own screen.
- **The fourth whole-codebase audit** (#180), merged on the owner's "Merge and depkoy", which deploys the page and the
  rooms: twelve read-only auditors by area and a reviewer of the diff, each finding read against the code first and each
  fix but two with a test that failed before it. High: the dungeon entrances bound no sky groups, so every frame on a
  node with entrances failed WebGPU validation once #155 fixed the stride before it (maybe the owner's "world stopped
  being drawn" in #163; unchecked). Medium: a hull pushed apart in a fight could be pressed onto a continent and stuck
  there; the protocol's version missed the files that set a fighter's body, statuses and trim; the controls sheet's
  repeated Use rows kept Tab and the pad from its sea fight rows and Reset; a failed wreck download stayed failed though
  later beats fetched it; a failed return to the ship from a dungeon left it undrawn; `content/forged` joins
  `ROOMS_CODE` (a deploy change, its own commit); the install no longer traces the SkillsMP key (a security change, its
  own commit). Low: an unkept repair mended the kept ship, the pad's B on an entrance's card, the Ammo crate with no
  Ranged weapon, a horse's "Level 1", the deep's heartbeat. What it found and left is in its description, among them for
  the owner: a dungeon block split into 3 rooms where 4 fit (a fix changes every seed), the week's `--sea` run entered
  from anywhere at sea, the starter stock's weapons rolling no element. Tested offline: `cargo xtask check` at its head;
  nothing played.
- **The writing pass** (#176), merged: every spoken line read and most reworded, all 33 lore chapters, the new tutorial
  with them, each speaker in a voice of their own within [[Dialogue]], and the lore given more detail and mysteries
  shown and never explained ([[Every Line Reads as Spoken, and the Lore Is Detailed, Mysterious and Gripping]], every
  call listed there). Ids, scene names, each scene's speakers in order and the puzzles' orders are kept, so the game
  behaves as before. The dialogue check holds two lines a turn across a quest's seams
  ([[The Dialogue Check Holds Two Lines a Turn Across a Quest's Seams]]). Its merge deployed the rooms too: `lore.json`,
  `quests.json`, `items.json` and `factions.json` feed the protocol's version. Tested offline: the full check on the
  head. Not yet read or heard in the game. For the owner: the Pearl Tomb's brief (`briefs.json`, never shown) has dunes
  where the lore has cliffs; the books name Corran Hale, the brothers Penhallow and the wreckers' wars, which no note of
  the owner's names.
- **A ship's wake follows the track it sailed** (#177), merged, which deployed the page. The owner: "the waves that
  follow behind the ship dont animate when you turn your ship. They are always straight". The water drew every wake
  straight aft of the heading the ship had that frame; it now keeps where each ship's stern has been and lays the arms
  and the wash along it ([[Water]], "Its wake"; the numbers in [[The Sea as Claude Shapes It]]). Tested offline
  (`wakes.test.ts`: a turn's wash where it sailed, no wake ahead of the bow after a stop or going astern, a ship drawn
  5x in a hard turn, the wake's box holding all of it); a read-only review's five findings fixed with those tests. Not
  seen on a real GPU: how the curved wake looks, and the shader's cost while a ship turns (unmeasured; a straight course
  takes the old path).
- **The wreck's R2 tools after #172**, which no session may edit: `tools/wreck/wreck_level.py`'s waves still list the
  Tithe-Mates and Bosuns at rank 1; to match `content/prologue/wreck.json` each `(11, 1, ...)` becomes `(11, 2, ...)`
  and each `(10, 1, ...)` `(10, 2, ...)`, and `export_wreck.py` should write the quiet deck's `masts` (added to
  wreck.json by hand), or the next export drops them. A horse's card names no content it came from, as a ship's
  module's does not (Claude's call in the merge, the owner's to change).
- **The ship aim under the crosshair, and the ship steady in it** (#168), merged with the owner's yes ("Deploy 168 when
  ready"), which deployed the page and the rooms. The owner: "The aim UI needs to be center on the camera and its
  currently offset. Ship geometry in the aim jitters" ([[Aiming a Ship Looks Square Off Its Side, Clear of Its Rig]],
  its calls). Measured offline on the rules' own swell (`seaAim.test.ts`, and a probe driving `SeaCombat` on the wasm
  rules): the volley's fall stood 90 to 100 px past the crosshair on a 1080-line screen, as the rules laid for a sea at
  rest at the ship's heave; it now stands within about 4 px settled, the rules laying where the look's ray meets the
  swell (`on_water`), the view held at the guns' real nearest (`laidNearest`) and turned over the fall (`laidAlong`).
  The eye stood 0 to 13 cm off its place on the drawn ship from frame to frame when answers came unevenly, placed from
  the answer before the one the ship was drawn from; it now stands on it. Not yet seen on a real GPU: how the aim feels
  and looks in the game. Left: answers that come unevenly still move the ship and the eye together in uneven steps
  against the sea.
- **The owner's bugs from two rounds of play** (#163), merged, which deploys the page and the rooms. Each fix was audited read-only, and every finding fixed with a test
  that fails without it. Elder Maren Hale's welcome was left to the session reworking it (#172, where her walk is
  gone):
  - A pad seam blends toward a level at most a step off ([[Cities]]), so the floor beside the plaza's parapets no
    longer dips and carries a body over them, and no ledge runs along a ramp's side.
  - [[Each Patrol Zone Has a Built Landing Site, Its Guards Beyond It]]: no foe starts a fight with a player within
    15 m of a patrol zone's spawn until they strike from there; a fight brought in goes on; the guards stand where
    they stood, 25 m or more off (`crates/room/src/landing.rs`, [[Enemies]]).
  - [[Friendly Ships Take Several Courses, About Five in View, Sailing Visibly]]: three courses a pair, about five
    in view near a port, 60 m/s, departures staggered across all nine courses ([[World Map]], "Traffic").
  - Tested offline only. Left: ships start and stop at 60 m/s at once (they no longer lie on one point at a
    roadstead: each course has berths of its own, below); some retaining walls near Overlook's plaza may be dropped
    whole (low confidence, the seam audit's).
- **#163's follow-up, the patrol audit and its leftovers** (#170, a draft for the owner's yes once its checks pass;
  main merged in up to #177). The owner's solid red patrol screen was the death veils piling up under a frame that
  threw before it presented; each frame now starts with none. What threw is still unknown: the owner's browser
  console names it (`FrameGuard` logs each error once). The owner's "Can you do a deep audit on patrols and ensure its
  clean" found and fixed the landing's leave lost to inert, fallen or stale foes, every foe told every swing, the
  section's dead still a target, the tithe-taker and the growth killed by foes, a second event chest and entrances on
  boxes. Then "Fix everything": each call put to the owner and fixed as answered
  ([[The Patrol Audit's Leftovers Are Fixed as the Owner Chose]], with Claude's calls): the landing's officers left be
  and only chases started there going on; blows at others passing a spared player by; a half-fallen patrol group made
  whole as Destiny does; foes standing at the caverns' and runs' sites (`stands.rs`, lazily within 150 m and none
  within 40 m); an escort's ambush dropping nothing again; the server checking a dungeon's way out; a locked patrol
  refused alone. Every recorded risk is fixed, the layouts' by a worker (every walked line inside its section, the
  rock beside ramparts out, caverns on quarters, building runs ramped short of their place's middle). Each moved pin
  is attributed in its commit; the page's bots now lose the raid's stores at its pinned minute, which a 12-minute
  sweep puts down to that one minute. Tested offline; the full check's result is in #170. Left for the owner: whether
  sections may overlap (4.2 m, highwater-fells and
  wreckwood); none of Saltmere's landings has a boardwalk, why unchecked. Risks: a site's first stand bakes its
  navmesh a slice a tick (15 to 19 ms at most natively, #203); room memory with every site stood unmeasured; a
  cavern over 4 m below the surface unchecked for followers' places; the page's bots fail about 10 of 12 heroic raids
  either way.
- **Looks by content, the Playlist and the matchmade dungeons' encounters** (#160), merged with the owner's yes ("Let's merge and deploy and talk about this
  after"), which deploys the page and the rooms. The owner's asks are recorded ([[Armour and Weapon Looks Belong to the Content That Gives Them]],
  [[Elite and Abyss Dungeons Are Queued From a Playlist Beside Each Port]],
  [[Matchmade Dungeons Gain Encounters, Puzzles, Climbs and Raid Mechanics]],
  [[A Playlist's Launch Is Drawn by the Server]], [[The Room Keeps Only Looks of a Piece's Own Content]],
  [[Faction Blades Wear Their Faction's Colour on Hilt and Trim]]), every call of Claude's in [[The Playlist and Its Dungeons as Claude Shapes Them]].
  - Looks ([[Gear]], "Where it came from" and "Looks"): every item and Vestige keeps its content; each armour set and
    metal is one content's; past the world a piece's set and metal follow its name, so each content's every look is
    seen where it drops; "From" on the card, the page and a Vestige's line, a faction's piece naming its faction; the
    room keeps only looks of a worn piece's own content (`gear::looks`, `content/gear/drawn.json`).
  - The Playlist ([[Activities]], [[Accounts]], [[Interface]]): crests on a chart and one card, after the owner's
    Vanguard reference, pictured clean at six sizes; Find a Company over one pool, Launch drawn by the server; runs
    started from it (a playlist's, and the week's marked `--sea`) entered from the sea and left back to it; the finder
    refuses a seeker before the prologue or under the week's level, and silent sockets never fill it.
  - Encounters ([[Dungeons]], "Encounters"): two or three seals a run (the Litany, the Weighing, the Ascent's real
    climb in nine of the 18, the Holdfast), the Court's wards, anchors, slam and Reckoning, Fury from the end room;
    living players counted, encounter foes dropping nothing, compass marks, the Boss scaled to the company; the Court's
    display kept clear at every size, a centre call for the slam ("Get clear!") and the Reckoning ("Into the light!"),
    foul water's green edge, beams fading beside the camera; each moment pictured in three dungeons
    (`tools/claude-toolkit/encounter-plan.ts`).
  - Tested offline: `cargo xtask check` on each pushed head (c2361953 last, with main merged in at 1cd6a379); three
    rounds of read-only audits (rules, page, design, bible, looks, and two mutation audits of the tests), every finding
    fixed with a test or recorded. Not yet: played by hand, or in a deployed room.
  - The Abyss Dungeons' crossbow art waits ("Not now"). The faction blades, the named-piece gaps and the Veiled's
    colour were settled by the owner in #169 (below).
- **The whole-codebase audit** (#167), merged with the owner's yes ("Merge and deploy"), which deploys the page and
  the rooms: twelve read-only auditors by area and a reviewer of the diff, every
  finding checked against the code first and each bug fixed with a test that fails without it. Among the fixes: quest
  steps keep within a public event's kept places; the raid's stores read 100% only while every store is whole and 0
  only once every store fell; silenced music stops; cues sharing a recording are each heard the first time; Return to
  ship waits for the room while it joins again; a company's fall heard behind the veil is taken on foot; the land's map
  is put away at sea; the wheel scrolls in the interface's pixels; flora that failed to come is asked for again; the
  island door, `identify`'s number, the bake's panics, the chat hall's sizes, mottos' hidden marks and the World
  Editor's keys; dead code and some 25 stale docs out; the Code Map, Toolchain, Testing and other notes made true.
  Tested offline (the full check at its head, `main` merged in); not played. What it left went to four pull requests,
  all merged:
  - #171: the `modules` workflow uploads the folder its bake fills, and `r2.py upload` refuses a missing one. Tested
    live on its push: the publish ended "491 staged files on R2" (it had said 0).
  - #173: a room holds eight sockets unsigned from one address at most (`UNSIGNED_FROM_ONE`); every room, not only
    the sea, which the owner may narrow. The roster's and a player's reads still have no rate limit.
  - #174: the vault check wants a `code:` symbol defined in its file, not only named; the html check refuses
    `insertNode`, `importNode` and `new Text(`, and excuses `.append(` only on a name given nothing but `new`.
  - #175: the owner's answers,
    [[Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach]]: only the garrison's
    own kills share its clear; a failed trip from a beach, played alone, goes back to it; Branches and Merging says
    merge, not rebase and squash, and the `built` notes are `live` (Claude's calls).
- **#169, the owner's gear calls, built whole**, a draft. The owner: "I dont want to merge until everything is
  finished. Focus on getting this to 100% and stop depending on me"
  ([[Claude Finishes the Gear Calls on Its Own Word]]). Every call is built; what is left is the owner's yes to merge
  and one forge run (below). Tested offline with `cargo xtask check` on each pushed head, green but for the four R2 ship-mesh tests this container cannot
  fetch; CI green on each head it finished.
  - The owner's calls, in their words ([[Everything Carries a Set Name, and Perks Roll by Pool]] and the decisions it
    links), and every perk in the game approved ("All approved": [[Every Perk Stands, the Factions' Nine With Them]];
    the review page the owner marked: https://claude.ai/artifact/Jtfdq4zJyoUsQdsJqWgA4y).
  - Built ([[Gear]]; each call of Claude's in [[Gear as Claude Shapes It]]): every armour piece and weapon named by
    its set and kind ("Portwatch Helm"), Atherics and kept named pieces keeping theirs; every drop, Vestige and Shape's
    Legendaries rolled in a content's set look with random perks, the named Legendaries kept-only; faction pieces
    rolling the shared pool and one of their faction's nine perks; the Breaches' own pool of thirteen, a Breach piece
    rolling its perk columns from it alone, never one twice (no Breach is built: the owner, "Lets just finish this");
    no metal name in anything a player reads (`client/src/metalWords.test.ts`); a faction blade's hilt, guard and
    trim in its faction's colour, the Veiled's a faint cold violet ([[Factions]], [[Sprite Forge]],
    [[First Person]]); a rolled piece's look roll (`vestige::LOOK_ROLLS`, 36) choosing its set, metal, dye, make and
    shield, so a ware is bought as shown.
  - The set names stand: the owner's yes to merge settled them ([[The Set Names Stand as Claude Drafted Them]]).
  - Asked to wait before the merge, the owner added three calls: flavour text for every weapon and armour piece
    ([[Weapons and Armour Carry Flavour Text]]: `content/gear/words.json`, a line for each set and kind); commons drop
    as themselves, never as Vestiges ([[Commons Drop as Themselves, Never as Vestiges]]); and a Breach's Hard weapons
    named "(Forged)" ([[Breach Weapons Come Normal and Forged]]), for the Breach's own PR (#182, stacked on #169) to
    build with its `Item.hard`. The owner relays that one: this session may not message another.
  - The faction blades' art is published (forge run 18: figure strips and first person's frames, after a first run
    failed on a missing scikit-image pin) and `content/forge/renders.json` points at it.
  - Unchecked: whether the new first-person blades pair with the published hands (same size and `oFFs`); every look
    of a kept piece moves once with the wider look roll; played live. Here the full check stops at four R2 ship tests
    this container cannot fetch, before the repo checks: run `cargo xtask repo` beside it.
- **Open pull requests**, for the owner's yes once their checks pass: #162 (the game's words out to Type and back; it
  conflicts with `main` in `Decisions.md`) and #159 (the rooms' worker tests wait for what they check; it conflicts
  with `main` in `roomThread.test.ts`). Drafts:
  #169 (the owner's gear calls), #178 (the balance and economy pass), #179 (guilds), #93 (the toolkit's first
  review) and #114 (the gear message carries the pledge once).
- **Open points from merged work**, each the owner's to say:
  - #158 (the prologue's waking, scenes and arena, one loading screen, foes that give up only when far, feet on the
    city's ground; [[One Loading Screen Covers Every Trip Until the Place Is Ready]] and the decisions it names): the
    loading screen is not yet timed on a real GPU.
  - #164 (a smith's ware drawn as the piece it becomes): a purchase moves the number on, so the other wares still shown
    may redraw.
  - #161 (the owner's six prologue points, the wreck's room in the worker): whether each hull's eye frames well (the
    Brig's on its quarterdeck, aft of its battery; the Schooner's under its main boom), and the narrowing's 2x and
    1.5 s.
  - #154 (nameplates, the player menu and chat): the pad has no button for the chat; reporting a line.
  - #148 (the owner's bugs and polish): whether a Major's and higher's balls striking about half the time meets
    "insane accuracy"; whether the battery rose's red outline on the side a blow came from comes back on the ship's
    bar; creation's turn keys turning the figure on the spot; a Boss closing on the player's Sloop still wins every
    headless fight; the crew re-laid when a fight starts ([[Game]], limits).
- **#153, a keeper with something for you lit**, merged:
  - A keeper's mark beats and is drawn over everything while a quest step asks to speak with them or letters wait.
  - Their coin on the held map is ringed, and the Postmaster has a coin.
  - Its decisions: "The Factions Are the Baseline for Every Quest" and "A Keeper With Something for You
    Pulses and Is Seen From Everywhere", with Claude's calls listed there.
  - Pictured headless: a lit emblem over the Hall of the Arts, drawn through its walls, and the held map's rings.
    Not yet seen on a real GPU, nor the beat in motion.
- **#156, the Compendium**, merged:
  - The tab, its Collections-style front and its Lore-style book view ([[Lore]],
    [[The Compendium Holds the Lore Books, After Destiny's]]).
  - The houses' three books are written, a chapter for each task of each road
    ([[Each House's Lore Book Tells Its Art's Origin]]), for the owner to read. More books go in `content/lore/lore.json`;
    [[Lore]], "The file", says how. A chapter is found as the story ends, as a named quest's task is done, or lying at a
    named place in a node.
  - The books are set out with bold, italics, documents set in and breaks
    ([[The Lore Is Set Out, Bold and Italic Where It Helps]]); bold and italic work in any of the interface's words.
  - The covers are redrawn after the owner's pictures of Destiny's, as posters in the game's own pixel art, one design
    in each book's cloth and motif; a finished book turns down a gold corner, one not found is a dotted slot
    ([[The Lore Books' Covers Are Drawn in Detail]]).
  - Its pictures: `tools/uiShot.mjs` with `compendium/compendiumShots.ts`. Finding a chapter in a deployed room
    waits on the first books.
- **A thin black vertical line across the world**, reported by the owner and not yet found: the canvas fills the
  page, so it is not a gap in the page. The owner will send a screenshot.
- **The public events under main's balance pass** (#141): with the fight's harm at 1.5 and 0.75, the rules' two scripted
  players seal a heroic Fissure and, foes' swings at seven eighths, hold the heroic raid;
  the dev page's two bots win the Fissure either way and lose the raid's stores either way. The events are Claude's to tune ("Claude
  tunes them"); whether a pair should hold the heroic raid is the owner's to say. The chest's Vestige: #141 dropped the
  colour rows it drew on, so a plain chest draws on a Major's colours and a heroic one on a Boss's; a heroic chest's
  Vestige is now Normal about half the time (never before). The rest of #124's points are in its description and in
  [[Open Questions]], "The public events".
- **The Lattice's story**: the talk stops at the rest of [[Open Questions]], "The Lattice's places and events": the
  nine story missions as three acts of three or one chain through the islands, where the Lattice and the Heart come
  in, how near the ninth comes to the Cube; who gives the side quests. Read with them: #82 (the loop, the nine
  missions) and #97 (activities, the quest engine), both merged; #97's one clock can replace the events' own schedule.
- **The Lattice's other props**: its sixteen props are pictures only; four of the events' modules are built from
  their parts, and the rest wait on where its corrupted areas lie.
- **The codebase audit** (#142), merged: what it left is under Next ("The audit's findings left").
- **#141's calls.** Claude's calls in bringing #97 under the owner's loot rules: a dungeon's cache pays a dungeon's
  clear (an item, a Vestige one time in three, XP and Aurem), the week's Abyss Dungeon pays 15 Shapes, and the dungeon
  of the day a Boss Captain's kill.
- **The audit's leftovers, all fixed as the owner took them** (#152), merged
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]], its Claude's calls there): the asset workflows' token held only by jobs that upload; a hand run of the rooms' deploy
  refused without main's check; the Sloop checked by its hash; guests capped at 500 an hour and deleted unused 30
  days; riding on the room's word; health, charges and the Arts' charge kept with the character through a return;
  the swings' chain kept by the room; a new ship put in at a roadstead and one sailed before back where it left;
  the sea's loot on the host's own seeds; a leashed Boss's calls dropping nothing; an island's nodes spent until the
  day turns; quest waves fought once paying once; a failed trip back where the player stood; the return to the ship
  refused while fallen or just struck; long recordings in order; the island packs, `runs_everywhere` and the quests'
  lines checked in CI. Tested offline; the split asset workflows are first tested live on their next run, and nothing
  is yet played by hand or in a deployed room.
- **#155's open points**, each the owner's: a limit on travel (each travel resets the hostile roll to 30 s, so one who
  keeps travelling meets no hostile ship); whether the healing drink is "a heal" that Exposure halves; whether a lip
  caught off square is hung square; whether control waits a moment for a run that opens in the wake's last instant;
  the wreck scene's sunk Sloop, which wears the pirates' colours until `tools/wreck` is rendered again (a push there
  publishes to R2; #158's `wreck_level.py`, its waves now the Tithe's types as the layout has them, is one); a ship the room took off its route
  still drawn on it from land; the crystal of a ruin's buildings round its plaza, kept clear in its 110 m window.
- **The combat notes' open points** (#135): whether the one-second reset of the swings' chain and the foes' pace feel
  right in play; whether a stroke that would not reach the locked foe is passed over, as now (at the edge of reach
  every swing thrusts), or the chain kept strictly and a short stroke left to miss, asked and not yet answered.
- **The dungeons' and activities' questions**: whether the dungeons' taking DFO's moods, dressing and landmarks as
  law, which the Pick List had left behind, stands (#72, [[Dungeons as Claude Builds Them]]); #97's three, in its
  description: dungeon interiors and #102's encounters, the timers' borrowed row layout, and the fight director's heat
  with a run's modifiers.
- **The Thunderlock's hold** (#119). After the owner's "fix the thunderlock idle hold. Currently its held backwards",
  the forge holds it trigger to the front (`gunplay.PORT`), but its rest, walk and sprint are not drawn again ("Blades
  only for now"), so the game holds it as before. Drawing them is about 27,000 frames a body for every set and both
  bodies, some 400 Actions minutes of the `forge` workflow's `figures`.
- **Claude's calls, each the owner's to change**, are in the decisions whose names say "as Claude Shapes It" and the
  like ([[Decisions]]), [[The Audit's Calls Are Claude's]] and [[Claude Makes the Four Points' Open Calls]]; among
  them [[The Perk Pass as Claude Shapes It]] (Atheric armour keeps one signature, a rolled Rare reaches daedric at
  level 20, a faction's shield and bow keep one make, a blow on a foe four or more levels above sets off no chain blow)
  and [[The Prologue as Claude Shapes It]] (the story's day and night, music and sound). The world's sounds
  ([[The World Sounds From the Sound Picker]]): a ball on a body plays `hit.blunt`, a step sounds every 2.5 m,
  `step.wood` only on the Test Ground's crate, up to 16 sounds within 40 m. Merged pull requests' descriptions list
  the rest: #59, #61 (a captain strikes from losing men at about 80% of its hull), #68, #69, #95, #98, #99.
- **Elements and shields**: whether named weapons keep an element of their own (a leap is Volt on any Gullwing),
  whether a shield comes back after a while, and which foes beyond the patrols' carry them.
- **The held map on land** has no fog of war, so a whole land shows the first time; whether to fog it.
- **The hub's plants**: whether "any flora like bushes or trees" ([[The Hub's Plants Are the World's Low-Poly Ones]])
  also covers the wall ivy and the cut flowers at the flower stall and cart, which are the hub's own.
- **The wreck's teaching** ([[The Wreck Opens by Teaching the Player]]): the owner's "teaching them the inventory" is
  taught on the Character page (I), where gear is worn; whether the owner wants it otherwise.
- **Saltmere's heights** ([[Zones Rise and Fall, Above and Below Ground]]), for the owner to look at before the other
  islands' eight patrol zones take heights and runs. Switchbacks: the owner approved "ways that switch back down cliffs", but no
  Saltmere way needs one as built (`map_planned.rs`); whether they are wanted as a cliff climb of their own, and where.
- **Open points in merged descriptions:**
  - #98: the crew's bars under the fewer plates; whether the welcome's "Follow" moves onto the tracker and the
    keepers' marks come back as something else; the wreck's look and its zones' size; whether a fire burns half
    again; Thule's fight now that a player's blows land at 0.94 of their worth.
  - #102 and #107: whether defending foes hold ground past a foe's patience; whether any lower rank screening a
    leader under a Miniboss is the "Minors screening an Elite" meant; whether a wave is enough without a drop, and one
    the room has no room for comes later; whether "no blurbs" rules out a break's sound and the plate's alert mark;
    whether ships' plates come under "enemy health bars" (Claude recommends they stay); whether a fought foe's plate
    stays whole the full 6 s; whether a plate fading out of the cone may overlap the one taking it.
  - #95: the target's own plate over its head, to look at again once the owner has played with which plates show.
  - #96: where the claude-mem store lives (an archive kept out of git, [[Toolkit]]).
  - #68: the group's and the display's numbers, a locked-on backstep turning round or not, the vitals' frames over a
    night sky, and the rest of its list.
  - #69: emptying a Core slot; resting the ability bar with the vitals; the forge's gun puff, blue in its art
    (`tools/forge/tools/sprite-forge/guns3p.py`), which a re-render would change.
  - #59: the keys (B, H, E), the stand-ins' number and dress, Manage's view, what a walker who goes overboard meets,
    and whether DFO's Travel Options encounter comes over. #50: where another player's colour goes on the Sloop.
- **The bars' proposals**: a foe's alert "!" showing its plate through the cone for a second; a setting to switch the
  vitals' rest off; near plates growing (DFO's law grows them to 1.5×, ours caps them); ships' plates fading with
  distance; land, not only blocks, hiding plates; a soft-locked Boss shown once; a mark for a Major; the display
  scaled with the screen; one look for both kinds of death in the Game.
- **The attack feel** plays at the [[Test Ground]]'s defaults with the light layer on
  ([[Attack Visuals Go Beyond the Limits]]); which effects stay, and at what settings, is the owner's to say (`FEEL`
  in `combat/attackFeel.ts`). And whether a drawn bow or gun can punch, and in what element.
- **The mirrored view**: a drawn sword, dagger or mace changes hands through the walk, the rest and a blow, as the
  forge draws none in the left fist there; whether it should.
- **The Roster** ([[The Roster and Emblems as Claude Shapes Them]]): a join that loads another landmass; more
  emblems and where they come from.
- **The ships** ([[The Ships as Claude Shapes Them]]): the owner asked for the Frigate as one more model "and call its
  there", so the Tithe Ram and the Fluyt wait until asked; splitting ships into parts for upgrades, and the cabin's
  decoration from DFO's `decor/`, are set aside by the owner for now.
- **The lore**: nothing in the prologue names the Cube or a crystal, and the voice in the deep has no name. The
  owner's premise ([[No Shores]]) is for later in the game: "This is for later".
  Elder Maren Hale says the Grey Tithe take a tenth and Overlook pays nothing, the owner's decision
  ("The Grey Tithe Take a Tenth, and Overlook Does Not Pay").
- **Accounts and hosting** ([[The Audit's Calls Are Claude's]]): the Workers plan (a password sign-in takes about
  50 ms of CPU; the Free plan allows 10); a domain of the game's own, since every Pages project of
  `lattymoy.github.io` shares one origin and its storage; rate-limiting rules over the accounts; required reviewers
  over the deploy jobs; the Discord app's redirect (`/v1/discord/callback` on `overlook-accounts`) and its secrets
  `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`; the Cloudflare token's leave to edit D1; whether the page plays
  online by default (without `?room=` it has no accounts).
- **Keys and workflows**: rotate the Cloudflare token the owner gave in the chat (the Actions secret
  `CLOUDFLARE_TOKEN`, which the `rooms` workflow and every workflow that publishes to R2 read,
  [[The Asset Workflows Publish to R2 With the Cloudflare Token]]); add `tools/install-flatc.sh` to `ROOMS_CODE` in
  `.github/workflows/rooms.yml`. A cloud session cannot deploy the rooms itself: its proxy writes the stored token
  over the upload token Cloudflare hands back.
- **The forge's renders** leave `r2.dev`, which limits its rate, once `daggerfalljs.dev`'s DNS moves to Cloudflare
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).
- **Proposed, not agreed**: a check for [[Plain Text]] like DFO's word limits (held in review for now); the comments
  check also catching a comment that names a note ("see the X note"); whether a ship deck's grid (`deck.py`) stays in
  the manifest or goes to R2 as a bake; whether the Overworld's rise and fall, ported but never wired, stays out
  ([[Pick - Overworld]]); deleting the 37 old branches #70's description lists.
- **Walking or sprinting that does not happen on demand**: not reproduced playing alone; when it happens is the
  owner's to say.
- **Whether players may harm one another** ([[Combat]]); and **isles**: how many, how big and how placed
  ([[World Map]]).
- **The balance and economy pass** (#178), merged on the owner's "Merge and deploy", which deployed the rooms and the
  page; on the owner's
  "comprehensive balance pass and economy pass on the entire game ecosystem so far ... Destiny 1 vanilla as a
  reference ... autonomy" ([[The Balance and Economy Pass Is Claude's, After Destiny 1 Vanilla]]; every call, its
  reason and its Destiny 1 source in [[The Balance and Economy Pass as Claude Shapes It]]). The owner's own decisions
  stand. Changed: an Atheric's upgrades 8 Essence and its own node dearer, so no Atheric finishes cheaper than a
  Legendary; a Breach's armour 7; every piece's Prestige by equal steps (a ship's guns no longer 33 and 36); a faction
  rank every 100,000 reputation (rank 2 near level 20), packages 2,500 Aurem and Legendary one time in two, the cape
  500, a faction weapon 12,000; Shape's Atheric armour 13 and weapon 23, the week's Abyss 10 Shapes; a chest's Essence
  only from the day's first heroic one; bounties in three tiers (the tier on the wire, `GearBounty.tier`); every
  deed's XP to the Art and the faction (`earn_play_xp`); a road's task paying a mission's clear; a sinking paying
  twelve kills to the ship and now the player (XP and Aurem); no fire from a harmless ball; a player's bow two thirds
  (12 quick, 18 drawn); the greatsword 21 and lighter; captains' defence under the cap so each rank defends more;
  Exploit ×1.25, no crit; companions with the land's ease. On the owner's answers
  ([[The Bulwark Blocks, Supers Are Powerful, the Sea's Gaps Close and Level 30 Takes Breach Gear]]): the Bulwark
  blocks as a swordsman until its change (`roster::standing`); Tempest 48 an orb, Duskraven 16 a bolt, Linked 8 a
  second and ×1.3; a travel never brings the next hostile roll sooner; a cove's wreck one material of 1 or 2,
  Heartwood 1.5%, a module 3%; a fire's bite scales with the shooter's level strength and the ball. With the
  Bulwark blocking, the rules' scripted pair and the dev page's bots still win the heroic Fissure. On the owner's "Go ahead with your proposals except the stamina change"
  ([[Pairs Swing Faster, Foes' Guns Strike Two Thirds and Faction Gear Has No Weekly Limit]]): a player's pair comes
  round in 0.8 of its lone weapon's time at 0.9 of its blow (a foe's pair as its lone weapon, for faster paired daggers
  set a crowd of skirmishers turning about); a foe's ball strikes two thirds (`FOE_GUN`, its aimed shot too), so an
  Elite Marksman fells a matched player in three aimed shots, not two; no weekly limit on faction gear; stamina as it
  was. Measured with `economy_tests.rs` (six pace tests and the
  ledger), `balance_tests.rs` (`measure_ranks`), `measure_blows` and `measure_fights_by_rank`. Destiny 1's numbers
  came from search summaries; the proxy refused every page, so they are unchecked against the pages. Tested offline:
  `cargo xtask check` on its head; not played. The rules' two scripted sword players stand near the line of holding the
  heroic raid, which the owner keeps as it is for now; they hold it since foes' swings take seven eighths. Its one open point, Conduit, is in [[Open Questions]].
  Not yet seen in the deployed game: a pair's quicker swings, the Bulwark's shield and its drop, the supers' numbers,
  a Marksman's three aimed shots, a sinking's pay, a bounty card's own pay and the heroic raid with players.

## Next

- **The passages, to finish** (#204), in order:
  1. The client design round, stopped part-way on `passages-fx-design` (60b73921, work in progress, untested:
     `passageGame.ts` being split into `passageAsks.ts`, `mouthsCard.ts` and `zoneStood.ts`). Still to do: the Hold's
     ring modelled in Blender as `passage.ring` (its pack publishes on a push of `tools/dungeon/**`; take the manifest
     from CI); the Gauntlet's far mouth's sign (`sites.far`); "The Marked" and "Collector" over their heads and the
     Tally Post read as struck; the public way (`public` in the web) on the map and the card; words for ask 87 and
     refusal 181 (the page's 182); a cold fourth lamp's prompt to kindle; the lamp begins and "The First Lamp" checked
     on the page; tests for `wayOut` (out of font-importing `travel.ts`), `bake::crossings_of`, the `?from=` path,
     `resumeIn` and `homeTo`'s seas; pictures by the game's own camera at a ravine's arrival, by a strand's wreck, of
     the held map at sea over a lit region and of an open mouth under ground, and "Limits" made true.
  2. The band, set once, stopped part-way on `passages-fix-rules` (8a1fd725, work in progress). Both sides by the
     same scripted player: round three's measured a patrol garrison's foe at 12.5 s, a patrol dungeon's at 28 and an
     Elite Dungeon's at 24, where `band.rs` still has 25, 55 and 45; if one of main's own activities leaves the band,
     say so rather than retune it. Every deal played to done or named with its cause, the root found where the walker
     stands within a blow of a foe it never brings down (veins 0 of 3 alone, a Skirmish, a Sever, a Vault, an Ambush,
     the fourth lamp's Boss at about 14 minutes); a hollow's beat margin read from the grid's edge, not the floor's;
     `measure_the_pace` still names removed patrol zones (thunderhoof-grasslands, whitewind-tundra). Then the band's
     tables in [[Passages]] and [[Activities]], and "The band, measured" in [[Passages as Claude Builds Them]].
  3. A fresh review of the rules round together (`git diff e7f89516 9e822b36`: the dive, play and web workers and the
     merge's resolution in 9d4e2579), which was stopped unrun when the session moved.
  4. `cargo xtask check` locally and in CI on the head, pictures, #204's description rewritten (the draft is stale:
     the nine-foe cap, the fourth lamp's Abyss roll, limits since fixed), then the owner asked.
  Workers start detached and are waited on by `wait-worker.sh` ([[Toolkit]]), three at most on this container.
- **DFO's newest site.** `MckaySea/website.df.source`, a fork pushed after `Lattymoy/website.df.source`, stays unread:
  attaching it was refused as another account's. The second pass followed `Lattymoy/website.df.source` at 375ba209.
- **The boxing's cost, further** (this branch): a leaning spire of the cities keeps within 13 m only, as boxes
  square to the world stack up a lean; boxing a city takes 0.03 to 0.5 s natively where it took a millisecond, and
  WebAssembly's cost (the land worker boxes a node's city on entry) is unmeasured. The meadow's cost on a real GPU,
  and a hand's play of both, are still to come.
- **The patrol audit's risks left** (#170's description, each with its file in the audit): run lines against the
  section's ring (the ways measured: 4 of some 14,800 samples outside, by 1.8 m at most) and rock beside a run inside
  it, against [[A Run on the Rock's Top Is Held by Out of Bounds]]; `runs_everywhere` checks the wing from the ring,
  not the claim; the map draws a run's connections straight; caverns' chambers turned by quarters, building runs off a
  raised area, a rampart draw at a slope of 0.602, cave roofs over low rock; a kill goal's road group never sent away;
  a rejected post dropping the points near it; a leashed foe off the navmesh walking straight home; a far-off shot
  still filling an empty threat; the page's per-player and per-foe maps over a long stay; a trip that throws after
  its room joined leaving the socket open; one throw every foot frame keeping the veil up. A check for wiki links that
  span two lines (the vault check reads line by line) is the owner's to agree.
- **The welcome's live pictures** (#172): the header's 400 Aurem after the stranger's gift, the tracker's first task,
  a starter piece bought at the Weaponsmith and the Character page with it worn. A local room runs (`npm run server`),
  but under `tools/claude-toolkit/webgpu-shot.cjs` the game's worker opens no socket to it (the driver rewrites the
  worker's script); the `/editor/` page, which has no game worker, reaches it. Fix the driver, then picture them
  (`?arrival=1` begins at the arrival under `npm run dev`; `__qaGame` is lent in a live room too). Also unpictured:
  the wreck's ability bar just after the engulfing (pictured in the Storm's lesson), the shore and the deep in plain
  clothes (the shore's taking of her hand does not advance headless; a dev start past it would), and the Mount
  flyout at 960x540 (measured by the screens' layout harness; the offline page has no gear).
- **A cloud session runs on the `no-shores-source` environment** (personal, set up with the owner's approval): its
  network allows R2's public bucket (`ships.base`), which `client/src/ships/shipTags.test.ts` fetches meshes from, and
  its setup script runs `npm ci`. Run the check there as `NODE_USE_ENV_PROXY=1 cargo xtask check`: Node's `fetch`
  ignores `HTTPS_PROXY` without it. On the Default environment those four tests fail with "fetch failed" and xtask
  stops before the build, the bundle and the repo checks. The Context7 and SkillsMP keys are on neither environment.
- **The encounters' headless run's WebGPU error** ("Instance range ... requires a larger buffer (28) than the bound
  buffer size (24) ..."): the dungeon entrances' instance, fixed by #155 (f895eb80); the error it hid, the entrances
  drawing with no sky groups bound, is #180's first fix. Neither is yet pictured on a node. The dungeon picture driver
  (`tools/claude-toolkit/dungeon-plan.ts`) waits for an HTML "Enter" prompt the game now draws in its worker, so it
  cannot picture a dungeon until it waits on the game's own word.
- **The public events' last pictures**, left for later by the owner: the raid's waves marching, a store
  plundered, Marrow, the Tithe giving up and a failed raid; the Fissure's growth sinking, the Warden, the last minute,
  the seal and a failed Fissure; the chest, the result and the reward feed; night; the banner at 1280x720, 1000x600,
  390x844 and 844x390. Pictured and still wrong: a store's bar shows through a house's wall (the bars are interface
  marks with no depth), and the banner reads "Stores 100%" with a store at 99% (the sum rounds up). Headless frames took
  11 to 30 s, so a pass needs several runs under the 2-hour limit (observation 0095). Dev play: `&public=`, `&speed=`,
  `&bots=`.
- **The Lattice's armour and weapons in Daedric's place**, on hold by the owner's word for the Lattice's foes
  ([[The Lattice's Armour and Weapons Take Daedric's Place]]). The armour is built after the owner's reference and
  the owner likes it (`tools/lattice/armoury.py`, drawn standing still on the man's and the woman's bodies). Still to
  do when it resumes: the woman's body; every move, about 48,000 renders, in a workflow that renders in parallel and
  publishes to R2 with the repository's Cloudflare key, which needs the owner's named yes; first person; the weapons
  and shields; and the game's own names (gear tiers, dyes, outfits, first person's metals, the swing's tint, their
  tests) from Daedric to Lattice. The horse's Daedric barding is left out by the owner and still bears Bethesda's name
  ([[Open Questions]]).
- **Played live, once deployed**: a dungeon of each style (a band's fight, the Reeve's fall, the cache's Vestige and
  the portal out); the Journal and the board (take a bounty, count it, turn it in, the timers off with T; a sea bounty
  counted at sea); an arrival of each kind (a landing, a gate, a dungeon and back out at its entrance, a company join,
  one refused); a Vestige left lying and taken from the Postmaster, his counter and figure pictured; the accounts'
  migration of each character's room. Known, small: before any gear has come a tier's seas show open, the server
  still refusing them. A change to `tools/dungeon/` or the contracts publishes new packs: take the manifest line from
  the workflow's log into `content/dungeon/modules.json`.
- **Hitching in the prologue, left by #161**: the aim's view (`AimView`) is made again for every sea fight; the shore's
  return to Saltmere rebuilds its city in one go. A fleet room's lagging player has their held lay begun again by the
  room's standing orders while their page keeps counting.
- **Hitching, after DFO's performance work** ([[DFO's Performance Work Comes Over, Measured First]]): the city is
  built a few steps a frame, the veil waiting on its first; nature re-scatters only where the ground changed; flora is
  kept between landmasses; rooms run in their worker, but for the Test Ground's. Still open: a landmass cannot be
  prepared before it opens, as the land's worker holds one; the main city and the layouts' city may build at once, up
  to 48 ms a frame behind the veil; a layouts rebuild re-scatters every tile. R2's own `Cache-Control` waits on a test
  upload (the owner's yes, a write to R2). `client/src/ships/shipTags.test.ts` fetches ship meshes from `r2.dev`, so
  every deploy waits on R2 answering. Memory to measure: the figure cards' 4000-texture budget (`player/cards.ts`) and
  the item pictures' cache, uncapped (`player/itemPictures.ts`); the scene's targets are capped at 3840 by 2160's
  worth. Everything in it measured on a real GPU with `?perf`.
- **Browser QA** ([[Toolkit]]):
  - `tools/claude-toolkit/webgpu-shot.cjs` pictures the game in its worker. Run it on an idle machine: beside a
    cargo build the world may not draw for minutes.
  - The held map raised on foot pictures well. `?face=<degrees>` is not an address flag: patch a built copy's
    `askedArrival` to face a way.
  - `tools/uiShot.mjs` draws the menu whole through the real renderer (the Journal's and the Compendium's pictures).
- **A raised shield's walk**, which the owner asked for and chose to defer: walking with the guard up shows the still
  `block` frame. It needs a `blockwalk` from the forge (the block's arms and shield over the shield march's legs, as
  `onthemove.py` lays an action over a walk, held for the stride's four frames) for every body and gear layer that
  draws the block, published to R2, then the figure's guard on the move playing it (`playerMoves.ts` `fightMove`).
- **After the roads**: a road walked end to end by a person; the cost of a place's navmesh bake's slices in
  WebAssembly (15 to 19 ms at most natively, some 45 ticks a place); playing alone walks no road, as it keeps no gear.
- **After the performance pass** (#203): a node's room opens in 0.7 to 0.9 s natively on the roads' nodes, about 95%
  of it navmesh bakes (the node's own square 370 to 510 ms), half of each bake reading the land's height and a quarter
  stepping bodies over links. Baking a node's meshes with `npm run bake` would open a room at once but ship larger node
  files: the owner's call, not asked yet. The bake's whole-field slices (the open floor, the regions, the polys, some
  15 ms each natively) could be cut finer. The GPU audit's other ideas wait on a real GPU's timing; indexing the
  city's quads was left, as it breaks their culling a quad at a time, and so was culling hulls on the CPU. A 10 s
  window at the hub 30 s after loading still allocated some 400 MB over many sites, while the hub streamed in: measure
  later after loading before taking it on.
- **The garrison agreement run kills no foe** (`crates/room-wasm/src/garrison_door_tests.rs`,
  `server/garrison.test.ts`): its 13 foes stand all 1500 ticks, so nothing after a fall (drops, a group's break,
  fallback and last stand, waves) is checked natively against WebAssembly. Next: a scripted player that turns to its
  nearest foe and lands its blows, and a guard that needs a foe to fall.
- **The hub** ([[Overlook's Hub as Claude Shapes It]]): its audit's open risks (a walker's side step or sharp turn not
  walked against the hub's boxes, kept posts' people not booked against walkers, routines' maths rounding by engine,
  puddles on lawn as on flat stone); pictures of the Harbour Stair, the road, the fall and the townsfolk at work. #97
  reads `Social.board` from `hub::BOARD_LANDING_M` and counts bounties in the sea room through `Sea.minute`.
- **The islands** ([[Islands]]): coming out of a door's dungeon back onto its island, before the door, rather than at
  the ship (the trip takes the door's point already, `SeaBack`); pictures of the landfall offer, E's prompts and
  washing up, in the game itself. Picturing a dungeon headless: `tools/claude-toolkit/dungeon-qa-build.sh` and
  `dungeon-plan.ts` ([[Toolkit]], Browser QA).
- **The sea**: the fleet room has no burst (`crates/protocol/src/fleet.rs` sends `boost: false`); no ship opens its
  cabin yet, and the Tithe Ram has no ram bow ([[Hulls]]); merchantmen, bounties, public events and fleets
  ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]), which #82's loop overlaps (flotsam stays the gear loop's
  drops, the seas chosen bring their own weather). Unexplained: one voyage in contested water held a ship in sight
  89 s; under a player's fire a Frigate lasts about 5% longer than a Sloop of its rank. Quays wait, and the land a
  fight is fought over; [[Pick - Sailing and Naval Combat]]'s step 3 still lists boarding and crew as waiting.
- **The ships' manifest** (660 KB) is imported by the client and embedded whole by the room: load each deck on its
  own before more ships join. A change to the shared builder is checked by rebuilding each published ship and
  comparing its dry-run mesh hash with the manifest's.
- **The wreck**: the step up to where the player wakes is too high for foes, so a player who stays there is not
  reached until they come down.
- **The houses and looks**: reputation from bounties and activities once they exist; Shape at Sunspire and Rimeholt
  when their social spaces open; a hide and mane mask from the forge for coats (the ride's `_uv` strips are one); the
  Wraith Mist barding's blank ride strips on R2, a forge re-render ([[Gear]]); the Elite and Abyss tiers' names on the
  voyage's card (#82).
- **The gear loop**: a signed ticket from the sea room naming the node and the seas a player may join at (the client
  names a voyage's seas now); Breaches, Elite Dungeons and Missions as loot sources; the wardrobe
  ([[Clothing Is Armour, With a Wardrobe Later]]).
- **Zones**: the other islands' eight patrol zones' runs once the owner has looked at Saltmere's; a swamp's massif is 12 m high, low
  enough to climb in places, so its runs' end arenas need cutting deeper or walling. The layouts' open ends
  ([[Layouts]], "Limits"): replanning only the layouts a change touches, and the activities on the sites. The
  dungeons session (#82) plans to move each patrol's dungeon entrances onto the layouts' places, and will
  coordinate before it touches the layout code.
- **Attack visuals**, left for later: one particle system for `Sparks`, `Bits` and the shots' bits; the marks copied
  into new arrays each frame (about 0.4 MB in a busy fight); emitters under the sea still lighting; `camera.ts`
  `shifted` keeping the HUD matrix's translation in float32 (about 0.25 m off far out).
- **The client audit's finding**: trees and water past 1 km stand on the uncarved 1 km ground, the middle ground
  being the terrain's only. (#139 stops the land texts and the city's assets fetching the same files twice.)
- **Unchecked**: in a headless Test Ground run the pistolet and the thunderlock showed no first-person pictures within
  ten seconds while the crossbow did, with a 404: missing on R2, or slow. And fight-life's voice blurb system, which
  the owner named for [[Speech]], could not be read, so the likeness is unchecked.
- **#70's findings**: its description lists dead code in #63's, #68's and #69's files, to clear now they are merged;
  whether it is cleared is unchecked.
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
- **The held map** ([[Held Map]]): a quest's goals beyond the keepers it names (ringed on land by #153) tracked on
  it; on land, the relief past the camera's 2 km read off the worker's exact ground, and lakes, which only the 1 km
  grid holds.
- **Touch**: no touch layer yet, so the sea fight and the wreck's fights need keys or a pad ([[Interface]], "Limits").
- **The audit's findings left** (the audit's pull request lists each with its evidence), each needing the owner's word
  or more than a fix:
  - A player who opens sockets and never sends fills a room's 16 places (the sea's 64); #122 dismisses unsigned
    ones, but a signed idle player is never let go: whether an idle player is sent away is the owner's call.
  - A stalled network that resumes sends a second's held inputs at once, past the room's 240 a second, and the room
    sends the player away for good (`roomConnection.ts`, `budget.ts`).
  - A Guns module's Prestige climbs past Ship Power's caps (the weapon grid's five upgrades), and a ship four levels
    under still burns a captain with heated shot though its balls do nothing: the owner's to say which way each goes.
  - Binds: Use rebound to R is never heard walking the deck, where Repair keeps R; F held to dismantle can be taken by
    a rebound Details or Character. The clash finder sees neither.
  - A coward's flight is cancelled for good by a stagger (`foes/tactics.rs`).
  - The terrain's painted paths are sampled at window coordinates in f32 (3 to 6 cm steps far out), an island
    room's hauls are kept and never told, and `RoomHost`
    (`server/worker.ts`) has no test.
  - Workflows (#180 adds `content/forged` to `ROOMS_CODE`, which the bake reads); the wreck's and the ships' workflows
    miss inputs they import (`tools/ships`, `shipPictures.ts`); a failed accounts deploy still lets the rooms record
    a deploy and the page publish.
  - Repo checks that still let things through: `shaders.mjs` reads a shader only when `code:` is its call's first key;
    the html check misses `.after`/`.before` and `attributeStyleMap`; a Python docstring is found only at a line's
    start; the assets check misses `.modules` and `.bin`.


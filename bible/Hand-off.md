---
type: handoff
---
# Hand-off

Where the work stands now, for the next session. Each session rewrites this note at its end; history stays in git.

## Done

All of this is on `main`; a merge deploys the page and the rooms ([[The Rooms Deploy When Their Code Changes]]). How
each part works is in its system note.

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
- **The fight on foot**: Soulframe's guard, parry, riposte and dodge over DFO's blows; DFO's Enhanced AI with
  project-final's, in groups that lead, break and give ground; three healing charges; the aim, the crosshair and
  ranged weapons ([[Combat]], [[Foes]], [[Navmesh]]).
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
  following the moment, K for every control, the pad's cursor and DFO's gauntlet as the pointer ([[Player]]).
- **Not yet seen or heard.** Sessions test offline and picture headless, and headless Chromium in a cloud session now
  loses the game's WebGPU device about 2 s in, so these wait on a real GPU, an ear or a hand:
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
    Vestige opened at the Reader's.

## Waiting on the owner

The decisions in [[Open Questions]] are not repeated here.

- **The codebase audit** (branch `ccr-e6d5616d-oe5iwr`), for the owner's yes to merge: its fixes and what it left
  are in its pull request's description and under Next ("The audit's findings left").
- **Open pull requests.** For the owner's yes once their checks pass: #139 (areas in chunks), #135 (swings chain;
  foes at 75% of the player's pace), #134 (a keeper's mark over what can be used), #132 (resource nodes), #131 (the
  houses' roads), #124 (public events on Saltmere). Drafts: #72 and #88 (dungeons), #77 (lore), #82 (the owner's
  loop), #97 (activities), #122 (server authority), #123 (the Postmaster); #93 and #114 sit on the merged
  `claude/waters-from-islands`.
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
- **The held map on land** has no fog of war, so a whole land shows the first time; whether to fog it as the sea is.
- **The hub's plants**: whether "any flora like bushes or trees" ([[The Hub's Plants Are the World's Low-Poly Ones]])
  also covers the wall ivy and the cut flowers at the flower stall and cart, which are the hub's own.
- **The wreck's teaching** ([[The Wreck Opens by Teaching the Player]]): the owner's "teaching them the inventory" is
  taught on the Character page (I), where gear is worn; whether the owner wants it otherwise.
- **Saltmere's heights** ([[Zones Rise and Fall, Above and Below Ground]]), for the owner to look at before the other
  24 zones take heights and runs. Switchbacks: the owner approved "ways that switch back down cliffs", but no
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
- **The Roster** ([[The Roster and Emblems as Claude Shapes Them]]): a join that loads another landmass; names over
  other players' heads, green for the company; the Guild tab's own page; more emblems and where they come from;
  whether Overlook has text chat, which mute would need.
- **The ships** ([[The Ships as Claude Shapes Them]]): the owner asked for the Frigate as one more model "and call its
  there", so the Tithe Ram and the Fluyt wait until asked; splitting ships into parts for upgrades, and the cabin's
  decoration from DFO's `decor/`, are set aside by the owner for now.
- **The lore** (#77): nothing in the prologue names the Cube or a crystal, and the voice in the deep has no name.
- **Accounts and hosting** ([[The Audit's Calls Are Claude's]]): the Workers plan (a password sign-in takes about
  50 ms of CPU; the Free plan allows 10); a domain of the game's own, since every Pages project of
  `lattymoy.github.io` shares one origin and its storage; rate-limiting rules over the accounts; required reviewers
  over the deploy jobs; the Discord app's redirect (`/v1/discord/callback` on `overlook-accounts`) and its secrets
  `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`; the Cloudflare token's leave to edit D1; whether the page plays
  online by default (without `?room=` it has no accounts).
- **Keys and workflows**: rotate the Cloudflare token the owner gave in the chat (the repository reads the Actions
  secret `CLOUDFLARE_TOKEN`); add `tools/install-flatc.sh` to `ROOMS_CODE` in `.github/workflows/rooms.yml`;
  setting R2's `Cache-Control` on files already there writes to R2 (#139). A cloud session cannot deploy the rooms
  itself: its proxy writes the stored token over the upload token Cloudflare hands back.
- **The cloud environment**: two environments named Default are listed and no `overlook-source` one; which one
  sessions should run on, and which holds the SkillsMP key, is unchecked. A Context7 key, if wanted, goes on it the
  same way.
- **The forge's renders** leave `r2.dev`, which limits its rate, once `daggerfalljs.dev`'s DNS moves to Cloudflare
  ([[The Forge's Renders Will Use daggerfalljs.dev]]).
- **Names** for the armour sets and weapons, to replace the forge's ([[Three Races]]).
- **Proposed, not agreed**: a check for [[Plain Text]] like DFO's word limits (held in review for now); the comments
  check also catching a comment that names a note ("see the X note"); whether a ship deck's grid (`deck.py`) stays in
  the manifest or goes to R2 as a bake; whether the Overworld's rise and fall, ported but never wired, stays out
  ([[Pick - Overworld]]); deleting the 37 old branches #70's description lists.
- **Walking or sprinting that does not happen on demand**: not reproduced playing alone; when it happens is the
  owner's to say.
- **Whether players may harm one another** ([[Combat]]); and **isles**: how many, how big and how placed
  ([[World Map]]).

## Next

- **Areas in chunks**, after #139 ([[Areas Load in Chunks With Proper Caching]]): the hitch risks it found (playing
  alone, a room opens on the game's thread; a city is built in one go after each landmass switch and every 1.5 km); a
  landmass readied before it opens; the hitching measured on a real GPU. Memory to measure: the figure cards' 4000-texture budget (`player/cards.ts`), the scene's
  full-size targets, about 590 MB at 5120 by 2880, uncapped (`scene.ts`), and the item pictures' cache, uncapped
  (`player/itemPictures.ts`).
- **Browser QA**: `tools/claude-toolkit/webgpu-shot.cjs` reads the page's canvas, so it pictures the Test Ground and
  the World Editor but not the game, which draws in its worker ([[Toolkit]]); time the game's frames through
  Playwright's worker handle. The kit is kept as shipped, so its fix is the co-dev's (observation 0068).
- **The garrison agreement run kills no foe** (`crates/room-wasm/src/garrison_door_tests.rs`,
  `server/garrison.test.ts`): its 13 foes stand all 1500 ticks, so nothing after a fall (drops, a group's break,
  fallback and last stand, waves) is checked natively against WebAssembly. Next: a scripted player that turns to its
  nearest foe and lands its blows, and a guard that needs a foe to fall.
- **The hub** ([[Overlook's Hub as Claude Shapes It]]): its audit's open risks (a walker's side step or sharp turn not
  walked against the hub's boxes, kept posts' people not booked against walkers, routines' maths rounding by engine,
  puddles on lawn as on flat stone); pictures of the Harbour Stair, the road, the fall and the townsfolk at work. #97
  reads `Social.board` from `hub::BOARD_LANDING_M` and counts bounties in the sea room through `Sea.minute`.
- **The islands** ([[Islands]]): the door's trip into its dungeon once the dungeons' work (#72, #88) brings its
  `sea-dungeon-…` room (until then E at the door says the way down is not open); pictures of the landfall offer, E's
  prompts and washing up, in the game itself.
- **The sea**: the fleet room has no burst (`crates/protocol/src/fleet.rs` sends `boost: false`); no ship opens its
  cabin yet, and the Tithe Ram has no ram bow ([[Hulls]]); merchantmen, bounties, public events and fleets
  ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]), which #82's loop overlaps (flotsam stays the gear loop's
  drops, the seas chosen bring their own weather). Unexplained: one voyage in contested water held a ship in sight
  89 s; under a player's fire a Frigate lasts about 5% longer than a Sloop of its rank. Quays wait, and the land a
  fight is fought over; [[Pick - Sailing and Naval Combat]]'s step 3 still lists boarding and crew as waiting.
- **The ships' manifest** (388 KB) is imported by the client and embedded whole by the room: load each deck on its
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
- **Zones**: the other 24 zones' runs once the owner has looked at Saltmere's; a swamp's massif is 12 m high, low
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
- **The held map** ([[Held Map]]): discovery kept by the server per character, quests tracked on it, the charted sea's
  wash laid while it is up; on land, the relief past the camera's 2 km read off the worker's exact ground, and lakes,
  which only the 1 km grid holds.
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
  - A coward's flight is cancelled for good by a stagger (`foes/tactics.rs`, which #135 changes).
  - The terrain's painted paths are sampled at window coordinates in f32 (3 to 6 cm steps far out), the water and the
    scene make about 13 GPU objects a frame, an island room's hauls are kept and never told, and `RoomHost`
    (`server/worker.ts`) has no test.
  - Workflows: `content/forged` is not in `ROOMS_CODE` though the bake reads it; the wreck's and the ships' workflows
    miss inputs they import (`tools/ships`, `shipPictures.ts`); a failed accounts deploy still lets the rooms record
    a deploy and the page publish.
  - Repo checks that still let things through: `shaders.mjs` reads a shader only when `code:` is its call's first key;
    the html check misses `.after`/`.before` and `attributeStyleMap`; a Python docstring is found only at a line's
    start; the assets check misses `.modules` and `.bin`.


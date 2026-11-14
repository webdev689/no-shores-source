---
type: reference
source: DFO Online, branch ccr-aff93cb4-gw1nto-audit and the unmerged branches named below
---
# Pick List - Network and Platform

Part of the [[Pick List]]. How to read the verdicts and the "Lands as" column: [[Port]].

Area: `src/net/**`, `server/**` (the relay), `server-account/**` (account service, D1, Discord), `app/**` (Electron),
`.github/workflows/*`, `scripts/**`. Read at the tip (`ccr-aff93cb4-gw1nto-audit`, b172380aa7) unless a branch is named.
Server side lands as a Rust rebuild with DFO as the specification; client side as a TS port. "Law both ends run" in
`src/net` is one JS file today that the page, the relay and the account service all import, so most rows land twice.

| Folder / module | What it is (<=12 words) | Kind | Verdict | Lands as | Seam or reason (<=25 words) | Effort | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/net/wire.js` | The wire's law both ends import: frames, rooms, rates, bounds | Platform | Cut | Rust rebuild + TS port | Framing, rate buckets, validators generic; room keys by map pixel/mapId, MapsFile units, DFU ordinals, 71 region channels, 3E405 classic clock. | L | `src/net/wire.js:validPose` |
| `src/net/online.js`, `backoff`, `reconnectWave`, `loneSleep`, `relayCfg`, `updateNotice`, `foesQuiet`, `hitPend`, `seatLive`, `sharedClock`, `ownerClock`, `playClock`, `dayTurn`, `askRest` | Client session: hello, poses, halos, lone sleep, reconnect spread, clocks | Platform | Cut | TS port | Pacing and reconnect generic; room naming reads `mapsTables` Bay bounds and Daggerfall place keys; foes/act frames assume client-hosted rooms. | M | `src/net/online.js:haloPoseDue` |
| `src/net/cellTree.js`, `hubShards.js` | Cell quadtree split/merge; sixteen hub shards and bus; region shards | Platform | Cut | Rust rebuild + TS port | Pure and generic; only constants are Daggerfall's: `REGION_CHANNELS` 71, `REGION_SPLIT` 62, `WORLD_CELL` 16 map pixels. | S | `src/net/hubShards.js:REGION_CHANNELS` |
| `src/net/instanceRoom.js`, `privateInterior.js`, `roomLease.js`, `oneSeat.js` | Instance rooms, owner rooms, hub leases, one character at a time | Platform | Cut | Rust rebuild + TS port | Admission and lease logic generic; keys built from MAPS.BSA mapId and building key, poses in the MapsFile frame. | S | `src/net/privateInterior.js:privateInteriorOf` |
| `src/net/identityToken.js`, `sessionPassLaw.js`, `cacheProof.js`, `watchReceipt.js`, `canon.js` | Ed25519 identity token, signed orders, relay receipts, session pass | Platform | Cut | Rust rebuild + TS port | `v1.` token with no algorithm field, signed orders and receipts are Clean; closed TITLES/GLYPHS/AURAS vocabulary carries lore names. | M | `src/net/identityToken.js:verifyToken` |
| `src/net/accountClient.js`, `heartbeat.js`, `busyLaw.js`, `handleShape.js`, `legalLaw.js` | The page's client of the account service: tokens, bookmarks, busy gate | Platform | Cut | TS port | Retry, busy gate, bookmarks, token reuse generic; routes cover homes and halls by mapId, realm roster, Daggerfall item records. | M | `src/net/accountClient.js` |
| `src/net/chat.js`, `chatCommands.js`, `chatVoice.js`, `roster.js`, `social.js`, `dice.js`, `moderation.js` | Chat law, slash commands, roster, friends and party, dice | UI | Clean | TS port | Own-work ledger rows ("Not a DFU member"); the region channel list lives in `wire.js`, not here. | M | `src/net/chatCommands.js` |
| `src/net/nameFilter.js`, `privateReport.js`, `reportLaw.js` | Name and text filter; private exploit reports | Platform | Clean | TS port + Rust rebuild | No game data; the filter also runs inside the relay's sanitizers. | S | `src/net/nameFilter.js` |
| `src/net/staffChat`, `staffCommands`, `staffFollow`, `staffHook`, `staffMessages`, `staffTeleport`, `staffMap`, `staffPlaces`, `hiddenSeen`, `toyboxEvents`, `toyboxGrant` | Staff tooling, page half: freeze, follow, hidden, teleport, map | Platform | Cut | TS port | Commands, follow, freeze generic; `staffMap`/`staffPlaces`/`staffTeleport` read MapsFile places, `LOCATION_TYPES`, `REGION_NAMES`. | M | `src/net/staffPlaces.js` |
| `src/net/remotePlayers.js` | Other players drawn: bodies, mounts, badges, sounds | Gameplay | Cut | TS port | Interpolation and range ours; draws through Daggerfall mobile/paperdoll sprites, `rmbFlats`, `equipTable`, races. No GPU calls. | M | `src/net/remotePlayers.js` |
| `src/net/appearanceLaw`, `armoryLaw`, `effectLaw`, `insignia`, `heraldryLaw`, `heraldryIndex`, `profileCard`, `partyBuffs`, `journalPage` | Cosmetic vocab, heraldry, inspect card, party buff timers, shared journal | Gameplay | Cut | TS port + Rust rebuild | Validators generic; `armorMaterials`, chargen stats, mysticism effects and cosmetic names are Daggerfall or lore content. | S | `src/net/appearanceLaw.js` |
| `src/net/overworldLaw`, `grantLaw`, `grantMeasure`, `foeBounds`, `bodyLoot`, `raiseWord` | Overworld spent-row ledger, cell spawn grants, foe bounds, body loot | Gameplay | Cut | Rust rebuild + TS port | Cell-signed spawn grants and ledger ours; rows keyed by world pixel; bounds from monster ranges; loot is Daggerfall items. | M | `src/net/grantLaw.js:validGrantAsk` |
| `src/net/frontLaw`, `festivalLaw`, `skyLaw`, `tideLaw`, `regionClockLaw` | Event fronts, festival days, waits clock, tides, region prosperity | Gameplay | Cut | Rust rebuild | Clock math ours; `holidayTables`, regions 0..70 and lore names are content. | S | `src/net/regionClockLaw.js` |
| `src/net/bossRef.js`, `bossBody.js`, `bossSeam.js`, `kitMight.js`, `mightLaw.js` | Relay boss referee: strike shapes, body counts, the boss contract | Gameplay | Cut | Rust rebuild | `bossSeam` contract (new/join/hit/step/say) Clean; `kitMight` reads Daggerfall paperdoll and weapons. | M | `src/net/bossSeam.js` |
| `src/net/marketLaw`, `marketBook`, `marketArrivals`, `marketAffixLaw`, `tradeSession`, `vendorLaw`, `bagLaw`, `productRecord` | Market listings and auctions, player trade machine, vendors, bag | Gameplay | Cut | Rust rebuild + TS port | `tradeSession` is a pure state machine; listings carry Daggerfall item records judged by `systems/item/itemLaw`. | M | `src/net/tradeSession.js` |
| `src/net/mail`, `letterLaw`, `postLaw`, `serverPost`, `giftLaw`, `lostLaw`, `lostSpoils` | Letters, server post, gifts, lost boss loot to the mailbox | Gameplay | Cut | Rust rebuild + TS port | Mail law generic; attachments are Daggerfall loot items. | S | `src/net/letterLaw.js` |
| `src/net/shopLaw`, `aurumLaw`, `aurumCacheLaw`, `battlePassLaw`, `marksLaw`, `marksBook`, `patronLaw` | Storefront, Aurum currency, battle pass, Marks currency, NPC patrons | Gameplay | Cut | Rust rebuild + TS port | Currency and pass ledgers ours; catalog names lore; `patronLaw` prices through the Roleplay Realism Items port. | M | `src/net/patronLaw.js` |
| `src/net/professionLaw`, `profBook`, `nodeLaw`, `provinceNodes`, `motherlodeLaw`, `motherlodeBook`, `witnessTileLaw` | Gathering nodes by climate and region, motherlodes, witnessed ground | Gameplay | Cut | Rust rebuild + TS port | Reads `mapsTables` CLIMATES and REGION_RACES (DFU herb groups), map pixel keys, Tamriel provinces. | L | `src/net/nodeLaw.js` |
| `src/net/recipeLaw`, `craftWritLaw`, `writLaw`, `writBook`, `masterLaw`, `temperLaw`, `repairLaw`, `alchemyLaw`, `chainLaw`, `huntLaw`, `huntBook`, `trophyLaw` | Crafting recipes, writs, tempering, alchemy, repair, hunts | Gameplay | Cut | Rust rebuild + TS port | Item templates, potion recipes, dyes, `factionFile` FACTION_FLAGS, bounty tables are Daggerfall's. | L | `src/net/recipeLaw.js` |
| `src/net/townSeatLaw`, `townSeatBook`, `fortLaw`, `castleLaw`, `kingdomLaw`, `domainLaw`, `seatGiftLaw`, `royalLink`, `royalSession`, `townEconLaw`, `townEconBook` | Town seats, domains, kingdoms, forts, royal tourney, town economy | Gameplay | Cut | Rust rebuild + TS port | `REGION_NAMES`, `BAY_REGION_COUNT`, the Iliac Bay kingdoms and MAPS.BSA towns are the seam. | L | `src/net/townSeatLaw.js` |
| `src/net/npcChapterLaw`, `npcHallBook`, `npcRollTracker`, `chapterEvents`, `chapterSheet`, `renown`, `renownTracker`, `questlineClaims`, `noticeBook`, `boardLaw` | NPC guild chapters, Renown, questline claims, notice boards | Gameplay | Cut | Rust rebuild + TS port | Daggerfall guilds and factions, `REGION_NAMES`, `nameHelper`, building names. | M | `src/net/npcChapterLaw.js` |
| `src/net/homeLaw`, `homeListingLaw`, `homeListings.json`, `homeScene`, `homeVoteLaw`, `houseLaw`, `hallLaw`, `decorLaw`, `yardCellLaw`, `yardPush`, `yardRange`, `yardWordLaw` | Player homes, guild halls, decor, yards, town votes | Gameplay | Cut | Rust rebuild + TS port | A home is MAPS.BSA mapId plus RMB building key; decor reads Daggerfall flats and nature archives. | M | `src/net/homeLaw.js` |
| `src/net/caravanVisitLink`, `sailingCabinLink`, `boatIdentity`, `crewSignLaw`, `wedSession` | Caravan visits, boat cabins, crew signing, weddings | Gameplay | Cut | TS port | Link logic generic; wagon/horse systems and Project Legacy bonds behind it. | S | `src/net/wedSession.js` |
| `src/net/arena/` | Arena bouts, ladder, league: law, relay brain, receipts | Gameplay | Cut | Rust rebuild + TS port | ARENA4 law ours; the colosseum comes over rebuilt in our formats ([[Which Made-for-DFO Mods Come Over]]); ladder stats are DFU EnemyBasics rows. | M | `src/net/arena/arenaLaw.js` |
| `src/net/card/`, `src/net/holdemTable.js` | Hold'em: relay deals, stake escrow, receipts | Gameplay | Clean | Rust rebuild + TS port | "Not a DFU member"; imports only `dice.js`; card worth reads realm gold law. | M | `src/net/holdemTable.js` |
| `src/net/iliac/` | Iliac Hand card game: deck, hand rules, table, receipts | Gameplay | Cut | Rust rebuild + TS port | Table engine reuses Hold'em's; the 1.6k-line deck is lore-named cards. | M | `src/net/iliac/iliacCards.js` |
| `src/net/gambit/`, `src/net/kingsGambit.js` | King's Gambit board game: rules, relay table, receipts | Gameplay | Cut | Rust rebuild + TS port | Rules engine ours; pieces are Daggerfall monsters (`VANILLA_ENEMY_BASICS`). | M | `src/net/kingsGambit.js` |
| `src/net/duel/` | Duels: session, relay referee, receipt | Gameplay | Cut | Rust rebuild + TS port | Referee reuses `siegeRef`'s DFU weapon damage tables. | S | `src/net/duel/duelRef.js` |
| `src/net/siege/` | Seat sieges: referee, health share, receipts, session | Gameplay | Cut | Rust rebuild + TS port | Refereeing ours; `CalculateWeaponMaxDamage`, material modifiers, EquipSlots copied from DFU and pinned equal. | M | `src/net/siege/siegeRef.js` |
| `src/net/wild/` | Open PvP zone: referee, vitals, remains, insurance, receipts | Gameplay | Cut | Rust rebuild + TS port | Referee and vitals ours; inventory/item model Daggerfall's; Wrothgar naming. | M | `src/net/wild/wildRef.js` |
| `src/net/sea/` | Sea bounty, seasons, wreck prize, ship guns referee | Gameplay | Cut | Rust rebuild | Rules ours; prize is a Daggerfall item; Eltheric Ocean names. | S | `src/net/sea/seaRef.js` |
| `src/net/gate/` | Oblivion Gate world boss: brain kernel, courts, rite, receipts | Gameplay | Cut | Rust rebuild + TS port | `gateBrain`'s threat, hit-bucket and DPS kernel feeds every boss; Oblivion/Dagon content is lore. | L | `src/net/gate/gateBrain.js` |
| `src/net/serpent/` | Sea serpent world boss: brain, body, site, receipts | Gameplay | Cut | Rust rebuild + TS port | Brain ours; lore naming; health references off DFU bars. | M | `src/net/serpent/serpentBrain.js` |
| `src/net/dragon/` | Dwarven Dragon sky boss: brain, path, seed, receipts | Gameplay | Cut | Rust rebuild + TS port | Built on `gateBrain`; Dwarven lore content. | M | `src/net/dragon/dragonBrain.js` |
| `src/net/ketch/` | Sky-Ketch airship raid: voyage, deck, constructs, warden, judge | Gameplay | Cut | Rust rebuild + TS port | Deck plan in the dungeon frame; Dwarven lore; `gateBrain` kernel. | M | `src/net/ketch/ketchJudge.js` |
| `src/net/superDungeon/` | Abyss Dungeon: Remnant brain, marks, strikes, herald, receipts | Gameplay | Cut | Rust rebuild + TS port | `sdHerald` imports `formats/mapsTables` REGION_NAMES; lore content. | M | `src/net/superDungeon/sdRemnant.js` |
| `src/net/eliteGates/` | Elite Breach: director, halls, spans, legion, lords, route proofs | Gameplay | Cut | Rust rebuild + TS port | 21k lines of our own law; Battlespire lore; DFU-member constants through `gateBrain`. | L | `src/net/eliteGates/egBrain.js` |
| `src/net/starfall/` | Starfall festival event: night, defence ledger, receipt | Gameplay | Cut | Rust rebuild + TS port | Tied to the Witches' Festival (a Daggerfall holiday); lore names. | S | `src/net/starfall/starfallLaw.js` (unread) |
| `src/net/raid/` | Town raids online: relay ledger, receipts, claims | Gameplay | Cut | Rust rebuild | Ledger ours, over the Raiding Parties port (Raiding Parties comes over as design): key, Unity Random roll pinned to the mod; towns table handed in by SHA. | S | `src/net/raid/raidLaw.js:raidTownsCanon` |
| `src/net/delve/` | DELVE II encounters: kinds, ledger machine, plan hash | Gameplay | Clean | Rust rebuild + TS port | Pure; offline and relay run one state; borrows helpers from gate and starfall modules. | M | `src/net/delve/delveLaw.js` |
| `src/net/invasion/` | Toybox invasion fight brain and its wire | Gameplay | Clean | Rust rebuild | No data or lore; reuses `gateBrain` constants and the toybox wave law. | S | `src/net/invasion/invasionBrain.js` |
| `src/net/staffEvent/` | Staff-run live events: law, receipt, toybox event | Platform | Cut | Rust rebuild + TS port | Event ledger ours; places named by Daggerfall map ids. | S | `src/net/staffEvent/staffEventLaw.js` |
| `src/net/firmament/` | Firmament passive tree and its book | Gameplay | Cut | Rust rebuild + TS port | Tree engine ours; the 1.3k-line tree is Tamriel constellations and lore node names. | M | `src/net/firmament/firmamentTree.js` |
| `src/net/guild/` | Guild book, ranks, powers, vault, shop, logos | Gameplay | Cut | Rust rebuild + TS port | Halls bought by mapId and building key; the rest generic. | M | `src/net/guild/guildBook.js` |
| `src/net/realm/` | Realm gold, player trade law, gzip save codec | Platform | Cut | Rust rebuild + TS port | Codec Clean; gold and trade law read Daggerfall items and wagons. | S | `src/net/realm/realmSaveCodec.js` |
| `src/net/safety/` | Chat stamp, sealed reviewer feed, report law, conduct | Platform | Clean | Rust rebuild + TS port | Relay signs every line; feed sealed to the reviewer; no game data. | S | `src/net/safety/chatStamp.js` |
| `src/net/herald/` | Discord herald card: families, bounds, threads, safe words | Platform | Clean | Rust rebuild | Generic webhook card; each event's herald lives in its own folder. | S | `src/net/herald/heraldCard.js` |
| `src/net/peer/` | Other players' bodies, riders, climbs, music, gathering, effects | Gameplay | Cut | TS port | `peerBodies` imports Morrowind `mwItemMap`/`mwNpc`; Daggerfall weapon states; sprite-forge looks. | M | `src/net/peer/peerBodies.js` |
| `server/src/index.js` | Relay Worker and `Room` Durable Object, one 12k-line class | Platform | Cut | Rust rebuild | Rooms, hub bus, layers, referees, receipts carry; DO hibernation/storage/alarms do not; Daggerfall room keys, regions, raid table SHA. | L | `server/src/index.js:Room` |
| `server/src/relay.js`, `relayScale.js`, `foesHold.js`, `drainWindows.js` | Room deadlines, bounded caches, metrics, layer walk, foes budget hold | Platform | Clean | Rust rebuild | Generic; `drainWindows` exists for DO billing; metrics write Analytics Engine. | S | `server/src/relayScale.js:layerWalk` |
| `server/src/cellNodes.js`, `cellMoves.js`, `cellHandover.js` | Cell directory, split/merge moves, stored-row handover | Platform | Clean | Rust rebuild | Quadtree repartition with dwell and row handover carries; built on DO stubs and storage. | M | `server/src/cellHandover.js:handOver` |
| `server/src/staffEvents`, `staffFeedLaw`, `staffFeeds`, `staffFollow`, `staffFreeze`, `staffGhost`, `staffHidden`, `staffMessage`, `staffTeleport` | Staff tooling, relay half: feeds, freeze, hidden spectators, follow, ghost | Platform | Clean | Rust rebuild | No game data; feeds post signed to the account service. | M | `server/src/staffFreeze.js` |
| `server/src/dragonFights`, `invasionFights`, `delveRoom`, `sdCopy`, `pvpLinger`, `yardWords` | Event hosting halves: dragon, invasion, delve, abyss copies, PvP linger | Gameplay | Cut | Rust rebuild | Hosting pattern ours; content lore-named; yard words keyed by town places. | M | `server/src/dragonFights.js` |
| `server/wrangler.toml`, `server/package.json` | Relay config: public key, cell law, runtime settings, Discord roles | Platform | Clean | Practice | Cloudflare config; carry "empty is a legal state" vars and run-time settings, not the file. | S | `server/wrangler.toml` |
| `server-account/src/index.js`, `service`, `admit`, `sessionPass`, `signing`, `metrics`, `cron`, `heartbeat`, `door`, `sealed`, `unitRoll`, `weekKept`, `keptBoard`, `leanWitness` | Account core: router, replica reads, sign-in line, pass, crons, metrics | Platform | Clean | Rust rebuild | Design carries; D1 sessions and bookmarks, Analytics Engine and cron triggers are Cloudflare mechanics. | L | `server-account/src/service.js:routeDb` |
| `server-account/src/accounts`, `password`, `guestName`, `founderLink`, `patreon` | Accounts, passwords, guest names, founder and Patreon links | Platform | Cut | Rust rebuild | `guestName` draws Daggerfall's name banks (`characters/nameGen.json`); the rest generic. | M | `server-account/src/guestName.js` |
| `server-account/src/realm`, `saves`, `realmTrade`, `ledger`, `judge`, `verdict`, `budget`, `progress`, `legacy`, `craftedPiece`, `villainy`, `accessOrphans` | Realm characters: lease+seq checkpoints, item ledger, judge, verdict, budget | Platform | Cut | Rust rebuild | Lease, seq, prev-object writes and verdict Clean; the judge asks `itemLaw` over Daggerfall item templates and enchantments. | L | `server-account/src/judge.js` |
| `server-account/src/staff*.js` (21), `claudeStaff`, `devEvents`, `devToybox` | Staff panel back end: census, economy, realm, freeze, orders, Claude | Platform | Cut | Rust rebuild | Tooling generic; `staffRealm` and `staffEconomy` judge through Daggerfall `itemLaw`. | L | `server-account/src/claudeStaff.js` (sampled) |
| `server-account/src/safety`, `safetyClock`, `sanctions`, `reports`, `review`, `modAi` | Chat safety, sanctions, reports, review queue, AI moderator | Platform | Clean | Rust rebuild | No game data; `modAi` runs an LLM reviewer in shadow mode. | M | `server-account/src/modAi.js` |
| `server-account/src/discord.js`, `discordCommands.js` | Discord bot: interactions endpoint, mod slash commands, logo review | Platform | Clean | Rust rebuild | Commands are code; the account deploy registers them and the endpoint. | S | `server-account/src/discordCommands.js` |
| `server-account/src/shop`, `aurum`, `aurumCache`, `battlePass`, `market`, `brokerSales`, `contracts`, `cards`, `post`, `letters`, `lostSpoils`, `grants` | Shop, Aurum, pass, market, contracts, card escrow, letters, post | Gameplay | Cut | Rust rebuild | `market` reads `itemLaw`, `mapsTables`, recipe and node law; shop catalog uses lore names. | L | `server-account/src/market.js` |
| `server-account/src/guilds`, `guildBoard`, `guildFurniture`, `guildLogos`, `guildPowerSql`, `guildShop`, `guildVault` | Guilds, board, vault, shop, furniture, logos, powers | Gameplay | Cut | Rust rebuild | `guildFactions` (Daggerfall factions); halls keyed by map ids. | M | `server-account/src/guilds.js` |
| `server-account/src/homes`, `homeTransfer`, `homeVotes`, `rent`, `decor`, `decorAccess`, `decorBatch`, `halls`, `yardCells`, `townLayout`, `poi` | Homes, transfers, votes, rent, decor, yards, POI store | Gameplay | Cut | Rust rebuild | Rows keyed by `(map_id, building_key)`; POI meshes. | M | `server-account/src/homes.js` |
| `server-account/src/townSeats`, `seat*` (11), `castles`, `domains`, `regionClock`, `tides`, `townEcon` | Town seats, Turning, sieges, forts, domains, tides, town economy | Gameplay | Cut | Rust rebuild | Thin store over shared `townSeatLaw`/`nodeLaw`: regions 0..70, Bay towns. | M | `server-account/src/seatTurning.js` (imports only) |
| `server-account/src/npcChapters`, `npcHalls`, `npcMerit`, `npcReceipts`, `npcRoll`, `festival`, `questlines`, `firmament`, `board`, `boardNames`, `lamp` | NPC chapters, halls, roll, festival, questlines, firmament, boards | Gameplay | Cut | Rust rebuild | Daggerfall guilds, holidays and the lore tree come through the shared laws. | M | `server-account/src/npcChapters.js` (imports only) |
| `server-account/src/arena`, `eg*`, `raids`, `serpents`, `dragons`, `stars`, `sds`, `ketch`, `gambit`, `iliac`, `wild*`, `sea*`, `crewSigns`, `seasonClaim`, `honours`, `titles`, `renownTracks`, `marks`, `hunts` | Receipt redemption and boards for arena, breach, raids, bosses, cards, sea | Gameplay | Cut | Rust rebuild | Redeem-once receipt pattern Clean; event names and rewards are lore content. | L | `server-account/src/eg.js` |
| `server-account/src/professions`, `alchemy`, `masterWork`, `motherlodes`, `witnessTiles`, `groundConfirmed`, `writs`, `craftWrits` | Professions, alchemy, motherlodes, witness tiles, confirmed ground, writs | Gameplay | Cut | Rust rebuild | Climate, region and pixel keyed; three-account ground confirmation is generic. | L | `server-account/src/professions.js` |
| `server-account/migrations/` (215 files) | Append-only D1 schema: 334 CREATE TABLE in 10.6k lines | Platform | Cut | Rust rebuild | The schema is the spec; 64 migrations key by map_id, building_key, pixel or region; SQLite dialect and triggers. | L | `server-account/migrations/0018_realm_characters.sql` |
| `server-account/wrangler.toml`, `server-account/CLAUDE.md` | Service config: staff handle lists, feature switches, crons; Discord-is-code | Platform | Clean | Practice | Switches and role lists as config carry; placement, bindings and workers.dev URLs do not. | S | `server-account/wrangler.toml` |
| `app/main.cjs`, `preload.cjs`, `launcherPreload.cjs`, `app/lib/launcherState.cjs` | Electron shell: launcher, updates, `dagger://` file protocol | Platform | Cut | TS port | Update, swap and news logic ours; about 170 ARENA2, Daggerfall, Steam and GOG hits locate, serve and probe the player's files. | M | `app/main.cjs:handleDagger` |
| `app/lib/arena2Detect.cjs`, `arena2Probe.cjs` | Finds a Daggerfall install through Steam, GOG, DFU settings | Platform | Can't | — | Exists to locate Daggerfall's ARENA2 folder. | — | `app/lib/arena2Detect.cjs` |
| `app/lib/autoUpdate`, `updateCheck`, `selfSwap`, `downloads`, `gameStore`, `gameChannel`, `readyGameSwitch`, `fileStorage`, `shellDialogs`, `rendererGone`, `frameRate`, `gpuCacheTurn` | Updater, self-swap, game pack store, file saves, crash watch | Platform | Clean | TS port | No game data. | M | `app/lib/gameStore.cjs` |
| `app/lib/graphicsBackend.cjs` | ANGLE Vulkan/D3D11 guard for the WebGL2 page | Platform | Clean | Practice | WebGL2-specific; a WebGPU (Dawn) backend needs its own guard built on the same "blank window" checks. | S | `app/lib/graphicsBackend.cjs` |
| `app/lib/privateHost.mjs`, `hostingPin.cjs`, `src/net/privateServer.js`, `scripts/privateRelay.mjs` | Private server on a player's PC: local relay, host mints tokens | Platform | Clean | Practice | Runs the Cloudflare relay unchanged in miniflare/workerd; carry the host-mints-guest-tokens trust model, ship the Rust server instead. | S | `app/lib/privateHost.mjs` |
| `app/package.json`, `afterPack.cjs` | electron-builder packaging, ad-hoc Mac signing hook | Tooling | Clean | Practice | Packaging config and a signing workaround. | S | `app/afterPack.cjs` |
| `.github/workflows/relay-deploy.yml`, `account-deploy.yml` | Deploy on merge: version vs health, live-event drain, keys, Discord | Tooling | Clean | Practice | Steps are wrangler/D1; the gates carry: version against `/health`, siege blackout, key match, migration retry, endpoint registration. | M | `.github/workflows/relay-deploy.yml` |
| `realm-restore.yml`, `realm-revive.yml`, `realm-rollback.yml`, `account-recovery.yml`, `guild-grant.yml`, `server-post.yml`, `sd-clears.yml` | Operator runbooks: point-in-time restore, revive, rollback, grants, post | Tooling | Clean | Practice | Hold service, bookmark present, rewind, export, put present back, re-insert; D1 Time Travel specific. | M | `.github/workflows/realm-restore.yml` |
| `d1-load.yml`, `relay-load.yml`, `do-active.yml` | Load and cost readers: D1 statements, relay metrics, DO awake time | Tooling | Clean | Practice | Read Analytics Engine and Cloudflare GraphQL; the questions carry. | S | `.github/workflows/do-active.yml` |
| `deploy.yml` | Site build and GitHub Pages deploy with a preview | Tooling | Clean | Practice | Pages-specific; the size guard and preview path carry. | S | `.github/workflows/deploy.yml` |
| `release-desktop.yml`, `release-notes.yml` | Tagged desktop installers, changed-files game update, release notes | Tooling | Clean | Practice | Draft then publish whole; update ships changed files; no ARENA2 in the bundle. | M | `.github/workflows/release-desktop.yml` |
| `verify.yml`, `check.yml`, `test-times.yml`, `eg-sweep.yml`, `ste-notes.yml`, `intro-quality.yml`, `public-copy.yml` | CI: lint, types, 8 test shards, build, sweeps, STE notes | Tooling | Clean | Practice | The new repo has its own gates; carry sharded tests by recorded time and the STE notes check. | S | `.github/workflows/verify.yml` |
| `scripts/desktopRelease`, `buildTag`, `updateNumber`, `updateLine`, `firstVisitPins`, `noTopLevelAwait`, `openFileLimit`, `landingHtml`, `makeIcons`, `forgeWebp`, `artIndex`, `studioArtIndex` | Build and release scripts: version stamps, installers, landing page, icons | Tooling | Clean | TS port | No game data. | M | `scripts/desktopRelease.mjs` |
| `scripts/steNotes.mjs`, `leanBundle.mjs` | STE patch-notes checker; bundle author-name scrub | Tooling | Clean | Practice | `steNotes` carries as-is; `leanBundle` enforces a DFU/mod credit rule. | S | `scripts/steNotes.mjs` |
| `scripts/bakeBooks.mjs`, `bakeSettings.mjs`, `bakeSettingsText.mjs` | Bake DFU's MIT books, settings defaults, settings text | Tooling | Can't | — | Exist to import Daggerfall Unity vendor data. | — | `scripts/bakeBooks.mjs` |
| `scripts/bakeWindmill.mjs`, `bakeWindmillInterior.mjs` | Bake the windmills mod's rotor and farm interior | Content | Can't | — | Port of a mod's geometry, from its vendor folder; the windmills stay; we design our own ([[Which Made-for-DFO Mods Come Over]]). | — | `scripts/bakeWindmill.mjs` |

## Unmerged work in this area

**`infra-to-server`** (630 non-merge commits off main, 734 with merges; none on the tip; base 2026-11-02, last
2026-11-13; 1,545 files, +165k lines, of which `game-server/` +14.2k, `infra/` +4.3k, `server/` +4.6k,
`server-account/` +2.3k, `src/net/` +8.7k, `tools/` +27.8k with cheat and load bots). What it adds:

- **A game server** (`game-server/src/`, plain Node, `ws`, worker-thread room pool, 20 Hz tick from `src/sim/index.js`
  `SIM_TICK_HZ`). It runs a dungeon's foes, rolls every melee blow both ways, flies arrows and spell missiles, owns
  room loot and rest encounters, counts a seat's health, and shadows movement by replaying the client's `PlayerMotor`
  inputs (`shadow.js`, `src/net/gsWire.js`: batches every 50 ms, at most 64 frames, dt at most 0.25 s). It builds each
  level itself from ARENA2 (`levels.js`) and derives the room key again from its own build.
- **A character home** (`server/src/characterHome.js`, 3,055 lines): one Durable Object per realm character. It checks
  the character out of the account service's new **vault** (`server-account/src/vault.js`) with the player's token,
  holds the save in memory, and commits in groups: gold, items and level within seconds, the rest within minutes,
  under lease, epoch and seq. Bank, loans, deeds, decor, station fees, journeys and the ship move under it.
- **Field ownership** (`src/net/realm/saveOwners.js`): each save field is `client`, `server` or `page`; the `page`
  list only shrinks (`tools/serverFieldsBaseline.json`). Server fields move only by the act judge
  (`game-server/src/actJudge.js`, loopback, key-gated, own threads) or the home's rule.
- **Signed hand-offs**: loot grants signed with `GS_GRANT_KEY`, audience-bound, queued with a disk log and retried
  (`grantFeed.js`); the relay vouches each seat's relay id to the game server with `GS_PASS_KEY`.
- **Hosting off Cloudflare** (`infra/`, `bible/11-Multiplayer/Hosting.md`): the relay as N `workerd` processes, a
  room owned by `id-hash mod N`, one SQLite file per room; the account service as plain Node over one SQLite file with
  WAL and supervisor-fired crons; Caddy, WireGuard, systemd. Measured: 2,000 bots cost the game server ~4 cores, 800
  cost the relay ~3, the account service peaked at 0.3 core at 1,300.
- **Adversarial testing**: `tools/gsCheatBots.mjs` and `tools/lib/gsCheatScenarios.mjs` attack level, stats, health
  and movement on the beta; `tools/loadFleet.mjs` runs honest fighters that measure combat feel.

Verdict: **Cut as design, Can't as code.** The architecture is the closest DFO came to the new game's server and is
the best specification for the Rust rebuild. The rule code is not: `game-server/src/foes.js` steps the client's
Daggerfall `EnemyAI`/`EnemyAttack`, `combat/formulas.js` and `TextureFile`; `mods.js` installs Daggerfall Enemy
Expansion and Meaner Monsters; `levels.js` reads `MapsFile`/`BlocksFile`/`Arch3dFile`; `src/net/realm/stockClassTable.js`
is generated from `CLASS*.CFG`. Lands as: Rust rebuild (server, home, vault, judge), Practice (rollout and cheat bots).

Design lessons it proves:
1. **One rules library both sides run.** The game server imports the client's own modules, so "index i names the same
   foe on every machine". In Rust + TS that becomes one Rust rules crate the client reaches by WASM, or two
   implementations held together by parity tests.
2. **Roll out authority behind switches and modes**: `GS_FOES`, `enforce`, vitals `measure`/`enforce`, `ownMode`
   `page`/`measure`, `moves=on`. Each runs in shadow and logs disagreement before it corrects anything.
3. **Movement by input replay, not by position**: start each batch from the last accepted place; a body that only
   took another way counts for nothing; batches the server cannot replay are held to speed, walls and jump bounds.
4. **The server owns geometry**: it builds the level and checks the room key against its build. Pure authority
   needs the world's data on the server box.
5. **An actor per character with group commit** (lease, epoch, seq, many characters per transaction) cut the
   account requests that dominated load; checkpoints were only ~4 a second at 1,300 players.
6. **Costs**: it never merged in 12 days; it mixes rendering and performance commits; it made a new 3k-line host;
   the relay version moved world308 to world330, and each relay change drops every player.

**The long tail** (none on the tip):

- **Staff and moderation**: `staff-toybox-fold` (38), `staff-mod-tp` (17), `claude-watch-on` (16),
  `staff-phone-reports` (8), `feature/toybox-guard-rails` (7), `claude-staff-fold` (6), `staff-pull` (5),
  `staff-claude`, `staff-mute-history`, `feat/staff-panel-search` (4 each), `staff-noclip`, `econ-banned-out` (3),
  `staff-ban-lifted`, `staff-chat-find-follow`, `sp-speed-profile`, `claude-staff-check` (2), `moderator-title`,
  `claude-staff-on`, `ccr-de31c006-v4f3dc` (1). Moderator powers and `/tp` (relay world306), a Mutes tab, lifted bans,
  inventory search by affix, a staff phone page with a Risk tab, the Claude staff assistant switched on, toybox
  event limits, an Aurum refund. Clean tooling, Rust rebuild + TS port; Cut where it reads item affixes.
- **Market**: `feat/market-buy-part-of-stack` (28), `feat/market-easier-search` (12), `fix/market-search-metal`,
  `feat/vendor-items-on-market` (3), `trade-chat-for-everyone` (2). Part-stack buys, affix search, a 5-minute read
  cache, vendor goods listed. Cut (Daggerfall affixes and items).
- **Launcher and private servers**: `ccr-39b987b4-txy6xh` (5, launcher redesign), `local-hosting` (4, a 2 to 10
  player server on the player's PC), `launcher-fold` (4), `private-installer`, `hosting-pin` (2),
  `browser-private`, `launcher-offline`, `launcher-tech-notes`, `fix-host-pack-cache` (1). Clean; TS port and
  Practice.
- **Database and load ops**: `ccr-f986e558-o7hoku` (5, D1 write audit), `ops/load-summary-to-log` (4), `fix/d1-load`,
  `d1-load-readable`, `ccr-160d2f36-cph5qg` (3, sleeping cells keep grant asks), `dev-signup-codes` (4),
  `ccr-1587f0b0-43nv67`, `claude/cloudflare-account-service-8plxjv`, `fix/address-rate-short-name`, `arena-copy`,
  `ember-post` (1). Mostly D1/Cloudflare tuning: Practice. Sign-up codes and plain refusal text are Clean.
- **Release, deploy, licence**: `ccr-255d9f14-uphsqf` (10, release-flow audit), `preview-next-deploy`,
  `preview-size-guard`, `preview-guard-fix`, `ccr-7360d3c9-9wtg9s` (AGPL relicense), `ccr-8d83a993-qxxpay` (public
  history-free copy), `claude/release-version-gate`. Practice.

## Notes

- **Authority today.** Rooms are client-hosted: the longest-connected socket simulates the foes and publishes a
  `world` snapshot the relay stores unread; `foes` and `act` frames are fanned, and outside refereed rooms "a client's
  blow is applied as sent" (`bible/11-Multiplayer/Multiplayer.md`). The relay referees only duels, sieges, the open
  zone, the sea, boss bodies and card tables. The realm save is a client-written blob under a lease
  (`server-account/src/realm.js` quotes "almost all of the game is client authoritative"), judged by item law,
  ledger and wealth budget. Pure authority also needs a server simulation, server geometry, input-replay movement and
  field ownership. `infra-to-server` prototyped all four.
- **The wire** (`src/net/wire.js`, 7,846 lines, 1,131 exports, over 50 frame types): JSON text frames, symmetric
  validators, per-type rate buckets, frame/socket caps, id plus secret on reconnect, `RELAY_VERSION` with
  `*_RELAY_MIN` feature gates, and a batched second wire (`w2`, `slimPose`). It is Daggerfall-shaped in its room keys
  (`world:<cx>,<cy>` over 16 map pixels, `dungeon:m<mapId>`, `interior:m<mapId>.<buildingKey>`, sea-vault map ids),
  pose units (MapsFile 2.5 cm), ordinals (DFU WeaponStates, TargetTypes, TransportModes, 27 equip slots), the look
  (race, gender, face, paperdoll items), the 71 region channels, `GROUND_LAW` and the classic clock
  (`sharedClassicMinutes`: 3E405 epoch at DFU's time scale).
- **Generic MMO infrastructure worth the most**: cell quadtree with dwell split/merge and row handover; a 16-shard hub
  with one bus (poll, batch, periodic resync); overflow layers at 256 sockets; halo thinning and lone sleep; a foes
  byte budget with held first frames; a sign-in admission line; reconnect waves spread; a busy gate (503 plus
  `Retry-After`, client doubling backoff); replica reads with bookmarks; one heartbeat for many polls.
- **The trust chain is the best Clean piece**: an Ed25519 `v1.` token with no algorithm field; account-signed orders
  (mute, ban, guild, home) the relay believes by signature whoever carries them; relay-minted receipts the account
  service redeems once; a five-minute session pass on hot routes. In Rust this is a small, well-tested crate.
- **Hardest seam: place identity.** MAPS.BSA mapId, RMB building key and the map pixel key rooms, homes, halls, yards,
  decor, raids and 64 migrations. The new world's place ids must replace them in the wire, the relay and the schema
  together.
- **Hardest seam: the item model.** The account service's judge, ledger, market and staff routes import
  `systems/item/itemLaw.js`, `itemTemplatesData.js`, `enchantmentCatalogue.js` and `characters/weapons.js`; referees
  copy DFU damage tables. Every economy route needs the new game's item model first.
- **"Law both ends run" splits in two.** About 130k lines in `src/net` are pure JS imported by the page, the relay
  (93 modules imported directly) and the account service (121). The account service is a thin store over those laws. A Rust
  server and a TS client means a second implementation of each, or a Rust crate compiled to WASM for the client.
- **Cloudflare mechanics that do not carry**: Durable Object hibernation, alarms and storage (354 storage calls in the `Room` file alone,
  `server/src/index.js`), D1 replicas, bookmarks and Time Travel, Analytics Engine, cron triggers, workers.dev URLs, and code
  that exists to cut DO billing (`drainWindows.js`, lone sleep, `REGION_SHARDS` off). `infra-to-server` already ran
  the same relay and account code off Cloudflare.
- **Misfiled**: `src/net/raid/` is our ledger over a mod port (Raiding Parties: the key and a `UnityEngine.Random`
  roll pinned to the mod, a towns table the client hands in by SHA because the relay may not hold ARENA2 data);
  `net/arena`'s colosseum is mod data, which comes over rebuilt in our formats; `patronLaw` prices through Roleplay Realism Items; `peer/peerBodies`
  imports Morrowind readers; guest names come from Daggerfall's name banks. Looks Daggerfall but ours:
  `gate/gateBrain.js` is the generic boss kernel under lore names, and `invasion/` and `delve/` are Clean.
- **Port from tests and the bible, not the comments.** The `Room` class is ~12k lines in one file; `wire.js` is
  1.38 MB with 3,696 comment lines and a `RELAY_VERSION` line that is a changelog. The new repo's 600-line and
  8-line-comment checks force a split. The behaviour is pinned by `test/net` (527 files) and `test/server` (202).

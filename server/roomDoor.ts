/** A block of a room's course: its footprint (x east, y south, metres), its top and its underside. */
export interface CourseBlock {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
  readonly bottom: number;
}

/** A resource node on a course: where it stands, and its island's resource by its place in the gear's list. */
export interface CourseNode {
  readonly x: number;
  readonly y: number;
  readonly resource: number;
}

/** What became of a player's input: the room took it, or why not. At sea, `too soon` is a second course in one tick,
 *  and `refused` a course the sea's law will not sail: across land, at a pace off the steps, or too long. */
export type InputAnswer = 'taken' | 'not an input' | 'out of order' | 'no such player' | 'too soon' | 'refused';

/** By the door's numbers (room-wasm's TAKEN, NOT_AN_INPUT, OUT_OF_ORDER, NO_SUCH_PLAYER, TOO_SOON, REFUSED). */
const ANSWERS: readonly InputAnswer[] = [
  'taken',
  'not an input',
  'out of order',
  'no such player',
  'too soon',
  'refused',
];

/** One room, running in the `room-wasm` module: the room crate and its messages. */
export interface RoomDoor {
  /** How long one tick is, in seconds: the room is ticked that often. */
  readonly tickSeconds: number;
  /** Opens the room on a course, its players standing at the spawn when they join; false if the course is not one.
   *  A course laid `overSea` has no ground to walk under it: its foes walk its blocks alone. */
  open(spawn: { readonly x: number; readonly y: number }, blocks: readonly CourseBlock[], overSea?: boolean): boolean;
  /** Opens a node's room from its file's text, as the bake writes it; false if the text is not a node. */
  openNode(nodeText: string): boolean;
  /** Opens the room of a patrol's dungeon by its number (0 to 2), from the patrol's node file's text; false if the
   *  text is not a patrol's or it has no such dungeon. */
  openDungeon(nodeText: string, dungeon: number): boolean;
  /** Opens a dungeon's run from its ask (JSON: its dungeon, its tier 0 to 2 and the Unix minute it opens, as
   *  crates/room-wasm/src/run_door.rs reads it), and a patrol's dungeon's from its patrol's node file's text, whose lock
   *  it keeps; false for an ask that does not read, a dungeon no rule lays, or a patrol's without its file. */
  openRun(ask: string, patrolText?: string): boolean;
  /** What is on at a Unix minute, as JSON: the day's and the week's numbers, the minutes to the next of each, each
   *  island's dungeon of the day, the day's modifier, the week's two with their modifiers and levels, each island's
   *  band at each tier, the revives, and each modifier's name and words. */
  activities(minute: number): string;
  /** Why each place is shut to a character of `level`, past the prologue or not, as JSON (each reason, or null where
   *  it is open): the dungeon of the day and the seas at each tier, an Elite Dungeon, and the week's two. */
  gates(level: number, prologue: boolean): string;
  /** Opens a captain's deck as a room alone, as the sea holds one boarded: its hull's number, its faction, its rank
   *  (1 Minor to 5 Boss) and level; false if the hull or the rank is not one. */
  openDeck(hull: number, faction: number, rank: number, level: number): boolean;
  /** Opens the sea round the continents of a layout file's text, its hostile ships' chances drawn from `seed`, its clock
   *  started at `worldStartS` (seconds since the Unix epoch, which sets its fights' weather); false if the text is not
   *  a layout. */
  openSea(layoutText: string, seed: number, worldStartS?: number): boolean;
  /** Opens a fleet room on the open sea. */
  openFleet(worldStartS?: number): boolean;
  /** Opens a sea island's room on the sea's word on it (`seaIsland`); false if the word makes no island. */
  openIsland(word: string): boolean;
  /** The open sea's word on its island by its number, as JSON: empty if it does not stand. */
  seaIsland(id: number): string;
  /** The open sea's word on the standing island whose door leads into a dungeon's room (its name at Normal), as
   *  `seaIsland` gives it: empty if no island the sea holds has that door. */
  seaDungeon(room: string): string;
  /** Holds the open sea's island by its number and seed while players stand ashore: whether it stands. */
  holdAshore(id: number, seed: string): boolean;
  /** The number of the open sea's landing of an account on its island of that number and seed (its ship at rest at
   *  the island's anchorage when last at sea), or 0 if it is not landed there. */
  seaLanded(id: number, seed: string, account: string): number;
  /** Turns on the open island room's check of landings: only the accounts `land` names scavenge and gather. Whether
   *  it is one. */
  checkLandings(): boolean;
  /** Lands an account on the open island room, on its sea's word, by its landing's number (a new number, a new
   *  visit): whether it is an island's room. */
  land(account: string, landing: number): boolean;
  /** An island's plan as JSON in its own frame, and its ground's numbers as `movement::Heights` gives them with its
   *  middle at `at` in the world, from its seed (a decimal string) and climate: both empty for a climate the islands'
   *  contract does not dress. */
  islePlan(seed: string, climate: string): string;
  isleHeights(seed: string, climate: string, at: readonly [number, number]): Float64Array;
  /** Lets the open room take players' asks for foes, as a course's room does: a node's room takes none until told.
   *  Only a page playing alone tells it; a server never does. */
  takeFoeAsks(): void;
  /** Plays the prologue's wreck: no Art until the Storm is given, the player waking hurt in the story's steel with no
   *  weapon, and every boarder on one side (`Room::story_wreck`). */
  storyWreck(): void;
  /** A new player's number, or 0 when the room is full or its node locked. */
  join(): number;
  /** A new player's number, standing before the door of the open patrol's entrance numbered `entrance`, facing away
   *  from it; 0 when the room is no patrol, has no such entrance, is full or its node locked. */
  joinAt(entrance: number): number;
  /** Stands a player who joined before an entrance at the room's next spawn instead, as an ordinary join. */
  standAtSpawn(player: number): boolean;
  /** Why the room takes no player, a locked node's words; null for a room that takes them. */
  refusal(): string | null;
  /** The welcome's bytes for a player. */
  joined(player: number): Uint8Array;
  leave(player: number): void;
  /** Opens every public event's chest lying for a player about to leave, before their character is kept. */
  parting(player: number): void;
  /** A player's input on land; at sea their ship's course or orders, a step of their walk on deck or the helm; or
   *  their ship's orders in a fleet. */
  input(player: number, bytes: Uint8Array): InputAnswer;
  tick(): void;
  /** A player's snapshot after the last tick, as its bytes (`snapshotPrepare`, then `snapshotFor`). */
  snapshot(player: number): Uint8Array;
  /** Takes the snapshot after the last tick, for `snapshotFor` to cut each player's from. */
  snapshotPrepare(): void;
  /** The prepared snapshot as one player is sent it: on land what changed since the one their screen last showed;
   *  at sea every ship near them and only what is theirs of the sea's own part; in a fleet every ship, its balls and
   *  what happened. */
  snapshotFor(player: number): Uint8Array;
  /** Lays out a course's stall, where a social space's asks are answered, and its resource nodes; false with no
   *  course open. */
  furnish(stall: { readonly x: number; readonly y: number } | null, nodes: readonly CourseNode[]): boolean;
  /** A player's own gear's bytes, to send them alone; empty when it has not changed since last asked. */
  gear(player: number): Uint8Array;
  /** Sets a node's room's difficulty, as its voyage set out, or the sea's tier: 0 Normal, 1 Elite, 2 Abyss; false in a
   *  fleet. */
  difficulty(seas: number): boolean;
  /** Sets the minute, counted from the epoch, whose day (`gear::clock`) sets its vendors' wares and whose week sets
   *  Shape, or the sea's; false in a fleet. */
  minute(minute: number): boolean;
  /** Sets the wall's time at the room's first tick, milliseconds since 1970: its world time, and its welcome's. */
  epoch(unixMs: number): void;
  /** Draws a room's chances from seeds the host keeps secret, each as two halves: a room on land's loot, and apart
   *  from it its foes and camps, or the sea's flotsam and boarded decks; false in a fleet. */
  reseed(seeds: readonly [number, number, number, number]): boolean;
  /** Sends what still lies for a player to their mail, at sea from the deck they stand on: called as they leave,
   *  before their character is read for its last save. */
  mailLying(player: number): void;
  /** A player's character as it is kept between sessions (JSON), at sea with their ship's hurts (a new one until the
   *  accounts gave theirs); null in a fleet or for no such player. */
  character(player: number): string | null;
  /** A new character wearing a plain sword and armour (JSON): what scripted players start from. */
  kitted(): string;
  /** Gives a player the character kept for them; false if the text is not one, they are not in, or the gate shuts. */
  restoreCharacter(player: number, kept: string): boolean;
  /** Why the open room's gate shuts to a player's kept character (JSON), or to a new one (null), in its words, with
   *  the story they already hold in the room carried forward, or at sea the sea's tier; empty when it may enter, in a
   *  fleet, or for no character. */
  shut(player: number, kept: string | null): string;
  /** Notes the account that keeps a player's character, so what they gathered this turn follows a rejoin. */
  own(player: number, account: string): boolean;
  /** Names a player by their account's username, for the plate others read over their head; false on no land. */
  name(player: number, name: string): boolean;
  /** Gives a player their guild's tag for their plate, or takes it with none (''); false on no land. */
  tag(player: number, tag: string): boolean;
  /** Tells the room a player's guild as the accounts tell it (`guildWeeks.ts` `guildTold`), as text; '' for none. */
  guild(player: number, told: string): boolean;
  /** At sea, the name of the water a player's ship lies in; null off the sea or before it puts to sea. */
  water(player: number): string | null;
  /** Holds a player's inputs, or lets them play: held, each is taken in its order and played as standing still. */
  hold(player: number, held: boolean): boolean;
  /** The open sea keeps characters from now on: a player's courses wait for the keeper's word on theirs (a character
   *  given back, or `noneKept`), so a ship comes back where the room last kept it; false if no sea is open. */
  keepCharacters(): boolean;
  /** The keeper has no character to give a player at sea (none kept, or the page plays unkept): the course held for
   *  them sails. */
  noneKept(player: number): void;
  /** The Sloop's build as the naval rules hold it, as JSON: its name, hull and canvas whole, crew, guns on each side,
   *  and the loads its guns take. */
  sloop(): string;
  /** Every foe type the rules know (the Brig's crew among them, on the players' side), as JSON, in their order: each
   *  one's number (`type`), name, faction (`faction` and `faction_name`), domain (land or deck), role (`role` and
   *  `role_name`), ranks (their numbers, the plainest first), and its right and left forge layers. */
  roster(): string;
  /** A patrol's dungeon by its patrol's id and name and its number, as JSON (crates/room-wasm/src/dungeon_door.rs),
   *  or "null" for an ask that does not read. */
  dungeon(patrol: string, name: string, number: number): string;
  /** A dungeon by any ask `room_dungeon` reads (a patrol's, an Elite Dungeon's place, or a seed and a style), as JSON;
   *  "null" for one that does not read. */
  layout(ask: string): string;
  /** The port cities' ids, as JSON: every other city is a ruin. */
  mainPorts(): string;
  /** A page playing a course alone, never a server: stands a foe of the roster (its `type`, `rank` and `level` as the
   *  roster numbers them) on the top of the block under (x, y), facing `facing` (radians clockwise from north), its
   *  post there; a Boss stood so calls no one. Its number, or 0 when none stood. */
  standFoe(type: number, rank: number, x: number, y: number, facing: number, level: number): number;
  /** A page alone: sends every foe away at once; false with no room on land. */
  clearFoes(): boolean;
  /** A page alone: sets where the next respawn stands the player, a checkpoint; false with no room on land. */
  setSpawn(x: number, y: number): boolean;
  /** A page alone: stands a player at once on the top under (x, y), keeping their health; false for no such player. */
  putPlayer(player: number, x: number, y: number): boolean;
  /** The story's sword and shield or its bow, by the gear's kind number, taken from the deck into `player`'s pack,
   *  unworn (`Room::story_take`): whether it was given. */
  storyTake(player: number, kind: number): boolean;
  /** On the wreck, the wisp gives `player` the Storm, worn, earned and charged (`Room::story_storm`): whether it did. */
  storyStorm(player: number): boolean;
  /** On the wreck, sends a foe at a player, alert, as a foe called to a fight is sent; whether it was. */
  storyHunt(foe: number, player: number): boolean;
  /** On the wreck, moves one of the Brig's crew's post, where he walks and keeps; whether it was. */
  storyPost(crew: number, x: number, y: number, facing: number): boolean;
  /** A page alone: stands a block on the course at once, as a way closing; false with no room on land. */
  standBlock(block: CourseBlock): boolean;
  /** A page alone: takes a block from the course at once, as a way opening; false when the room holds no such block. */
  takeBlock(block: CourseBlock): boolean;
  /** Makes the open node's room a guild's outpost: its guild's key and its muster ground's middle; false off land. */
  outpost(key: string, muster: readonly [number, number]): boolean;
  /** The errands the outpost's players' asks hold for the host since it last took them (`outpostHost.ts`). */
  outpostErrands(): Errand[];
  /** The accounts' answer to an errand: how many they moved, used or gave, or the horn's answer (its tier, or 0, -1
   *  or -2 for why it did not sound); null when they could not be reached, and the errand is given back whole. False
   *  for no such errand. */
  outpostAnswered(id: number, answer: number | null): boolean;
  /** Says a player is leaving the outpost while their errands settle: their account joining again takes it over. */
  outpostParting(player: number): boolean;
  /** Says the host stood the outpost's plot anew, which the snapshot counts. */
  outpostStood(): boolean;
  /** Says where the plot's Delve Gate stands, as x east, y south and the way out from it (radians clockwise from
   *  north), or null for none: one out of the guild dungeon joins before it as entrance 0 (`joinAt`). */
  outpostGate(gate: readonly [number, number, number] | null): boolean;
}

/** An errand an outpost's room holds for its host, as `room-wasm`'s outpost door writes it. */
export interface Errand {
  readonly id: number;
  readonly player: number;
  readonly account: string;
  readonly kind: 'deposit' | 'deliver' | 'take' | 'horn' | 'changed';
  readonly amount?: number;
  readonly structure?: number;
  readonly stuff?: 'timber' | 'canvas' | 'iron' | 'heartwood' | 'island';
}

interface RoomExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  room_tick_seconds(): number;
  room_open(address: number, length: number): number;
  room_open_over_sea(address: number, length: number): number;
  room_open_node(address: number, length: number): number;
  room_open_dungeon(address: number, length: number, dungeon: number): number;
  room_open_run(address: number, length: number, patrolAddress: number, patrolLength: number): number;
  room_activities(minute: number): bigint;
  room_gates(level: number, prologue: number): bigint;
  room_open_deck(hull: number, faction: number, rank: number, level: number): number;
  room_open_sea(address: number, length: number, seed: number): number;
  room_open_fleet(): number;
  room_open_island(address: number, length: number): number;
  room_sea_island(id: number): bigint;
  room_sea_dungeon(address: number, length: number): bigint;
  room_hold_ashore(id: number, low: number, high: number): number;
  room_sea_landed(id: number, low: number, high: number, address: number, length: number): number;
  room_isle_check_landings(): number;
  room_isle_land(address: number, length: number, landing: number): number;
  room_isle_plan(low: number, high: number, address: number, length: number): bigint;
  room_isle_heights(low: number, high: number, x: number, y: number, address: number, length: number): bigint;
  room_world_start(seconds: number): void;
  room_take_foe_asks(): void;
  room_story_wreck(): void;
  room_join(): number;
  room_join_at(entrance: number): number;
  room_stand_at_spawn(player: number): number;
  room_refusal(): bigint;
  room_joined(player: number): bigint;
  room_leave(player: number): void;
  room_parting(player: number): void;
  room_input(player: number, address: number, length: number): number;
  room_tick(): void;
  room_snapshot_prepare(): void;
  room_snapshot_for(player: number): bigint;
  room_gear(player: number): bigint;
  room_character(player: number): bigint;
  room_kitted(): bigint;
  room_mail_lying(player: number): void;
  room_shut(player: number, address: number, length: number): bigint;
  room_difficulty(seas: number): number;
  room_minute(minute: number): number;
  room_epoch(unixMs: number): void;
  room_reseed(lootLow: number, lootHigh: number, worldLow: number, worldHigh: number): number;
  room_restore_character(player: number, address: number, length: number): number;
  room_own(player: number, address: number, length: number): number;
  room_name(player: number, address: number, length: number): number;
  room_tag(player: number, address: number, length: number): number;
  room_guild(player: number, address: number, length: number): number;
  room_water(player: number): bigint;
  room_hold(player: number, held: number): number;
  room_keep_characters(): number;
  room_none_kept(player: number): void;
  room_furnish(address: number, length: number): number;
  room_sloop(): bigint;
  room_roster(): bigint;
  room_dungeon(address: number, length: number): bigint;
  room_main_ports(): bigint;
  room_stand_foe(type: number, rank: number, x: number, y: number, facing: number, level: number): number;
  room_clear_foes(): number;
  room_set_spawn(x: number, y: number): number;
  room_put_player(player: number, x: number, y: number): number;
  room_story_take(player: number, kind: number): number;
  room_story_storm(player: number): number;
  room_story_hunt(foe: number, player: number): number;
  room_story_post(crew: number, x: number, y: number, facing: number): number;
  room_stand_block(minX: number, minY: number, maxX: number, maxY: number, top: number, bottom: number): number;
  room_take_block(minX: number, minY: number, maxX: number, maxY: number, top: number, bottom: number): number;
  room_outpost(address: number, length: number): number;
  room_outpost_errands(): bigint;
  room_outpost_answered(id: number, answer: number): number;
  room_outpost_stood(): number;
  room_outpost_parting(player: number): number;
  room_outpost_gate(x: number, y: number, facing: number): number;
}

/** A seed's low and high 32 bits, from its decimal string. */
function halves(seed: string): [number, number] {
  const whole = BigInt.asUintN(64, BigInt(seed));
  return [Number(whole & 0xffff_ffffn), Number(whole >> 32n)];
}

/** Starts a room from the compiled `room-wasm` module. Each call is a room of its own. */
export function startRoomDoor(module: WebAssembly.Module): RoomDoor {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as RoomExports;
  /** Copies bytes into the module, runs `use` on where they are, and gives the memory back. */
  const lend = <T>(bytes: Uint8Array, use: (address: number) => T): T => {
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return use(address);
    } finally {
      exports.release(address, bytes.length);
    }
  };
  /** Takes bytes the module handed over (its address and length packed in one number) and gives the memory back. */
  const take = (packed: bigint): Uint8Array => {
    const [address, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
    const bytes = new Uint8Array(exports.memory.buffer, address, length).slice();
    exports.release(address, length);
    return bytes;
  };
  const openWithAnswer = (entry: (address: number, length: number) => bigint, text: string): bigint => {
    const bytes = new TextEncoder().encode(text);
    return lend(bytes, (address) => entry(address, bytes.length));
  };
  const openWith = (entry: (address: number, length: number) => number, text: string): boolean => {
    const bytes = new TextEncoder().encode(text);
    return lend(bytes, (address) => entry(address, bytes.length)) === 1;
  };
  return {
    tickSeconds: exports.room_tick_seconds(),
    open: (spawn, blocks, overSea = false) => {
      const numbers = [
        spawn.x,
        spawn.y,
        ...blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top, block.bottom]),
      ];
      const bytes = new Uint8Array(new Float64Array(numbers).buffer);
      const entry = overSea ? exports.room_open_over_sea : exports.room_open;
      return lend(bytes, (address) => entry(address, bytes.length)) === 1;
    },
    openNode: (nodeText) => openWith(exports.room_open_node, nodeText),
    openDungeon: (nodeText, dungeon) =>
      openWith((address, length) => exports.room_open_dungeon(address, length, dungeon >>> 0), nodeText),
    openRun: (ask, patrolText = '') => {
      const patrol = new TextEncoder().encode(patrolText);
      const opens = (address: number, length: number) =>
        lend(patrol, (patrolAt) => exports.room_open_run(address, length, patrolAt, patrol.length));
      return openWith(opens, ask);
    },
    activities: (minute) => new TextDecoder().decode(take(exports.room_activities(minute >>> 0))),
    gates: (level, prologue) => new TextDecoder().decode(take(exports.room_gates(level >>> 0, prologue ? 1 : 0))),
    openDeck: (hull, faction, rank, level) => exports.room_open_deck(hull, faction, rank, level) === 1,
    openSea: (layoutText, seed, worldStartS = 0) => {
      const opened = openWith((address, length) => exports.room_open_sea(address, length, seed >>> 0), layoutText);
      exports.room_world_start(worldStartS);
      return opened;
    },
    openFleet: (worldStartS = 0) => {
      const opened = exports.room_open_fleet() === 1;
      exports.room_world_start(worldStartS);
      return opened;
    },
    openIsland: (word) => openWith(exports.room_open_island, word),
    seaIsland: (id) => new TextDecoder().decode(take(exports.room_sea_island(id >>> 0))),
    seaDungeon: (room) => new TextDecoder().decode(take(openWithAnswer(exports.room_sea_dungeon, room))),
    holdAshore: (id, seed) => exports.room_hold_ashore(id >>> 0, ...halves(seed)) === 1,
    seaLanded: (id, seed, account) => {
      const bytes = new TextEncoder().encode(account);
      return lend(bytes, (address) => exports.room_sea_landed(id >>> 0, ...halves(seed), address, bytes.length));
    },
    checkLandings: () => exports.room_isle_check_landings() === 1,
    land: (account, landing) =>
      openWith((address, length) => exports.room_isle_land(address, length, landing >>> 0), account),
    islePlan: (seed, climate) =>
      new TextDecoder().decode(
        take(
          openWithAnswer((address, length) => {
            const [low, high] = halves(seed);
            return exports.room_isle_plan(low, high, address, length);
          }, climate),
        ),
      ),
    isleHeights: (seed, climate, [x, y]) => {
      const bytes = take(
        openWithAnswer((address, length) => {
          const [low, high] = halves(seed);
          return exports.room_isle_heights(low, high, x, y, address, length);
        }, climate),
      );
      return new Float64Array(bytes.buffer, bytes.byteOffset, bytes.length / 8);
    },
    takeFoeAsks: () => exports.room_take_foe_asks(),
    storyWreck: () => exports.room_story_wreck(),
    join: () => exports.room_join(),
    joinAt: (entrance) => exports.room_join_at(entrance >>> 0),
    standAtSpawn: (player) => exports.room_stand_at_spawn(player) === 1,
    refusal: () => new TextDecoder().decode(take(exports.room_refusal())) || null,
    joined: (player) => take(exports.room_joined(player)),
    leave: (player) => exports.room_leave(player),
    parting: (player) => exports.room_parting(player),
    input: (player, bytes) =>
      ANSWERS[lend(bytes, (address) => exports.room_input(player, address, bytes.length))] ?? 'not an input',
    tick: () => exports.room_tick(),
    snapshot: (player) => {
      exports.room_snapshot_prepare();
      return take(exports.room_snapshot_for(player));
    },
    snapshotPrepare: () => exports.room_snapshot_prepare(),
    snapshotFor: (player) => take(exports.room_snapshot_for(player)),
    furnish: (stall, nodes) => {
      const numbers = [
        stall?.x ?? Number.NaN,
        stall?.y ?? Number.NaN,
        ...nodes.flatMap((node) => [node.x, node.y, node.resource]),
      ];
      const bytes = new Uint8Array(new Float64Array(numbers).buffer);
      return lend(bytes, (address) => exports.room_furnish(address, bytes.length)) === 1;
    },
    gear: (player) => take(exports.room_gear(player)),
    difficulty: (seas) => exports.room_difficulty(seas) === 1,
    minute: (minute) => exports.room_minute(minute) === 1,
    epoch: (unixMs) => exports.room_epoch(unixMs),
    reseed: ([lootLow, lootHigh, worldLow, worldHigh]) =>
      exports.room_reseed(lootLow, lootHigh, worldLow, worldHigh) === 1,
    mailLying: (player) => exports.room_mail_lying(player),
    character: (player) => {
      const bytes = take(exports.room_character(player));
      return bytes.length === 0 ? null : new TextDecoder().decode(bytes);
    },
    kitted: () => new TextDecoder().decode(take(exports.room_kitted())),
    restoreCharacter: (player, kept) =>
      openWith((address, length) => exports.room_restore_character(player, address, length), kept),
    own: (player, account) => openWith((address, length) => exports.room_own(player, address, length), account),
    name: (player, name) => openWith((address, length) => exports.room_name(player, address, length), name),
    tag: (player, tag) => openWith((address, length) => exports.room_tag(player, address, length), tag),
    guild: (player, told) => openWith((address, length) => exports.room_guild(player, address, length), told),
    water: (player) => {
      const bytes = take(exports.room_water(player));
      return bytes.length === 0 ? null : new TextDecoder().decode(bytes);
    },
    hold: (player, held) => exports.room_hold(player, held ? 1 : 0) === 1,
    shut: (player, kept) => {
      const bytes = new TextEncoder().encode(kept ?? '');
      return new TextDecoder().decode(take(lend(bytes, (address) => exports.room_shut(player, address, bytes.length))));
    },
    keepCharacters: () => exports.room_keep_characters() === 1,
    noneKept: (player) => exports.room_none_kept(player),
    sloop: () => new TextDecoder().decode(take(exports.room_sloop())),
    roster: () => new TextDecoder().decode(take(exports.room_roster())),
    dungeon: (patrol, name, number) => {
      const bytes = new TextEncoder().encode(JSON.stringify({ patrol, name, number }));
      return new TextDecoder().decode(take(lend(bytes, (address) => exports.room_dungeon(address, bytes.length))));
    },
    layout: (ask) => {
      const bytes = new TextEncoder().encode(ask);
      return new TextDecoder().decode(take(lend(bytes, (address) => exports.room_dungeon(address, bytes.length))));
    },
    mainPorts: () => new TextDecoder().decode(take(exports.room_main_ports())),
    standFoe: (type, rank, x, y, facing, level) => exports.room_stand_foe(type, rank, x, y, facing, level),
    clearFoes: () => exports.room_clear_foes() === 1,
    setSpawn: (x, y) => exports.room_set_spawn(x, y) === 1,
    putPlayer: (player, x, y) => exports.room_put_player(player, x, y) === 1,
    storyTake: (player, kind) => exports.room_story_take(player, kind) === 1,
    storyStorm: (player) => exports.room_story_storm(player) === 1,
    storyHunt: (foe, player) => exports.room_story_hunt(foe, player) === 1,
    storyPost: (crew, x, y, facing) => exports.room_story_post(crew, x, y, facing) === 1,
    standBlock: ({ minX, minY, maxX, maxY, top, bottom }) =>
      exports.room_stand_block(minX, minY, maxX, maxY, top, bottom) === 1,
    takeBlock: ({ minX, minY, maxX, maxY, top, bottom }) =>
      exports.room_take_block(minX, minY, maxX, maxY, top, bottom) === 1,
    outpost: (key, muster) => openWith(exports.room_outpost, JSON.stringify({ key, muster })),
    outpostErrands: () => JSON.parse(new TextDecoder().decode(take(exports.room_outpost_errands()))) as Errand[],
    outpostAnswered: (id, answer) =>
      exports.room_outpost_answered(
        id >>> 0,
        answer === null ? -0x8000_0000 : Math.max(-0x7fff_ffff, Math.min(answer, 0x7fff_ffff)),
      ) === 1,
    outpostStood: () => exports.room_outpost_stood() === 1,
    outpostParting: (player) => exports.room_outpost_parting(player) === 1,
    outpostGate: (gate) => exports.room_outpost_gate(...(gate ?? [Number.NaN, 0, 0])) === 1,
  };
}

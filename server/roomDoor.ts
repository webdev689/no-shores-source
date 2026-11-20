/** A block of a room's course: its footprint (x east, y south, metres) and its top. */
export interface CourseBlock {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
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
  /** Opens the room on a course, its players standing at the spawn when they join; false if the course is not one. */
  open(spawn: { readonly x: number; readonly y: number }, blocks: readonly CourseBlock[]): boolean;
  /** Opens a node's room from its file's text, as the bake writes it; false if the text is not a node. */
  openNode(nodeText: string): boolean;
  /** Opens a captain's deck as a room alone, as the sea holds one boarded: its hull's number, its faction, its rank
   *  (1 Minor to 5 Boss) and level; false if the hull or the rank is not one. */
  openDeck(hull: number, faction: number, rank: number, level: number): boolean;
  /** Opens the sea round the continents of a layout file's text, its pirates' chances drawn from `seed`, its clock
   *  started at `worldStartS` (seconds since the Unix epoch, which sets its fights' weather); false if the text is not
   *  a layout. */
  openSea(layoutText: string, seed: number, worldStartS?: number): boolean;
  /** Opens a fleet room on the open sea. */
  openFleet(worldStartS?: number): boolean;
  /** Opens a sea island's room on the sea's word on it (`seaIsland`); false if the word makes no island. */
  openIsland(word: string): boolean;
  /** The open sea's word on its island by its number, as JSON: empty if it does not stand. */
  seaIsland(id: number): string;
  /** Holds the open sea's island by its number and seed while players stand ashore: whether it stands. */
  holdAshore(id: number, seed: string): boolean;
  /** An island's plan as JSON in its own frame, and its ground's numbers as `movement::Heights` gives them with its
   *  middle at `at` in the world, from its seed (a decimal string) and climate: both empty for a climate the islands'
   *  contract does not dress. */
  islePlan(seed: string, climate: string): string;
  isleHeights(seed: string, climate: string, at: readonly [number, number]): Float64Array;
  /** Lets the open room take players' asks for foes, as a course's room does: a node's room takes none until told.
   *  Only a page playing alone tells it; a server never does. */
  takeFoeAsks(): void;
  /** A new player's number, or 0 when the room is full. */
  join(): number;
  /** The welcome's bytes for a player. */
  joined(player: number): Uint8Array;
  leave(player: number): void;
  /** A player's input on land; at sea their ship's course or orders, a step of their walk on deck or the helm; or
   *  their ship's orders in a fleet. */
  input(player: number, bytes: Uint8Array): InputAnswer;
  tick(): void;
  /** Every player, or every ship (with a fleet's balls and what happened), after the last tick, as a snapshot's
   *  bytes. */
  snapshot(): Uint8Array;
  /** Takes the snapshot after the last tick, for `snapshotFor` to cut each player's from. */
  snapshotPrepare(): void;
  /** The prepared snapshot as one player is sent it: at sea only what is theirs of the sea's own part. */
  snapshotFor(player: number): Uint8Array;
  /** Lays out a course's stall, where a social space's asks are answered, and its resource nodes; false with no
   *  course open. */
  furnish(stall: { readonly x: number; readonly y: number } | null, nodes: readonly CourseNode[]): boolean;
  /** A player's own gear's bytes, to send them alone; empty when it has not changed since last asked. */
  gear(player: number): Uint8Array;
  /** Sets a node's room's difficulty, as its voyage set out: 0 Normal, 1 Elite, 2 Abyss; false if it is no room on land. */
  difficulty(seas: number): boolean;
  /** Sets the day, counted from the epoch, whose wares its vendors show; false if it is no room on land. */
  day(day: number): boolean;
  /** Draws a room on land's loot, and apart from it its foes and camps, from seeds the host keeps secret, each as two
   *  halves; false if it is none. */
  reseed(seeds: readonly [number, number, number, number]): boolean;
  /** A player's character as it is kept between sessions (JSON); null at sea or for no such player. */
  character(player: number): string | null;
  /** Gives a player the character kept for them; false if the text is not one or they are not in. */
  restoreCharacter(player: number, kept: string): boolean;
  /** Notes the account that keeps a player's character, so what they gathered this turn follows a rejoin. */
  own(player: number, account: string): boolean;
  /** The open sea keeps characters from now on: a player's courses wait for the keeper's word on theirs (a character
   *  given back, or `noneKept`), so a ship comes back where the room last kept it; false if no sea is open. */
  keepCharacters(): boolean;
  /** The keeper has no character to give a player at sea (none kept, or the page plays unkept): the course held for
   *  them sails. */
  noneKept(player: number): void;
  /** The Sloop's build as the naval rules hold it, as JSON: its name, hull and canvas whole, crew, guns on each side,
   *  and the loads its guns take. */
  sloop(): string;
  /** Every enemy type the rules know, as JSON, in their order: each one's number (`type`), name, faction (`faction`
   *  and `faction_name`), domain (land or deck), role (`role` and `role_name`), ranks (their numbers, the plainest
   *  first), and its right and left forge layers. */
  roster(): string;
  /** The port cities' ids, as JSON: every other city is a ruin. */
  mainPorts(): string;
}

interface RoomExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  room_tick_seconds(): number;
  room_open(address: number, length: number): number;
  room_open_node(address: number, length: number): number;
  room_open_deck(hull: number, faction: number, rank: number, level: number): number;
  room_open_sea(address: number, length: number, seed: number): number;
  room_open_fleet(): number;
  room_open_island(address: number, length: number): number;
  room_sea_island(id: number): bigint;
  room_hold_ashore(id: number, low: number, high: number): number;
  room_isle_plan(low: number, high: number, address: number, length: number): bigint;
  room_isle_heights(low: number, high: number, x: number, y: number, address: number, length: number): bigint;
  room_world_start(seconds: number): void;
  room_take_foe_asks(): void;
  room_join(): number;
  room_joined(player: number): bigint;
  room_leave(player: number): void;
  room_input(player: number, address: number, length: number): number;
  room_tick(): void;
  room_snapshot(): bigint;
  room_snapshot_prepare(): void;
  room_snapshot_for(player: number): bigint;
  room_gear(player: number): bigint;
  room_character(player: number): bigint;
  room_difficulty(seas: number): number;
  room_day(day: number): number;
  room_reseed(lootLow: number, lootHigh: number, worldLow: number, worldHigh: number): number;
  room_restore_character(player: number, address: number, length: number): number;
  room_own(player: number, address: number, length: number): number;
  room_keep_characters(): number;
  room_none_kept(player: number): void;
  room_furnish(address: number, length: number): number;
  room_sloop(): bigint;
  room_roster(): bigint;
  room_main_ports(): bigint;
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
    open: (spawn, blocks) => {
      const numbers = [
        spawn.x,
        spawn.y,
        ...blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top]),
      ];
      const bytes = new Uint8Array(new Float64Array(numbers).buffer);
      return lend(bytes, (address) => exports.room_open(address, bytes.length)) === 1;
    },
    openNode: (nodeText) => openWith(exports.room_open_node, nodeText),
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
    holdAshore: (id, seed) => exports.room_hold_ashore(id >>> 0, ...halves(seed)) === 1,
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
    join: () => exports.room_join(),
    joined: (player) => take(exports.room_joined(player)),
    leave: (player) => exports.room_leave(player),
    input: (player, bytes) =>
      ANSWERS[lend(bytes, (address) => exports.room_input(player, address, bytes.length))] ?? 'not an input',
    tick: () => exports.room_tick(),
    snapshot: () => take(exports.room_snapshot()),
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
    day: (day) => exports.room_day(day) === 1,
    reseed: ([lootLow, lootHigh, worldLow, worldHigh]) =>
      exports.room_reseed(lootLow, lootHigh, worldLow, worldHigh) === 1,
    character: (player) => {
      const bytes = take(exports.room_character(player));
      return bytes.length === 0 ? null : new TextDecoder().decode(bytes);
    },
    restoreCharacter: (player, kept) =>
      openWith((address, length) => exports.room_restore_character(player, address, length), kept),
    own: (player, account) => openWith((address, length) => exports.room_own(player, address, length), account),
    keepCharacters: () => exports.room_keep_characters() === 1,
    noneKept: (player) => exports.room_none_kept(player),
    sloop: () => new TextDecoder().decode(take(exports.room_sloop())),
    roster: () => new TextDecoder().decode(take(exports.room_roster())),
    mainPorts: () => new TextDecoder().decode(take(exports.room_main_ports())),
  };
}

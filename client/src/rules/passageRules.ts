// The passages' three doors in the room module (crates/room-wasm/src/passage_door.rs): an island's week's web, a zone
// of it laid whole, and an above-ground zone's ground, each read whole and checked before anything is drawn from it,
// built by the same rules the zone's room is built by, so the page draws and predicts on the room's own ground. Every
// point of a zone is in the zone's own frame: metres, x east, y south, z up.

export type Point2 = readonly [number, number];
/** A module set in a zone, as an island's placement is: its number in the islands' contract, its base's middle
 *  (x, y, z), the bearing it faces, its size and its lift. */
export type IslePlacement = readonly [number, number, number, number, number, number, number];
/** A solid: west, north, east, south, top. */
export type IsleBlock = readonly [number, number, number, number, number];

/** A zone's deal: a skirmish, one of the seven missions, a vault, a vein, a reliquary or its lamp. */
export type PassageDeal =
  | 'skirmish'
  | 'kindle'
  | 'hold'
  | 'hunt'
  | 'reckoning'
  | 'gauntlet'
  | 'ambush'
  | 'sever'
  | 'vault'
  | 'vein'
  | 'reliquary'
  | 'lamp';

export const DEALS: readonly PassageDeal[] = [
  'skirmish',
  'kindle',
  'hold',
  'hunt',
  'reckoning',
  'gauntlet',
  'ambush',
  'sever',
  'vault',
  'vein',
  'reliquary',
  'lamp',
];

/** A modifier as the room words it: the week's two, and each zone's currents (whether a boon, too). */
export interface PassageModifier {
  readonly key: string;
  readonly name: string;
  readonly words: string;
}

export interface PassageCurrent extends PassageModifier {
  readonly boon: boolean;
}

/** Under ground, a dungeon of its style; above ground, a hollow of its form. */
export type PassageGroundKind =
  { readonly kind: 'under'; readonly style: string } | { readonly kind: 'open'; readonly form: string };

/** One zone of the web: its number, depth and lane, where it lies on the island (world metres), its ground, size,
 *  deal, currents and name, the zones its onward mouths lead to in their order, its lamp's number (1 to 4) or null,
 *  and whether it lies on the week's public way. */
export interface PassageZone {
  readonly number: number;
  readonly depth: number;
  readonly lane: number;
  readonly at: Point2;
  readonly ground: PassageGroundKind;
  readonly size: 'small' | 'medium' | 'large';
  readonly deal: PassageDeal;
  readonly currents: readonly PassageCurrent[];
  readonly name: string;
  readonly onward: readonly number[];
  readonly lamp: number | null;
  /** Whether it lies on the week's public way, one zone a depth, where players in public rooms meet. */
  readonly public: boolean;
  /** Its foes' levels, lowest and highest, as its room stands them; none where the web does not say. */
  readonly levels?: readonly [number, number];
}

/** An island's passages for a week: its patrol zone, its mouths (each its run's name and the zone it leads to), the
 *  week's two modifiers and every zone, the shallowest first. */
export interface PassageWeb {
  readonly island: string;
  readonly patrol: string;
  readonly week: number;
  readonly mouths: readonly { readonly run: string; readonly zone: number }[];
  readonly modifiers: readonly PassageModifier[];
  readonly zones: readonly PassageZone[];
}

/** A door of a zone: where it stands and the bearing its front faces (radians clockwise from north). */
export interface PassageDoorSite {
  readonly at: Point2;
  readonly facing: number;
}

export type PieceKind = 'way-in' | 'mouth' | 'lamp' | 'kindle' | 'post' | 'node' | 'reliquary' | 'ring';

const PIECE_KINDS: readonly PieceKind[] = ['way-in', 'mouth', 'lamp', 'kindle', 'post', 'node', 'reliquary', 'ring'];

/** One of the passages' own pieces standing in a zone: its module's name, its kind and number among its kind, its
 *  foot's middle and the bearing its front faces. */
export interface PassagePiece {
  readonly module: string;
  readonly kind: PieceKind;
  readonly number: number;
  readonly at: readonly [number, number, number];
  readonly facing: number;
}

/** A zone's ground laid: under ground the Forge's layout as a dungeon's is read; above ground every module set in it,
 *  the blocks its modules stand as and its section's ring. */
export type PassageGround =
  /** The layout's JSON as `room_dungeon` gives a dungeon's, for the dungeon's own reader (`readDungeon`). */
  | { readonly kind: 'under'; readonly layout: string }
  | {
      readonly kind: 'open';
      readonly placements: readonly IslePlacement[];
      readonly blocks: readonly IsleBlock[];
      readonly ring: readonly Point2[];
    };

/** A zone laid whole: the zone, its ground, its sites, its pieces and every piece's solids. */
export interface PassagePlan {
  readonly zone: PassageZone;
  /** The islands' climate its hollow is dressed in, whose kit the page draws it from. */
  readonly climate: string;
  readonly ground: PassageGround;
  readonly sites: {
    readonly arrive: Point2;
    readonly facing: number;
    readonly wayIn: PassageDoorSite;
    readonly onward: readonly PassageDoorSite[];
    /** The onward mouth farthest from the way in, by its place among them: a Gauntlet's goal. */
    readonly far: number | null;
    readonly lamp: Point2 | null;
    readonly posts: readonly Point2[];
    readonly spots: readonly Point2[];
  };
  readonly pieces: readonly PassagePiece[];
  readonly solids: readonly IsleBlock[];
}

type Raw = Record<string, unknown>;

const fail = (what: string): never => {
  throw new Error(`the passages' ${what}`);
};

const objectOf = (value: unknown, what: string): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : fail(`${what} is no object`);

const finite = (value: unknown, what: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(`${what} is no number`);

const whole = (value: unknown, what: string): number =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fail(`${what} is no whole number`);

const text = (value: unknown, what: string): string => (typeof value === 'string' ? value : fail(`${what} is no text`));

function numbers(value: unknown, count: number, what: string): number[] {
  if (!Array.isArray(value) || value.length !== count || !value.every((each) => Number.isFinite(each)))
    fail(`${what} is not ${count} numbers`);
  return value as number[];
}

const point = (value: unknown, what: string): Point2 => numbers(value, 2, what) as unknown as Point2;

function list<T>(value: unknown, what: string, each: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) fail(`${what} is no list`);
  return (value as unknown[]).map(each);
}

function oneOf<T extends string>(value: unknown, known: readonly T[], what: string): T {
  return known.find((each) => each === value) ?? fail(`${what} ${String(value)} is not one the page knows`);
}

function parsed(answer: string, what: string): Raw {
  let raw: unknown;
  try {
    raw = JSON.parse(answer);
  } catch {
    fail(`${what} is not JSON`);
  }
  return objectOf(raw, what);
}

function zoneOf(value: unknown): PassageZone {
  const raw = objectOf(value, 'zone');
  const ground = objectOf(raw.ground, "zone's ground");
  const kind = oneOf(ground.kind, ['under', 'open'] as const, "zone's ground");
  const lamp = raw.lamp === null ? null : whole(raw.lamp, "zone's lamp");
  if (lamp !== null && (lamp < 1 || lamp > 4)) fail(`lamp ${lamp} is not one of the four`);
  return {
    number: whole(raw.number, "zone's number"),
    depth: whole(raw.depth, "zone's depth"),
    lane: whole(raw.lane, "zone's lane"),
    at: point(raw.at, "zone's place"),
    ground:
      kind === 'under'
        ? { kind, style: text(ground.style, "zone's style") }
        : { kind, form: text(ground.form, "zone's form") },
    size: oneOf(raw.size, ['small', 'medium', 'large'] as const, "zone's size"),
    deal: oneOf(raw.deal, DEALS, "zone's deal"),
    currents: list(raw.currents, "zone's currents", (each) => {
      const current = objectOf(each, 'current');
      if (typeof current.boon !== 'boolean') fail('current says not whether it is a boon');
      return { ...modifierOf(current), boon: current.boon as boolean };
    }),
    name: text(raw.name, "zone's name"),
    onward: list(raw.onward, "zone's ways on", (each) => whole(each, 'way on')),
    lamp,
    public: raw.public === true,
    ...(raw.levels === undefined || raw.levels === null
      ? {}
      : { levels: numbers(raw.levels, 2, "zone's levels") as unknown as [number, number] }),
  };
}

function modifierOf(raw: Raw): PassageModifier {
  return {
    key: text(raw.key, "modifier's key"),
    name: text(raw.name, "modifier's name"),
    words: text(raw.words, 'words'),
  };
}

/** Reads a week's web, or throws saying what is wrong: anything missing, of the wrong shape, or a way on to a zone the
 *  web does not hold. An empty answer (an island with no passages) is null. */
export function readPassageWeb(answer: string): PassageWeb | null {
  if (answer === '') return null;
  const raw = parsed(answer, 'web');
  const zones = list(raw.zones, "web's zones", zoneOf);
  const numbered = new Set(zones.map((zone) => zone.number));
  if (numbered.size !== zones.length) fail('web holds a zone number twice');
  const mouths = list(raw.mouths, "web's mouths", (each) => {
    const mouth = objectOf(each, 'mouth');
    return { run: text(mouth.run, "mouth's run"), zone: whole(mouth.zone, "mouth's zone") };
  });
  for (const way of [...mouths.map((mouth) => mouth.zone), ...zones.flatMap((zone) => zone.onward)])
    if (!numbered.has(way)) fail(`web leads to zone ${way}, which it does not hold`);
  return {
    island: text(raw.island, "web's island"),
    patrol: text(raw.patrol, "web's patrol zone"),
    week: whole(raw.week, "web's week"),
    mouths,
    modifiers: list(raw.modifiers, "week's modifiers", (each) => modifierOf(objectOf(each, 'modifier'))),
    zones,
  };
}

const doorOf = (value: unknown, what: string): PassageDoorSite => {
  const raw = objectOf(value, what);
  return { at: point(raw.at, `${what}'s place`), facing: finite(raw.facing, `${what}'s facing`) };
};

function groundOf(value: unknown): PassageGround {
  const raw = objectOf(value, "zone's laid ground");
  if (oneOf(raw.kind, ['under', 'open'] as const, "zone's laid ground") === 'under') {
    const layout = objectOf(raw.layout, "zone's layout");
    if (!Array.isArray(layout.cells) || !Array.isArray(layout.rooms)) fail("zone's layout holds no cells or rooms");
    return { kind: 'under', layout: JSON.stringify(layout) };
  }
  return {
    kind: 'open',
    placements: list(raw.placements, 'placements', (each) => {
      const numbered = numbers(each, 7, 'a placement');
      if (!Number.isInteger(numbered[0]) || (numbered[0] ?? -1) < 0) fail('placement names no whole module');
      return numbered as unknown as IslePlacement;
    }),
    blocks: list(raw.blocks, 'blocks', (each) => numbers(each, 5, 'a block') as unknown as IsleBlock),
    ring: list(raw.ring, 'ring', (each) => point(each, 'a ring point')),
  };
}

function pieceOf(each: unknown): PassagePiece {
  const piece = objectOf(each, 'piece');
  return {
    module: text(piece.module, "piece's module"),
    kind: oneOf(piece.kind, PIECE_KINDS, "piece's kind"),
    number: whole(piece.number, "piece's number"),
    at: numbers(piece.at, 3, "piece's place") as unknown as readonly [number, number, number],
    facing: finite(piece.facing, "piece's facing"),
  };
}

/** Reads a zone laid whole, or throws saying what is wrong; an empty answer (a zone the web does not hold, or a style
 *  the Forge does not know yet) is null. Its onward mouths must be as many as its ways on. */
export function readPassagePlan(answer: string): PassagePlan | null {
  if (answer === '') return null;
  const raw = parsed(answer, 'zone plan');
  const zone = zoneOf(raw.zone);
  const ground = groundOf(raw.ground);
  if (ground.kind !== zone.ground.kind)
    fail(`zone ${zone.number} is laid ${ground.kind} but said to be ${zone.ground.kind}`);
  const sites = objectOf(raw.sites, "zone's sites");
  const onward = list(sites.onward, 'onward mouths', (each) => doorOf(each, 'an onward mouth'));
  if (onward.length !== zone.onward.length)
    fail(`zone ${zone.number} stands ${onward.length} mouths for ${zone.onward.length} ways on`);
  const pieces = list(raw.pieces, 'pieces', pieceOf);
  if (pieces.filter((piece) => piece.kind === 'mouth').length !== onward.length)
    fail(`zone ${zone.number} stands mouth pieces other than its ${onward.length} onward mouths`);
  return {
    zone,
    climate: text(raw.climate, "zone's climate"),
    ground,
    sites: {
      arrive: point(sites.arrive, 'arrival'),
      facing: finite(sites.facing, "arrival's facing"),
      wayIn: doorOf(sites.wayIn, 'way in'),
      onward,
      far: sites.far === null || sites.far === undefined ? null : whole(sites.far, 'far mouth'),
      lamp: sites.lamp === null ? null : point(sites.lamp, "lamp's place"),
      posts: list(sites.posts, 'posts', (each) => point(each, 'a post')),
      spots: list(sites.spots, 'spots', (each) => point(each, 'a spot')),
    },
    pieces,
    solids: list(raw.solids, 'solids', (each) => numbers(each, 5, 'a solid') as unknown as IsleBlock),
  };
}

/** Reads an above-ground zone's ground (`movement::Heights::to_floats`, little-endian) as its numbers, as an island's
 *  are held, or throws if they are no grid; empty bytes (a zone under ground) are null. */
export function readPassageHeights(bytes: Uint8Array): Float64Array | null {
  if (bytes.length === 0) return null;
  if (bytes.length % 8 !== 0) fail(`ground of ${bytes.length} bytes is no whole count of numbers`);
  const floats = new Float64Array(bytes.slice().buffer);
  // A grid's west, north, cell, columns and rows, then a height for each of its cells.
  const [columns = NaN, rows = NaN] = [floats[3], floats[4]];
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    rows < 2 ||
    floats.length !== 5 + columns * rows
  )
    fail(`ground of ${floats.length} numbers is no grid`);
  return floats;
}

/** The room module's exports the passages' doors use. */
interface PassageExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  room_passage_web(week: number, address: number, length: number): bigint;
  room_passage_zone(week: number, zone: number, address: number, length: number): bigint;
  room_passage_heights(week: number, zone: number, address: number, length: number): bigint;
}

/** The passages' doors on an instance of the room module of their own: a week's web, a zone laid whole and its
 *  ground, each read whole. A module older than the passages has none of the doors, and this throws saying so. */
export interface PassageDoor {
  web(island: string, week: number): PassageWeb | null;
  plan(island: string, week: number, zone: number): PassagePlan | null;
  heights(island: string, week: number, zone: number): Float64Array | null;
}

export function startPassageDoor(module: WebAssembly.Module): PassageDoor {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as PassageExports;
  if (typeof exports.room_passage_web !== 'function') throw new Error('this room module has no passages');
  const ask = (island: string, entry: (address: number, length: number) => bigint): Uint8Array => {
    const bytes = new TextEncoder().encode(island);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    let packed: bigint;
    try {
      packed = entry(address, bytes.length);
    } finally {
      exports.release(address, bytes.length);
    }
    const [handed, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
    const answer = new Uint8Array(exports.memory.buffer, handed, length).slice();
    exports.release(handed, length);
    return answer;
  };
  const words = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  return {
    web: (island, week) =>
      readPassageWeb(words(ask(island, (address, length) => exports.room_passage_web(week, address, length)))),
    plan: (island, week, zone) =>
      readPassagePlan(words(ask(island, (address, length) => exports.room_passage_zone(week, zone, address, length)))),
    heights: (island, week, zone) =>
      readPassageHeights(ask(island, (address, length) => exports.room_passage_heights(week, zone, address, length))),
  };
}

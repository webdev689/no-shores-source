/** A block: its footprint (x east, y south, metres), its top, and its underside: at or below the ground for a block
 *  from the ground up, over it for a floor, a bridge or a roof a body walks under. */
export interface Block {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
  /** Its underside: the ground's height where it stands, or below it, for a block from the ground up; over the ground
   *  for a floor, a bridge, a roof a body walks under, or a ship's boom or yard. */
  readonly bottom: number;
}

/** What the player asks of the body for a tick: movement relative to where it looks (-1..1), the look's bearing in
 *  radians clockwise from north, and the keys that act once. */
export interface Controls {
  readonly forward: number;
  readonly sideways: number;
  readonly yaw: number;
  readonly run: boolean;
  readonly jump: boolean;
  readonly crouch: boolean;
  readonly mounted: boolean;
  /** The rider's boost tapped this tick; none is tapped where it is left out. */
  readonly boost?: boolean;
}

/** How the body is held: on its feet, in the air, hanging from a lip, on a wall, or mantling or vaulting over one. */
export type Mode = 'ground' | 'air' | 'hang' | 'climb' | 'mantle' | 'vault';

/** The modes in the order the movement crate numbers them. */
const MODES: readonly Mode[] = ['ground', 'air', 'hang', 'climb', 'mantle', 'vault'];

type Point3 = readonly [number, number, number];

/** The body as the movement crate keeps it: its feet (x, y, z), its velocity, the way it faces, and how it is held. */
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly facing: number;
  readonly mode: Mode;
  readonly crouched: boolean;
  /** 0 standing to 1 crouched, easing between. */
  readonly crouch: number;
  /** How long it has stood on the ground, for the jump. */
  readonly grounded: number;
  /** A mantle's or a vault's start, end and progress 0..1, and how long it takes. */
  readonly over: {
    readonly from: Point3;
    readonly to: Point3;
    readonly progress: number;
    readonly seconds: number;
  } | null;
  /** The lip it hangs from, climbs towards or goes over. */
  readonly lip: number;
  /** Whether it moved along the ground or the wall this tick. */
  readonly moving: boolean;
  /** The seconds its rider's boost still runs, then the seconds before it may boost again; none where left out. */
  readonly boosting?: number;
  readonly recharging?: number;
}

/** The movement crate, running in WebAssembly: the same steps, to the bit, as the crate run natively. */
export interface MovementRules {
  /** One tick, in seconds: every step moves a body by exactly this. */
  readonly tickSeconds: number;
  /** A body standing at (x, y): at 0 m, or on the ground of a window of the land once one is set. */
  standing(x: number, y: number): Body;
  /** Keeps these blocks as the course every later step moves on. */
  setCourse(blocks: readonly Block[]): void;
  /** Stands every later step on a node's window of the land, from its JSON (the land's `window`), the same ground to
   *  the bit as the node's room; null, or anything that is not a window, is open ground at 0 m. Answers whether a
   *  window was set. */
  setGround(windowJson: string | null): boolean;
  /** Stands every later step on a ship's deck in place of any ground: its grid of heights as the movement crate
   *  numbers it (`Heights::to_floats`), the same heights to the bit as the sea room's; null, or numbers that are not a
   *  grid, is open ground at 0 m. Answers whether a deck was set. */
  setHeights(grid: readonly number[] | null): boolean;
  /** Stands every later step on the rim round a course laid over the sea, as the sea room holds its bodies: the
   *  movement crate makes it from the blocks (`Heights::rim`), so it agrees with the room's to the bit. Answers whether
   *  the blocks were taken. */
  setRim(blocks: readonly Block[]): boolean;
  /** Judges every later `reachTick` against a node's section (its ring and spawns, world metres, and whether a fall
   *  kills there, as a social space's does), by the room's own reach rules, the body standing as `standing` says (a
   *  room's last word) or inside; null clears it. */
  setSection(
    section: {
      readonly ring: readonly Point[];
      readonly spawns: readonly Point[];
      readonly fallsKill?: boolean;
      readonly standing?: Reach;
    } | null,
  ): void;
  /** One tick of the body against the section: inside, warned with the ticks left, or dead for so many, by a fall or
   *  by straying. */
  reachTick(body: Body): Reach;
  /** Respawns a body that died at (x, y), once allowed: the spawn it stands at, or null while too soon. */
  respawn(x: number, y: number): Point | null;
  /** The body one tick on under these controls. */
  step(body: Body, controls: Controls): Body;
  /** Where the eye is over the feet: standing, crouched, or easing between. */
  eyeHeight(body: Body): number;
}

type Point = readonly [number, number];

/** A body's standing with its section, as the reach rules judge it. */
export type Reach =
  | { readonly kind: 'inside' }
  | { readonly kind: 'warned'; readonly ticksLeft: number }
  | { readonly kind: 'dead'; readonly ticks: number; readonly fell: boolean };

/** A standing as the door's one number: its kind in the top two bits (3 dead by a fall), its ticks below. */
export function packedOf(reach: Reach): number {
  if (reach.kind === 'inside') return 0;
  const ticks = Math.min(reach.kind === 'warned' ? reach.ticksLeft : reach.ticks, 0x3fffffff);
  const kind = reach.kind === 'warned' ? 1 : reach.fell ? 3 : 2;
  return (kind * 0x40000000 + ticks) >>> 0;
}

/** A standing from the door's one number: its kind in the top two bits, its ticks below. */
export function reachOf(packed: number): Reach {
  const [kind, ticks] = [packed >>> 30, packed & 0x3fffffff];
  if (kind === 1) return { kind: 'warned', ticksLeft: ticks };
  return kind >= 2 ? { kind: 'dead', ticks, fell: kind === 3 } : { kind: 'inside' };
}

interface MovementExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  movement_tuning(): bigint;
  movement_set_course(address: number, length: number): number;
  movement_set_ground(address: number, length: number): number;
  movement_set_heights(address: number, length: number): number;
  movement_set_rim(address: number, length: number): number;
  movement_standing(address: number, length: number): void;
  movement_step(address: number, length: number): void;
  movement_set_section(address: number, length: number): number;
  movement_reach_tick(x: number, y: number, z: number, aloft: number): number;
  movement_respawn(x: number, y: number, address: number): number;
}

interface Tuning {
  readonly tick_seconds: number;
  readonly step_floats: number;
  readonly body_floats: number;
  readonly eye: number;
  readonly crouched_eye: number;
}

const flag = (value: boolean): number => (value ? 1 : 0);

/** How many numbers a body is, and the controls. */
export const BODY_FLOATS = 24;
export const CONTROLS_FLOATS = 8;

/** Blocks as the movement crate reads them (`Block::from_floats`): every list of blocks the rules take. */
export function blockFloats(blocks: readonly Block[]): number[] {
  return blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top, block.bottom]);
}

/** A body's numbers in the movement crate's order: x, y, z, vx, vy, vz, facing, mode, crouched, crouch, grounded;
 *  whether it is going over a lip, and that move's start, end, progress and seconds; then lip and moving; then the
 *  boost's seconds and the recharge's. */
export function floatsOf(body: Body): number[] {
  const over = body.over ?? { from: [0, 0, 0], to: [0, 0, 0], progress: 0, seconds: 0 };
  return [
    body.x,
    body.y,
    body.z,
    body.vx,
    body.vy,
    body.vz,
    body.facing,
    MODES.indexOf(body.mode),
    flag(body.crouched),
    body.crouch,
    body.grounded,
    flag(body.over !== null),
    ...over.from,
    ...over.to,
    over.progress,
    over.seconds,
    body.lip,
    flag(body.moving),
    body.boosting ?? 0,
    body.recharging ?? 0,
  ];
}

/** The controls' numbers in the movement crate's order: forward, sideways, yaw, run, jump, crouch, mounted, boost. */
export const floatsOfControls = (controls: Controls): number[] => [
  controls.forward,
  controls.sideways,
  controls.yaw,
  flag(controls.run),
  flag(controls.jump),
  flag(controls.crouch),
  flag(controls.mounted),
  flag(controls.boost ?? false),
];

/** The body the numbers hold, in the same order. */
export function bodyOf(floats: readonly number[]): Body {
  const number = (index: number) => floats[index] ?? 0;
  return {
    x: number(0),
    y: number(1),
    z: number(2),
    vx: number(3),
    vy: number(4),
    vz: number(5),
    facing: number(6),
    mode: MODES[number(7)] ?? 'ground',
    crouched: number(8) !== 0,
    crouch: number(9),
    grounded: number(10),
    over:
      number(11) === 0
        ? null
        : {
            from: [number(12), number(13), number(14)],
            to: [number(15), number(16), number(17)],
            progress: number(18),
            seconds: number(19),
          },
    lip: number(20),
    moving: number(21) !== 0,
    boosting: number(22),
    recharging: number(23),
  };
}

/** Reads text the module handed over (its address and length packed in one number) and gives the memory back. */
function takeText(exports: MovementExports, packed: bigint): string {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, address, length));
  exports.release(address, length);
  return text;
}

/** Starts the movement rules from the compiled `movement-wasm` module's bytes. */
export async function startMovementRules(moduleBytes: BufferSource): Promise<MovementRules> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as MovementExports;
  const tuning = JSON.parse(takeText(exports, exports.movement_tuning())) as Tuning;
  // One place in the module's memory, kept for good, that each step reads a body and controls from and writes into.
  const exchange = exports.reserve(tuning.step_floats * 8);
  // A view made fresh for each use: the module's memory may grow and move under an older one.
  const view = () => new DataView(exports.memory.buffer, exchange, tuning.step_floats * 8);
  const write = (floats: readonly number[]) => {
    const numbers = view();
    floats.forEach((value, index) => numbers.setFloat64(index * 8, value, true));
  };
  const readBody = (): Body => {
    const numbers = view();
    return bodyOf(Array.from({ length: tuning.body_floats }, (unused, index) => numbers.getFloat64(index * 8, true)));
  };
  return {
    tickSeconds: tuning.tick_seconds,
    standing: (x, y) => {
      write([x, y]);
      exports.movement_standing(exchange, tuning.step_floats * 8);
      return readBody();
    },
    setCourse: (blocks) => {
      const floats = blockFloats(blocks);
      const address = exports.reserve(floats.length * 8);
      const numbers = new DataView(exports.memory.buffer, address, floats.length * 8);
      floats.forEach((value, index) => numbers.setFloat64(index * 8, value, true));
      exports.movement_set_course(address, floats.length * 8);
      exports.release(address, floats.length * 8);
    },
    setGround: (windowJson) => {
      const bytes = new TextEncoder().encode(windowJson ?? '');
      const address = exports.reserve(bytes.length);
      new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
      try {
        return exports.movement_set_ground(address, bytes.length) === 1;
      } finally {
        exports.release(address, bytes.length);
      }
    },
    setRim: (blocks) => {
      const floats = blockFloats(blocks);
      const address = exports.reserve(Math.max(1, floats.length) * 8);
      const numbers = new DataView(exports.memory.buffer, address, floats.length * 8);
      floats.forEach((value, index) => numbers.setFloat64(index * 8, value, true));
      try {
        return exports.movement_set_rim(address, floats.length * 8) === 1;
      } finally {
        exports.release(address, Math.max(1, floats.length) * 8);
      }
    },
    setHeights: (grid) => {
      const floats = grid ?? [];
      const address = exports.reserve(Math.max(1, floats.length) * 8);
      const numbers = new DataView(exports.memory.buffer, address, floats.length * 8);
      floats.forEach((value, index) => numbers.setFloat64(index * 8, value, true));
      try {
        return exports.movement_set_heights(address, floats.length * 8) === 1;
      } finally {
        exports.release(address, Math.max(1, floats.length) * 8);
      }
    },
    setSection: (section) => {
      const standing = section?.standing ? packedOf(section.standing) : 0;
      const fallsKill = section?.fallsKill ?? false;
      const text = section
        ? JSON.stringify({ ring: section.ring, spawns: section.spawns, falls_kill: fallsKill, standing })
        : 'null';
      const bytes = new TextEncoder().encode(text);
      const address = exports.reserve(bytes.length);
      new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
      exports.movement_set_section(address, bytes.length);
      exports.release(address, bytes.length);
    },
    reachTick: (body) => reachOf(exports.movement_reach_tick(body.x, body.y, body.z, body.mode === 'air' ? 1 : 0)),
    respawn: (x, y) => {
      const address = exports.reserve(16);
      try {
        if (exports.movement_respawn(x, y, address) !== 1) return null;
        const numbers = new DataView(exports.memory.buffer, address, 16);
        return [numbers.getFloat64(0, true), numbers.getFloat64(8, true)];
      } finally {
        exports.release(address, 16);
      }
    },
    step: (body, controls) => {
      write([...floatsOf(body), ...floatsOfControls(controls)]);
      exports.movement_step(exchange, tuning.step_floats * 8);
      return readBody();
    },
    eyeHeight: (body) => tuning.eye + (tuning.crouched_eye - tuning.eye) * body.crouch,
  };
}

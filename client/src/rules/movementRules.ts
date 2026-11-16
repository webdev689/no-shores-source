/** A block standing on the ground: its footprint (x east, y south, metres) and its top. */
export interface Block {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
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
}

/** The movement crate, running in WebAssembly: the same steps, to the bit, as the crate run natively. */
export interface MovementRules {
  /** One tick, in seconds: every step moves a body by exactly this. */
  readonly tickSeconds: number;
  /** A body standing on open ground at (x, y). */
  standing(x: number, y: number): Body;
  /** Keeps these blocks as the course every later step moves on. */
  setCourse(blocks: readonly Block[]): void;
  /** The body one tick on under these controls. */
  step(body: Body, controls: Controls): Body;
  /** Where the eye is over the feet: standing, crouched, or easing between. */
  eyeHeight(body: Body): number;
}

interface MovementExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  movement_tuning(): bigint;
  movement_set_course(address: number, length: number): number;
  movement_standing(address: number, length: number): void;
  movement_step(address: number, length: number): void;
}

interface Tuning {
  readonly tick_seconds: number;
  readonly step_floats: number;
  readonly body_floats: number;
  readonly eye: number;
  readonly crouched_eye: number;
}

const flag = (value: boolean): number => (value ? 1 : 0);

/** A body's numbers in the movement crate's order: x, y, z, vx, vy, vz, facing, mode, crouched, crouch, grounded;
 *  whether it is going over a lip, and that move's start, end, progress and seconds; then lip and moving. */
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
  ];
}

/** The body the numbers hold, in the same order. */
function bodyOf(floats: readonly number[]): Body {
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
      const floats = blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top]);
      const address = exports.reserve(floats.length * 8);
      const numbers = new DataView(exports.memory.buffer, address, floats.length * 8);
      floats.forEach((value, index) => numbers.setFloat64(index * 8, value, true));
      exports.movement_set_course(address, floats.length * 8);
      exports.release(address, floats.length * 8);
    },
    step: (body, controls) => {
      write([
        ...floatsOf(body),
        controls.forward,
        controls.sideways,
        controls.yaw,
        flag(controls.run),
        flag(controls.jump),
        flag(controls.crouch),
        flag(controls.mounted),
      ]);
      exports.movement_step(exchange, tuning.step_floats * 8);
      return readBody();
    },
    eyeHeight: (body) => tuning.eye + (tuning.crouched_eye - tuning.eye) * body.crouch,
  };
}

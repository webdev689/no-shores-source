import type { Block } from './movementRules.ts';

/** A fired shot's numbers after a predicted fighter's: its weapon, where it left, its velocity. */
const FIRED_FLOATS = 7;

/** How many numbers a fighter, an intent and a glance are, as the combat crate lays them out. */
export interface CombatSizes {
  readonly fighter: number;
  readonly intent: number;
  readonly glance: number;
}

/** A fighter the player sees, as a number and a glance, for predicting their own fighter among them. */
export interface Glanced {
  readonly id: number;
  readonly glance: Float64Array;
}

/** A shot a tick let go: its weapon's number, where it left and its velocity; a ball's velocity is its whole line, to
 *  where it stops among those the player sees, in one tick. */
export interface Fired {
  readonly ranged: number;
  readonly at: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
}

/** The combat crate's player tick and arms, running in WebAssembly: the same tick, to the bit, the room takes. */
export interface CombatRules {
  readonly sizes: CombatSizes;
  /** Keeps these blocks as the course every later prediction moves on. */
  setCourse(blocks: readonly Block[]): void;
  /** Keeps a node's window of the ground (its JSON, as the land's worker cuts it) for every later prediction to stand
   *  on, or open ground with none; false if the text is not ground. */
  setGround(windowJson: string | null): boolean;
  /** Keeps dungeon `number` of a patrol (its id and name) as the ground every later prediction stands on, its jambs
   *  and pillars its own walls and the course empty, as the dungeon's room judges bodies; false if there is none. */
  setDungeon(patrol: string, name: string, number: number): boolean;
  /** The player's fighter one tick on under an intent, taking up `arms` as the room does, among the fighters they
   *  see, and the shot it let go. */
  predict(
    fighter: Float64Array,
    intent: Float64Array,
    id: number,
    arms: number,
    view: readonly Glanced[],
  ): { readonly fighter: Float64Array; readonly fired: Fired | null };
  /** What hands holding these forge layers fight with, as combat's arms code. */
  armsCode(right: string | null, left: string | null, drawn: boolean): number;
  /** The farthest a stroke (1 to 6) of the melee weapon in this arms code reaches, feet to a body's middle, in a
   *  player's hands or a foe's. */
  strokeReach(arms: number, stroke: number, player: boolean): number;
  /** The half-width in radians of the arc a stroke (1 to 6) sweeps either side of its aim; 0 for no stroke. */
  strokeArc(stroke: number): number;
}

interface FightExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  fighter_course(address: number, length: number): number;
  fighter_ground(address: number, length: number): number;
  fighter_dungeon(address: number, length: number): number;
  fighter_predict(address: number, length: number): bigint;
  fighter_arms(address: number, length: number): number;
  fighter_sizes(): number;
  fighter_reach(arms: number, stroke: number, player: number): number;
  fighter_stroke_arc(stroke: number): number;
}

/** Starts the fight's rules from the compiled `room-wasm` module. */
export function startCombatRules(module: WebAssembly.Module): CombatRules {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as FightExports;
  const lend = <T>(bytes: Uint8Array, use: (address: number) => T): T => {
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return use(address);
    } finally {
      exports.release(address, bytes.length);
    }
  };
  const take = (packed: bigint): Uint8Array => {
    const [address, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
    const bytes = new Uint8Array(exports.memory.buffer, address, length).slice();
    exports.release(address, length);
    return bytes;
  };
  const packed = exports.fighter_sizes();
  const sizes: CombatSizes = { fighter: packed & 0xff, intent: (packed >> 8) & 0xff, glance: (packed >> 16) & 0xff };
  const floatBytes = (floats: Float64Array) => new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  return {
    sizes,
    setCourse: (blocks) => {
      const floats = new Float64Array(
        blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top, block.bottom]),
      );
      lend(floatBytes(floats), (address) => exports.fighter_course(address, floats.byteLength));
    },
    setGround: (windowJson) => {
      const text = new TextEncoder().encode(windowJson ?? '');
      return lend(text, (address) => exports.fighter_ground(address, text.length)) === 1;
    },
    setDungeon: (patrol, name, number) => {
      const text = new TextEncoder().encode(JSON.stringify({ patrol, name, number }));
      return lend(text, (address) => exports.fighter_dungeon(address, text.length)) === 1;
    },
    predict: (fighter, intent, id, arms, view) => {
      const floats = new Float64Array(sizes.fighter + sizes.intent + 2 + view.length * (sizes.glance + 1));
      floats.set(fighter, 0);
      floats.set(intent, sizes.fighter);
      floats[sizes.fighter + sizes.intent] = id;
      floats[sizes.fighter + sizes.intent + 1] = arms;
      view.forEach((each, index) => {
        const start = sizes.fighter + sizes.intent + 2 + index * (sizes.glance + 1);
        floats[start] = each.id;
        floats.set(each.glance, start + 1);
      });
      const bytes = take(lend(floatBytes(floats), (address) => exports.fighter_predict(address, floats.byteLength)));
      const length = bytes.length / 8;
      if (length !== sizes.fighter && length !== sizes.fighter + FIRED_FLOATS) return { fighter, fired: null };
      const numbers = new Float64Array(bytes.buffer, bytes.byteOffset, length).slice();
      const after = (index: number) => numbers[sizes.fighter + index] ?? 0;
      const fired =
        length === sizes.fighter
          ? null
          : {
              ranged: after(0),
              at: [after(1), after(2), after(3)] as const,
              velocity: [after(4), after(5), after(6)] as const,
            };
      return { fighter: numbers.subarray(0, sizes.fighter), fired };
    },
    armsCode: (right, left, drawn) => {
      const text = new TextEncoder().encode(`${right ?? ''}\n${left ?? ''}\n${drawn ? 'drawn' : 'worn'}`);
      return lend(text, (address) => exports.fighter_arms(address, text.length));
    },
    strokeReach: (arms, stroke, player) => exports.fighter_reach(arms, stroke, player ? 1 : 0),
    strokeArc: (stroke) => exports.fighter_stroke_arc(stroke),
  };
}

import type { Block } from './movementRules.ts';

/** How many numbers a fighter, an intent and a glance are, as the combat crate lays them out. */
export interface FightSizes {
  readonly fighter: number;
  readonly intent: number;
  readonly glance: number;
}

/** A fighter the player sees, as a number and a glance, for predicting their own fighter among them. */
export interface Glanced {
  readonly id: number;
  readonly glance: Float64Array;
}

/** The combat crate's player tick and arms, running in WebAssembly: the same tick, to the bit, the room takes. */
export interface FightRules {
  readonly sizes: FightSizes;
  /** Keeps these blocks as the course every later prediction moves on. */
  setCourse(blocks: readonly Block[]): void;
  /** The player's fighter one tick on under an intent, among the fighters they see. */
  predict(fighter: Float64Array, intent: Float64Array, id: number, view: readonly Glanced[]): Float64Array;
  /** What hands holding these forge layers fight with, as combat's arms code. */
  armsCode(right: string | null, left: string | null, drawn: boolean): number;
}

interface FightExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  fighter_course(address: number, length: number): number;
  fighter_predict(address: number, length: number): bigint;
  fighter_arms(address: number, length: number): number;
  fighter_sizes(): number;
}

/** Starts the fight's rules from the compiled `room-wasm` module. */
export function startFightRules(module: WebAssembly.Module): FightRules {
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
  const sizes: FightSizes = { fighter: packed & 0xff, intent: (packed >> 8) & 0xff, glance: (packed >> 16) & 0xff };
  const floatBytes = (floats: Float64Array) => new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  return {
    sizes,
    setCourse: (blocks) => {
      const floats = new Float64Array(
        blocks.flatMap((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top]),
      );
      lend(floatBytes(floats), (address) => exports.fighter_course(address, floats.byteLength));
    },
    predict: (fighter, intent, id, view) => {
      const floats = new Float64Array(sizes.fighter + sizes.intent + 1 + view.length * (sizes.glance + 1));
      floats.set(fighter, 0);
      floats.set(intent, sizes.fighter);
      floats[sizes.fighter + sizes.intent] = id;
      view.forEach((each, index) => {
        const start = sizes.fighter + sizes.intent + 1 + index * (sizes.glance + 1);
        floats[start] = each.id;
        floats.set(each.glance, start + 1);
      });
      const bytes = take(lend(floatBytes(floats), (address) => exports.fighter_predict(address, floats.byteLength)));
      if (bytes.length !== sizes.fighter * 8) return fighter;
      return new Float64Array(bytes.buffer, bytes.byteOffset, sizes.fighter).slice();
    },
    armsCode: (right, left, drawn) => {
      const text = new TextEncoder().encode(`${right ?? ''}\n${left ?? ''}\n${drawn ? 'drawn' : 'worn'}`);
      return lend(text, (address) => exports.fighter_arms(address, text.length));
    },
  };
}

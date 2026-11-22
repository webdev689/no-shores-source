import { PROTOCOL } from '../../../generated/messages/ts/version.ts';
import { FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS } from './fighters.ts';
import { type Block, blockFloats } from './movementRules.ts';

/** The address of the room's rules a page serves under `base`. It names the protocol, which hashes the fight's
 *  layouts, so a cache never hands a new page an old `room.wasm`. */
export const roomWasmAt = (base: string): string => `${base}room.wasm?v=${PROTOCOL}`;
/** The room's rules fetched from `roomWasmAt`, asked of the server again each time (a "not modified" costs little), as
 *  a change to the rules alone leaves the layouts and so the address as they were. */
export const fetchRoomWasm = (base: string): Promise<Response> => fetch(roomWasmAt(base), { cache: 'no-cache' });

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
  /** Keeps the dungeon an ask names (any ask `room_dungeon` reads: a patrol's by its number, an Elite Dungeon by its
   *  place, a seed and a style) as the ground every later prediction stands on, its jambs and pillars its own walls
   *  and the course empty, as the dungeon's room judges bodies; false if there is none. */
  setDungeon(ask: Readonly<Record<string, string | number>>): boolean;
  /** Keeps a ship's deck, as its grid's numbers (`deckFloats`), for every later prediction to stand on in place of any
   *  ground; false if the numbers are not a grid. */
  setHeights(grid: readonly number[]): boolean;
  /** Stands every later prediction on the rim round a course laid over the sea, as the sea room holds its bodies
   *  (`Floor::Sea`), made from these blocks by the rules; false if they are not blocks. */
  setRim(blocks: readonly Block[]): boolean;
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
  fighter_heights(address: number, length: number): number;
  fighter_rim(address: number, length: number): number;
  fighter_predict(address: number, length: number): bigint;
  fighter_arms(address: number, length: number): number;
  fighter_sizes(): number;
  fighter_reach(arms: number, stroke: number, player: number): number;
  fighter_stroke_arc(stroke: number): number;
}

/** The page's own count of the numbers in a fighter, an intent and a glance (`fighters.ts`). */
export const PAGE_SIZES: CombatSizes = { fighter: FIGHTER_FLOATS, intent: INTENT_FLOATS, glance: GLANCE_FLOATS };

/** Refuses rules that count a fighter, an intent or a glance otherwise than the page: every number would be read in
 *  the wrong place. */
export function checkSizes(sizes: CombatSizes): void {
  const { fighter, intent, glance } = PAGE_SIZES;
  if (sizes.fighter !== fighter || sizes.intent !== intent || sizes.glance !== glance)
    throw new Error("the game's rules are from another version than this page. Reload the page");
}

/** Starts the fight's rules from the compiled `room-wasm` module; refused, with a word why, if they are not the
 *  page's own. */
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
  checkSizes(sizes);
  const floatBytes = (floats: Float64Array) => new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  return {
    sizes,
    setCourse: (blocks) => {
      const floats = new Float64Array(blockFloats(blocks));
      lend(floatBytes(floats), (address) => exports.fighter_course(address, floats.byteLength));
    },
    setRim: (blocks) => {
      const floats = new Float64Array(blockFloats(blocks));
      return lend(floatBytes(floats), (address) => exports.fighter_rim(address, floats.byteLength)) === 1;
    },
    setGround: (windowJson) => {
      const text = new TextEncoder().encode(windowJson ?? '');
      return lend(text, (address) => exports.fighter_ground(address, text.length)) === 1;
    },
    setDungeon: (ask) => {
      const text = new TextEncoder().encode(JSON.stringify(ask));
      return lend(text, (address) => exports.fighter_dungeon(address, text.length)) === 1;
    },
    setHeights: (grid) => {
      const floats = new Float64Array(grid);
      return lend(floatBytes(floats), (address) => exports.fighter_heights(address, floats.byteLength)) === 1;
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

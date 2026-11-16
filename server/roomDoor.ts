/** A block of a room's course: its footprint (x east, y south, metres) and its top. */
export interface CourseBlock {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
}

/** What became of a player's input: the room took it, or why not. */
export type InputAnswer = 'taken' | 'not an input' | 'out of order' | 'no such player';

/** By the door's numbers (room-wasm's TAKEN, NOT_AN_INPUT, OUT_OF_ORDER, NO_SUCH_PLAYER). */
const ANSWERS: readonly InputAnswer[] = ['taken', 'not an input', 'out of order', 'no such player'];

/** One room, running in the `room-wasm` module: the room crate and its messages. */
export interface RoomDoor {
  /** How long one tick is, in seconds: the room is ticked that often. */
  readonly tickSeconds: number;
  /** Opens the room on a course, its players standing at the spawn when they join; false if the course is not one. */
  open(spawn: { readonly x: number; readonly y: number }, blocks: readonly CourseBlock[]): boolean;
  /** A new player's number, or 0 when the room is full. */
  join(): number;
  /** The welcome's bytes for a player. */
  joined(player: number): Uint8Array;
  leave(player: number): void;
  input(player: number, bytes: Uint8Array): InputAnswer;
  tick(): void;
  /** Every player after the last tick, as a snapshot's bytes. */
  snapshot(): Uint8Array;
}

interface RoomExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  room_tick_seconds(): number;
  room_open(address: number, length: number): number;
  room_join(): number;
  room_joined(player: number): bigint;
  room_leave(player: number): void;
  room_input(player: number, address: number, length: number): number;
  room_tick(): void;
  room_snapshot(): bigint;
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
    join: () => exports.room_join(),
    joined: (player) => take(exports.room_joined(player)),
    leave: (player) => exports.room_leave(player),
    input: (player, bytes) =>
      ANSWERS[lend(bytes, (address) => exports.room_input(player, address, bytes.length))] ?? 'not an input',
    tick: () => exports.room_tick(),
    snapshot: () => take(exports.room_snapshot()),
  };
}

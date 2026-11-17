import { type CourseBlock, type CourseNode, type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import { readFromRoom } from './messages.ts';
import type { GearMessage, RoomLink, Snapshot } from './roomConnection.ts';

/** A course's stall, where a social space's asks are answered, and its resource nodes. */
export interface Furnishing {
  readonly stall: { readonly x: number; readonly y: number } | null;
  readonly nodes: readonly CourseNode[];
}

/** A room in the page itself, for playing alone: the same room crate the servers run, in its own WebAssembly, ticked
 *  by the page's clock, its snapshots handed on as a server's would be. */
export class LocalRoom implements RoomLink {
  private readonly door: RoomDoor;
  private readonly snapshot: (snapshot: Snapshot) => void;
  private readonly gear: (gear: GearMessage) => void;
  private carry = 0;
  readonly player: number;
  readonly dressed = [];
  /** A room in the page is never lost. */
  readonly lost = null;

  private constructor(door: RoomDoor, snapshot: (snapshot: Snapshot) => void, gear: (gear: GearMessage) => void) {
    this.door = door;
    this.snapshot = snapshot;
    this.gear = gear;
    this.player = door.join();
  }

  /** Opens a room on a course from the compiled `room-wasm` module, its player standing at `spawn`, with its stall and
   *  resource nodes laid out; each snapshot goes to `snapshot`, and the player's own gear to `gear`. */
  static open(
    module: WebAssembly.Module,
    spawn: { readonly x: number; readonly y: number },
    blocks: readonly CourseBlock[],
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
    furnishing: Furnishing = { stall: null, nodes: [] },
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.open(spawn, blocks)) throw new Error('the course is not one a room can stand on');
    door.furnish(furnishing.stall, furnishing.nodes);
    return new LocalRoom(door, snapshot, gear);
  }

  /** Opens the sea round the continents of a layout file's text from the compiled `room-wasm` module, its player
   *  joined, their ship not yet at sea. */
  static openSea(module: WebAssembly.Module, layoutText: string, snapshot: (snapshot: Snapshot) => void): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.openSea(layoutText)) throw new Error('the world’s layout is not one the sea can open round');
    return new LocalRoom(door, snapshot, () => undefined);
  }

  send(bytes: Uint8Array<ArrayBuffer>): void {
    this.door.input(this.player, bytes);
  }

  /** Ticks the room as many whole ticks as `seconds` and what was carried make, handing on each tick's snapshot. */
  pump(seconds: number): void {
    this.carry += seconds;
    while (this.carry >= this.door.tickSeconds) {
      this.carry -= this.door.tickSeconds;
      this.door.tick();
      const message = readFromRoom(this.door.snapshot());
      if (message?.kind === 'snapshot') this.snapshot(message);
      const gear = readFromRoom(this.door.gear(this.player));
      if (gear?.kind === 'gear') this.gear(gear);
    }
  }
}

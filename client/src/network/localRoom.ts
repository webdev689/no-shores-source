import { type CourseBlock, type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import { readFromRoom } from './messages.ts';
import type { RoomLink, Snapshot } from './roomConnection.ts';

/** A room in the page itself, for playing alone: the same room crate the servers run, in its own WebAssembly, ticked
 *  by the page's clock, its snapshots handed on as a server's would be. */
export class LocalRoom implements RoomLink {
  private readonly door: RoomDoor;
  private readonly snapshot: (snapshot: Snapshot) => void;
  private carry = 0;
  readonly player: number;
  readonly dressed = [];

  private constructor(door: RoomDoor, snapshot: (snapshot: Snapshot) => void) {
    this.door = door;
    this.snapshot = snapshot;
    this.player = door.join();
  }

  /** Opens a room on a course from the compiled `room-wasm` module, its player standing at `spawn`. */
  static open(
    module: WebAssembly.Module,
    spawn: { readonly x: number; readonly y: number },
    blocks: readonly CourseBlock[],
    snapshot: (snapshot: Snapshot) => void,
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.open(spawn, blocks)) throw new Error('the course is not one a room can stand on');
    return new LocalRoom(door, snapshot);
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
    }
  }
}

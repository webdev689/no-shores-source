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
  /** A room in the page is joined once and never lost. */
  readonly joins = 1;
  readonly rejoining = false;
  readonly lost = null;

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

  /** Opens a node's room from its file's text (as the bake writes it) from the compiled `room-wasm` module, its player
   *  joined at its first spawn. With `foeAsks` the player may ask it for foes, to try a fight on the node's land. */
  static openNode(
    module: WebAssembly.Module,
    nodeText: string,
    snapshot: (snapshot: Snapshot) => void,
    foeAsks = false,
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.openNode(nodeText)) throw new Error('the place is not one a room can stand on');
    if (foeAsks) door.takeFoeAsks();
    return new LocalRoom(door, snapshot);
  }

  /** Opens the sea round the continents of a layout file's text from the compiled `room-wasm` module, its player
   *  joined, their ship not yet at sea; its pirates come as `seed` draws them, a new sea each time by default. */
  static openSea(
    module: WebAssembly.Module,
    layoutText: string,
    snapshot: (snapshot: Snapshot) => void,
    seed = Math.floor(Math.random() * 2 ** 32),
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.openSea(layoutText, seed)) throw new Error('the world’s layout is not one the sea can open round');
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

/** The Sloop's build as the naval rules hold it, read through a door of its own on the compiled `room-wasm` module: the
 *  same rules the servers' sea rooms run (`RoomDoor.sloop`). */
export function sloopBuildText(module: WebAssembly.Module): string {
  return startRoomDoor(module).sloop();
}

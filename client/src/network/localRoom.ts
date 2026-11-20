import { type CourseBlock, type CourseNode, type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import type { ArtState } from './artMessages.ts';
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
  /** A room in the page is joined once and never lost. */
  readonly joins = 1;
  readonly rejoining = false;
  readonly lost = null;
  /** World time at the room's first tick, seconds, as its welcome says. */
  readonly epoch: number;
  /** The player's trim, and the arms they may take up, from the room's last word on their gear. */
  trim: readonly number[] | null = null;
  arms: readonly number[] | null = null;
  arts: ArtState | null = null;

  private constructor(door: RoomDoor, snapshot: (snapshot: Snapshot) => void, gear: (gear: GearMessage) => void) {
    this.door = door;
    this.snapshot = snapshot;
    this.gear = gear;
    this.player = door.join();
    const welcome = readFromRoom(door.joined(this.player));
    this.epoch = welcome?.kind === 'joined' ? welcome.epoch : 0;
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
    door.epoch(Date.now());
    door.furnish(furnishing.stall, furnishing.nodes);
    door.day(Math.floor(Date.now() / 86_400_000));
    return new LocalRoom(door, snapshot, gear);
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
    door.epoch(Date.now());
    if (foeAsks) door.takeFoeAsks();
    return new LocalRoom(door, snapshot, () => undefined);
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
    door.epoch(Date.now());
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
      // The player's gear before the snapshot, as the servers send it, so a change is predicted from the snapshot on.
      const gear = readFromRoom(this.door.gear(this.player));
      if (gear?.kind === 'gear') {
        if (gear.trim) this.trim = gear.trim;
        if (gear.arms) this.arms = gear.arms;
        if (gear.arts) this.arts = gear.arts;
        this.gear(gear);
      }
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

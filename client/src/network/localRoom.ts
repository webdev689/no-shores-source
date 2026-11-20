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

  private constructor(
    door: RoomDoor,
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void,
    player = door.join(),
  ) {
    this.door = door;
    this.snapshot = snapshot;
    this.gear = gear;
    this.player = player;
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
    door.minute(Math.floor(Date.now() / 60_000));
    return new LocalRoom(door, snapshot, gear);
  }

  /** Opens a room on a course laid over the open sea, as a wreck's decks are (`LocalRoom.open`, with no stall or
   *  nodes): its foes walk the blocks alone, as the sea under them is no ground. */
  static openOverSea(
    module: WebAssembly.Module,
    spawn: { readonly x: number; readonly y: number },
    blocks: readonly CourseBlock[],
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.open(spawn, blocks, true)) throw new Error('the course is not one a room can stand on');
    door.minute(Math.floor(Date.now() / 60_000));
    return new LocalRoom(door, snapshot, gear);
  }

  /** Opens a node's room from its file's text (as the bake writes it) from the compiled `room-wasm` module, its player
   *  joined at its first spawn, or before entrance `entrance`'s door; the player's own gear goes to `gear`. With
   *  `foeAsks` the player may ask it for foes, to try a fight on the node's land. */
  static openNode(
    module: WebAssembly.Module,
    nodeText: string,
    snapshot: (snapshot: Snapshot) => void,
    foeAsks = false,
    { gear = () => undefined, entrance }: { gear?: (gear: GearMessage) => void; entrance?: number } = {},
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.openNode(nodeText)) throw new Error('the place is not one a room can stand on');
    door.epoch(Date.now());
    if (foeAsks) door.takeFoeAsks();
    // An entrance the room does not have is an ordinary join, as the servers take it.
    const player = (entrance === undefined ? 0 : door.joinAt(entrance)) || door.join();
    return new LocalRoom(door, snapshot, gear, player);
  }

  /** Opens dungeon `number` of a patrol from the patrol's node file's text, from the compiled `room-wasm` module, its
   *  player joined at its way in; the player's own gear goes to `gear`. */
  static openDungeon(
    module: WebAssembly.Module,
    patrolText: string,
    number: number,
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
  ): LocalRoom {
    const door = startRoomDoor(module);
    if (!door.openDungeon(patrolText, number)) throw new Error('the dungeon is not one a room can stand in');
    return new LocalRoom(door, snapshot, gear);
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

  /** Stands a foe of the roster on the top under (x, y), its post there (`RoomDoor.standFoe`); its number, or 0. */
  standFoe(type: number, rank: number, x: number, y: number, facing: number, level: number): number {
    return this.door.standFoe(type, rank, x, y, facing, level);
  }

  /** Sends every foe away at once, as a scene clears its stage. */
  clearFoes(): void {
    this.door.clearFoes();
  }

  /** Sets where the next respawn stands the player: a checkpoint. */
  setSpawn(x: number, y: number): void {
    this.door.setSpawn(x, y);
  }

  /** Stands the player at once on the top under (x, y), as when they fall into the sea and are brought back. */
  putPlayer(x: number, y: number): void {
    this.door.putPlayer(this.player, x, y);
  }

  /** Stands a block on the course at once, as a way closing behind the player. */
  standBlock(block: CourseBlock): void {
    this.door.standBlock(block);
  }

  /** Takes a block from the course at once, as a way opening once the foes holding it have fallen. */
  takeBlock(block: CourseBlock): void {
    this.door.takeBlock(block);
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

// A room for playing alone, run in a worker of its own (`roomWorker.ts`): the same room the page ran (`LocalRoom`), its
// opening (a node's navmesh baked, a sea laid) and every tick off the game's thread, its snapshots handed on as they
// come, as a server's are.
import type { ArtState } from './artMessages.ts';
import type { GearMessage, RoomLink, Snapshot } from './roomConnection.ts';
import type { CourseBlock } from '../../../server/roomDoor.ts';
import type { FromRooms, Opening, StoryAsk, ToRooms } from './roomServe.ts';
import type { PortInfo } from '../rules/watersRules.ts';

/** How the game's thread reaches the rooms' worker: a worker of its own unless a test says otherwise. */
export interface RoomPort {
  post(told: ToRooms): void;
  hear(heard: (said: FromRooms) => void): void;
  /** `failed` is told why if the worker itself fails: it did not start, or an error escaped it. */
  fail(failed: (reason: string) => void): void;
}

const workerPort = (): RoomPort => {
  const worker = new Worker(new URL('./roomWorker.ts', import.meta.url), { type: 'module' });
  return {
    post: (told) => worker.postMessage(told),
    hear: (heard) => worker.addEventListener('message', (event: MessageEvent<FromRooms>) => heard(event.data)),
    fail: (failed) => worker.addEventListener('error', (event) => failed(event.message || 'the rooms’ worker failed')),
  };
};

let port: RoomPort | null = null;
// A worker that failed answers nothing more; every later opening is refused at once with why.
let portFailed: Error | null = null;
const rooms = new Map<number, RoomThread>();
const opening = new Map<number, { resolve: (room: RoomThread) => void; reject: (error: Error) => void }>();
const words = new Map<number, ((word: string) => void)[]>();
let next = 1;

/** The rooms' worker, started the first time a room opens; `given` in its place for a test. */
export function roomPort(given?: RoomPort): RoomPort {
  if (given || !port) {
    port = given ?? workerPort();
    portFailed = null;
    port.hear(heard);
    port.fail(workerFailed);
  }
  return port;
}

/** Every word still waited for from room `id` answered: none. */
function unasked(id: number): void {
  for (const answer of words.get(id) ?? []) answer('');
  words.delete(id);
}

/** The worker failed: every opening still waiting is refused and every room is lost, each told why. */
function workerFailed(reason: string): void {
  console.error(`the rooms for playing alone failed: ${reason}`);
  portFailed = new Error(reason);
  for (const [id, waiting] of opening) {
    opening.delete(id);
    waiting.reject(new Error(reason));
  }
  for (const [id, room] of rooms) {
    room.lost = reason;
    unasked(id);
  }
}

function heard(said: FromRooms): void {
  if (said.kind === 'opened' || said.kind === 'failed') {
    const waiting = opening.get(said.id);
    opening.delete(said.id);
    if (said.kind === 'failed') waiting?.reject(new Error(said.error));
    else waiting?.resolve(new RoomThread(said.id, said.player, said.epoch));
    return;
  }
  if (said.kind === 'word') {
    words.get(said.id)?.shift()?.(said.word);
    return;
  }
  const room = rooms.get(said.id);
  if (said.kind === 'lost') {
    console.error(`a room for playing alone was lost: ${said.error}`);
    if (room) room.lost = said.error;
    unasked(said.id);
    return;
  }
  if (said.kind === 'snapshot') room?.told(said.snapshot);
  else room?.geared(said.gear);
}

/** A room for playing alone, in the rooms' worker: a link as a server's room is, joined once, lost only if it fails. */
export class RoomThread implements RoomLink {
  readonly player: number;
  readonly epoch: number;
  readonly dressed = [];
  readonly joins = 1;
  readonly rejoining = false;
  lost: string | null = null;
  trim: readonly number[] | null = null;
  arms: readonly number[] | null = null;
  arts: ArtState | null = null;
  private readonly id: number;
  private snapshot: (snapshot: Snapshot) => void = () => undefined;
  private gear: (gear: GearMessage) => void = () => undefined;

  constructor(id: number, player: number, epoch: number) {
    [this.id, this.player, this.epoch] = [id, player, epoch];
  }

  /** Opens a room in the worker, `opening` as `LocalRoom` opens it, each snapshot going to `snapshot` and each word on
   *  the player's gear to `gear`. */
  private static open(
    module: WebAssembly.Module,
    how: Opening,
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
  ): Promise<RoomThread> {
    if (portFailed) return Promise.reject(portFailed);
    const id = next++;
    const opened = new Promise<RoomThread>((resolve, reject) => opening.set(id, { resolve, reject })).then((room) => {
      [room.snapshot, room.gear] = [snapshot, gear];
      rooms.set(id, room);
      return room;
    });
    roomPort().post({ kind: 'open', id, module, opening: how });
    return opened;
  }

  /** A node's room from its file's text, as `LocalRoom.openNode`: joined before entrance `entrance`'s door if given,
   *  the player's gear going to `gear`. */
  static openNode(
    module: WebAssembly.Module,
    nodeText: string,
    snapshot: (snapshot: Snapshot) => void,
    foeAsks = false,
    { gear, entrance, seas = 0 }: { gear?: (gear: GearMessage) => void; entrance?: number; seas?: number } = {},
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'node', nodeText, foeAsks, entrance, seas }, snapshot, gear);
  }

  /** Dungeon `number` of a patrol from the patrol's node file's text, as `LocalRoom.openDungeon`. */
  static openDungeon(
    module: WebAssembly.Module,
    patrolText: string,
    number: number,
    snapshot: (snapshot: Snapshot) => void,
    gear?: (gear: GearMessage) => void,
    seas = 0,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'dungeon', patrolText, number, seas }, snapshot, gear);
  }

  /** A dungeon's run from its ask, on a patrol's node file's text, as `LocalRoom.openRun`. */
  static openRun(
    module: WebAssembly.Module,
    ask: string,
    patrolText: string,
    snapshot: (snapshot: Snapshot) => void,
    gear?: (gear: GearMessage) => void,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'run', ask, patrolText }, snapshot, gear);
  }

  /** A passage zone's room from its ask, as `LocalRoom.openPassage`. */
  static openPassage(
    module: WebAssembly.Module,
    ask: string,
    snapshot: (snapshot: Snapshot) => void,
    gear?: (gear: GearMessage) => void,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'passage', ask }, snapshot, gear);
  }

  /** A Breach's run from its ask, as `LocalRoom.openBreach`. */
  static openBreach(
    module: WebAssembly.Module,
    ask: string,
    snapshot: (snapshot: Snapshot) => void,
    gear?: (gear: GearMessage) => void,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'breach', ask }, snapshot, gear);
  }

  /** The sea round a layout's continents, as `LocalRoom.openSea`, the player's gear going to `gear`. */
  static openSea(
    module: WebAssembly.Module,
    layoutText: string,
    snapshot: (snapshot: Snapshot) => void,
    seed = Math.floor(Math.random() * 2 ** 32),
    ports: readonly PortInfo[] = [],
    seas = 0,
    gear: (gear: GearMessage) => void = () => undefined,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'sea', layoutText, seed, ports, seas }, snapshot, gear);
  }

  /** A sea island's room on the sea's word on it, as `LocalRoom.openIsland`. */
  static openIsland(
    module: WebAssembly.Module,
    word: string,
    snapshot: (snapshot: Snapshot) => void,
    seas = 0,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'island', word, seas }, snapshot);
  }

  /** A wreck's room on its course over the open sea, as `LocalRoom.openOverSea`, the player standing at `spawn`. */
  static openOverSea(
    module: WebAssembly.Module,
    spawn: { readonly x: number; readonly y: number },
    blocks: readonly CourseBlock[],
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'overSea', spawn, blocks }, snapshot, gear);
  }

  /** A snapshot from the worker, handed on. */
  told(snapshot: Snapshot): void {
    this.snapshot(snapshot);
  }

  /** A word on the player's gear from the worker, kept as `LocalRoom` keeps it and handed on. */
  geared(gear: GearMessage): void {
    if (gear.trim) this.trim = gear.trim;
    if (gear.arms) this.arms = gear.arms;
    if (gear.arts) this.arts = gear.arts;
    this.gear(gear);
  }

  send(bytes: Uint8Array<ArrayBuffer>): void {
    roomPort().post({ kind: 'input', id: this.id, bytes });
  }

  /** The room's clock let run by `seconds`: it ticks in the worker, and its snapshots come as they are made. */
  pump(seconds: number): void {
    roomPort().post({ kind: 'pump', id: this.id, seconds });
  }

  /** The word on its island `isle` of the sea this room is, as an island's room opens on it; empty if none stands. */
  isleWord(isle: number): Promise<string> {
    return this.asked({ kind: 'word', id: this.id, isle });
  }

  /** One of the story's asks of the room (`StoryAsk`), made in the worker in the order asked, before any tick asked
   *  after it: its answer, a foe's number, 1 done or given, or 0 refused, as the room was lost or let go too. */
  async story(story: StoryAsk): Promise<number> {
    return Number(await this.asked({ kind: 'story', id: this.id, story })) || 0;
  }

  /** `told` posted, and the word answering it, as the worker answers each room's asks in turn. */
  private asked(told: ToRooms): Promise<string> {
    const answer = new Promise<string>((resolve) => words.set(this.id, [...(words.get(this.id) ?? []), resolve]));
    roomPort().post(told);
    return answer;
  }

  /** Lets the room go in the worker: nothing more of it is heard. */
  close(): void {
    rooms.delete(this.id);
    unasked(this.id);
    roomPort().post({ kind: 'close', id: this.id });
  }
}

// A room for playing alone, run in a worker of its own (`roomWorker.ts`): the same room the page ran (`LocalRoom`), its
// opening (a node's navmesh baked, a sea laid) and every tick off the game's thread, its snapshots handed on as they
// come, as a server's are.
import type { ArtState } from './artMessages.ts';
import type { RoomLink, Snapshot } from './roomConnection.ts';
import type { FromRooms, Opening, ToRooms } from './roomServe.ts';
import type { PortInfo } from '../rules/watersRules.ts';

/** How the game's thread reaches the rooms' worker: a worker of its own unless a test says otherwise. */
export interface RoomPort {
  post(told: ToRooms): void;
  hear(heard: (said: FromRooms) => void): void;
}

const workerPort = (): RoomPort => {
  const worker = new Worker(new URL('./roomWorker.ts', import.meta.url), { type: 'module' });
  return {
    post: (told) => worker.postMessage(told),
    hear: (heard) => worker.addEventListener('message', (event: MessageEvent<FromRooms>) => heard(event.data)),
  };
};

let port: RoomPort | null = null;
const rooms = new Map<number, RoomThread>();
const opening = new Map<number, { resolve: (room: RoomThread) => void; reject: (error: Error) => void }>();
const words = new Map<number, ((word: string) => void)[]>();
let next = 1;

/** The rooms' worker, started the first time a room opens; `given` in its place for a test. */
export function roomPort(given?: RoomPort): RoomPort {
  if (given || !port) {
    port = given ?? workerPort();
    port.hear(heard);
  }
  return port;
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
  if (said.kind === 'snapshot') room?.told(said.snapshot);
  else if (room) [room.trim, room.arms, room.arts] = [said.trim, said.arms, said.arts];
}

/** A room for playing alone, in the rooms' worker: a link as a server's room is, joined once and never lost. */
export class RoomThread implements RoomLink {
  readonly player: number;
  readonly epoch: number;
  readonly dressed = [];
  readonly joins = 1;
  readonly rejoining = false;
  readonly lost = null;
  trim: readonly number[] | null = null;
  arms: readonly number[] | null = null;
  arts: ArtState | null = null;
  private readonly id: number;
  private snapshot: (snapshot: Snapshot) => void = () => undefined;

  constructor(id: number, player: number, epoch: number) {
    [this.id, this.player, this.epoch] = [id, player, epoch];
  }

  /** Opens a room in the worker, `opening` as `LocalRoom` opens it, each snapshot going to `snapshot`. */
  private static open(
    module: WebAssembly.Module,
    how: Opening,
    snapshot: (snapshot: Snapshot) => void,
  ): Promise<RoomThread> {
    const id = next++;
    const opened = new Promise<RoomThread>((resolve, reject) => opening.set(id, { resolve, reject })).then((room) => {
      room.snapshot = snapshot;
      rooms.set(id, room);
      return room;
    });
    roomPort().post({ kind: 'open', id, module, opening: how });
    return opened;
  }

  /** A node's room from its file's text, as `LocalRoom.openNode`. */
  static openNode(
    module: WebAssembly.Module,
    nodeText: string,
    snapshot: (snapshot: Snapshot) => void,
    foeAsks = false,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'node', nodeText, foeAsks }, snapshot);
  }

  /** The sea round a layout's continents, as `LocalRoom.openSea`. */
  static openSea(
    module: WebAssembly.Module,
    layoutText: string,
    snapshot: (snapshot: Snapshot) => void,
    seed = Math.floor(Math.random() * 2 ** 32),
    ports: readonly PortInfo[] = [],
    seas = 0,
  ): Promise<RoomThread> {
    return RoomThread.open(module, { how: 'sea', layoutText, seed, ports, seas }, snapshot);
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

  /** A snapshot from the worker, handed on. */
  told(snapshot: Snapshot): void {
    this.snapshot(snapshot);
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
    const answer = new Promise<string>((resolve) => words.set(this.id, [...(words.get(this.id) ?? []), resolve]));
    roomPort().post({ kind: 'word', id: this.id, isle });
    return answer;
  }

  /** Lets the room go in the worker: nothing more of it is heard. */
  close(): void {
    rooms.delete(this.id);
    words.delete(this.id);
    roomPort().post({ kind: 'close', id: this.id });
  }
}

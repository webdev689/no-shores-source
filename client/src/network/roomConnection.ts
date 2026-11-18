import { type FromRoomMessage, type JoinedNode, type PlayerDress, courseBytes, readFromRoom } from './messages.ts';

/** A room's snapshot, as a link hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;
type Welcome = Extract<FromRoomMessage, { kind: 'joined' }>;

/** A browser's way into a room, wherever the room runs: the player's number and the dresses at their last welcome;
 *  how many welcomes it has had (each rejoin is a new join, with a new number and inputs numbered from 1 again);
 *  whether it is rejoining after its socket closed; why it was lost for good (null while it holds or rejoins); their
 *  inputs sent, and the room's clock let run (a room in the page ticks itself; one elsewhere runs on its own). */
export interface RoomLink {
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  readonly joins: number;
  readonly rejoining: boolean;
  readonly lost: string | null;
  send(bytes: Uint8Array<ArrayBuffer>): void;
  pump(seconds: number): void;
}

/** Opens a WebSocket to a room's address: the browser's own, or a test's stand-in. */
export type Connect = (url: string) => WebSocket;

/** Seconds before the next try to rejoin, after `tries` tries since the room last welcomed the player: 1, 2, 4, 8,
 *  then 15 at most. */
export function rejoinWait(tries: number): number {
  return Math.min(15, 2 ** tries);
}

/** The codes a room closes a socket with when it sends its player away for not keeping to the messages (too many,
 *  too large, or not one, worker.ts): rejoining would only be sent away again. */
const SENT_AWAY = [1008, 1009];

/** Hands on a socket's messages: its welcome to `welcomed`, each snapshot to `snapshot`. */
function hear(socket: WebSocket, welcomed: (welcome: Welcome) => void, snapshot: (snapshot: Snapshot) => void): void {
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const message = readFromRoom(new Uint8Array(event.data));
    if (message?.kind === 'joined') welcomed(message);
    else if (message?.kind === 'snapshot') snapshot(message);
  });
}

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick (or, at sea, their ship's
 *  course), and hands on every snapshot. When its socket closes for a deploy or a dropped network, it joins the room
 *  again by itself, waiting longer after each try that fails (`rejoinWait`). */
export class RoomConnection implements RoomLink {
  private socket: WebSocket;
  private readonly url: string;
  private readonly snapshot: (snapshot: Snapshot) => void;
  private readonly connect: Connect;
  /** The player's number in the room, every dress in it when they joined, and its node in a node's room, from its
   *  last welcome. */
  player: number;
  dressed: readonly PlayerDress[];
  node: JoinedNode | null;
  joins = 1;
  rejoining = false;
  /** Why the room sent the player away, in its words where it gave them; null while the link holds or rejoins. */
  lost: string | null = null;
  private tries = 0;
  private closed = false;
  private waiting: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    url: string,
    snapshot: (snapshot: Snapshot) => void,
    connect: Connect,
    socket: WebSocket,
    welcome: Welcome,
  ) {
    [this.url, this.snapshot, this.connect, this.socket] = [url, snapshot, connect, socket];
    [this.player, this.dressed, this.node] = [welcome.player, welcome.dressed, welcome.node];
    this.watch(socket);
  }

  /** Joins the room at `url` (`ws://…/room/<name>`); resolves once the room has welcomed the player, and fails if it
   *  closes first (a full room says so). */
  static open(
    url: string,
    snapshot: (snapshot: Snapshot) => void,
    connect: Connect = (address) => new WebSocket(address),
  ): Promise<RoomConnection> {
    return new Promise((resolve, reject) => {
      const socket = connect(url);
      hear(socket, (welcome) => resolve(new RoomConnection(url, snapshot, connect, socket, welcome)), snapshot);
      socket.addEventListener('error', () => reject(new Error(`the room at ${url} could not be reached`)));
      socket.addEventListener('close', (event) =>
        reject(new Error(`the room at ${url} closed: ${event.reason || 'it gave no reason'}`)),
      );
    });
  }

  /** Once `socket` closes, unless the page closed it or the room sent the player away, tries again after a wait. */
  private watch(socket: WebSocket): void {
    socket.addEventListener('close', (event) => {
      if (socket !== this.socket || this.closed) return;
      if (SENT_AWAY.includes(event.code)) {
        [this.rejoining, this.lost] = [false, event.reason || 'the room sent the player away'];
        return;
      }
      this.rejoining = true;
      this.waiting = setTimeout(() => this.rejoin(), rejoinWait(this.tries++) * 1000);
    });
  }

  private rejoin(): void {
    this.waiting = null;
    const socket = this.connect(this.url);
    this.socket = socket;
    hear(socket, (welcome) => this.welcomed(socket, welcome), this.snapshot);
    this.watch(socket);
  }

  /** A new welcome: the player joined again, as the room numbers them now. */
  private welcomed(socket: WebSocket, welcome: Welcome): void {
    if (socket !== this.socket || this.closed) return;
    [this.player, this.dressed, this.node] = [welcome.player, welcome.dressed, welcome.node];
    [this.joins, this.tries, this.rejoining] = [this.joins + 1, 0, false];
  }

  /** Sends one tick's input bytes; while the socket is not open, nothing is sent. */
  send(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(bytes);
  }

  /** Sends the sea room the player's ship's course and pace; while the socket is not open, nothing is sent. */
  sendCourse(points: readonly (readonly [number, number])[], pace: number): void {
    this.send(courseBytes(points, pace));
  }

  /** Whether the socket is open: a room that dropped the player, or a network that dropped the room, closes it. */
  get open(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  /** Leaves the room: the socket closes, the room lets the player go, and no rejoin is tried. */
  close(): void {
    this.closed = true;
    if (this.waiting !== null) clearTimeout(this.waiting);
    this.socket.close();
  }

  /** The room runs on its own clock, on the server. */
  pump(): void {}
}

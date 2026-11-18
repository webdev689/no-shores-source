import { type FromRoomMessage, type JoinedNode, type PlayerDress, courseBytes, readFromRoom } from './messages.ts';
import { PROTOCOL } from '../../../generated/messages/ts/version.ts';

/** A room's snapshot, as a link hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;
/** The player's own gear, as a link hands it on whenever it changes. */
export type GearMessage = Extract<FromRoomMessage, { kind: 'gear' }>;

/** A browser's way into a room, wherever the room runs: the player's number and the dresses at their welcome, why the
 *  link was lost (null while it holds), their inputs sent, and the room's clock let run (a room in the page ticks
 *  itself; one elsewhere runs on its own). */
export interface RoomLink {
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  readonly lost: string | null;
  send(bytes: Uint8Array<ArrayBuffer>): void;
  pump(seconds: number): void;
  /** The player's trim, from the room's last word on their gear; none until it sends it. */
  readonly trim?: readonly number[] | null;
  /** The arms the room lets the player take up, from its last word on their gear; none until it sends it. */
  readonly arms?: readonly number[] | null;
}

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick (or, at sea, their ship's
 *  course), and hands on every snapshot. */
export class RoomConnection implements RoomLink {
  private readonly socket: WebSocket;
  /** The player's number in the room, every dress in it when they joined, and its node in a node's room, from its
   *  welcome. */
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  readonly node: JoinedNode | null;
  /** Why the socket closed, in the server's words where it gave them; null while it is open. */
  lost: string | null = null;
  /** The player's trim, and the arms they may take up, from the room's last word on their gear. */
  trim: readonly number[] | null = null;
  arms: readonly number[] | null = null;

  private constructor(socket: WebSocket, welcome: Extract<FromRoomMessage, { kind: 'joined' }>) {
    this.socket = socket;
    this.player = welcome.player;
    this.dressed = welcome.dressed;
    this.node = welcome.node;
    socket.addEventListener('close', (event) => {
      this.lost = event.reason || 'the connection closed';
    });
  }

  /** Joins the room at `url` (`ws://…/room/<name>`); resolves once the room has welcomed the player, and fails if it
   *  closes first (a full room says so). Each snapshot goes to `snapshot`, and the player's own gear to `gear`. With
   *  a session's token, the room is sent it once welcomed, to keep the player's character. */
  static open(
    url: string,
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
    session: string | null = null,
  ): Promise<RoomConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let made: RoomConnection | null = null;
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('error', () => reject(new Error(`the room at ${url} could not be reached`)));
      socket.addEventListener('close', (event) =>
        reject(new Error(`the room at ${url} closed: ${event.reason || 'it gave no reason'}`)),
      );
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const message = readFromRoom(new Uint8Array(event.data));
        if (message?.kind === 'joined') {
          if (message.protocol !== PROTOCOL) {
            socket.close(1000, 'another protocol');
            reject(new Error('The game was updated. Load the page again.'));
            loadAgainFor(message.protocol);
            return;
          }
          if (session !== null) socket.send(session);
          made = new RoomConnection(socket, message);
          resolve(made);
        } else if (message?.kind === 'snapshot') snapshot(message);
        else if (message?.kind === 'gear') {
          if (made && message.trim) made.trim = message.trim;
          if (made && message.arms) made.arms = message.arms;
          gear(message);
        }
      });
    });
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

  /** Leaves the room: the socket closes, and the room lets the player go. */
  close(): void {
    this.socket.close();
  }

  /** The room runs on its own clock, on the server. */
  pump(): void {}
}

/** Loads the page again for a room that speaks another protocol, once for each protocol, so a page a deploy left
 *  behind takes the new one without looping should the two still differ. */
function loadAgainFor(protocol: number): void {
  const key = 'overlook.protocol';
  try {
    if (globalThis.sessionStorage.getItem(key) === String(protocol)) return;
    globalThis.sessionStorage.setItem(key, String(protocol));
    globalThis.location.reload();
  } catch {
    // No storage, or no page: the join fails, and says why.
  }
}

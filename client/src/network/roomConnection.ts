import { type FromRoomMessage, type PlayerDress, readFromRoom } from './messages.ts';

/** A room's snapshot, as a link hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

/** A browser's way into a room, wherever the room runs: the player's number and the dresses at their welcome, why the
 *  link was lost (null while it holds), their inputs sent, and the room's clock let run (a room in the page ticks
 *  itself; one elsewhere runs on its own). */
export interface RoomLink {
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  readonly lost: string | null;
  send(bytes: Uint8Array<ArrayBuffer>): void;
  pump(seconds: number): void;
}

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick, and hands on every snapshot. */
export class RoomConnection implements RoomLink {
  private readonly socket: WebSocket;
  /** The player's number in the room, and every dress in it when they joined, from its welcome. */
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  /** Why the socket closed, in the server's words where it gave them; null while it is open. */
  lost: string | null = null;

  private constructor(socket: WebSocket, player: number, dressed: readonly PlayerDress[]) {
    this.socket = socket;
    this.player = player;
    this.dressed = dressed;
    socket.addEventListener('close', (event) => {
      this.lost = event.reason || 'the connection closed';
    });
  }

  /** Joins the room at `url` (`ws://…/room/<name>`); resolves once the room has welcomed the player, and fails if it
   *  closes first (a full room says so). */
  static open(url: string, snapshot: (snapshot: Snapshot) => void): Promise<RoomConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('error', () => reject(new Error(`the room at ${url} could not be reached`)));
      socket.addEventListener('close', (event) =>
        reject(new Error(`the room at ${url} closed: ${event.reason || 'it gave no reason'}`)),
      );
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const message = readFromRoom(new Uint8Array(event.data));
        if (message?.kind === 'joined') resolve(new RoomConnection(socket, message.player, message.dressed));
        else if (message?.kind === 'snapshot') snapshot(message);
      });
    });
  }

  /** Sends one tick's input bytes; while the socket is not open, nothing is sent. */
  send(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(bytes);
  }

  /** The room runs on its own clock, on the server. */
  pump(): void {}
}

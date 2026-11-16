import { type FromRoomMessage, type PlayerDress, readFromRoom } from './messages.ts';

/** A room's snapshot, as a link hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

/** A browser's way into a room, wherever the room runs: the player's number and the dresses at their welcome, their
 *  inputs sent, and the room's clock let run (a room in the page ticks itself; one elsewhere runs on its own). */
export interface RoomLink {
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  send(bytes: Uint8Array<ArrayBuffer>): void;
  pump(seconds: number): void;
}

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick, and hands on every snapshot. */
export class RoomConnection implements RoomLink {
  private readonly socket: WebSocket;
  /** The player's number in the room, and every dress in it when they joined, from its welcome. */
  readonly player: number;
  readonly dressed: readonly PlayerDress[];

  private constructor(socket: WebSocket, player: number, dressed: readonly PlayerDress[]) {
    this.socket = socket;
    this.player = player;
    this.dressed = dressed;
  }

  /** Joins the room at `url` (`ws://…/room/<name>`); resolves once the room has welcomed the player. */
  static open(url: string, snapshot: (snapshot: Snapshot) => void): Promise<RoomConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('error', () => reject(new Error(`the room at ${url} could not be reached`)));
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

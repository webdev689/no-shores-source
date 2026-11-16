import type { Controls } from '../rules/movementRules.ts';
import { type FromRoomMessage, inputBytes, readFromRoom } from './messages.ts';

/** A room's snapshot, as the connection hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick, and hands on every snapshot. */
export class RoomConnection {
  private readonly socket: WebSocket;
  /** The player's number in the room, from its welcome. */
  readonly player: number;

  private constructor(socket: WebSocket, player: number) {
    this.socket = socket;
    this.player = player;
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
        if (message?.kind === 'joined') resolve(new RoomConnection(socket, message.player));
        else if (message?.kind === 'snapshot') snapshot(message);
      });
    });
  }

  /** Sends one tick's controls, numbered `sequence`; while the socket is not open, nothing is sent. */
  send(sequence: number, controls: Controls): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(inputBytes(sequence, controls));
  }
}

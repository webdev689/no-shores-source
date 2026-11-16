import type { Controls } from '../rules/movementRules.ts';
import {
  type FromRoomMessage,
  type JoinedNode,
  type Look,
  type PlayerDress,
  courseBytes,
  inputBytes,
  readFromRoom,
} from './messages.ts';

/** A room's snapshot, as the connection hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick (or, at sea, their ship's
 *  course), and hands on every snapshot. */
export class RoomConnection {
  private readonly socket: WebSocket;
  /** The player's number in the room, every dress in it when they joined, and its node in a node's room, from its
   *  welcome. */
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  readonly node: JoinedNode | null;

  private constructor(socket: WebSocket, welcome: Extract<FromRoomMessage, { kind: 'joined' }>) {
    this.socket = socket;
    this.player = welcome.player;
    this.dressed = welcome.dressed;
    this.node = welcome.node;
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
        if (message?.kind === 'joined') resolve(new RoomConnection(socket, message));
        else if (message?.kind === 'snapshot') snapshot(message);
      });
    });
  }

  /** Sends one tick's controls, numbered `sequence`, with what the player's figure shows, their dress when it
   *  changed, and whether they ask to respawn; while the socket is not open, nothing is sent. */
  send(sequence: number, controls: Controls, look: Look, dress?: string, respawn = false): void {
    if (this.socket.readyState === WebSocket.OPEN)
      this.socket.send(inputBytes(sequence, controls, look, dress, respawn));
  }

  /** Sends the sea room the player's ship's course and pace; while the socket is not open, nothing is sent. */
  sendCourse(points: readonly (readonly [number, number])[], pace: number): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(courseBytes(points, pace));
  }

  /** Leaves the room: the socket closes, and the room lets the player go. */
  close(): void {
    this.socket.close();
  }
}

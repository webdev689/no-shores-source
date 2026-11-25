import type { ArtState } from './artMessages.ts';
import { type FromRoomMessage, type JoinedNode, type PlayerDress, readFromRoom } from './messages.ts';
import type { PlayerPlate } from './plateMessages.ts';
import { ROOM_TICK_S, WORLD_CLOCK } from '../sky/worldClock.ts';
import { LinkMeasure, type Measured } from './linkMeasure.ts';
import { SnapshotKeeper } from './snapshots.ts';
import { PROTOCOL } from '../../../generated/messages/ts/version.ts';

/** A room's snapshot, as a link hands it on. */
export type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;
/** The player's own gear, as a link hands it on whenever it changes. */
export type GearMessage = Extract<FromRoomMessage, { kind: 'gear' }>;
type Welcome = Extract<FromRoomMessage, { kind: 'joined' }>;

/** A browser's way into a room, wherever the room runs: the player's number and the dresses at their last welcome;
 *  how many welcomes it has had (each rejoin is a new join, with a new number and inputs numbered from 1 again);
 *  whether it is rejoining after its socket closed; why it was lost for good (null while it holds or rejoins); their
 *  inputs sent, and the room's clock let run (a room in the page ticks itself; one elsewhere runs on its own). */
export interface RoomLink {
  readonly player: number;
  readonly dressed: readonly PlayerDress[];
  /** Everyone's plate at the last welcome; none from a room in the page, where no one else plays. */
  readonly plates?: readonly PlayerPlate[];
  readonly joins: number;
  readonly rejoining: boolean;
  readonly lost: string | null;
  /** World time at the room's first tick, seconds, from its last welcome; none from a stand-in that never says. */
  readonly epoch?: number;
  send(bytes: Uint8Array<ArrayBuffer>): void;
  pump(seconds: number): void;
  /** Lets the room go, where the link holds one open: a socket, or a room in a worker. */
  close?(): void;
  /** Sends the session's token again, so the room names the player by a username taken since they joined. */
  named?(): void;
  /** The player's trim, from the room's last word on their gear; none until it sends it. */
  readonly trim?: readonly number[] | null;
  /** The arms the room lets the player take up, from its last word on their gear; none until it sends it. */
  readonly arms?: readonly number[] | null;
  /** The player's Arts, from the room's last word on their gear; none until it sends it. */
  readonly arts?: ArtState | null;
  /** Why the room's gate shut to the player, in its words; null while it is open, and always for a room alone. */
  readonly shut?: string | null;
  /** How many inputs before each go with it, on a link that may lose one; none on a WebSocket, which loses none. */
  readonly resend?: number;
  /** Told each input's number as it is sent, for a link that measures its lag (`linkMeasure.ts`). */
  readonly inputSent?: (sequence: number) => void;
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
/** The code a room closes with when it turns the player away and says why, its gate shut to their character or its
 *  node locked (worker.ts): rejoining would be turned away again. */
export const SHUT = 4003;
/** The code a room closes with once the player's character is taken by another of their sockets, in this room or
 *  another (worker.ts): joining again would take it back, and the two would send each other away for ever. */
export const ELSEWHERE = 4001;

/** What a socket's messages go to: its welcome, each snapshot, and the player's own gear. */
interface Heard {
  readonly welcomed: (welcome: Welcome) => void;
  readonly snapshot: (snapshot: Snapshot) => void;
  readonly gear: (gear: GearMessage) => void;
  /** Each snapshot as it came, and whether it was made whole and handed on, for the link's measure. */
  readonly came?: (snapshot: Snapshot, kept: boolean) => void;
}

/** Hands on a socket's messages to `heard`. */
function hear(socket: WebSocket, heard: Heard): void {
  socket.binaryType = 'arraybuffer';
  // Each socket is one join: the snapshots it holds to build on start with it.
  const kept = new SnapshotKeeper();
  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const message = readFromRoom(new Uint8Array(event.data));
    const whole = message?.kind === 'snapshot' ? kept.whole(message) : null;
    if (message?.kind === 'snapshot') heard.came?.(message, whole !== null);
    if (message?.kind === 'joined') heard.welcomed(message);
    else if (whole) heard.snapshot(whole);
    else if (message?.kind === 'gear') heard.gear(message);
  });
}

/** The words a join fails with when the room speaks another protocol than the page. */
const UPDATED = 'The game was updated. Load the page again.';
/** Why a room was not joined, as the player is told it. */
const UNREACHED = 'the room could not be reached';

/** A browser's WebSocket to one room: it joins, sends the player's input for each tick (or, at sea, their ship's
 *  course), and hands on every snapshot. When its socket closes for a deploy or a dropped network, it joins the room
 *  again by itself, waiting longer after each try that fails (`rejoinWait`). */
export class RoomConnection implements RoomLink {
  private socket: WebSocket;
  private readonly url: string;
  private readonly snapshot: (snapshot: Snapshot) => void;
  private readonly gear: (gear: GearMessage) => void;
  private readonly session: string | null;
  private readonly connect: Connect;
  /** The player's number in the room, every dress in it when they joined, and its node in a node's room, from its
   *  last welcome. */
  player: number;
  dressed: readonly PlayerDress[];
  plates: readonly PlayerPlate[];
  node: JoinedNode | null;
  joins = 1;
  rejoining = false;
  epoch: number;
  /** Why the room sent the player away, in its words where it gave them; null while the link holds or rejoins. */
  lost: string | null = null;
  /** Why the room's gate shut to the player, in its words; null while it is open. */
  shut: string | null = null;
  /** The player's trim, and the arms they may take up, from the room's last word on their gear. */
  trim: readonly number[] | null = null;
  arms: readonly number[] | null = null;
  arts: ArtState | null = null;
  private tries = 0;
  private closed = false;
  private readonly measure = new LinkMeasure();
  private waiting: ReturnType<typeof setTimeout> | null = null;
  /** The last welcome, until a snapshot after it carries its dresses and plates on. */
  private welcomeUnheard: Welcome | null = null;

  private constructor(
    url: string,
    heard: { snapshot: (snapshot: Snapshot) => void; gear: (gear: GearMessage) => void; session: string | null },
    connect: Connect,
    socket: WebSocket,
    welcome: Welcome,
  ) {
    // Each snapshot's tick says the room's world time, which keeps the page's clock in step with the room's. The last
    // welcome's dresses and plates go under the first snapshot after it, so what is newer is never undone by them.
    const told = (shot: Snapshot) => {
      WORLD_CLOCK.heard(this.epoch + Number(shot.tick) * ROOM_TICK_S);
      const welcome = this.welcomeUnheard;
      this.welcomeUnheard = null;
      const dressed = welcome ? [...welcome.dressed, ...shot.dressed] : shot.dressed;
      heard.snapshot(welcome ? { ...shot, dressed, plates: [...welcome.plates, ...shot.plates] } : shot);
    };
    [this.url, this.snapshot, this.gear, this.session] = [url, told, heard.gear, heard.session];
    [this.connect, this.socket] = [connect, socket];
    [this.player, this.dressed, this.node, this.epoch] = [welcome.player, welcome.dressed, welcome.node, welcome.epoch];
    [this.plates, this.welcomeUnheard] = [welcome.plates, welcome];
    this.watch(socket);
  }

  /** Joins the room at `url` (`ws://…/room/<name>`); resolves once the room has welcomed the player, and fails if it
   *  closes first (a full room says so) or speaks another protocol (the page loads again for it). Each snapshot goes to
   *  `snapshot`, and the player's own gear to `gear`. With a session's token, the room is sent it once welcomed, and
   *  on each rejoin, to keep the player's character. */
  static open(
    url: string,
    snapshot: (snapshot: Snapshot) => void,
    gear: (gear: GearMessage) => void = () => undefined,
    session: string | null = null,
    connect: Connect = (address) => new WebSocket(address),
  ): Promise<RoomConnection> {
    return new Promise((resolve, reject) => {
      const socket = connect(url);
      let made: RoomConnection | null = null;
      const welcomed = (welcome: Welcome) => {
        if (welcome.protocol !== PROTOCOL) {
          socket.close(1000, 'another protocol');
          reject(new Error(UPDATED));
          loadAgainFor(welcome.protocol);
          return;
        }
        if (session !== null) socket.send(session);
        made = new RoomConnection(url, { snapshot, gear, session }, connect, socket, welcome);
        resolve(made);
      };
      const told = (shot: Snapshot) => (made ? made.snapshot(shot) : snapshot(shot));
      const came = (shot: Snapshot, kept: boolean) => made?.came(shot, kept);
      hear(socket, { welcomed, snapshot: told, gear: (sent) => (made ? made.heard(sent) : gear(sent)), came });
      // The player is told in words; the room's address is for the console.
      socket.addEventListener(
        'error',
        () => (console.warn(`${url} could not be reached`), reject(new Error(UNREACHED))),
      );
      socket.addEventListener('close', (event) =>
        reject(new Error(`the room closed: ${event.reason || 'it gave no reason'}`)),
      );
    });
  }

  /** Once `socket` closes, unless the page closed it or the room sent the player away, tries again after a wait. */
  private watch(socket: WebSocket): void {
    socket.addEventListener('close', (event) => {
      if (socket !== this.socket || this.closed) return;
      if (SENT_AWAY.includes(event.code) || event.code === SHUT || event.code === ELSEWHERE) {
        [this.rejoining, this.lost] = [false, event.reason || 'the room sent the player away'];
        if (event.code === SHUT) this.shut = this.lost;
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
    const welcomed = (welcome: Welcome) => this.welcomed(socket, welcome);
    hear(socket, { welcomed, snapshot: this.snapshot, gear: (sent) => this.heard(sent), came: this.came });
    this.watch(socket);
  }

  /** A new welcome: the player joined again, as the room numbers them now; a room deployed with another protocol
   *  sends the page to load again. */
  private welcomed(socket: WebSocket, welcome: Welcome): void {
    if (socket !== this.socket || this.closed) return;
    if (welcome.protocol !== PROTOCOL) {
      [this.closed, this.rejoining, this.lost] = [true, false, UPDATED];
      socket.close(1000, 'another protocol');
      loadAgainFor(welcome.protocol);
      return;
    }
    if (this.session !== null) socket.send(this.session);
    [this.player, this.dressed, this.node, this.epoch] = [welcome.player, welcome.dressed, welcome.node, welcome.epoch];
    [this.plates, this.welcomeUnheard] = [welcome.plates, welcome];
    [this.joins, this.tries, this.rejoining] = [this.joins + 1, 0, false];
    this.measure.clear();
  }

  named(): void {
    if (this.session !== null && !this.rejoining && this.socket.readyState === WebSocket.OPEN)
      this.socket.send(this.session);
  }

  /** The room's word on the player's gear: its trim and arms kept, and the whole handed on. */
  private heard(gear: GearMessage): void {
    if (gear.trim) this.trim = gear.trim;
    if (gear.arms) this.arms = gear.arms;
    if (gear.arts) this.arts = gear.arts;
    this.gear(gear);
  }

  /** Sends one tick's input bytes; while the socket is not open, or a rejoin's socket is open but not yet welcomed,
   *  nothing is sent: an input numbered for the last join would be out of order in the new one. */
  send(bytes: Uint8Array<ArrayBuffer>): void {
    if (!this.rejoining && this.socket.readyState === WebSocket.OPEN) this.socket.send(bytes);
  }

  /** The link's lag and loss as the page measures them. */
  get measured(): Measured {
    return this.measure.measured;
  }

  readonly inputSent = (sequence: number): void => this.measure.sent(sequence, performance.now());

  private readonly came = (snapshot: Snapshot, kept: boolean): void => {
    const own = snapshot.players.find((seen) => seen.player === this.player);
    if (own) this.measure.snapshot(own.acknowledged, kept, performance.now());
  };

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

/** Loads the page again for a room that speaks another protocol, once for each protocol, so a page a deploy left
 *  behind takes the new one without looping should the two still differ. */
function loadAgainFor(protocol: number): void {
  const key = 'noshores.protocol';
  try {
    if (globalThis.sessionStorage.getItem(key) === String(protocol)) return;
    globalThis.sessionStorage.setItem(key, String(protocol));
    globalThis.location.reload();
  } catch {
    // No storage, or no page: the join fails, and says why.
  }
}

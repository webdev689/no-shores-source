import { DurableObject } from 'cloudflare:workers';
import course from '../content/testground/course.json' with { type: 'json' };
import layout from '../content/world/layout.json' with { type: 'json' };
import roomModule from '../target/wasm32-unknown-unknown/release/room_wasm.wasm';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

interface Env {
  readonly ROOMS: DurableObjectNamespace<RoomHost>;
  /** The bake's node files (`generated/nodes/<id>.json`), as static assets only the rooms read. */
  readonly NODES: Fetcher;
}

/** The most bytes one input may be: an input with the largest dress fits well inside it. */
const MESSAGE_MOST = 8192;

/** Who a WebSocket belongs to, kept on the socket so it outlives the object's sleep. */
interface Attachment {
  readonly player: number;
}

/** The most sockets a room holds: a guard against one client opening sockets without end, since every snapshot
 *  carries every player to every socket. A room on land holds fewer players than this; the sea counts on it. */
const MAX_PLAYERS = 64;

/** A room's name from its address, `/room/<name>`: lowercase letters, digits and hyphens. */
function roomName(request: Request): string | null {
  return /^\/room\/([a-z0-9-]{1,40})$/.exec(new URL(request.url).pathname)?.[1] ?? null;
}

/**
 * One room on Cloudflare: a Durable Object, one for each room's name, that keeps the room in WebAssembly. Its name
 * says which: `sea` is the sea, `node-<id>` that node's room on its baked window of the land, and any other the Test
 * Ground's course. Players join by WebSocket; each binary message is one of their inputs, or at sea their ship's
 * course. While anyone is in, it ticks the room in step with the clock and sends every player the snapshot after each
 * tick.
 */
export class RoomHost extends DurableObject<Env> {
  private readonly room: RoomDoor = startRoomDoor(roomModule);
  private opened: Promise<boolean> | null = null;
  private ticking: ReturnType<typeof setInterval> | null = null;
  /** Players this object has let go of, whose sockets may still be closing. */
  private readonly gone = new Set<number>();
  private started = 0;
  private ticks = 0;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('A room is joined by WebSocket', { status: 426 });
    this.opened ??= this.openRoom(roomName(request) ?? '').catch(() => false);
    if (!(await this.opened)) {
      // Nothing opened, so nothing is lost by asking again on the next join.
      this.opened = null;
      return new Response('No such room', { status: 404 });
    }
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response('The room is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.guarded(() => this.room.join(), 0);
    if (player === 0) {
      // A full room still takes the socket, to say why it closes.
      server.accept();
      server.close(1013, 'the room is full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ player } satisfies Attachment);
    server.send(this.room.joined(player));
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Opens the room its name says, once: a node's from its baked file, which only that node's room reads. */
  private async openRoom(name: string): Promise<boolean> {
    if (name === 'sea') return this.room.openSea(JSON.stringify(layout));
    const node = /^node-(.+)$/.exec(name)?.[1];
    if (node === undefined) return this.room.open(course.start, course.blocks);
    const file = await this.env.NODES.fetch(`https://nodes/${node}.json`);
    return file.ok && this.room.openNode(await file.text());
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const { player } = socket.deserializeAttachment() as Attachment;
    if (typeof message !== 'string' && message.byteLength > MESSAGE_MOST)
      return this.dismiss(socket, 1009, 'too large');
    const answer =
      typeof message === 'string'
        ? 'not an input'
        : this.guarded(() => this.room.input(player, new Uint8Array(message)), 'not an input');
    // A second course in a tick is only dropped, and a course the sea will not sail only refused; anything else but
    // an input taken means the browser is not speaking the protocol, so it goes.
    if (answer !== 'taken' && answer !== 'too soon' && answer !== 'refused') this.dismiss(socket, 1008, answer);
  }

  override webSocketClose(socket: WebSocket): void {
    this.left(socket);
  }

  override webSocketError(socket: WebSocket): void {
    this.left(socket);
  }

  /** Closes a socket and takes its player out at once, so no snapshot is sent to it while it closes. */
  private dismiss(socket: WebSocket, code: number, reason: string): void {
    this.left(socket);
    socket.close(code, reason);
  }

  private left(socket: WebSocket): void {
    const { player } = socket.deserializeAttachment() as Attachment;
    if (this.gone.has(player)) return;
    this.gone.add(player);
    this.guarded(() => this.room.leave(player), undefined);
    const others = this.open().filter((each) => each !== socket);
    if (others.length === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }

  /** The sockets still open, and not one this object has already let go of. */
  private open(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => {
      const { player } = socket.deserializeAttachment() as Attachment;
      return socket.readyState === WebSocket.OPEN && !this.gone.has(player);
    });
  }

  /** A call into the room; if the room's WebAssembly traps, it cannot be trusted again: every player is told and the
   *  object starts over. */
  private guarded<T>(call: () => T, fallback: T): T {
    try {
      return call();
    } catch {
      for (const socket of this.ctx.getWebSockets()) socket.close(1011, 'the room failed');
      this.ctx.abort('the room trapped');
      return fallback;
    }
  }

  /** Ticks the room as often as its clock says, catching up whole ticks the timer was late for. */
  private startTicking(): void {
    if (this.ticking) return;
    const tickMs = this.room.tickSeconds * 1000;
    this.started = Date.now() - this.ticks * tickMs;
    this.ticking = setInterval(() => {
      const due = Math.floor((Date.now() - this.started) / tickMs);
      if (this.ticks >= due) return;
      while (this.ticks < due) {
        this.guarded(() => this.room.tick(), undefined);
        this.ticks++;
      }
      const snapshot = this.guarded(() => this.room.snapshot(), new Uint8Array());
      for (const socket of this.open()) {
        try {
          socket.send(snapshot);
        } catch {
          // A socket that closed between the check and the send misses this snapshot; the rest still get theirs.
        }
      }
    }, tickMs);
  }
}

/** Sends `/room/<name>` to that room's object; a name is lowercase letters, digits and hyphens. */
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const name = roomName(request);
    if (!name) return new Response('Not found', { status: 404 });
    return env.ROOMS.getByName(name).fetch(request);
  },
} satisfies ExportedHandler<Env>;

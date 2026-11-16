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

/** Who a WebSocket belongs to, kept on the socket so it outlives the object's sleep. */
interface Attachment {
  readonly player: number;
}

/** The most players a room holds: a guard against one client opening sockets without end, since every snapshot
 *  carries every player to every socket. */
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
  private started = 0;
  private ticks = 0;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('A room is joined by WebSocket', { status: 426 });
    this.opened ??= this.open(roomName(request) ?? '').catch(() => false);
    if (!(await this.opened)) {
      // Nothing opened, so nothing is lost by asking again on the next join.
      this.opened = null;
      return new Response('No such room', { status: 404 });
    }
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response('The room is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.room.join();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ player } satisfies Attachment);
    server.send(this.room.joined(player));
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Opens the room its name says, once: a node's from its baked file, which only that node's room reads. */
  private async open(name: string): Promise<boolean> {
    if (name === 'sea') return this.room.openSea(JSON.stringify(layout));
    const node = /^node-(.+)$/.exec(name)?.[1];
    if (node === undefined) return this.room.open(course.start, course.blocks);
    const file = await this.env.NODES.fetch(`https://nodes/${node}.json`);
    return file.ok && this.room.openNode(await file.text());
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const { player } = socket.deserializeAttachment() as Attachment;
    const answer = typeof message === 'string' ? 'not an input' : this.room.input(player, new Uint8Array(message));
    // A flood is only dropped, and a course the sea will not sail only refused; anything else wrong means the browser
    // is not speaking the protocol, so it goes.
    if (answer !== 'taken' && answer !== 'too many waiting' && answer !== 'refused') {
      socket.close(1008, answer);
      this.left(socket);
    }
  }

  override webSocketClose(socket: WebSocket): void {
    this.left(socket);
  }

  override webSocketError(socket: WebSocket): void {
    this.left(socket);
  }

  private left(socket: WebSocket): void {
    this.room.leave((socket.deserializeAttachment() as Attachment).player);
    const others = this.ctx.getWebSockets().filter((each) => each !== socket);
    if (others.length === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
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
        this.room.tick();
        this.ticks++;
      }
      const snapshot = this.room.snapshot();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(snapshot);
        } catch {
          // A socket the room has closed is listed until the browser answers; the others still get the tick.
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

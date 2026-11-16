import { DurableObject } from 'cloudflare:workers';
import course from '../content/testground/course.json' with { type: 'json' };
import roomModule from '../target/wasm32-unknown-unknown/release/room_wasm.wasm';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

interface Env {
  readonly ROOMS: DurableObjectNamespace<RoomHost>;
}

/** Who a WebSocket belongs to, kept on the socket so it outlives the object's sleep. */
interface Attachment {
  readonly player: number;
}

/**
 * One room on Cloudflare: a Durable Object, one for each room's name, that keeps the room in WebAssembly. Players
 * join by WebSocket; each binary message is one of their inputs. While anyone is in, it ticks the room in step with
 * the clock and sends every player the snapshot after each tick.
 */
export class RoomHost extends DurableObject<Env> {
  private readonly room: RoomDoor = startRoomDoor(roomModule);
  private ticking: ReturnType<typeof setInterval> | null = null;
  private started = 0;
  private ticks = 0;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.room.open(course.start, course.blocks);
  }

  override fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('A room is joined by WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.room.join();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ player } satisfies Attachment);
    server.send(this.room.joined(player));
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const { player } = socket.deserializeAttachment() as Attachment;
    const answer = typeof message === 'string' ? 'not an input' : this.room.input(player, new Uint8Array(message));
    // A flood is only dropped; anything else wrong means the browser is not speaking the protocol, so it goes.
    if (answer !== 'taken' && answer !== 'too many waiting') socket.close(1008, answer);
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
      for (const socket of this.ctx.getWebSockets()) socket.send(snapshot);
    }, tickMs);
  }
}

/** Sends `/room/<name>` to that room's object; a name is lowercase letters, digits and hyphens. */
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const name = /^\/room\/([a-z0-9-]{1,40})$/.exec(new URL(request.url).pathname)?.[1];
    if (!name) return new Response('Not found', { status: 404 });
    return env.ROOMS.getByName(name).fetch(request);
  },
} satisfies ExportedHandler<Env>;

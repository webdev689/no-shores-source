import { DurableObject } from 'cloudflare:workers';
import course from '../content/testground/course.json' with { type: 'json' };
import layout from '../content/world/layout.json' with { type: 'json' };
import roomModule from '../target/wasm32-unknown-unknown/release/room_wasm.wasm';
import type { CharacterKeeper } from './accounts/worker.ts';
import { type Count, counted } from './budget.ts';
import { Keeper, TOKEN } from './keeping.ts';
import { isleRoom, nodeRoom, seaRoom, seaRoomName } from './roomNames.ts';
import { SEA_PORTS } from './seaPorts.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

interface Env {
  readonly ROOMS: DurableObjectNamespace<RoomHost>;
  /** The bake's node files (`generated/nodes/<id>.json`), as static assets only the rooms read. */
  readonly NODES: Fetcher;
  /** The accounts' keeper of characters (`accounts/worker.ts`), through a service binding. */
  readonly ACCOUNTS: Service<CharacterKeeper>;
}

/** A day, milliseconds: the vendors' wares change with it. */
const DAY_MS = 86_400_000;

/** How often the sea says again who is there: half of how long the accounts keep its word. */
const PRESENT_EVERY_MS = 30_000;

/** How often an island's room tells the sea that players stand ashore on it, so it does not fade under them. */
const ASHORE_EVERY_MS = 60_000;

/** The close code for a player whose character joined another room. */
const ELSEWHERE = 4001;

/** The close code for a player turned away from a locked node's room. */
const LOCKED = 4003;

/** The most bytes one input may be: an input with the largest dress fits well inside it. */
const MESSAGE_MOST = 8192;

/** The most sockets a room holds: a guard against one client opening sockets without end, since every snapshot
 *  carries every player to every socket. A room on land holds fewer players than this; the sea counts on it. */
const MAX_PLAYERS = 64;

/** A room's name from its address, `/room/<name>`: lowercase letters, digits and hyphens. */
function roomName(request: Request): string | null {
  return /^\/room\/([a-z0-9-]{1,40})$/.exec(new URL(request.url).pathname)?.[1] ?? null;
}

/**
 * One room on Cloudflare: a Durable Object, one for each room's name, that keeps the room in WebAssembly. Its name
 * says which: `sea` is the sea (`--elite` or `--abyss` after it at a voyage's harder difficulty), `node-<id>` that
 * node's room on its baked window of the land (with the same tiers), `isle-<number>-<seed>` an island a sea rolled
 * (with its sea's tier), opened on that sea's word, `fleet-<name>` a fleet's place on the open sea, and any other the
 * Test Ground's course. Players join by WebSocket; each binary message is one of their inputs, at sea their ship's
 * course, or in a fleet their ship's orders. While anyone is in, it ticks the room with the clock and sends every
 * player each tick's snapshot. Its sockets live and die with it: the room is kept only in memory. A browser's one
 * text message is its session's token; in a node's room, an island's and at sea, its character is kept (`keeping.ts`).
 */
export class RoomHost extends DurableObject<Env> {
  private readonly room: RoomDoor = startRoomDoor(roomModule);
  private opened: Promise<boolean> | null = null;
  private ticking: ReturnType<typeof setInterval> | null = null;
  /** Each player's socket, by its player's number, and their messages in the second they last sent in (`budget.ts`);
   *  a player let go of is gone from it, though their socket may still be closing. */
  private readonly players = new Map<
    WebSocket,
    { readonly player: number; count: Count | undefined; signed: boolean; spoke: boolean; token: string | null }
  >();
  private keeper: Keeper | null = null;
  private name = '';
  private lastKept = 0;
  private lastPresent = 0;
  private started = 0;
  private ticks = 0;
  /** An island's room: the island's number at sea, its sea room's name, and when it last told that sea players stand
   *  ashore. */
  private island: { readonly id: number; readonly seed: string; readonly sea: string; told: number } | null = null;

  /** The sea's word on its island `id`, for that island's room: empty unless this is the open sea and it stands. */
  async islandWord(id: number): Promise<string> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return '';
    return this.guarded(() => this.room.seaIsland(id), '');
  }

  /** Whether the sea has `account` landed on its island `id` of `seed`, for that island's room: its ship at rest at
   *  the island's anchorage when last at sea. */
  async landed(id: number, seed: string, account: string): Promise<boolean> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return false;
    return this.guarded(() => this.room.seaLanded(id, seed, account), false);
  }

  /** Holds the sea's island `id` of `seed` while players stand ashore on it: whether it stands. */
  async holdAshore(id: number, seed: string): Promise<boolean> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return false;
    return this.guarded(() => this.room.holdAshore(id, seed), false);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('A room is joined by WebSocket', { status: 426 });
    this.opened ??= this.openRoom(roomName(request) ?? '').catch(() => false);
    if (!(await this.opened)) {
      // Nothing opened, so nothing is lost by asking again on the next join.
      this.opened = null;
      return new Response('No such room', { status: 404 });
    }
    if (this.players.size >= MAX_PLAYERS) return new Response('The room is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.guarded(() => this.room.join(), 0);
    if (player === 0) {
      // A full room, or a locked node's, still takes the socket, to say why it closes.
      const locked = this.guarded(() => this.room.refusal(), null);
      server.accept();
      server.close(locked === null ? 1013 : LOCKED, locked ?? 'the room is full');
      return new Response(null, { status: 101, webSocket: client });
    }
    server.binaryType = 'arraybuffer';
    server.accept();
    this.players.set(server, { player, count: undefined, signed: false, spoke: false, token: null });
    server.addEventListener('message', (event) => this.message(server, event.data));
    server.addEventListener('close', () => this.left(server));
    server.addEventListener('error', () => this.left(server));
    // Ticking first: a room waking from rest sets its first tick's time anew, which the welcome carries.
    this.startTicking();
    server.send(this.room.joined(player));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Opens the room its name says, once: a node's from its baked file, which only that node's room reads. */
  private async openRoom(name: string): Promise<boolean> {
    this.name = name;
    const accounts = this.env.ACCOUNTS;
    const room = {
      character: (player: number) => this.guarded(() => this.room.character(player), null),
      restoreCharacter: (player: number, kept: string) =>
        this.guarded(() => this.room.restoreCharacter(player, kept), false),
      own: (player: number, account: string) => {
        const owned = this.guarded(() => this.room.own(player, account), false);
        if (owned && this.island) void this.landOn(this.island, player, account);
        return owned;
      },
    };
    const characters = {
      claim: (token: string, holder: string) => accounts.claim(token, holder),
      save: (account: string, holder: string, body: string) => accounts.save(account, holder, body),
      release: (account: string, holder: string, body: string | null) => accounts.release(account, holder, body),
    };
    // The game's nodes and the sea keep characters (at sea, with their ship's hurts): the Test Ground grants gear to try
    // it, and a fleet room is the World Editor's.
    const seas = seaRoom(name);
    const keeps = name.startsWith('node-') || name.startsWith('isle-') || seas !== null;
    this.keeper = new Keeper(keeps ? characters : null, room, name, (player) => {
      const socket = [...this.players].find(([, held]) => held.player === player)?.[0];
      if (socket) this.dismiss(socket, ELSEWHERE, 'your character joined another room');
    });
    // At sea a player's courses wait for the keeper's word, so a ship comes back where the room last kept it.
    if (seas !== null)
      return (
        this.room.openSea(
          JSON.stringify({ layout, ports: SEA_PORTS }),
          crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
          Date.now() / 1000,
        ) &&
        this.room.difficulty(seas) &&
        this.room.keepCharacters()
      );
    if (name.startsWith('fleet-')) return this.room.openFleet(Date.now() / 1000);
    const isle = /^isle-(.+)$/.exec(name)?.[1];
    if (isle !== undefined) return this.openIsland(isle);
    const node = /^node-(.+)$/.exec(name)?.[1];
    // Every room on land rolls its loot from a seed of its own that no player sees.
    const [lootLow = 0, lootHigh = 0, worldLow = 0, worldHigh = 0] = crypto.getRandomValues(new Uint32Array(4));
    const seeds = [lootLow, lootHigh, worldLow, worldHigh] as const;
    if (node === undefined)
      return (
        this.room.open(course.start, course.blocks) &&
        this.room.furnish(course.stall, course.resources) &&
        this.room.reseed(seeds)
      );
    const named = nodeRoom(node);
    if (!named) return false;
    const file = await this.env.NODES.fetch(`https://nodes/${named.id}.json`);
    const opened = file.ok && this.room.openNode(await file.text()) && this.room.difficulty(named.seas);
    return opened && this.room.reseed(seeds) && this.room.day(Math.floor(Date.now() / DAY_MS));
  }

  /** Opens an island's room on the word of the sea room its name's tier says: only an island that sea holds, with the
   *  seed its name gives, its guards raised to that sea's difficulty. */
  private async openIsland(name: string): Promise<boolean> {
    const named = isleRoom(name);
    if (!named) return false;
    const sea = seaRoomName(named.seas);
    const word = await this.env.ROOMS.getByName(sea).islandWord(named.id);
    if (!word || (JSON.parse(word) as { seed?: string }).seed !== named.seed) return false;
    this.island = { id: named.id, seed: named.seed, sea, told: Date.now() };
    const [lootLow = 0, lootHigh = 0, worldLow = 0, worldHigh = 0] = crypto.getRandomValues(new Uint32Array(4));
    // Only an account the sea says is landed here scavenges: nobody sails ashore from afar by naming the room.
    const opened = this.room.openIsland(word) && this.room.checkLandings() && this.room.difficulty(named.seas);
    return opened && this.room.reseed([lootLow, lootHigh, worldLow, worldHigh]);
  }

  /** Asks the sea whether a player's account is landed on this room's island: landed, they may scavenge; not, they
   *  are let go. A sea that does not answer lets nobody go, and lands nobody. */
  private async landOn(
    island: { readonly id: number; readonly seed: string; readonly sea: string },
    player: number,
    account: string,
  ): Promise<void> {
    const landed = await this.env.ROOMS.getByName(island.sea)
      .landed(island.id, island.seed, account)
      .catch(() => null);
    if (landed === true) this.guarded(() => this.room.land(account), false);
    else if (landed === false) {
      const socket = [...this.players].find(([, held]) => held.player === player)?.[0];
      if (socket) this.dismiss(socket, 1008, 'your ship does not lie at this island');
    }
  }

  private message(socket: WebSocket, message: string | ArrayBuffer): void {
    const held = this.players.get(socket);
    // A flood still arriving when its socket was let go of costs nothing more.
    if (!held) return;
    const { player } = held;
    const { count, within } = counted(held.count, Date.now());
    const here = () => this.players.get(socket) === held;
    if (typeof message === 'string' && TOKEN.test(message) && !held.signed) {
      held.signed = true;
      held.count = count;
      // Whatever the keeper answers, the sea then sails the course it held: from where it kept the ship, if it did.
      void (this.keeper?.signIn(player, message, Date.now, here) ?? Promise.resolve(false))
        .catch(() => false)
        .then(() => {
          if (here()) this.guarded(() => this.room.noneKept(player), undefined);
        });
      // At sea the room also says who is there, for the Roster.
      if (seaRoom(this.name) !== null) {
        held.token = message;
        void this.env.ACCOUNTS.present(message, this.name).catch(() => false);
      }
      return;
    }
    held.count = count;
    // At sea an input before any token sails at once; a token after it still gives the ship back where it was kept.
    if (seaRoom(this.name) !== null && !held.signed && !held.spoke) {
      held.spoke = true;
      this.guarded(() => this.room.noneKept(player), undefined);
    }
    if (!within) return this.dismiss(socket, 1008, 'too many messages');
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

  /** Closes a socket and takes its player out at once, so no snapshot is sent to it while it closes. */
  private dismiss(socket: WebSocket, code: number, reason: string): void {
    this.left(socket);
    socket.close(code, reason);
  }

  private left(socket: WebSocket): void {
    const held = this.players.get(socket);
    if (!held) return;
    this.players.delete(socket);
    if (held.token) void this.env.ACCOUNTS.present(held.token, null).catch(() => false);
    // The character's last save reads it now, before the room lets the player go.
    void this.keeper?.leave(held.player);
    this.guarded(() => this.room.leave(held.player), undefined);
    const others = this.open().filter((each) => each !== socket);
    if (others.length === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }

  /** The sockets still open, and not one this object has already let go of. */
  private open(): WebSocket[] {
    return [...this.players.keys()].filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  /** A call into the room; if the room's WebAssembly traps, it cannot be trusted again: every player is told and the
   *  object starts over. */
  private guarded<T>(call: () => T, fallback: T): T {
    try {
      return call();
    } catch {
      for (const socket of this.players.keys()) socket.close(1011, 'the room failed');
      this.ctx.abort('the room trapped');
      return fallback;
    }
  }

  /** Ticks the room as often as its clock says, catching up whole ticks the timer was late for. */
  private startTicking(): void {
    if (this.ticking) return;
    const tickMs = this.room.tickSeconds * 1000;
    this.started = Date.now() - this.ticks * tickMs;
    this.guarded(() => this.room.epoch(this.started), undefined);
    this.ticking = setInterval(() => {
      const due = Math.floor((Date.now() - this.started) / tickMs);
      if (this.ticks >= due) return;
      while (this.ticks < due) {
        this.guarded(() => this.room.tick(), undefined);
        this.ticks++;
      }
      // Taken once, then cut for each player: what the sea tells one goes to them alone.
      this.guarded(() => this.room.snapshotPrepare(), undefined);
      for (const socket of this.open()) {
        const held = this.players.get(socket);
        const snapshot = held
          ? this.guarded(() => this.room.snapshotFor(held.player), new Uint8Array())
          : new Uint8Array();
        // Each player's own gear goes to them alone, when it changed.
        const gear = held ? this.guarded(() => this.room.gear(held.player), new Uint8Array()) : new Uint8Array();
        if (held && gear.length > 0) this.keeper?.changed(held.player);
        try {
          // Gear first, so the browser predicts a change of trim or arms from this snapshot on.
          if (gear.length > 0) socket.send(gear);
          if (snapshot.length > 0) socket.send(snapshot);
        } catch {
          // A socket that closed between the check and the send misses this snapshot; the rest still get theirs.
        }
      }
      const now = Date.now();
      // Said again before the last word lapses, for each player at sea.
      if (now - this.lastPresent >= PRESENT_EVERY_MS) {
        this.lastPresent = now;
        for (const held of this.players.values())
          if (held.token) void this.env.ACCOUNTS.present(held.token, this.name).catch(() => false);
      }
      if (this.island && now - this.island.told >= ASHORE_EVERY_MS) {
        this.island.told = now;
        const island = this.island;
        // An island the sea no longer holds (it faded, or the sea restarted) is not held again, whatever has its number.
        void this.env.ROOMS.getByName(island.sea)
          .holdAshore(island.id, island.seed)
          .then((stands) => {
            if (!stands && this.island === island) this.island = null;
          })
          .catch(() => false);
      }
      if (now - this.lastKept >= 1000) {
        this.lastKept = now;
        void this.keeper?.due(now);
        this.guarded(() => this.room.day(Math.floor(now / DAY_MS)), false);
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

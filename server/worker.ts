import { DurableObject } from 'cloudflare:workers';
import course from '../content/testground/course.json' with { type: 'json' };
import layout from '../content/world/layout.json' with { type: 'json' };
import roomModule from '../target/wasm32-unknown-unknown/release/room_wasm.wasm';
import type { CharacterKeeper } from './accounts/worker.ts';
import { type Listed, arrives, cameOutOf, reachOf, shipOf } from './arrival.ts';
import { addressKey } from './address.ts';
import { type Count, admitsFrom, counted } from './budget.ts';
import { delveAsk } from './delveHost.ts';
import { Keeper, partFrom, TOKEN, TOKEN_WAIT_MS } from './keeping.ts';
import { OutpostHost, outpostGround } from './outpostHost.ts';
import { openPassageRoom, passagesOf } from './passageHost.ts';
import {
  entranceOf,
  isleRoom,
  nodeRoom,
  passageRoom,
  privateRun,
  roomName,
  runAsk,
  seaDungeonRoom,
  seaRoom,
  seaRoomName,
  socketsMost,
  TEST_GROUND,
} from './roomNames.ts';
import { SEA_PORTS } from './seaPorts.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

interface Env {
  readonly ROOMS: DurableObjectNamespace<RoomHost>;
  /** The bake's node files (`generated/nodes/<id>.json`), as static assets only the rooms read. */
  readonly NODES: Fetcher;
  /** The accounts' keeper of characters (`accounts/worker.ts`), through a service binding. */
  readonly ACCOUNTS: Service<CharacterKeeper>;
}

/** A minute, milliseconds: the rooms' clock (`gear::clock`) counts in them. */
const MINUTE_MS = 60_000;

/** How long an emptied run's room stays as its company left it, through a dropped connection, before it is
 *  forgotten. */
const RUN_LINGER_MS = 60_000;

/** How often the sea says again who is there: half of how long the accounts keep its word. */
const PRESENT_EVERY_MS = 30_000;
/** How often a player's token, sent again, names them anew at most. */
const RENAMED_EVERY_MS = 5_000;

/** How long a sea island's dungeon holds a player for the sea's word that they landed: a token's wait, a claim's own
 *  waits, and the sea's answer. */
const LAND_WAIT_MS = 20_000;
/** How often an island's room tells the sea that players stand ashore on it, so it does not fade under them. */
const ASHORE_EVERY_MS = 60_000;

/** The close code for a player whose character joined another room. */
const ELSEWHERE = 4001;
/** The close code for a player the room turns away and tells why: its gate shuts to their character, or its node is
 *  locked. */
const SHUT = 4003;
/** The close code for a player a run cannot keep for now, the accounts not answering: the page joins again. */
const AGAIN = 1013;

/** The most bytes one input may be: an input with the largest dress fits well inside it. */
const MESSAGE_MOST = 8192;

/** A session token's SHA-256, in hex: what the sea knows a ship played unkept by, never the token itself. */
async function sessionHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * One room on Cloudflare: a Durable Object for each room's name (`roomNames.ts`), keeping the room in WebAssembly:
 * `sea` the sea (with `--elite` or `--abyss` at a harder tier); `node-...` a node's room, a patrol's shared dungeon, or
 * a run (`--run-<instance>`, kept to one company); `sea-dungeon-...` a sea island's dungeon and `isle-...` an island a
 * sea rolled, each opened on that sea's word; `passage-...` a passage zone's room (`passageRoom`); `fleet-<name>` a
 * fleet's place; `test-<name>` the Test Ground's course.
 * Each binary message on a player's WebSocket is an input. While anyone is in, it ticks the room with the clock and
 * sends each player each tick's snapshot. Its sockets live and die with it: the room is kept only in memory, so a
 * socket must never outlast it. A browser's one text message is its session's token, which keeps its character.
 */
export class RoomHost extends DurableObject<Env> {
  private readonly room: RoomDoor = startRoomDoor(roomModule);
  private opened: Promise<boolean> | null = null;
  /** Why the room did not open, told to whoever came: a passage zone of a week gone, or none its web holds. */
  private why = '';
  private ticking: ReturnType<typeof setInterval> | null = null;
  /** Each player's socket, by its player's number, and their messages in the second they last sent in (`budget.ts`);
   *  a player let go of is gone from it, though their socket may still be closing. */
  private readonly players = new Map<
    WebSocket,
    {
      readonly player: number;
      /** The address it joined from (`addressKey`), which holds only so many sockets unsigned (`admitsFrom`). */
      readonly address: string;
      count: Count | undefined;
      signed: boolean;
      spoke: boolean;
      token: string | null;
      /** The entrance a player was joined before, until the room learns whether they came out of its dungeon; and whether
       *  they log back in here (`?relog=1`), to stand where their kept character left this social space. */
      door: number | null;
      relog?: boolean;
      /** At sea, the water their ship lay in as the accounts last took it (unset till they do), which the chat's Region
       *  is; and the word on it in flight, so each is said after the last. */
      water?: string | null;
      presenting?: Promise<unknown>;
      /** When their token last came again, naming them anew. */
      renamed?: number;
    }
  >();
  private keeper: Keeper | null = null;
  /** The wait before an emptied run is forgotten, while it runs. */
  private closing: ReturnType<typeof setTimeout> | null = null;
  private name = '';
  private lastKept = 0;
  private lastPresent = 0;
  private started = 0;
  private ticks = 0;
  /** An island's room or its dungeon's: the island's number at sea, its sea room's name, and when it last told that
   *  sea players stand ashore. */
  private island: { readonly id: number; readonly seed: string; readonly sea: string; told: number } | null = null;
  /** In a sea island's dungeon, the players the sea says are landed on its island: no one else's inputs are played. */
  private readonly ashore = new Set<number>();
  /** At a guild's outpost, what stands its plot and runs its players' errands with the accounts. */
  private outpost: OutpostHost | null = null;

  /** The sea's word on its island `id`, for that island's room: empty unless this is the open sea and it stands. */
  async islandWord(id: number): Promise<string> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return '';
    return this.guarded(() => this.room.seaIsland(id), '');
  }

  /** The sea's word on the island whose door leads into the dungeon `room` (its name at Normal), for that dungeon's
   *  room: empty unless this is the open sea and an island it holds has that door. */
  async dungeonWord(room: string): Promise<string> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return '';
    return this.guarded(() => this.room.seaDungeon(room), '');
  }

  /** The number of the sea's landing of `account` on its island `id` of `seed`, for that island's room (its ship at
   *  rest at the island's anchorage when last at sea), or 0 if it is not landed there. */
  async landed(id: number, seed: string, account: string): Promise<number> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return 0;
    return this.guarded(() => this.room.seaLanded(id, seed, account), 0);
  }

  /** Holds the sea's island `id` of `seed` while players stand ashore on it: whether it stands. */
  async holdAshore(id: number, seed: string): Promise<boolean> {
    if (seaRoom(this.name) === null || !(await (this.opened ?? Promise.resolve(false)))) return false;
    return this.guarded(() => this.room.holdAshore(id, seed), false);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('A room is joined by WebSocket', { status: 426 });
    if (this.closing) clearTimeout(this.closing);
    this.closing = null;
    this.opened ??= this.openRoom(roomName(request) ?? '').catch(() => false);
    const opened = await this.opened;
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    if (!opened) {
      // Nothing opened, so nothing is lost by asking again on the next join.
      this.opened = null;
      if (this.why === '') return new Response('No such room', { status: 404 });
      server.accept();
      server.close(SHUT, this.why);
      return new Response(null, { status: 101, webSocket: client });
    }
    // Past its sockets the room still takes one, to say why it closes: a page never reads a refused upgrade's status.
    if (this.players.size >= socketsMost(this.name)) {
      server.accept();
      server.close(1013, 'the room is full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const address = addressKey(request.headers.get('CF-Connecting-IP') ?? 'nowhere');
    if (!admitsFrom(this.players.values(), address)) {
      server.accept();
      server.close(AGAIN, 'too many joins from one address');
      return new Response(null, { status: 101, webSocket: client });
    }
    // A join at an entrance that is not one is the room's ordinary join; one at an entrance stays there only once the
    // room keeps the player's character as come out of its dungeon (`outOfDoor`).
    const entrance = entranceOf(request);
    const atDoor = entrance === null ? 0 : this.guarded(() => this.room.joinAt(entrance), 0);
    const player = atDoor || this.guarded(() => this.room.join(), 0);
    if (player === 0) {
      // A full room, or a locked node's, still takes the socket, to say why it closes.
      const locked = this.guarded(() => this.room.refusal(), null);
      server.accept();
      server.close(locked === null ? 1013 : SHUT, locked ?? 'the room is full');
      return new Response(null, { status: 101, webSocket: client });
    }
    server.binaryType = 'arraybuffer';
    server.accept();
    const door = atDoor ? entrance : null;
    const relog = new URL(request.url).searchParams.get('relog') === '1';
    const held = { player, address, count: undefined, signed: false, spoke: false, token: null, door, relog };
    this.players.set(server, held);
    if (held.door !== null) setTimeout(() => !held.signed && this.outOfDoor(server), TOKEN_WAIT_MS);
    // In a run no one plays before the room keeps their character, nor in a sea island's dungeon before the sea says
    // they are landed on its island: their inputs are taken in their order and stand still until then.
    if (privateRun(this.name) || this.name.startsWith('sea-dungeon-') || this.outpost)
      this.guarded(() => this.room.hold(player, true), false);
    // A sea island's dungeon whose sea never says the player landed sends them off to join again, rather than hold them.
    if (this.name.startsWith('sea-dungeon-'))
      setTimeout(() => {
        if (this.players.get(server) === held && !this.ashore.has(player))
          this.dismiss(server, AGAIN, 'the sea did not answer');
      }, LAND_WAIT_MS);
    void this.keeper?.tokenDue(
      player,
      () => held.signed,
      () => this.players.get(server) === held,
    );
    server.addEventListener('message', (event) => this.message(server, event.data));
    server.addEventListener('close', () => this.left(server));
    server.addEventListener('error', () => this.left(server));
    // Ticking first: a room waking from rest sets its first tick's time anew, which the welcome carries.
    this.startTicking();
    server.send(this.room.joined(player));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Opens the room its name says, once: a node's from its baked file, which only that node's room reads, a patrol's
   *  shared dungeon's from its patrol's, a run from its name alone, and a sea island's dungeon from its name on its
   *  sea's word (`behindDoor`). */
  private async openRoom(name: string): Promise<boolean> {
    this.name = name;
    const accounts = this.env.ACCOUNTS;
    const room = {
      character: (player: number) => this.guarded(() => this.room.character(player), null),
      restoreCharacter: (player: number, kept: string) =>
        this.guarded(() => this.room.restoreCharacter(player, kept), false),
      own: (player: number, account: string) => {
        const owned = this.guarded(() => this.room.own(player, account), false);
        // Kept, a run's player plays; a sea island's dungeon's waits on the sea's word that they are landed.
        if (owned && !this.name.startsWith('sea-dungeon-')) this.guarded(() => this.room.hold(player, false), false);
        if (owned && this.island) void this.landOn(this.island, player, account);
        return owned;
      },
      shut: (player: number, kept: string | null) => this.guarded(() => this.room.shut(player, kept), ''),
      name: (player: number, name: string) => this.guarded(() => this.room.name(player, name), false),
      tag: (player: number, tag: string) => this.guarded(() => this.room.tag(player, tag), false),
      guild: (player: number, told: string) => this.guarded(() => this.room.guild(player, told), false),
    };
    // The game's nodes, dungeons, islands and the sea keep characters (at sea, with their ship's hurts): the Test
    // Ground grants gear to try it, and a fleet room is the World Editor's.
    const seas = seaRoom(name);
    const keeps = ['node-', 'sea-dungeon-', 'isle-', 'passage-'].some((kind) => name.startsWith(kind)) || seas !== null;
    this.keeper = new Keeper(keeps ? accounts : null, room, name, (player, why, rejoinable) => {
      const socket = [...this.players].find(([, held]) => held.player === player)?.[0];
      const code = why === undefined ? ELSEWHERE : rejoinable ? AGAIN : SHUT;
      if (socket) this.dismiss(socket, code, why ?? 'your character joined another room');
    });
    if (privateRun(name)) this.keeper.forCompany();
    // A node's room, its dungeons' and its runs' judge where each kept character comes from; a passage zone takes only
    // the dives its ways lead in, whoever of their company plays here.
    const reached = name.startsWith('node-') ? nodeRoom(name.slice('node-'.length)) : null;
    const passage = passageRoom(name);
    if (reached?.guild) this.keeper.forGuild(reached.guild);
    const reach = reached ? await this.reachOf(reached.id) : null;
    const judge = (from: string | null, body: string | null) =>
      arrives(name, from, shipOf(body), reach, passagesOf(this.room, body));
    if (reached || passage) this.keeper.judgingArrivals(judge, passage !== null);
    // Every room on land, and the sea's flotsam and decks, roll their loot from seeds of their own that no player sees:
    // the sea's own seed shows in its islands'.
    const [lootLow = 0, lootHigh = 0, worldLow = 0, worldHigh = 0] = crypto.getRandomValues(new Uint32Array(4));
    const seeds = [lootLow, lootHigh, worldLow, worldHigh] as const;
    // At sea a player's courses wait for the keeper's word, so a ship comes back where the room last kept it.
    if (seas !== null)
      return (
        this.room.openSea(
          JSON.stringify({ layout, ports: SEA_PORTS }),
          crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
          Date.now() / 1000,
        ) &&
        this.room.reseed(seeds) &&
        this.room.difficulty(seas) &&
        this.room.keepCharacters()
      );
    if (name.startsWith('fleet-')) return this.room.openFleet(Date.now() / 1000);
    if (passage) this.why = openPassageRoom(this.room, name, Math.floor(Date.now() / MINUTE_MS));
    if (passage) return this.why === '' && this.room.reseed(seeds);
    const isle = /^isle-(.+)$/.exec(name)?.[1];
    if (isle !== undefined) return this.openIsland(isle);
    const node = /^node-(.+)$/.exec(name)?.[1];
    // A guild dungeon's run opens only while its guild's Delve Gate stands at its tier (`delveHost.ts`).
    if (reached?.guild && reached.run !== null) {
      const outposts = (room: string) => this.env.ACCOUNTS.outpost(room);
      const delve = await delveAsk(name, Math.floor(Date.now() / MINUTE_MS), outposts, (id) => this.nodeText(id));
      return delve !== null && this.room.openRun(delve) && this.room.reseed(seeds);
    }
    const ask = runAsk(name, Math.floor(Date.now() / MINUTE_MS));
    if (ask !== null || name.startsWith('sea-dungeon-')) {
      if (name.startsWith('sea-dungeon-') && !(await this.behindDoor(name))) return false;
      // A patrol's dungeon's run reads its patrol's file, as its shared dungeon does, and keeps its lock.
      const patrol = node === undefined ? null : nodeRoom(node);
      const text = patrol && patrol.dungeon !== null ? await this.nodeText(patrol.id) : '';
      return ask !== null && text !== null && this.room.openRun(ask, text) && this.room.reseed(seeds);
    }
    if (node === undefined)
      return (
        name.startsWith(TEST_GROUND) &&
        this.room.open(course.start, course.blocks) &&
        this.room.furnish(course.stall, course.resources) &&
        this.room.reseed(seeds)
      );
    const named = nodeRoom(node);
    if (!named) return false;
    const text = await this.nodeText(named.id);
    // A guild's outpost opens only on a node whose file has an outpost's ground; the bare node is the wild site.
    const ground = named.guild !== null && text !== null ? outpostGround(text) : null;
    if (named.guild !== null && !ground) return false;
    const ready =
      text !== null && (named.dungeon === null ? this.room.openNode(text) : this.room.openDungeon(text, named.dungeon));
    if (ready && ground && named.guild !== null && this.room.outpost(named.guild, ground.muster, name)) {
      const guard = <T>(call: () => T, fallback: T) => this.guarded(call, fallback);
      const saved = (player: number) => this.keeper?.saveNow(player) ?? Promise.resolve(false);
      this.outpost = new OutpostHost(this.room, this.env.ACCOUNTS, name, ground, guard, saved);
      void this.outpost.read();
    }
    const opened = ready && this.room.difficulty(named.seas);
    return opened && this.room.reseed(seeds) && this.room.minute(Math.floor(Date.now() / MINUTE_MS));
  }

  /** Where a node lies and what leads into it, from the bake's index (`arrival.ts`); null when the index is missing. */
  private async reachOf(id: string): Promise<ReturnType<typeof reachOf>> {
    const index = await this.env.NODES.fetch('https://nodes/index.json');
    return index.ok ? reachOf((await index.json()) as Listed[], layout.continents, id) : null;
  }

  /** Stands a player joined before an entrance at a spawn, as an ordinary join, unless the room keeps their character
   *  as come out of that entrance's dungeon or run, by its exit door or its open portal. */
  private outOfDoor(socket: WebSocket): void {
    const held = this.players.get(socket);
    if (!held || held.door === null) return;
    const door = held.door;
    held.door = null;
    const cameOut = cameOutOf(this.name, this.keeper?.cameFrom(held.player) ?? null, door);
    if (!cameOut || !this.keeper?.leftByWayOut(held.player))
      this.guarded(() => this.room.standAtSpawn(held.player), false);
  }

  /** A node's baked file's text, or null when there is none. */
  private async nodeText(id: string): Promise<string | null> {
    const file = await this.env.NODES.fetch(`https://nodes/${id}.json`);
    return file.ok ? await file.text() : null;
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

  /** Opens a sea island's dungeon on the word of the sea its tier says, as an island's room opens: only behind the door
   *  of an island that sea holds, so with the seed and style the sea gives that island's dungeon. Only accounts the sea
   *  says are landed on the island play in it (`landOn`), and while they do the island is held. */
  private async behindDoor(name: string): Promise<boolean> {
    const named = seaDungeonRoom(name);
    if (!named) return false;
    const sea = seaRoomName(named.seas);
    const word = await this.env.ROOMS.getByName(sea).dungeonWord(name.split('--')[0] ?? '');
    if (!word) return false;
    const { id, seed } = JSON.parse(word) as { id: number; seed: string };
    this.island = { id, seed, sea, told: Date.now() };
    return true;
  }

  /** Asks the sea whether a player's account is landed on this room's island: landed, they may scavenge and gather, a
   *  new landing a new visit, and in its dungeon play; not, they are let go. A sea that does not answer lets nobody go
   *  from the island, and lands nobody; its dungeon lets them go to join again, as it plays no one the sea has not
   *  answered for. */
  private async landOn(
    island: { readonly id: number; readonly seed: string; readonly sea: string },
    player: number,
    account: string,
  ): Promise<void> {
    const landed = await this.env.ROOMS.getByName(island.sea)
      .landed(island.id, island.seed, account)
      .catch(() => null);
    if (landed !== null && landed > 0) {
      this.ashore.add(player);
      this.guarded(() => this.room.hold(player, false), false);
      this.guarded(() => this.room.land(account, landed), false);
      return;
    }
    const dungeon = this.name.startsWith('sea-dungeon-');
    const socket = [...this.players].find(([, held]) => held.player === player)?.[0];
    if (socket && landed === 0) this.dismiss(socket, 1008, 'your ship does not lie at this island');
    else if (socket && dungeon) this.dismiss(socket, AGAIN, 'the sea did not answer');
  }

  /** Tells the accounts a player at sea is here, in `water`: each word after the last, so the last said is the last
   *  kept; one not taken is said again the next second. */
  private present(
    held: { token: string | null; water?: string | null; presenting?: Promise<unknown> },
    water: string | null,
  ): void {
    const token = held.token;
    if (!token) return;
    held.water = water;
    held.presenting = (held.presenting ?? Promise.resolve())
      .then(() => this.env.ACCOUNTS.present(token, this.name, water))
      .catch(() => false)
      .then((took) => {
        if (!took && held.water === water) delete held.water;
      });
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
        .then(async (kept) => {
          // At sea a ship played unkept is its session's, so a rejoin brings it back where the sea last had it.
          const owner = !kept && seaRoom(this.name) !== null ? `unkept:${await sessionHash(message)}` : null;
          if (here() && owner !== null) this.guarded(() => this.room.own(player, owner), undefined);
          if (here()) this.guarded(() => this.room.noneKept(player), undefined);
          // Logging back in, the kept character stands where it left this social space, by the room's own word on it.
          if (here() && kept && held.relog) this.guarded(() => this.room.standWhereLeft(player), false);
          this.outOfDoor(socket);
        });
      // At sea the room also says who is there, for the Roster; the next second says in which water.
      if (seaRoom(this.name) !== null) {
        held.token = message;
        this.present(held, null);
      }
      return;
    }
    held.count = count;
    // An input before any token plays unkept: at sea the ship sails at once (a token after it still gives the ship back
    // where it was kept), and on land the character the room holds is the player's own.
    if (!held.signed && !held.spoke) {
      held.spoke = true;
      this.guarded(() => this.room.noneKept(player), undefined);
    }
    if (!within) return this.dismiss(socket, 1008, 'too many messages');
    // The token again, from a player who took a username since: they are named anew, once in a while at most.
    if (typeof message === 'string' && TOKEN.test(message) && held.signed) {
      if (Date.now() - (held.renamed ?? 0) < RENAMED_EVERY_MS) return;
      held.renamed = Date.now();
      void this.keeper?.rename(player, message).catch(() => undefined);
      return;
    }
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
    this.ashore.delete(held.player);
    const token = held.token;
    // After any word on the water still in flight, so leaving is the last the accounts hear.
    if (token)
      void (held.presenting ?? Promise.resolve()).then(() => this.env.ACCOUNTS.present(token, null)).catch(() => false);
    const part = () => partFrom(this.room, this.keeper, held.player, (call) => this.guarded(call, undefined));
    // At an outpost, the last save waits for what the player's errands give back.
    if (this.outpost) void this.outpost.settled(held.player).then(part);
    else part();
    const others = this.open().filter((each) => each !== socket);
    if (others.length === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
    if (others.length === 0 && privateRun(this.name) && !this.closing)
      this.closing = setTimeout(() => {
        this.closing = null;
        // The next to come opens a fresh run, its clock from its own first tick.
        if (this.open().length > 0) return;
        this.opened = null;
        this.ticks = 0;
      }, RUN_LINGER_MS);
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
    // Before the first tick, so a room just opened or woken from rest answers its first gear and asks by today.
    this.guarded(() => this.room.minute(Math.floor(Date.now() / MINUTE_MS)), false);
    this.ticking = setInterval(() => {
      const due = Math.floor((Date.now() - this.started) / tickMs);
      if (this.ticks >= due) return;
      while (this.ticks < due) {
        this.guarded(() => this.room.tick(), undefined);
        this.ticks++;
      }
      this.outpost?.tick();
      // Taken once, then cut for each player: on land what changed since the snapshot their screen last showed, and at
      // sea what the sea tells one goes to them alone.
      this.guarded(() => this.room.snapshotPrepare(), undefined);
      for (const socket of this.open()) {
        const held = this.players.get(socket);
        if (!held) continue;
        const snapshot = this.guarded(() => this.room.snapshotFor(held.player), new Uint8Array());
        // Each player's own gear goes to them alone, when it changed.
        const gear = this.guarded(() => this.room.gear(held.player), new Uint8Array());
        if (gear.length > 0) this.keeper?.changed(held.player);
        try {
          // Gear first, so the browser predicts a change of trim or arms from this snapshot on.
          if (gear.length > 0) socket.send(gear);
          if (snapshot.length > 0) socket.send(snapshot);
        } catch {
          // A socket that closed between the check and the send misses this snapshot; the rest still get theirs.
        }
      }
      const now = Date.now();
      // Said again before the last word lapses, for each player at sea, and at once when their ship crosses into
      // another water.
      const again = now - this.lastPresent >= PRESENT_EVERY_MS;
      if (again) this.lastPresent = now;
      if (now - this.lastKept >= 1000 || again)
        for (const held of this.players.values()) {
          if (!held.token) continue;
          const water = this.guarded(() => this.room.water(held.player), null);
          if (!again && water === held.water) continue;
          this.present(held, water);
        }
      if (this.island && now - this.island.told >= ASHORE_EVERY_MS) {
        this.island.told = now;
        // An island the sea no longer holds (it faded, or the sea restarted) is not held again, whatever has its
        // number: the sea holds it by its seed too. Kept here, it lands no one who joins after.
        void this.env.ROOMS.getByName(this.island.sea)
          .holdAshore(this.island.id, this.island.seed)
          .catch(() => false);
      }
      if (now - this.lastKept >= 1000) {
        this.lastKept = now;
        void this.keeper?.due(now);
        this.guarded(() => this.room.minute(Math.floor(now / MINUTE_MS)), false);
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

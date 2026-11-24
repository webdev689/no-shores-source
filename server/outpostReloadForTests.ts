// A guild's outpost's room as the worker runs it, for the reload tests: the room's WebAssembly on a small outpost
// node, the real Keeper (for the guild) and OutpostHost, and the real accounts on a test database, each of whose
// answers a test may hold back. A second room, any other room that keeps characters, stands for where a player sails.
import { readFile } from 'node:fs/promises';
import { accounts } from './accounts/accountsForTests.ts';
import { type Characters, characters } from './accounts/characters.ts';
import { guildKey } from './accounts/outpostStores.ts';
import { Keeper, partFrom } from './keeping.ts';
import { OutpostHost, outpostGround } from './outpostHost.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** A small node with an outpost's ground, as the bake writes one (`crates/bake` `OutpostGround`). */
function nodeText(): string {
  const grid = (value: number) => ({
    width: 4,
    height: 4,
    left_m: -2000,
    top_m: -2000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: Array<number>(16).fill(value),
  });
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  const ground = { ...layers, coast: grid(5000), across: grid(-50), pads: [{ bounds: [-60, -60, 60, 60], level: 12 }] };
  const ring = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ];
  const node = { id: 'gull-cove-outpost', kind: 'outpost', name: 'Gull Cove', continent: 'square', ring };
  const outpost = { plot: [0, 0], level: 12, muster: [0, 0] };
  return JSON.stringify({
    ...node,
    spawns: [[0, 0]],
    bounds: [-150, -150, 150, 150],
    ground: { ...ground, seed: 7 },
    outpost,
    boxes: [],
  });
}

export const flush = (millis = 0) => new Promise((done) => setTimeout(done, millis));
const guarded = <T>(call: () => T, fallback: T) => {
  try {
    return call();
  } catch {
    return fallback;
  }
};

/** A room that keeps characters, its keeper, and how a player joins and leaves it, as the worker does. */
function keptRoom(room: RoomDoor, kept: Characters, name: string, lost: number[]) {
  const keeping = {
    character: (player: number) => room.character(player),
    restoreCharacter: (player: number, body: string) => room.restoreCharacter(player, body),
    own: (player: number, account: string) => room.own(player, account) && room.hold(player, false),
    shut: (player: number, body: string | null) => room.shut(player, body),
    name: (player: number, named: string) => room.name(player, named),
    tag: (player: number, tag: string) => room.tag(player, tag),
    guild: (player: number, told: string) => room.guild(player, told),
  };
  const keeper = new Keeper(
    kept,
    keeping,
    name,
    (player) => lost.push(player),
    () => Promise.resolve(),
  );
  return { room, keeper };
}

/** Ada and Cyra of one guild at its outpost at Gull Cove, which is raised; the accounts' answers held on asking. */
export async function outpostWorld() {
  const made = accounts();
  made.clock.now = Date.UTC(2026, 10, 21, 12);
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Cyra']) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const social = (name: string, path: string, body: object = {}) =>
    made.ask('POST', `/v1/social/${path}`, body, tokens[name]);
  await social('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await social('Ada', 'guild/invite', { name: 'Cyra' });
  await social('Cyra', 'guild/accept', { tag: 'SALT' });
  const database = made.deps.database;
  const guild = async () =>
    (await database
      .prepare("SELECT id, treasury FROM guilds WHERE tag = 'SALT'")
      .first<{ id: string; treasury: number }>())!;
  const key = guildKey((await guild()).id);
  const name = `node-gull-cove-outpost--guild-${key}`;
  const real = characters(
    database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  // An ask named in `holding` waits, once answered, until `let` lets it go: its answer comes late.
  const holding = new Set<string>();
  const gates: { ask: string; done: () => void }[] = [];
  const kept = new Proxy(real, {
    get:
      (target, ask: keyof Characters) =>
      async (...args: never[]) => {
        const answer: unknown = await (target[ask] as (...all: never[]) => Promise<unknown>)(...args);
        if (holding.delete(ask)) await new Promise<void>((done) => gates.push({ ask, done }));
        return answer;
      },
  });
  const text = nodeText();
  const ground = outpostGround(text);
  const door = startRoomDoor(compiled);
  if (!ground || !door.openNode(text) || !door.outpost(key, ground.muster, name)) throw new Error('no outpost');
  door.difficulty(0);
  door.minute(Math.floor(made.clock.now / 60_000));
  const lost: number[] = [];
  const outpost = keptRoom(door, kept, name, lost);
  outpost.keeper.forGuild(key);
  const host = new OutpostHost(door, kept, name, ground, guarded, (player) => outpost.keeper.saveNow(player), [2, 2]);
  await host.read();
  const elsewhere = startRoomDoor(compiled);
  if (!elsewhere.openNode(text)) throw new Error('no node');
  const sea = keptRoom(elsewhere, kept, 'node-gull-cove-outpost', lost);
  const accountOf = async (who: string) => (await real.look(tokens[who] ?? ''))?.account ?? '';
  /** A member's kept character, given Aurem and Timber before they join. */
  const kit = async (who: string, aurem: number, timber: number) => {
    const probe = door.join();
    const body = JSON.parse(door.character(probe) ?? '{}') as { materials: { aurem: number; ship: object } };
    door.leave(probe);
    body.materials.aurem = aurem;
    body.materials.ship = { timber, canvas: 0, iron: 0, heartwood: 0 };
    await database
      .prepare(
        'INSERT INTO characters (account_id, body) VALUES (?1, ?2) ON CONFLICT (account_id) DO UPDATE SET body = ?2',
      )
      .bind(await accountOf(who), JSON.stringify(body))
      .run();
  };
  /** A socket joining a room and signing in: held until kept; the room told their guild, as the worker's next second. */
  const join = async (who: string, into = outpost) => {
    const player = into.room.join();
    into.room.hold(player, true);
    const signed = into.keeper.signIn(
      player,
      tokens[who] ?? '',
      () => made.clock.now,
      () => true,
    );
    const ok = await signed;
    await into.keeper.due(made.clock.now);
    await flush(2);
    return { player, ok };
  };
  /** A player's input at the outpost, as their page sends it. */
  const input = (player: number, bytes: Uint8Array) => door.input(player, bytes);
  /** A socket closing, as the worker's: at the outpost the last save waits up to `most` for the player's errands. */
  const close = (player: number, into = outpost, most = 30_000) =>
    (into === outpost ? host.settled(player, most) : Promise.resolve()).then(() =>
      partFrom(into.room, into.keeper, player, (call) => call()),
    );
  /** The room's ticks and the host's, and the keeper's saves of what changed, as the worker's second. */
  const ticks = async (rounds = 2) => {
    for (let round = 0; round < rounds; round++) {
      for (const each of [outpost, sea]) {
        for (let tick = 0; tick < 5; tick++) each.room.tick();
        made.clock.now += 1_000;
        await each.keeper.due(made.clock.now);
      }
      host.tick(made.clock.now);
      await flush(4);
    }
  };
  const body = (player: number, into = outpost) =>
    JSON.parse(into.room.character(player) ?? '{}') as { materials: { aurem: number; ship: { timber: number } } };
  const keptBody = async (who: string) =>
    JSON.parse(
      (
        await database
          .prepare('SELECT body FROM characters WHERE account_id = ?1')
          .bind(await accountOf(who))
          .first<{
            body: string;
          }>()
      )?.body ?? '{}',
    ) as { materials: { aurem: number; ship: { timber: number } }; errand?: unknown };
  return {
    ...made,
    tokens,
    social,
    guild,
    outpost,
    sea,
    host,
    lost,
    kit,
    join,
    input,
    close,
    ticks,
    body,
    keptBody,
    hold: (asked: keyof Characters) => holding.add(asked),
    /** Lets the longest held answer go, or the longest held of one ask. */
    let: (ask?: keyof Characters) => {
      const place = gates.findIndex((gate) => ask === undefined || gate.ask === ask);
      if (place >= 0) gates.splice(place, 1)[0]?.done();
    },
    held: () => gates.map((gate) => gate.ask),
    /** Lets every held answer go, and holds none more. */
    letAll: () => {
      holding.clear();
      while (gates.length > 0) gates.shift()?.done();
    },
  };
}

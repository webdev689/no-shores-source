import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kindOf, TREASURY_MOST } from '../client/src/game/guild/outpostLaw.ts';
import { ASKS } from '../client/src/network/gearMessages.ts';
import { inputBytes } from '../client/src/network/messages.ts';
import { flush, outpostWorld } from './outpostReloadForTests.ts';
import { intentOf } from './intentForTests.ts';

const SITE = 'gull-cove-outpost';
const still = intentOf();
const look = { anim: 'walk', frame: 2, facing: 0 };
const sequences = new Map<number, number>();
/** An input carrying an ask, in the player's own sequence. */
function asking(player: number, ask: Record<string, unknown>): Uint8Array {
  const next = (sequences.get(player) ?? 0) + 1;
  sequences.set(player, next);
  return inputBytes(next, { intent: still, look, arms: 0, seen: 0n, ask } as never);
}

test('a refusal answered after a reload’s claim took the character is given back where it plays now', async () => {
  const world = await outpostWorld();
  sequences.clear();
  await world.deps.database.prepare('UPDATE guilds SET treasury = ?1').bind(TREASURY_MOST).run();
  await world.kit('Ada', 1_000, 0);
  const first = await world.join('Ada');
  assert.equal(first.ok, true);
  world.hold('deposit');
  world.input(first.player, asking(first.player, { kind: ASKS.outpostDeposit, count: 500 }));
  await world.ticks();
  const saved = await world.keptBody('Ada');
  assert.equal(saved.materials.aurem, 500, 'saved as taken before the accounts were asked');
  assert.notEqual(saved.errand, undefined, 'and carrying the errand');
  // The page reloads: the old socket's last save waits on the errand, the new one's claim takes the hold meanwhile.
  const parted = world.close(first.player);
  world.hold('claim');
  const joining = world.join('Ada');
  await flush(20);
  world.let();
  await parted;
  world.let();
  const second = await joining;
  assert.equal(second.ok, true);
  await world.ticks(3);
  assert.equal(world.body(second.player).materials.aurem, 1_000, 'the 500 the full treasury refused');
  await world.close(second.player);
  await flush(10);
  const kept = await world.keptBody('Ada');
  assert.deepEqual([kept.materials.aurem, kept.errand], [1_000, undefined]);
  assert.equal((await world.guild()).treasury, TREASURY_MOST);
});

test('a refusal answered after the player sailed off is given back in the room that holds the character', async () => {
  const world = await outpostWorld();
  sequences.clear();
  await world.deps.database.prepare('UPDATE guilds SET treasury = ?1').bind(TREASURY_MOST).run();
  await world.kit('Ada', 1_000, 0);
  const first = await world.join('Ada');
  world.hold('deposit');
  world.input(first.player, asking(first.player, { kind: ASKS.outpostDeposit, count: 500 }));
  await world.ticks();
  const parted = world.close(first.player);
  // She sails off: the sea's claim takes the hold after its wait, and asks the accounts again itself.
  const sailed = await world.join('Ada', world.sea);
  assert.equal(sailed.ok, true);
  world.let();
  await parted;
  await world.ticks(3);
  assert.equal(world.body(sailed.player, world.sea).materials.aurem, 1_000);
  const kept = await world.keptBody('Ada');
  assert.deepEqual([kept.materials.aurem, kept.errand], [1_000, undefined], 'given once, carried no more');
});

/** A small generator of numbers in [0, 1), the same for the same seed. */
function numbers(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Random deposits, deliveries and takes by two members, answers and claims held back past each other, reloads and
 *  sailings off and back; at the end every answer let through and everyone gone. What Aurem and Timber are counted
 *  in (kept bodies and the treasury; kept bodies, what the structures hold and the stores) never changes. */
async function walk(seed: number, steps: number) {
  const random = numbers(seed);
  const world = await outpostWorld();
  sequences.clear();
  const database = world.deps.database;
  for (const who of ['Ada', 'Cyra']) await world.kit(who, 8_000, 120);
  type Where = { player: number; into: typeof world.outpost };
  const where = new Map<string, Where>();
  for (const who of ['Ada', 'Cyra']) where.set(who, { player: (await world.join(who)).player, into: world.outpost });
  await database.prepare('UPDATE guilds SET xp = 800000, treasury = 30000').run();
  assert.equal((await world.social('Ada', 'outpost/raise', { site: SITE, turn: 0 })).status, 200);
  const placed = await world.social('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  assert.equal(placed.status, 200);
  await database.prepare(`UPDATE outposts SET stores = '{"timber":60}', stores_at = ?1`).bind(world.clock.now).run();
  const totals = async () => {
    const [ada, cyra] = [await world.keptBody('Ada'), await world.keptBody('Cyra')];
    const aurem = ada.materials.aurem + cyra.materials.aurem + (await world.guild()).treasury;
    const rows = await database
      .prepare('SELECT kind, tier, delivered FROM outpost_structures')
      .all<{ kind: string; tier: number; delivered: string }>();
    let sunk = 0;
    for (const row of rows.results) {
      sunk += (JSON.parse(row.delivered) as { timber?: number }).timber ?? 0;
      for (let tier = 1; tier <= row.tier; tier++) sunk += kindOf(row.kind)?.tiers[tier - 1]?.materials.timber ?? 0;
    }
    const stores = await database.prepare('SELECT stores FROM outposts').first<{ stores: string }>();
    const stored = (JSON.parse(stores?.stores ?? '{}') as { timber?: number }).timber ?? 0;
    return { aurem, timber: ada.materials.ship.timber + cyra.materials.ship.timber + sunk + stored };
  };
  for (const [who, here] of where) {
    await world.close(here.player);
    where.set(who, { player: (await world.join(who)).player, into: world.outpost });
  }
  const start = await totals();
  const log: string[] = [];
  // What the test itself put into or took out of the treasury.
  let shifted = 0;
  for (let step = 0; step < steps; step++) {
    const who = random() < 0.5 ? 'Ada' : 'Cyra';
    const here = where.get(who)!;
    const roll = random();
    if (roll < 0.45 && here.into === world.outpost) {
      const kind = random() < 0.34 ? 'deposit' : random() < 0.5 ? 'deliver' : 'takeStores';
      if (random() < 0.6) world.hold(kind);
      const count = 1 + Math.floor(random() * 30);
      const asked =
        kind === 'deposit'
          ? { kind: ASKS.outpostDeposit, count: count * 100 }
          : kind === 'deliver'
            ? { kind: ASKS.outpostDeliver, item: 3, slot: 0, count }
            : { kind: ASKS.outpostTake, slot: 0, count };
      world.input(here.player, asking(here.player, asked));
      log.push(`${step} ${who} ${kind} ${count}`);
    } else if (roll < 0.6) {
      world.let();
      log.push(`${step} let`);
    } else if (roll < 0.85) {
      // A reload or a sailing: the socket drops, and the page joins this room or the other while answers wait.
      const into = random() < 0.5 ? world.outpost : world.sea;
      const holdClaim = random() < 0.7;
      if (holdClaim) world.hold('claim');
      const parted = world.close(here.player, here.into, 20 + Math.floor(random() * 60));
      let joined: { player: number; ok: boolean } | null = null;
      const joining = world.join(who, into).then((done) => (joined = done));
      // The claim takes the hold, and answers held come now, after it, or not until later.
      await flush(10);
      const after = random();
      if (holdClaim && after < 0.6) while (world.held().some((ask) => ask !== 'claim')) (world.let(), await flush(3));
      if (after < 0.8) await parted;
      while (joined === null) (world.let('claim'), world.let(), await flush(3));
      await joining;
      await parted;
      const { player, ok } = joined as { player: number; ok: boolean };
      where.set(who, { player, into });
      log.push(`${step} ${who} to ${into === world.outpost ? 'outpost' : 'sea'} ok ${ok}`);
    } else if (roll < 0.92) {
      const near = TREASURY_MOST - Math.floor(random() * 3_000);
      shifted += near - (await world.guild()).treasury;
      await database.prepare('UPDATE guilds SET treasury = ?1').bind(near).run();
      log.push(`${step} treasury near full`);
    }
    await world.ticks(1);
  }
  for (let round = 0; round < 6; round++) (world.letAll(), await world.ticks(2));
  for (const [who, here] of where) {
    await world.close(here.player, here.into, 2_000);
    const again = await world.join(who);
    await world.ticks(2);
    await world.close(again.player, world.outpost, 2_000);
    await flush(10);
  }
  const end = await totals();
  const kept = await database.prepare('SELECT COUNT(*) AS count FROM outpost_errands').first<{ count: number }>();
  return { start, end: { ...end, aurem: end.aurem - shifted }, log, errands: kept?.count ?? 0 };
}

test(
  'reloads and sailings off mid-errand, with answers held past the claim, neither make nor lose',
  { timeout: 600_000 },
  async () => {
    const bad: string[] = [];
    let asked = 0;
    for (let seed = 1; seed <= Number(process.env['SEEDS'] ?? 12); seed++) {
      const { start, end, log, errands } = await walk(seed, 30);
      asked += errands;
      if (start.aurem !== end.aurem || start.timber !== end.timber)
        bad.push(`seed ${seed}: ${JSON.stringify(start)} -> ${JSON.stringify(end)}\n${log.join('\n')}`);
    }
    assert.deepEqual(bad, []);
    // A run whose inputs the room cannot read asks nothing, and would pass the totals above unseen.
    assert.ok(asked > 0, 'the errands of the run reached the accounts');
  },
);

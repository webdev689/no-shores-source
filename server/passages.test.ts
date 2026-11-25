import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInstance, sharedRun } from '../client/src/game/rooms.ts';
import { NO_WAY_HERE, type Passages, arrives } from './arrival.ts';
import { Keeper } from './keeping.ts';
import { weekOf } from '../client/src/game/guild/guildLaw.ts';
import { roomOf, world } from './keepingForTests.ts';
import { openPassageRoom, passagesOf, webOf } from './passageHost.ts';
import type { PassageWeb } from './arrival.ts';
import {
  PASSAGE_COPIES,
  PASSAGE_FULL,
  PASSAGE_MOST,
  RUN_MOST,
  passageAsk,
  passageRoom,
  passageRoomName,
  privateRun,
  runFull,
  socketsMost,
} from './roomNames.ts';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const door = startRoomDoor(compiled);

/** Saltmere's web of the week the rules' agreement test plays (crates/room-wasm/src/passage_room_door_tests.rs), and a
 *  minute in that week. */
const [ISLAND, WEEK, MINUTE] = ['continent-1', 2900, 29_230_000];
/** The web with each zone's depth, which the arrivals do not read. */
type Deep = Omit<PassageWeb, 'zones'> & {
  readonly zones: readonly (PassageWeb['zones'][number] & { depth: number })[];
};
const web = webOf(door, ISLAND, WEEK) as Deep | null;
if (!web) throw new Error('Saltmere has no passages in the room module');
const PATROL = `node-${web.patrol}`;
const zoneOf = (number: number) => web.zones.find((zone) => zone.number === number);
const first = web.mouths[0]?.zone ?? -1;
const second = web.mouths[1]?.zone ?? -1;
const lampZone = web.zones.find((zone) => zone.lamp === 1);
if (!lampZone) throw new Error('the web holds no first lamp');
const room = (zone: number, after: number | string = 1) => passageRoomName(ISLAND, WEEK, zone, after);

/** A kept character's body on a dive, as gear keeps it, with the lamps it lit this week. */
function diving(dive: Record<string, unknown> | null, lamps: number[] = []): Passages {
  const passage = dive && { island: ISLAND, week: WEEK, route: 'public', mouth: 0, depth: 1, lamp: 0, ...dive };
  const lit = lamps.length > 0 ? { [ISLAND]: lamps } : {};
  const body = JSON.stringify({ passage, activity: { this_week: { week: WEEK, passage_lamps: lit } } });
  return passagesOf(door, body, MINUTE * 60_000);
}

test('a passage zone’s room is named by its island, week and zone, a public copy or a route, by one spelling each', () => {
  assert.deepEqual(passageRoom('passage-continent-1-w2900-z12'), {
    island: 'continent-1',
    week: 2900,
    zone: 12,
    copy: 1,
    run: null,
  });
  assert.equal(passageRoom('passage-continent-1-w2900-z0--3')?.copy, 3);
  assert.equal(passageRoom(`passage-continent-1-w2900-z0--${PASSAGE_COPIES}`)?.copy, PASSAGE_COPIES, 'the last copy');
  assert.equal(passageRoom('passage-continent-1-w2900-z7--run-ab12cd34')?.run, 'ab12cd34');
  for (const name of [
    'passage-continent-1-w02900-z12',
    'passage-continent-1-w2900-z012',
    'passage-continent-1-w2900-z12--1',
    'passage-continent-1-w2900-z12--100',
    `passage-continent-1-w2900-z12--${PASSAGE_COPIES + 1}`,
    'passage-continent-1-w2900-z12--2--run-ab12cd34',
    'passage-continent-1-w2900-z12--run-ab12cd34--2',
    'passage-continent-1-w2900-z12--run-short',
    'passage-saltgrass-downs-w2900-z12',
    'passage-continent-1-w2900',
    'node-continent-1-w2900-z12',
    null,
  ])
    assert.equal(passageRoom(name), null, String(name));
  for (const name of [room(4), room(4, 2), room(4, 'ab12cd34')])
    assert.equal(passageRoomName(ISLAND, WEEK, 4, passageRoom(name)?.run ?? passageRoom(name)?.copy), name);
});

test('a public passage zone holds eight accounts and a company’s route its company, as runs do', () => {
  assert.equal(privateRun(room(4)), false);
  assert.equal(privateRun(room(4, 'ab12cd34')), true);
  assert.equal(socketsMost(room(4, 2)), PASSAGE_MOST * 2);
  assert.equal(socketsMost(room(4, 'ab12cd34')), RUN_MOST * 2);
  assert.equal(runFull(room(4), PASSAGE_MOST), null);
  assert.equal(runFull(room(4), PASSAGE_MOST + 1), PASSAGE_FULL);
  assert.equal(runFull(room(4, 'ab12cd34'), RUN_MOST + 1), 'This run is full.');
  assert.equal(runFull('node-tidewall', 99), null);
});

test('a company’s member taking its route joins a member’s room in that zone’s route, else a new one', () => {
  const route = room(4, runInstance());
  const places = ['node-saltgrass-downs', room(4), room(5, 'ab12cd34'), route];
  assert.equal(sharedRun(room(4), places), route, 'not the public room, nor another zone’s route');
  assert.equal(sharedRun(room(5), places), room(5, 'ab12cd34'));
  assert.equal(sharedRun(room(6), places), null, 'none there: the page draws a new instance');
  assert.ok(passageRoom(room(6, runInstance()))?.run, 'and a new instance names a route');
});

test('a passage zone opens for this week’s web or the last’s alone, and says why it opens none', () => {
  assert.equal(weekOf(MINUTE * 60_000), WEEK, 'as gear::clock::week_of counts it');
  assert.equal(weekOf(29_240_000 * 60_000), WEEK + 1);
  assert.deepEqual(JSON.parse((passageAsk(room(4, 'ab12cd34'), MINUTE) as { ask: string }).ask), {
    island: ISLAND,
    week: WEEK,
    zone: 4,
    route: 'company',
    minute: MINUTE,
  });
  assert.deepEqual(
    passageAsk(room(4), MINUTE + 7 * 24 * 60),
    { why: 'The passage has shifted' },
    'last week’s says it shifted, its zone never laid',
  );
  assert.ok('why' in passageAsk(room(4), MINUTE + 14 * 24 * 60), 'two weeks on');
  assert.ok('why' in passageAsk(room(4), MINUTE - 7 * 24 * 60), 'next week’s');
  assert.ok('why' in passageAsk('passage-continent-1-w2900-z012', MINUTE));
  assert.equal(openPassageRoom(startRoomDoor(compiled), room(first), MINUTE), '');
  assert.equal(openPassageRoom(startRoomDoor(compiled), room(999), MINUTE), 'No such passage.');
  assert.equal(
    openPassageRoom(startRoomDoor(compiled), room(first), MINUTE + 14 * 24 * 60),
    "That week's passages are gone.",
  );
});

test('a dive comes into a passage zone from its patrol zone at the mouth leading there, or at a lamp it lit', () => {
  assert.equal(arrives(room(first), PATROL, null, null, diving({ zone: first })), true);
  assert.equal(arrives(room(first), `${PATROL}--elite`, null, null, diving({ zone: first, seas: 'elite' })), true);
  assert.equal(arrives(room(first), `${PATROL}--elite`, null, null, diving({ zone: first })), false, 'begun at Normal');
  assert.equal(arrives(room(first, 2), PATROL, null, null, diving({ zone: first })), true, 'a later public copy');
  assert.equal(arrives(room(second), PATROL, null, null, diving({ zone: second })), false, 'mouth 0 leads elsewhere');
  assert.equal(arrives(room(second), PATROL, null, null, diving({ zone: second, mouth: 1 })), true);
  assert.equal(arrives(room(first), PATROL, null, null, diving({ zone: second })), false, 'its dive is elsewhere');
  assert.equal(arrives(room(first), PATROL, null, null, diving(null)), false, 'on no dive');
  assert.equal(arrives(room(first), PATROL, null, null, diving({ zone: first, week: WEEK - 1 })), false);
  assert.equal(arrives(room(first), PATROL, null, null, null), false, 'nothing to judge by');
  for (const from of [`${PATROL}--dungeon-0`, 'node-tidewall', 'sea', null])
    assert.equal(arrives(room(first), from, null, null, diving({ zone: first })), false, String(from));
  // A company's dive takes its route's rooms, a public one the public rooms.
  const company = diving({ zone: first, route: 'company' });
  assert.equal(arrives(room(first), PATROL, null, null, company), false);
  assert.equal(arrives(room(first, 'ab12cd34'), PATROL, null, null, company), true);
  assert.equal(arrives(room(first, 'ab12cd34'), PATROL, null, null, diving({ zone: first })), false);
  // At a lamp lit this week, its zone counted begun.
  const atLamp = { zone: lampZone.number, depth: lampZone.depth, lamp: 1 };
  assert.equal(arrives(room(lampZone.number), PATROL, null, null, diving(atLamp, [1])), true);
  assert.equal(arrives(room(lampZone.number), PATROL, null, null, diving(atLamp)), false, 'never lit');
  assert.equal(arrives(room(first), PATROL, null, null, diving({ ...atLamp, zone: first }, [1])), false);
});

test('a dive goes on into a zone its last zone’s ways lead to, and rejoins its own room', () => {
  const from = zoneOf(first);
  const next = from?.onward[0] ?? -1;
  const elsewhere = web.zones.find((zone) => zone.depth === 2 && !from?.onward.includes(zone.number));
  const wentOn = diving({ zone: next, depth: 2 });
  assert.equal(arrives(room(next), room(first), null, null, wentOn), true);
  assert.equal(arrives(room(next, 3), room(first, 2), null, null, wentOn), true, 'any public copy to any');
  assert.equal(arrives(room(next, 'ab12cd34'), room(first), null, null, wentOn), false, 'a public dive keeps public');
  assert.equal(
    arrives(room(next), passageRoomName(ISLAND, WEEK + 1, first), null, null, wentOn),
    false,
    'another week',
  );
  if (elsewhere) {
    const astray = diving({ zone: elsewhere.number, depth: 2 });
    assert.equal(arrives(room(elsewhere.number), room(first), null, null, astray), false, 'no way leads there');
  }
  assert.equal(arrives(room(first), room(first), null, null, diving({ zone: first })), true, 'a rejoin on its dive');
  const full = diving({ zone: first });
  assert.equal(arrives(room(first, 2), room(first), null, null, full), true, 'on to the next copy, one full');
  assert.equal(arrives(room(first), room(first, 3), null, null, full), true, 'or back to an earlier');
  assert.equal(arrives(room(next, 2), room(next), null, null, full), false, 'a copy of a zone it is not in');
  const route = diving({ zone: first, route: 'company' });
  assert.equal(arrives(room(first, 'ab12cd34'), room(first, 'zz12cd34'), null, null, route), false, 'a route is one');
  assert.equal(arrives(room(first), room(first), null, null, diving(null)), false, 'a rejoin whose dive ended');
  assert.equal(arrives(room(first), room(first), null, null, diving({ zone: next })), false, 'its dive went on');
  // Once the week turns, last week's web takes no one, whoever comes.
  const turned = passagesOf(door, wentOn.body, (MINUTE + 7 * 24 * 60) * 60_000);
  assert.equal(arrives(room(next), room(first), null, null, turned), false);
});

test('a lamp’s zone leads home to its patrol zone, at the seas the dive began at, once Home sent it there', () => {
  const lampRoom = room(lampZone.number);
  const home = { zone: lampZone.number, depth: lampZone.depth, lamp: 1, homeward: true };
  assert.equal(arrives(PATROL, lampRoom, null, null, diving(home, [1])), true);
  assert.equal(arrives(PATROL, lampRoom, null, null, diving({ ...home, homeward: false }, [1])), false, 'not homeward');
  assert.equal(arrives(PATROL, lampRoom, null, null, diving({ ...home, lamp: 0 }, [1])), false, 'unlit this dive');
  assert.equal(arrives(PATROL, lampRoom, null, null, diving(null, [1])), false, 'on no dive');
  assert.equal(arrives(PATROL, room(first), null, null, diving({ ...home, zone: first }, [1])), false, 'no lamp there');
  assert.equal(
    arrives(PATROL, lampRoom, null, null, diving({ ...home, zone: first }, [1])),
    false,
    'its dive elsewhere',
  );
  assert.equal(arrives(`${PATROL}--dungeon-0`, lampRoom, null, null, diving(home, [1])), false);
  assert.equal(arrives('node-tidewall', lampRoom, null, null, diving(home, [1])), false);
  assert.equal(arrives(PATROL, lampRoom, null, null, null), false);
  // A crafted page lands at Normal, lights the lamp and goes Home: it comes home at Normal, not at Abyss.
  assert.equal(arrives(`${PATROL}--abyss`, lampRoom, null, null, diving(home, [1])), false, 'begun at Normal');
  assert.equal(arrives(`${PATROL}--abyss`, lampRoom, null, null, diving({ ...home, seas: 'abyss' })), true);
  assert.equal(arrives(PATROL, lampRoom, null, null, diving({ ...home, seas: 'abyss' })), false, 'begun at Abyss');
  // Lit Monday, the week turned and a foe fell since, rolling the week's record: the dive still goes home.
  const passage = { island: ISLAND, week: WEEK, route: 'public', mouth: 0, ...home };
  const turned = JSON.stringify({ passage, activity: { this_week: { week: WEEK + 1, passage_lamps: {} } } });
  assert.equal(arrives(PATROL, lampRoom, null, null, passagesOf(door, turned, (MINUTE + 7 * 24 * 60) * 60_000)), true);
});

test('a move of what the next room judges is saved at once, a find is not, nor read out of the room', async () => {
  const { kept, token } = await world();
  // The accounts, unreachable while `unreachable` says so.
  let unreachable = false;
  const accounts = {
    ...kept,
    save: (account: string, holder: string, body: string) =>
      unreachable ? Promise.reject(new Error('unreachable')) : kept.save(account, holder, body),
  };
  const zone = roomOf();
  const body = (dive: Record<string, unknown>, lamps: number[] = []) =>
    JSON.stringify({
      passage: { island: ISLAND, week: WEEK, zone: lampZone.number, lamp: 0, ...dive },
      activity: { this_week: { week: WEEK, passage_lamps: lamps.length > 0 ? { [ISLAND]: lamps } : {} } },
    });
  zone.held.set(1, body({}));
  const keeper = new Keeper(accounts, zone, room(lampZone.number), () => undefined);
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => 0,
      () => true,
    ),
    true,
  );
  const saved = async () => (await kept.look(token))?.body ?? null;
  const change = async (now: string, moved: boolean) => {
    zone.held.set(1, now);
    if (moved) zone.moved.add(1);
    zone.reads.count = 0;
    keeper.changed(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  // A find changes the character, not what an arrival is judged by: it waits for the keeper's ordinary save.
  await change(body({ found: 1 }), false);
  assert.equal(zone.reads.count, 0, 'the room says nothing moved: the character is not read');
  assert.notEqual(await saved(), zone.held.get(1));
  const lit = body({ lamp: 1 }, [1]);
  await change(lit, true);
  assert.equal(await saved(), lit, 'a lamp lit is saved at once');
  const home = body({ lamp: 1, homeward: true }, [1]);
  await change(home, true);
  assert.equal(await saved(), home, 'Home is saved at once');
  await change('{}', true);
  assert.equal(await saved(), '{}', 'a dive ended is saved at once too');
  // A move the accounts did not take is saved at the next change, though that change moves nothing.
  unreachable = true;
  await change(lit, true);
  assert.equal(await saved(), '{}');
  unreachable = false;
  const found = body({ lamp: 1, found: 2 }, [1]);
  await change(found, false);
  assert.equal(await saved(), found, 'the unsaved move saved');
});

test('a public zone keeps eight accounts though two sign in together, each errand answered meanwhile', async () => {
  // Each body carries an outpost errand, asked again of the accounts between the judging and the keeping, which the
  // test answers once both are judged.
  const answers: (() => void)[] = [];
  const body = '{"errand":{"rid":"node-x:1","what":{"deposit":5}}}';
  const claimed = (token: string) => Promise.resolve({ account: token, body, from: null, name: null, tag: null });
  const accounts = {
    look: claimed,
    claim: claimed,
    release: () => Promise.resolve(true),
    deposit: () => new Promise<'moved'>((answered) => answers.push(() => answered('moved'))),
  } as unknown as ConstructorParameters<typeof Keeper>[0];
  const kept = roomOf();
  for (let player = 1; player <= PASSAGE_MOST + 1; player++) kept.held.set(player, '{}');
  const sent: [number, string | undefined][] = [];
  const keeper = new Keeper(accounts, kept, room(first), (player, why) => void sent.push([player, why]));
  const [now, here] = [() => 0, () => true];
  const signing = (player: number) => keeper.signIn(player, `account-${player}`, now, here);
  for (let player = 1; player < PASSAGE_MOST; player++) {
    const signed = signing(player);
    await new Promise((settled) => setTimeout(settled, 0));
    answers.shift()?.();
    assert.equal(await signed, true);
  }
  const together = [signing(PASSAGE_MOST), signing(PASSAGE_MOST + 1)];
  await new Promise((settled) => setTimeout(settled, 0));
  for (const answer of answers.splice(0)) answer();
  assert.deepEqual(await Promise.all(together), [true, false], 'the eighth kept, the ninth not');
  assert.deepEqual(sent, [[PASSAGE_MOST + 1, PASSAGE_FULL]]);
});

test('a room that dies between a go-on and its save leaves the dive where it was: the zone left takes it back', async () => {
  const { kept, token } = await world();
  const from = zoneOf(first);
  const next = from?.onward[0] ?? -1;
  const body = (zone: number) =>
    JSON.stringify({ passage: { island: ISLAND, week: WEEK, route: 'public', mouth: 0, zone, lamp: 0 } });
  const judging = (name: string, keeper: Keeper) =>
    keeper.judgingArrivals(
      (came, kept) => arrives(name, came, null, null, passagesOf(door, kept, MINUTE * 60_000)),
      true,
    );
  const [now, here] = [() => 0, () => true];
  // The dive in the first zone is saved there; then it goes on, its gear sent to the page, and the room dies before
  // its save lands, so the accounts keep it in the zone it left.
  const left = roomOf();
  left.held.set(1, body(first));
  const leftKeeper = new Keeper(kept, left, room(first), () => undefined);
  assert.equal(await leftKeeper.signIn(1, token, now, here), true);
  assert.equal(await leftKeeper.saveNow(1), true);
  left.held.set(1, body(next));
  const ahead = roomOf();
  ahead.held.set(1, '{}');
  const sent: (string | undefined)[] = [];
  const aheadKeeper = judging(room(next), new Keeper(kept, ahead, room(next), (player, why) => void sent.push(why)));
  assert.equal(await aheadKeeper.signIn(1, token, now, here), false, 'the next zone refuses the look');
  assert.deepEqual(sent, [NO_WAY_HERE]);
  // The zone left, opened again, takes the dive back as the accounts kept it.
  const again = roomOf();
  again.held.set(1, '{}');
  const againKeeper = judging(room(first), new Keeper(kept, again, room(first), () => undefined));
  assert.equal(await againKeeper.signIn(1, token, now, here), true);
});

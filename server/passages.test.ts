import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInstance, sharedRun } from '../client/src/game/rooms.ts';
import { type Passages, arrives } from './arrival.ts';
import { Keeper } from './keeping.ts';
import { weekOf } from '../client/src/game/guild/guildLaw.ts';
import { roomOf, world } from './keepingForTests.ts';
import { openPassageRoom, passagesOf, webOf } from './passageHost.ts';
import type { PassageWeb } from './arrival.ts';
import {
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
  assert.equal(passageRoom('passage-continent-1-w2900-z7--run-ab12cd34')?.run, 'ab12cd34');
  for (const name of [
    'passage-continent-1-w02900-z12',
    'passage-continent-1-w2900-z012',
    'passage-continent-1-w2900-z12--1',
    'passage-continent-1-w2900-z12--100',
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
  assert.ok('ask' in passageAsk(room(4), MINUTE + 7 * 24 * 60), 'last week’s still opens, to say it shifted');
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
  assert.equal(arrives(room(first), `${PATROL}--elite`, null, null, diving({ zone: first })), true);
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
  assert.equal(arrives(room(first), room(first), null, null, diving(null)), false, 'a rejoin whose dive ended');
  assert.equal(arrives(room(first), room(first), null, null, diving({ zone: next })), false, 'its dive went on');
  // Once the week turns, last week's web takes no one, whoever comes.
  const turned = passagesOf(door, wentOn.body, (MINUTE + 7 * 24 * 60) * 60_000);
  assert.equal(arrives(room(next), room(first), null, null, turned), false);
});

test('a lamp’s zone leads home to its patrol zone once its lamp is lit for the character', () => {
  const lampRoom = room(lampZone.number);
  assert.equal(arrives(PATROL, lampRoom, null, null, diving(null, [1])), true);
  assert.equal(arrives(PATROL, lampRoom, null, null, diving(null)), false, 'unlit');
  assert.equal(arrives(PATROL, room(first), null, null, diving(null, [1])), false, 'no lamp stands there');
  assert.equal(arrives(`${PATROL}--dungeon-0`, lampRoom, null, null, diving(null, [1])), false);
  assert.equal(arrives('node-tidewall', lampRoom, null, null, diving(null, [1])), false);
  assert.equal(arrives(PATROL, lampRoom, null, null, null), false);
  // Lamps lit in a week before this one's web are not this week's, though no weekly record rolled the week yet.
  const lastWeek = JSON.stringify({ activity: { this_week: { week: WEEK - 1, passage_lamps: { [ISLAND]: [1] } } } });
  assert.equal(arrives(PATROL, lampRoom, null, null, passagesOf(door, lastWeek, MINUTE * 60_000)), false, 'last week');
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

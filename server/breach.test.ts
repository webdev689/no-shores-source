import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { characters } from './accounts/characters.ts';
import { launchedFor } from './accounts/companies.ts';
import { foundRun } from './accounts/finding.ts';
import { accounts } from './accounts/accountsForTests.ts';
import {
  ASK_AGAIN_MS,
  Breach,
  type BreachDeps,
  CHECKPOINT_KEPT_MS,
  FORGET_AGAIN_MS,
  GATE_SHUT,
  LAUNCH_ARRIVES_MS,
  breachAsked,
  breachHeard,
  breachRoom,
  restoring,
  toldBreach,
} from './breach.ts';
import { NO_WAY_HERE } from './arrival.ts';
import { Keeper } from './keeping.ts';
import { roomOf } from './keepingForTests.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';
import { breachAsk } from './roomNames.ts';

const RUN = 'node-gullwing-vale--breach-hard--run-k3j4h5g6';

/** A host's words, written down: the room's own Breach calls, its zone's answers, and the accounts' launches. */
function host(opened = false, launched = true) {
  const said = { company: [] as [number, string][], inside: [] as string[], asked: [] as string[] };
  const room = {
    breachCompany: (player: number, word: string) => said.company.push([player, word]) > 0,
    breachProgress: () => JSON.stringify({ tier: 1, encounter: 3 }),
    breachKept: () => 'null',
  } as unknown as RoomDoor;
  const deps: BreachDeps = {
    room,
    zone: (name) => ({
      breachWord: (kind, text, zone) =>
        Promise.resolve(
          zone === name &&
            (kind === 'opened' ? said.asked.push(`${name} ${text}`) > 0 && opened : said.inside.push(text) > 0),
        ),
    }),
    launched: () => Promise.resolve(launched),
  };
  return { said, deps };
}

test('a join into a patrol’s room comes for a Breach’s run of that zone alone', () => {
  const ask = (query: string, zone = 'node-gullwing-vale') =>
    breachAsked(new Request(`https://r.test/room/x?${query}`), zone);
  assert.equal(ask(`breach=${RUN}`), RUN);
  assert.equal(ask(`breach=${RUN}`, 'node-saltgrass-downs'), null, 'another zone’s');
  assert.equal(ask('breach=node-krakens-grotto--run-k3j4h5g6'), null, 'no Breach’s run');
  assert.equal(ask(''), null);
});

test('in its zone a launched player is held in their run’s company once the accounts say so, and no one else', async () => {
  const { said, deps } = host();
  const zone = new Breach('node-gullwing-vale', deps);
  zone.joined(4, RUN);
  zone.joined(5, null);
  assert.equal(await zone.launchedHere(4, 'ada'), true);
  assert.equal(await zone.launchedHere(5, 'ben'), false, 'came for none');
  zone.owned(4, 'ada');
  zone.owned(5, 'ben');
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(said.company, [[4, JSON.stringify({ run: RUN, tier: 1 })]]);
  const { said: refused, deps: unlaunched } = host(false, false);
  const other = new Breach('node-gullwing-vale', unlaunched);
  other.joined(6, RUN);
  other.owned(6, 'cal');
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(refused.company, [], 'the accounts launched no run for them');
});

test('a run asks its zone whether its gate opened until it says so once, and tells it how far its company has come', async () => {
  const { said: silent, deps: unopened } = host(false);
  const shut = new Breach(RUN, unopened);
  assert.equal(await shut.gateOpen(), false);
  shut.tick(20_000);
  assert.deepEqual(silent.inside, [], 'a run no one was let into tells its zone nothing');
  const { said, deps } = host(true);
  const run = new Breach(RUN, deps);
  assert.equal(await run.gateOpen(), true);
  assert.equal(await run.gateOpen(), true);
  assert.deepEqual(said.asked, [`node-gullwing-vale ${RUN}`], 'asked once');
  const word = (name: string) => JSON.stringify({ run: RUN, tier: 1, name, encounter: 3 });
  run.tick(19_000);
  assert.deepEqual(said.inside, [], 'its gate open to one who was then refused: no one let in yet');
  run.owned(9, 'wenna');
  run.tick(20_000);
  assert.deepEqual(said.inside, [word('A company')], 'no one named yet');
  run.named(9, 'Wenna');
  run.named(3, 'Ossery');
  run.tick(25_000);
  assert.equal(said.inside.length, 1, 'every ten s');
  run.tick(30_000);
  assert.deepEqual(said.inside, [word('A company'), word('Ossery')], 'by its first player in');
});

test('a run tells its zone at once as its company moves on or clears, and asks its gate again once its word is old', async () => {
  const { said, deps } = host(true);
  let encounter = 3;
  deps.room.breachProgress = () => JSON.stringify({ tier: 1, encounter });
  const run = new Breach(RUN, deps);
  assert.equal(await run.gateOpen(0), true);
  run.owned(1, 'ada');
  run.tick(20_000);
  encounter = 6;
  run.tick(21_000);
  assert.deepEqual(
    said.inside.map((text) => (JSON.parse(text) as { encounter: number }).encounter),
    [3, 6],
    'the clear told at once, though ten seconds have not passed',
  );
  await run.gateOpen(30_000);
  assert.equal(said.asked.length, 1, 'its gate trusted a while');
  await run.gateOpen(61_000);
  assert.equal(said.asked.length, 2, 'then asked again, as a gate shuts on a clear or at its day’s end');
});

test('in its zone a launched player arrives from anywhere within the arrival window, and is held in the company for the day, asked twice', async () => {
  const [asked, waited]: [(number | undefined)[], number[]] = [[], []];
  let blips = 1;
  const { said, deps } = host();
  const zone = new Breach('node-gullwing-vale', {
    ...deps,
    launched: (_account, _run, within) => {
      asked.push(within);
      return blips-- > 0 ? Promise.reject(new Error('blip')) : Promise.resolve(true);
    },
    wait: (span) => {
      waited.push(span);
      return Promise.resolve();
    },
  });
  zone.joined(4, RUN);
  zone.owned(4, 'ada');
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(asked, [undefined, undefined], 'the day a found run is kept, asked again after a blip');
  assert.deepEqual(waited, [ASK_AGAIN_MS], 'given time to come back first');
  assert.deepEqual(said.company, [[4, JSON.stringify({ run: RUN, tier: 1 })]]);
  zone.joined(5, RUN);
  assert.equal(await zone.launchedHere(5, 'ben'), true);
  assert.equal(asked.at(-1), LAUNCH_ARRIVES_MS, 'arriving from anywhere only within the arrival window');
});

test('a Breach’s run lets its company in only once its gate opened, and its zone a player launched to it from anywhere', async () => {
  const made = accounts();
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const guest = async () => (await made.ask('POST', '/v1/guest')).body['token'] as string;
  const [ada, ben, cal] = [await guest(), await guest(), await guest()];
  const account = (await kept.look(ada))?.account ?? '';
  assert.equal(await foundRun(made.deps.database, RUN, [account], made.clock.now), true);
  const [now, here] = [() => made.clock.now, () => true];
  const sent: [number, string | undefined][] = [];
  const lost = (player: number, why?: string) => void sent.push([player, why]);
  let open = false;
  const room = roomOf();
  for (const player of [1, 2, 7, 8]) room.held.set(player, '{"starting":true}');
  const run = new Keeper(kept, room, RUN, lost).forCompany().behindGate(() => Promise.resolve(open ? '' : GATE_SHUT));
  assert.equal(await run.signIn(1, ada, now, here), false);
  assert.deepEqual(sent, [[1, GATE_SHUT]], 'let go untouched, saying why');
  open = true;
  assert.equal(await run.signIn(2, ada, now, here), true, 'once the zone says it opened');
  sent.length = 0;
  const zone = new Keeper(kept, room, 'node-gullwing-vale', lost)
    .judgingArrivals(() => false)
    .arrivingLaunched((player) => Promise.resolve(player === 7));
  assert.equal(await zone.signIn(8, ben, now, here), false);
  assert.deepEqual(sent, [[8, NO_WAY_HERE]], 'come by no way leading here, for no launch');
  assert.equal(await zone.signIn(7, cal, now, here), true, 'launched to the gate from wherever they were');
});

test('a launch takes its company to the gate from anywhere for half an hour, and admits its run for a day', async () => {
  const made = accounts();
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
  const account = (await kept.look(token))?.account ?? '';
  assert.equal(await foundRun(made.deps.database, RUN, [account], made.clock.now), true);
  const arrives = (after: number) =>
    launchedFor(made.deps.database, account, RUN, made.clock.now + after, LAUNCH_ARRIVES_MS);
  assert.equal(await arrives(LAUNCH_ARRIVES_MS - 1), true);
  assert.equal(await arrives(LAUNCH_ARRIVES_MS + 1), false, 'too long since: they sail there');
  assert.equal(await launchedFor(made.deps.database, account, RUN, made.clock.now + LAUNCH_ARRIVES_MS + 1), true);
});

test('a host’s keeper tells its Breach of each character it keeps, once kept, and of each name it gives', () => {
  const told: string[] = [];
  const breach = {
    owned: (player: number) => told.push(`owned ${player}`),
    named: (player: number, name: string) => told.push(`${player} ${name}`),
  };
  const kept: Parameters<typeof toldBreach>[1] = { own: (player) => player === 4, name: () => true };
  const door = toldBreach(() => breach as unknown as Breach, kept);
  assert.deepEqual([door.own(4, 'ada'), door.own(5, 'ben'), door.name(4, 'Ada')], [true, false, true]);
  assert.deepEqual(told, ['owned 4', '4 Ada'], 'one refused is not told');
});

test('a Breach asks the room through its guard, so a trap closes the room rather than being swallowed', () => {
  const trapped: string[] = [];
  const room = {
    breachCompany: () => {
      throw new Error('unreachable');
    },
    breachProgress: () => 'null',
  } as unknown as RoomDoor;
  const guarded = <T>(call: () => T, fallback: T): T => {
    try {
      return call();
    } catch {
      trapped.push('closed');
      return fallback;
    }
  };
  assert.equal(breachRoom(room, guarded).breachCompany(4, '{}'), false);
  assert.deepEqual(trapped, ['closed']);
});

test('a zone’s room is given the minute before it says whether a run’s gate opened, so a day out shuts it unticked', () => {
  let minute = 0;
  const room = {
    minute: (now: number) => ((minute = now), true),
    breachOpened: () => minute < 100,
    breachInside: () => true,
  } as unknown as RoomDoor;
  assert.equal(breachHeard(room, 'opened', RUN, 99), true);
  assert.equal(breachHeard(room, 'opened', RUN, 100), false, 'its day out, though the room never ticked');
});

/** A room's Breach keeping `kept` as it changes, and a storage that writes down what it is given. */
function keeping(first: string | undefined, unreadable = false) {
  const stored = new Map<string, string>(first === undefined ? [] : [['breach', first]]);
  const [alarms, forgotten, restored, keptRuns] = [[] as number[], [] as string[], [] as string[], [] as string[]];
  let kept = 'null';
  const { deps } = host();
  const room = {
    ...deps.room,
    breachKept: () => kept,
    breachRestore: (text: string) => (restored.push(text), (kept = text), true),
  } as unknown as RoomDoor;
  const storage = {
    get: <T>(key: string) =>
      unreadable ? Promise.reject(new Error('unread')) : Promise.resolve(stored.get(key) as T | undefined),
    put: (key: string, value: string) => Promise.resolve(void stored.set(key, value)),
    setAlarm: (when: number) => Promise.resolve(void alarms.push(when)),
  };
  // The accounts fail to forget while `failing` holds, as a blip would.
  const accounts = { failing: false };
  const runs = {
    forgetRun: (run: string) =>
      accounts.failing ? Promise.reject(new Error('blip')) : Promise.resolve(forgotten.push(run)),
    keepRun: (run: string) => Promise.resolve(keptRuns.push(run)),
  };
  const set = (text: string) => void (kept = text);
  return { deps: { ...deps, room, storage, runs }, stored, alarms, forgotten, restored, keptRuns, accounts, set };
}

test('a run given back its checkpoint as it opens stores it again as it moves, let go a day after it last moved', async () => {
  const { deps, stored, alarms, restored, set } = keeping('{"stage":2,"chests":[]}');
  const run = new Breach(RUN, deps);
  await run.restore();
  assert.deepEqual(restored, ['{"stage":2,"chests":[]}'], 'given back before anyone joins');
  run.tick(1_000);
  assert.deepEqual(alarms, [], 'nothing moved, nothing stored');
  set('{"stage":3,"chests":[]}');
  run.tick(2_000);
  assert.equal(stored.get('breach'), '{"stage":3,"chests":[]}');
  assert.deepEqual(alarms, [2_000 + CHECKPOINT_KEPT_MS]);
  set('null');
  run.tick(3_000);
  assert.equal(stored.get('breach'), '{"stage":3,"chests":[]}', 'a room that trapped answers null: never stored');
  const fresh = keeping(undefined);
  await new Breach(RUN, fresh.deps).restore();
  assert.deepEqual(fresh.restored, [], 'none kept: opened as it is');
});

test('a gate stores its runs as a word changes them, never with an alarm, and has the accounts forget each it shuts', async () => {
  const opened = JSON.stringify({ opened: { [RUN]: 100 }, spent: {} });
  const shut = JSON.stringify({ opened: {}, spent: { [RUN]: 100 } });
  const { deps, stored, alarms, forgotten, restored, set } = keeping(opened);
  const zone = new Breach('node-gullwing-vale', deps);
  await zone.restore();
  assert.deepEqual(restored, [opened]);
  const room = { minute: () => true, breachInside: () => (set(shut), true) } as unknown as RoomDoor;
  assert.equal(zone.heard(room, 'inside', JSON.stringify({ run: RUN, encounter: 6 }), 6_000_000), true);
  assert.equal(stored.get('breach'), shut, 'stored as the word is heard, though the zone does not tick');
  zone.tick(6_001_000);
  assert.deepEqual(forgotten, [RUN], 'forgotten once, so its company’s next Launch starts anew');
  assert.deepEqual(alarms, [], 'a gate lets its runs go itself');
});

test('a room opens once, its Breach restored; one that did not open is asked again', async () => {
  const restoredBy: string[] = [];
  const breach = { restore: () => Promise.resolve(void restoredBy.push('restored')) } as unknown as Breach;
  let again = 0;
  assert.equal(
    await restoring(
      Promise.resolve(true),
      () => breach,
      () => (again += 1),
    ),
    true,
  );
  assert.equal(
    await restoring(
      Promise.resolve(false),
      () => breach,
      () => (again += 1),
    ),
    false,
  );
  assert.equal(
    await restoring(
      Promise.reject(new Error('no file')),
      () => breach,
      () => (again += 1),
    ),
    false,
  );
  assert.deepEqual([restoredBy, again], [['restored'], 2]);
});

test('the room module keeps a run’s checkpoint and gives it back to a run opened afresh, never a gate’s runs', async () => {
  const compiled = new WebAssembly.Module(
    await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
  );
  const room = startRoomDoor(compiled);
  assert.ok(room.openBreach(breachAsk(RUN, 29_000_000) ?? ''));
  assert.deepEqual(JSON.parse(room.breachKept()), { stage: 0, chests: [] }, 'opened at its start');
  assert.equal(room.breachRestore('{"stage":2,"chests":[1]}'), true);
  assert.deepEqual(JSON.parse(room.breachKept()), { stage: 2, chests: [1] });
  assert.equal(room.breachRestore('{"opened":{},"spent":{}}'), false, 'a run takes no gate’s runs');
});

test("a gate has the accounts keep a run it opens, so its company launches back into it all its gate's day", async () => {
  const { deps, keptRuns, set } = keeping(JSON.stringify({ opened: {}, spent: {} }));
  const zone = new Breach('node-gullwing-vale', deps);
  await zone.restore();
  set(JSON.stringify({ opened: { [RUN]: 200 }, spent: {} }));
  zone.tick(12_000_000);
  assert.deepEqual(keptRuns, [RUN], 'kept from the minute its gate opened');
  zone.tick(12_001_000);
  assert.deepEqual(keptRuns, [RUN], 'once');
});

test('a run the accounts could not forget is asked of them again until they do', async () => {
  const shut = JSON.stringify({ opened: {}, spent: { [RUN]: 100 } });
  const { deps, forgotten, accounts, set } = keeping(JSON.stringify({ opened: { [RUN]: 100 }, spent: {} }));
  const zone = new Breach('node-gullwing-vale', deps);
  await zone.restore();
  accounts.failing = true;
  set(shut);
  zone.tick(6_000_000);
  await Promise.resolve();
  assert.deepEqual(forgotten, []);
  accounts.failing = false;
  zone.tick(6_000_000 + FORGET_AGAIN_MS);
  await Promise.resolve();
  assert.deepEqual(forgotten, [RUN], 'asked again once the accounts are back');
});

test('a storage that could not be read as the room opened is never written over', async () => {
  const { deps, stored, set } = keeping('{"stage":4,"chests":[]}', true);
  const run = new Breach(RUN, deps);
  await run.restore();
  set('{"stage":1,"chests":[]}');
  run.tick(1_000);
  assert.equal(stored.get('breach'), '{"stage":4,"chests":[]}', 'what it kept before stands for the next opening');
});

test('a Breach stores what it keeps as a player leaves, not only on the next second', async () => {
  const { deps, stored, set } = keeping(undefined);
  const run = new Breach(RUN, deps);
  await run.restore();
  set('{"stage":2,"chests":[1]}');
  run.left(7);
  assert.equal(stored.get('breach'), '{"stage":2,"chests":[1]}');
});

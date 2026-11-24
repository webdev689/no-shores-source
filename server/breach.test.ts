import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characters } from './accounts/characters.ts';
import { launchedFor } from './accounts/companies.ts';
import { foundRun } from './accounts/finding.ts';
import { accounts } from './accounts/accountsForTests.ts';
import { Breach, type BreachDeps, GATE_SHUT, LAUNCH_ARRIVES_MS, breachAsked } from './breach.ts';
import { NO_WAY_HERE } from './arrival.ts';
import { Keeper } from './keeping.ts';
import { roomOf } from './keepingForTests.ts';
import type { RoomDoor } from './roomDoor.ts';

const RUN = 'node-gullwing-vale--breach-hard--run-k3j4h5g6';

/** A host's words, written down: the room's own Breach calls, its zone's answers, and the accounts' launches. */
function host(opened = false, launched = true) {
  const said = { company: [] as [number, string][], inside: [] as string[], asked: [] as string[] };
  const room = {
    breachCompany: (player: number, word: string) => said.company.push([player, word]) > 0,
    breachProgress: () => JSON.stringify({ tier: 1, encounter: 3 }),
  } as unknown as RoomDoor;
  const deps: BreachDeps = {
    room,
    zone: (name) => ({
      breachWord: (kind, text) =>
        Promise.resolve(
          kind === 'opened' ? said.asked.push(`${name} ${text}`) > 0 && opened : said.inside.push(text) > 0,
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
  run.tick(20_000);
  assert.deepEqual(said.inside, [word('A company')], 'no one named yet');
  run.named(9, 'Wenna');
  run.named(3, 'Ossery');
  run.tick(25_000);
  assert.equal(said.inside.length, 1, 'every ten s');
  run.tick(30_000);
  assert.deepEqual(said.inside, [word('A company'), word('Ossery')], 'by its first player in');
});

test('in its zone a launched player arrives from anywhere within the arrival window, and is held in the company for the day, asked twice', async () => {
  const asked: (number | undefined)[] = [];
  let blips = 1;
  const { said, deps } = host();
  const zone = new Breach('node-gullwing-vale', {
    ...deps,
    launched: (_account, _run, within) => {
      asked.push(within);
      return blips-- > 0 ? Promise.reject(new Error('blip')) : Promise.resolve(true);
    },
  });
  zone.joined(4, RUN);
  zone.owned(4, 'ada');
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(asked, [undefined, undefined], 'the day a found run is kept, asked again after a blip');
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

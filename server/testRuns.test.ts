import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { readFromRoom } from '../client/src/network/messages.ts';
import { GATE_SHUT, breachAsked } from './breach.ts';
import { ACCOUNTS_TROUBLE, SIGN_IN_FOR_RUN } from './keeping.ts';
import { breachAsk, runAsk } from './roomNames.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';
import { DEVELOPERS_ONLY, type Developers, TestRun } from './testRuns.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const MINUTE = 29_000_000;
const PLAYLIST = 'node-coral-halls--abyss--playlist-32--test-k3j4h5g6';
const BREACH = 'node-saltgrass-downs--breach-hard--test-k3j4h5g6';

/** A test room opened from its name as the host opens it, made a test room, with one player joined. */
function testRoom(name: string): { room: RoomDoor; player: number } {
  const room = startRoomDoor(compiled);
  const breach = breachAsk(name, MINUTE);
  const ask = runAsk(name, MINUTE) ?? '';
  assert.ok(breach === null ? room.openRun(ask) : room.openBreach(breach), name);
  assert.ok(room.makeTest());
  return { room, player: room.join() };
}

/** The accounts as a test room asks them, answering `answer` for every token and noting each ask; nothing else. */
function accountsAnswering(answer: Awaited<ReturnType<Developers['developer']>> | Error) {
  const asked: string[] = [];
  const accounts: Developers = {
    developer: (token) => {
      asked.push(token);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { accounts, asked };
}

/** A test room's sign-ins over a room, noting who it sends away and why. */
function tester(room: RoomDoor, accounts: Developers, gateOpen?: () => Promise<boolean>) {
  const sent: [number, string | undefined, boolean | undefined][] = [];
  const away = (player: number, why?: string, rejoinable?: boolean) => void sent.push([player, why, rejoinable]);
  const run = new TestRun({ accounts, room, away, ...(gateOpen ? { gateOpen } : {}), wait: () => Promise.resolve() });
  return { run, sent };
}

const here = () => true;

test('a test room sends away anyone who is no developer, telling them so, and asks the accounts nothing more', async () => {
  const { room, player } = testRoom(PLAYLIST);
  const { accounts, asked } = accountsAnswering(null);
  const { run, sent } = tester(room, accounts);
  assert.equal(await run.signIn(player, 'a'.repeat(64), Date.now, here), false);
  assert.deepEqual(sent, [[player, DEVELOPERS_ONLY, false]]);
  assert.equal(DEVELOPERS_ONLY, 'Test runs are for developers.');
  assert.deepEqual(asked, ['a'.repeat(64)]);
});

test('a developer plays the test character in a test run, by their username, and nothing is claimed or saved', async () => {
  const { room, player } = testRoom(PLAYLIST);
  const { accounts } = accountsAnswering({ account: 'dev-1', name: 'Tester' });
  const { run, sent } = tester(room, accounts);
  assert.equal(await run.signIn(player, 'b'.repeat(64), Date.now, here), true);
  assert.deepEqual(sent, []);
  const joined = readFromRoom(room.joined(player));
  assert.ok(joined);
  assert.equal(joined.kind, 'joined');
  const plate = joined.kind === 'joined' ? joined.plates.find((each) => each.player === player) : undefined;
  assert.equal(plate?.level, 30, 'the test character, level 30');
  assert.equal(plate?.name, 'Tester');
  // `TestRun` is given only `developer`: no claim, save or release is there to call (the host's wiring is untested).
  assert.deepEqual(Object.keys(accounts), ['developer']);
  await run.leave(player);
});

test('a developer’s second socket sends their first away, as a run does', async () => {
  const { room, player } = testRoom(PLAYLIST);
  const second = room.join();
  const sent: number[] = [];
  // Sent away, a player is taken out of the room at once, as the host does.
  const away = (gone: number) => void (sent.push(gone), room.leave(gone));
  const { accounts } = accountsAnswering({ account: 'dev-1', name: null });
  const run = new TestRun({ accounts, room, away });
  assert.equal(await run.signIn(player, 'c'.repeat(64), Date.now, here), true);
  assert.equal(await run.signIn(second, 'c'.repeat(64), Date.now, here), true);
  assert.deepEqual(sent, [player]);
});

test('a Breach’s test run lets a developer in only once its zone copy’s gate opened', async () => {
  const { room, player } = testRoom(BREACH);
  const { accounts } = accountsAnswering({ account: 'dev-1', name: null });
  const shut = tester(room, accounts, () => Promise.resolve(false));
  assert.equal(await shut.run.signIn(player, 'd'.repeat(64), Date.now, here), false);
  assert.deepEqual(shut.sent, [[player, GATE_SHUT, false]]);
  let zoneSays = true;
  const open = tester(room, accounts, () => Promise.resolve(zoneSays));
  assert.equal(await open.run.signIn(player, 'd'.repeat(64), Date.now, here), true);
  // Once open, the run keeps the word for a rejoin, as its zone copy is forgotten after its tester walks through.
  zoneSays = false;
  room.leave(player);
  await open.run.leave(player);
  const again = room.join();
  assert.equal(await open.run.signIn(again, 'd'.repeat(64), Date.now, here), true);
  const zone = 'node-saltgrass-downs--test-k3j4h5g6';
  const join = (run: string) => new Request(`https://rooms/room/${zone}?breach=${run}`);
  assert.equal(breachAsked(join(BREACH), zone), BREACH, 'the zone copy takes a join for its own test run');
  assert.equal(breachAsked(join('node-saltgrass-downs--breach-hard--run-k3j4h5g6'), zone), null, 'and no real run');
  assert.equal(breachAsked(join(BREACH), 'node-saltgrass-downs'), null, 'nor the real zone a test run');
});

test('a test room sends away for now one the accounts do not answer for, and one whose token never came', async () => {
  const { room, player } = testRoom(PLAYLIST);
  const { run, sent } = tester(room, accountsAnswering(new Error('down')).accounts);
  assert.equal(await run.signIn(player, 'e'.repeat(64), Date.now, here), false);
  await run.tokenDue(7, () => false, here);
  assert.deepEqual(sent, [
    [player, ACCOUNTS_TROUBLE, true],
    [7, SIGN_IN_FOR_RUN, false],
  ]);
});

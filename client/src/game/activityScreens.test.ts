import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type ScreensFoot, startActivityScreens } from './activityScreens.ts';
import type { ActivityRecord, GearState } from '../network/gearMessages.ts';
import { SEARCH_LOST } from './companyFinder.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { type FakeElement, FakeEvent, fakePage } from './pageForTests.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const FRIDAY_NINE = 29_919_420;
const vale = { id: 'gullwing-vale', name: 'The Gullwing Vale', kind: 'patrol', continent: 'continent-1' } as NodeInfo;
const gearAt = (level: number, activity: ActivityRecord) => ({ level, prologueDone: true, activity }) as GearState;
const nothing = { day: 20_778, cleared: [], week: 2_968, elite: false, abyss: false, boon: false };
/** A player on foot before the Gullwing Vale's entrances at Elite seas, their gear as given. */
const standing = (gear: GearState, fallen = false): ScreensFoot => ({
  node: vale,
  seas: 'elite',
  dungeon: null,
  fallen,
  gear: { gear },
});
const nowhere = { enter: () => undefined };
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);
const still = { now: () => FRIDAY_NINE * 60_000, every: () => undefined };

test('This Week reads the last word a room sent of the character, kept at sea, and turns with the minute', async () => {
  let clock = FRIDAY_NINE * 60_000;
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, { ...nothing, cleared: [1] }));
  const screens = startActivityScreens(fakePage().root as never, module, [vale], () => here, nowhere, null, {
    now: () => clock,
    every: (run) => (look = run),
  });
  assert.equal(screens.week(), null, 'before the room module is read');
  await module;
  look();
  assert.deepEqual(
    screens.week()?.today.tiers.map((row) => row.state),
    ['Not taken', 'Taken', 'Abyss seas open at level 20.'],
  );
  assert.match(screens.week()?.today.dungeons[0]?.name ?? '', /Gullwing Vale$/);
  here = null;
  look();
  assert.equal(screens.kept()?.level, 12, 'the last word of the character, kept at sea');
  assert.equal(screens.week()?.today.tiers[1]?.state, 'Taken', 'at sea, as last heard');
  clock += 60_000;
  assert.equal(screens.week()?.today.endsAt, (FRIDAY_NINE + 1_440) * 60_000, 'the same reset, a minute on');
});

test('E at an entrance opens its card: tier, level, modifiers and pay; Enter goes in, Escape closes it', async () => {
  const { root, window } = fakePage();
  const entered: unknown[][] = [];
  const here = standing(gearAt(12, nothing));
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const screens = startActivityScreens(root as never, module, [vale], () => here, trips, null, still);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  for (const words of [
    'The Caverns of the Gullwing Vale',
    'Elite seas · Levels 3 to 6',
    'Burn (Shadow)',
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
  ])
    assert.ok(root.find(words), words);
  assert.equal(gearScreenOpen(), true, 'the game’s keys rest under it');
  keyed(root, 'card-enter')?.click();
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']]);
  assert.equal(gearScreenOpen(), false);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.equal(gearScreenOpen(), true);
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.equal(gearScreenOpen(), false);
  assert.equal(entered.length, 1, 'closed, not entered');
  screens.card(1, 'The Mines of the Gullwing Vale');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.deepEqual(entered[1], [1, 'The Mines of the Gullwing Vale'], 'E again goes in');
});

test('a shut card says why and does not go in, and before the rules are read E goes straight in', async () => {
  const { root, window } = fakePage();
  const entered: unknown[][] = [];
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const young = standing(gearAt(9, nothing));
  const screens = startActivityScreens(
    root as never,
    new Promise(() => undefined),
    [vale],
    () => young,
    trips,
    null,
    still,
  );
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']], 'no rules to show it by');
  const shut = startActivityScreens(root as never, module, [vale], () => young, trips, null, still);
  await module;
  shut.card(0, 'The Caverns of the Gullwing Vale');
  assert.ok(root.find('Elite seas open at level 10.'));
  keyed(root, 'card-enter')?.click();
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.equal(entered.length, 1, 'shut: not entered');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
});

test('the card goes when its player falls or leaves the place, and gives the keys back', async () => {
  const { root } = fakePage();
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, nothing));
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(root as never, module, [vale], () => here, nowhere, null, clock);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  look();
  assert.equal(gearScreenOpen(), true, 'standing there still');
  here = standing(gearAt(12, nothing), true);
  look();
  assert.equal(gearScreenOpen(), false, 'fallen');
  here = standing(gearAt(12, nothing));
  screens.card(0, 'The Caverns of the Gullwing Vale');
  here = null;
  look();
  assert.equal(gearScreenOpen(), false, 'gone from the place');
});

test('the seas a level shuts are read from the rules by the last word of the character, and none before', async () => {
  let look = () => undefined as void;
  let here: ScreensFoot | null = null;
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(fakePage().root as never, module, [vale], () => here, nowhere, null, clock);
  await module;
  assert.deepEqual(screens.seasShut(), [], 'no word yet');
  here = standing(gearAt(9, nothing));
  look();
  here = null;
  assert.deepEqual(screens.seasShut(), [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.']);
});

/** A socket to the finder, opened by the card: where it was opened, what it was sent and how it was closed. */
class FinderSocket {
  readonly address: string;
  readonly sent: string[] = [];
  closed: [number, string] | [] = [];
  private readonly heard = new Map<string, ((event: never) => void)[]>();
  constructor(address: string) {
    this.address = address;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(code = 1000, reason = ''): void {
    this.closed = [code, reason];
  }
  addEventListener(type: string, heard: (event: never) => void): void {
    this.heard.set(type, [...(this.heard.get(type) ?? []), heard]);
  }
  fire(type: string, event: object = {}): void {
    for (const heard of this.heard.get(type) ?? []) heard(event as never);
  }
}

const link = { token: 'a'.repeat(64), finderAt: (base: string) => `ws://finder.test/v1/find/${base}` };
const dungeonAt = (id: string, name: string, continent: string) =>
  ({ id, name, kind: 'dungeon', continent }) as NodeInfo;
const grotto = dungeonAt('krakens-grotto', 'Kraken’s Grotto', 'continent-1');

/** Screens at a node, its seas and the player's level as given, at `minute`, online unless `online` is null; each
 *  socket to the finder kept, and every trip in written down. */
async function finding(
  node: NodeInfo,
  seas: string,
  level: number,
  minute = FRIDAY_NINE,
  online: typeof link | null = link,
) {
  const { root, window } = fakePage();
  const [sockets, entered] = [[] as FinderSocket[], [] as unknown[][]];
  const time = { now: minute * 60_000 };
  let look = () => undefined as void;
  const here = { ...standing(gearAt(level, nothing)), node, seas } as ScreensFoot;
  const clock = {
    now: () => time.now,
    every: (run: () => void) => void (look = run),
    open: (address: string) => sockets[sockets.push(new FinderSocket(address)) - 1] as never,
  };
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const screens = startActivityScreens(root as never, module, [node], () => here, trips, online, clock);
  await module;
  screens.card(0, node.name);
  return { root, window, sockets, entered, time, look: () => look() };
}

test('Find a Company at an Elite Dungeon searches by its run, shows the wait, and goes into the run', async () => {
  const { root, sockets, entered, time, look } = await finding(grotto, 'normal', 12);
  keyed(root, 'card-find')?.click();
  assert.equal(sockets[0]?.address, 'ws://finder.test/v1/find/node-krakens-grotto');
  sockets[0]?.fire('open');
  assert.deepEqual(sockets[0]?.sent, [link.token]);
  time.now += 23_400;
  look();
  assert.ok(root.find('Finding a company · 0:23'));
  assert.ok(root.find('A run starts with four, or with fewer after a minute.'));
  assert.ok(keyed(root, 'card-stop') && !keyed(root, 'card-find'));
  sockets[0]?.fire('message', { data: '{"run":"node-krakens-grotto--run-m9n8b7v6"}' });
  assert.deepEqual(entered, [[0, 'Kraken’s Grotto', 'node-krakens-grotto--run-m9n8b7v6']]);
  assert.equal(gearScreenOpen(), false);
});

test('Stop and Escape leave the search; the week’s Abyss Dungeon, a patrol and a page offline offer none', async () => {
  const { root, window, sockets, entered } = await finding(grotto, 'normal', 12);
  keyed(root, 'card-find')?.click();
  keyed(root, 'card-stop')?.click();
  assert.deepEqual(sockets[0]?.closed, [1000, 'stopped']);
  assert.ok(keyed(root, 'card-find') && !keyed(root, 'card-stop'));
  keyed(root, 'card-find')?.click();
  sockets[1]?.fire('close', { code: 1006, reason: '' });
  assert.ok(root.find(SEARCH_LOST), 'a search that ended unasked says so');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'f' }));
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.deepEqual([sockets[2]?.closed, gearScreenOpen(), entered], [[1000, 'stopped'], false, []]);
  const warrens = await finding(dungeonAt('saltworm-warrens', 'Saltworm Warrens', 'continent-7'), 'abyss', 30);
  assert.ok(!keyed(warrens.root, 'card-find'));
  assert.ok(warrens.root.find('Never matched. Bring your company.'));
  assert.ok(!keyed((await finding(vale, 'elite', 12)).root, 'card-find'), 'a patrol’s dungeon');
  assert.ok(!keyed((await finding(grotto, 'normal', 12, FRIDAY_NINE, null)).root, 'card-find'), 'offline');
});

test('a search for the Elite Dungeon of the week ends as the week turns, and the card offers its Normal run', async () => {
  const cistern = dungeonAt('forsaken-cistern', 'Forsaken Cistern', 'continent-4');
  const { root, sockets, time, look } = await finding(cistern, 'elite', 26, 29_925_179);
  keyed(root, 'card-find')?.click();
  assert.match(sockets[0]?.address ?? '', /\/node-forsaken-cistern--elite$/);
  time.now += 60_000;
  look();
  assert.deepEqual(sockets[0]?.closed, [1000, 'stopped']);
  assert.ok(root.find('Elite Dungeon · Levels 10 to 13'));
  assert.ok(keyed(root, 'card-find'));
});

test('a run found just after the week turned is not gone into, and the card says to try again', async () => {
  const cistern = dungeonAt('forsaken-cistern', 'Forsaken Cistern', 'continent-4');
  const { root, sockets, entered, time } = await finding(cistern, 'elite', 26, 29_925_179);
  keyed(root, 'card-find')?.click();
  time.now += 60_000;
  sockets[0]?.fire('message', { data: '{"run":"node-forsaken-cistern--elite--run-m9n8b7v6"}' });
  assert.deepEqual(entered, [], 'last week’s run');
  assert.ok(root.find('The week turned. Try again.'));
  assert.ok(root.find('Elite Dungeon · Levels 10 to 13'), 'the card as it stands now');
  assert.ok(keyed(root, 'card-find'));
});

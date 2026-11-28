import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Child } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { type ActivityScreens, type ScreensFoot, startActivityScreens } from './activityScreens.ts';
import type { ActivityRecord, GearState } from '../network/gearMessages.ts';
import { SEARCH_LOST } from './companyFinder.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { FakeEvent, fakeWindow } from './pageForTests.ts';
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
/** The card as the game draws its layer on a screen `width` by `height`, read as a page is read: whether its words are
 *  laid, its press by its id, found and clicked, and the tree it was last built as. */
function drawn(screens: ActivityScreens, width = 1280, height = 900) {
  const { ui, step } = fakeInterface(width, height);
  let built: Child = null;
  const frame = (events: UiEvent[] = []) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = screens.layer(ui))] }), events);
  const settle = () => (frame(), frame());
  return {
    find: (words: string): boolean => (settle(), wordsIn(built).includes(words)),
    tree: (): Child => (settle(), built),
    press: (id: string) => {
      settle();
      const box = ui.boxOf(id);
      if (!box) return null;
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      return {
        click: () =>
          frame([
            { kind: 'pointer', x, y },
            { kind: 'down', x, y, button: 0 },
            { kind: 'up', x, y, button: 0 },
          ]),
      };
    },
  };
}
const still = { now: () => FRIDAY_NINE * 60_000, every: () => undefined };

test('This Week reads the last word a room sent of the character, kept at sea, and turns with the minute', async () => {
  fakeWindow();
  let clock = FRIDAY_NINE * 60_000;
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, { ...nothing, cleared: [1] }));
  const screens = startActivityScreens(module, [vale], () => here, nowhere, null, {
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

test('at sea the Journal reads the sea’s word of the character as it counts, and on foot the room’s again', async () => {
  fakeWindow();
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, nothing));
  let sea: GearState | null = null;
  const clock = { now: () => FRIDAY_NINE * 60_000, every: (run: () => void) => (look = run) };
  const screens = startActivityScreens(
    module,
    [vale],
    () => here,
    nowhere,
    null,
    clock,
    () => (here ? null : sea),
  );
  await module;
  look();
  here = null;
  look();
  assert.equal(screens.kept()?.level, 12, 'nothing heard at sea yet: the last word kept');
  sea = gearAt(13, { ...nothing, cleared: [1] });
  look();
  assert.equal(screens.kept()?.level, 13, "the sea's word, as it counts");
  assert.equal(screens.week()?.today.tiers[1]?.state, 'Taken');
  here = standing(gearAt(14, nothing));
  look();
  assert.equal(screens.kept()?.level, 14, "ashore, the room's word");
});

test('E at an entrance opens its card: tier, level, modifiers and pay; Enter goes in, Escape closes it', async () => {
  const { window } = fakeWindow();
  const entered: unknown[][] = [];
  const here = standing(gearAt(12, nothing));
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const screens = startActivityScreens(module, [vale], () => here, trips, null, still);
  const root = drawn(screens);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  for (const words of [
    'THE CAVERNS OF THE GULLWING VALE',
    'Elite seas · Levels 3 to 6',
    'Burn (Shadow)',
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
  ])
    assert.ok(root.find(words), words);
  assert.equal(gearScreenOpen(), true, 'the game’s keys rest under it');
  root.press('card-enter')?.click();
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale', undefined, 'elite']], 'at the tier its card drew');
  assert.equal(gearScreenOpen(), false);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.equal(gearScreenOpen(), true);
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.equal(gearScreenOpen(), false);
  assert.equal(entered.length, 1, 'closed, not entered');
  screens.card(1, 'The Mines of the Gullwing Vale');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.deepEqual(entered[1], [1, 'The Mines of the Gullwing Vale', undefined, 'elite'], 'E again goes in');
});

test('the card leads each modifier with its icon, its words as large as the menu’s on the same screen', async () => {
  fakeWindow();
  const here = standing(gearAt(12, nothing));
  const screens = startActivityScreens(module, [vale], () => here, nowhere, null, still);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  const burn = (tree: Child) =>
    nodesOf(tree).find((node) => node.children?.some((child) => child && child.text?.words === 'Burn (Shadow)'));
  const narrow = drawn(screens);
  assert.ok(
    nodesOf(burn(narrow.tree())).some((node) => node.picture),
    'Burn’s flame beside its name',
  );
  const sizeOf = (tree: Child) => nodesOf(tree).find((node) => node.text?.words === 'Burn (Shadow)')?.text?.size ?? 1;
  assert.ok(sizeOf(drawn(screens, 1920, 1080).tree()) > sizeOf(narrow.tree()), 'larger on a wide screen');
});

test('a shut card says why and does not go in, and before the rules are read E goes straight in', async () => {
  const { window } = fakeWindow();
  const entered: unknown[][] = [];
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const young = standing(gearAt(9, nothing));
  const screens = startActivityScreens(new Promise(() => undefined), [vale], () => young, trips, null, still);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']], 'no rules to show it by');
  const shut = startActivityScreens(module, [vale], () => young, trips, null, still);
  const root = drawn(shut);
  await module;
  shut.card(0, 'The Caverns of the Gullwing Vale');
  assert.ok(root.find('Elite seas open at level 10.'));
  root.press('card-enter')?.click();
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.equal(entered.length, 1, 'shut: not entered');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
});

test('the card goes when its player falls or leaves the place, and gives the keys back', async () => {
  fakeWindow();
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, nothing));
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(module, [vale], () => here, nowhere, null, clock);
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
  fakeWindow();
  let look = () => undefined as void;
  let here: ScreensFoot | null = null;
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(module, [vale], () => here, nowhere, null, clock);
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
  const { window } = fakeWindow();
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
  const screens = startActivityScreens(module, [node], () => here, trips, online, clock);
  await module;
  screens.card(0, node.name);
  return { root: drawn(screens), window, sockets, entered, time, look: () => look() };
}

test('Find a Company at an Elite Dungeon searches by its run, shows the wait, and goes into the run', async () => {
  const { root, sockets, entered, time, look } = await finding(grotto, 'normal', 12);
  root.press('card-find')?.click();
  assert.equal(sockets[0]?.address, 'ws://finder.test/v1/find/node-krakens-grotto');
  sockets[0]?.fire('open');
  assert.deepEqual(sockets[0]?.sent, [link.token]);
  time.now += 23_400;
  look();
  assert.ok(root.find('Finding a company · 0:23'));
  assert.ok(root.find('A run starts with four, or with fewer after a minute.'));
  assert.ok(root.press('card-stop') && !root.press('card-find'));
  sockets[0]?.fire('message', { data: '{"run":"node-krakens-grotto--run-m9n8b7v6"}' });
  assert.deepEqual(entered, [[0, 'Kraken’s Grotto', 'node-krakens-grotto--run-m9n8b7v6']]);
  assert.equal(gearScreenOpen(), false);
});

test('Stop and Escape leave the search; the week’s Abyss Dungeon, a patrol and a page offline offer none', async () => {
  const { root, window, sockets, entered } = await finding(grotto, 'normal', 12);
  root.press('card-find')?.click();
  root.press('card-stop')?.click();
  assert.deepEqual(sockets[0]?.closed, [1000, 'stopped']);
  assert.ok(root.press('card-find') && !root.press('card-stop'));
  root.press('card-find')?.click();
  sockets[1]?.fire('close', { code: 1006, reason: '' });
  assert.ok(root.find(SEARCH_LOST), 'a search that ended unasked says so');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'f' }));
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.deepEqual([sockets[2]?.closed, gearScreenOpen(), entered], [[1000, 'stopped'], false, []]);
  const warrens = await finding(dungeonAt('saltworm-warrens', 'Saltworm Warrens', 'continent-7'), 'abyss', 30);
  assert.ok(!warrens.root.press('card-find'));
  assert.ok(warrens.root.find('Never matched. Bring your company.'));
  assert.ok(!(await finding(vale, 'elite', 12)).root.press('card-find'), 'a patrol’s dungeon');
  assert.ok(!(await finding(grotto, 'normal', 12, FRIDAY_NINE, null)).root.press('card-find'), 'offline');
});

test('from the sea, Find a Company searches for the run started at sea, and holds as the minute turns', async () => {
  fakeWindow();
  const sockets: FinderSocket[] = [];
  const time = { now: FRIDAY_NINE * 60_000 };
  let look = () => undefined as void;
  const clock = {
    now: () => time.now,
    every: (run: () => void) => void (look = run),
    open: (address: string) => sockets[sockets.push(new FinderSocket(address)) - 1] as never,
  };
  const screens = startActivityScreens(
    module,
    [grotto],
    () => null,
    nowhere,
    link,
    clock,
    () => gearAt(12, nothing),
  );
  await module;
  screens.seaCard(grotto);
  const root = drawn(screens);
  root.press('card-find')?.click();
  assert.equal(sockets[0]?.address, 'ws://finder.test/v1/find/node-krakens-grotto--sea');
  time.now += 61_000;
  look();
  assert.deepEqual(sockets[0]?.closed, [], 'the card built again for the new minute keeps its search');
  assert.ok(root.press('card-stop'));
});

test('from the sea, Enter goes in from the sea, and a company found there is joined in its run, never by the door', async () => {
  fakeWindow();
  const sockets: FinderSocket[] = [];
  const trips: string[] = [];
  const clock = {
    now: () => FRIDAY_NINE * 60_000,
    every: () => undefined,
    open: (address: string) => sockets[sockets.push(new FinderSocket(address)) - 1] as never,
  };
  const screens = startActivityScreens(
    module,
    [grotto],
    () => null,
    {
      enter: (number, name, run) => void trips.push(`enter ${number} ${name} ${run ?? ''}`),
      intoRun: (node, run) => void trips.push(`into ${node.id} ${run}`),
      fromSea: (node) => void trips.push(`from sea ${node.id}`),
    },
    link,
    clock,
    () => gearAt(12, nothing),
  );
  await module;
  screens.seaCard(grotto);
  drawn(screens).press('card-enter')?.click();
  screens.seaCard(grotto);
  drawn(screens).press('card-find')?.click();
  sockets[0]?.fire('message', { data: '{"run":"node-krakens-grotto--sea--run-m9n8b7v6"}' });
  assert.deepEqual(trips, ['from sea krakens-grotto', 'into krakens-grotto node-krakens-grotto--sea--run-m9n8b7v6']);
});

test('a search for the Elite Dungeon of the week ends as the week turns, and the card offers its Normal run', async () => {
  const cistern = dungeonAt('forsaken-cistern', 'Forsaken Cistern', 'continent-4');
  const { root, sockets, time, look } = await finding(cistern, 'elite', 26, 29_925_179);
  root.press('card-find')?.click();
  assert.match(sockets[0]?.address ?? '', /\/node-forsaken-cistern--elite$/);
  time.now += 60_000;
  look();
  assert.deepEqual(sockets[0]?.closed, [1000, 'stopped']);
  assert.ok(root.find('Elite Dungeon · Levels 10 to 13'));
  assert.ok(root.press('card-find'));
});

test('a run found just after the week turned is not gone into, and the card says to try again', async () => {
  const cistern = dungeonAt('forsaken-cistern', 'Forsaken Cistern', 'continent-4');
  const { root, sockets, entered, time } = await finding(cistern, 'elite', 26, 29_925_179);
  root.press('card-find')?.click();
  time.now += 60_000;
  sockets[0]?.fire('message', { data: '{"run":"node-forsaken-cistern--elite--run-m9n8b7v6"}' });
  assert.deepEqual(entered, [], 'last week’s run');
  assert.ok(root.find('The week turned. Try again.'));
  assert.ok(root.find('Elite Dungeon · Levels 10 to 13'), 'the card as it stands now');
  assert.ok(root.press('card-find'));
});

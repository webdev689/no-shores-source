import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Child } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { fakeInterface, wordsIn } from '../ui/uiForTests.ts';
import { activitiesAt, gatesAt } from './activities.ts';
import { type ActivityScreens, startActivityScreens } from './activityScreens.ts';
import type { ActivityRecord, GearState } from '../network/gearMessages.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';
import { launchRoom, playlistScreenOf } from './playlistWords.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
/** A Friday's 09:00 UTC: day 20,778, in week 2,968. */
const FRIDAY_NINE = 29_919_420;
const NOW = FRIDAY_NINE * 60_000;
const record: ActivityRecord = {
  ...{ day: 20_778, cleared: [], week: 2_968, elite: false, abyss: true, boon: true },
  ...{ playlistTaken: [true, false], playlistClears: [2, 3] },
};
const names: Readonly<Record<string, string>> = { 'forsaken-cistern': 'Forsaken Cistern' };
const named = (id: string) => names[id] ?? id;

test('the Playlist says each entry’s level, rules, modifiers, rewards and gate, as the rules and the record say', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const gates = gatesAt(await module, 17, true);
  const screen = playlistScreenOf('Beside Overlook', drawn, gates, record, 17, named, NOW);
  assert.equal(screen.title, 'Playlist');
  const [elite, abyss, weekElite, weekAbyss] = screen.entries;
  assert.deepEqual(
    screen.entries.map((entry) => entry.name),
    ['Elite Playlist', 'Abyss Playlist', 'Elite Dungeon of the week', 'Abyss Dungeon of the week'],
  );
  assert.equal(elite?.about, 'Elite · Levels 15 to 19 · Foes at level 17');
  assert.deepEqual(
    elite?.modifiers.map((modifier) => modifier.key),
    ['burn-shadow'],
  );
  assert.deepEqual(
    abyss?.modifiers.map((modifier) => modifier.name),
    ['Burn (Shadow)', 'Trickle'],
  );
  assert.ok(abyss?.rules.includes('5 revives for the company. A wipe starts the run over.'));
  assert.equal(abyss?.rules[0], 'One of the 18 Elite Dungeons, at Abyss, drawn as each run starts.');
  assert.deepEqual(
    screen.entries.map((entry) => entry.drops),
    [
      'Drops orcish and mithril gear',
      'Drops adamantium and ebony gear',
      'Drops orcish and mithril gear',
      'Drops adamantium and ebony gear',
    ],
    'what each tier’s content drops, by its looks',
  );
  assert.equal(
    elite?.rewards[0]?.words,
    "Daily, the first clear: a Boss's worth of XP and Aurem, and a Vestige in a Boss's colours.",
  );
  assert.deepEqual(
    [elite?.lock, abyss?.lock, weekElite?.lock],
    [null, 'Opens at level 20 · You are 17', 'Opens at level 24 · You are 17'],
  );
  assert.deepEqual(
    elite?.rewards.map(({ taken, clears, resets }) => [taken, clears, resets]),
    [
      [true, null, 'Resets in 1d 00h'],
      [false, [true, true, false], 'Resets in 4d 00h'],
    ],
  );
  assert.equal(
    elite?.rewards[1]?.words,
    "Weekly, at 3 clears: 2 Essence of each stock and a Vestige in a Boss's colours.",
  );
  assert.equal(
    abyss?.rewards[1]?.words,
    "Weekly, at 3 clears: 3 Essence of each stock and 2 Vestiges in a Boss's colours.",
  );
  assert.equal(abyss?.rewards[1]?.taken, true, 'paid at its third clear');
  assert.equal(abyss?.shut, 'The Abyss Playlist opens at level 20.');
  assert.equal(weekElite?.about, 'Forsaken Cistern · Elite · Level 26');
  assert.equal(weekElite?.shut, 'This dungeon opens at level 24.');
  assert.equal(weekAbyss?.rewards[0]?.taken, true);
  assert.deepEqual(
    screen.entries.map((entry) => entry.launch.finds),
    ['playlist-elite', null, null, null],
    'shut ones and the week’s Abyss offer no search',
  );
  const later = playlistScreenOf('Beside Overlook', drawn, gatesAt(await module, 30, true), record, 30, named, NOW);
  assert.deepEqual(
    later.entries.map((entry) => entry.launch.finds),
    ['playlist-elite', 'playlist-abyss', 'node-forsaken-cistern--elite', null],
  );
  assert.equal(later.entries[1]?.about, 'Abyss · Level 30 · Foes at level 32');
  const yesterday = { ...record, day: 20_777, week: 2_967 };
  const stale = playlistScreenOf('Beside Overlook', drawn, gates, yesterday, 17, named, NOW).entries[0];
  assert.deepEqual(
    stale?.rewards.map((reward) => reward.taken),
    [false, false],
    'yesterday’s record is nothing today',
  );
  const unknown = playlistScreenOf('Beside Overlook', drawn, null, null, null, named, NOW).entries[0];
  assert.deepEqual([unknown?.about, unknown?.rewards[0]?.taken], ['Elite · From level 10', null]);
});

test('a launch names its run as the rooms read a playlist’s or the week’s', () => {
  const playlist = { place: null, seas: 'abyss', playlist: 28, finds: 'playlist-abyss' } as const;
  assert.equal(launchRoom(playlist, 'coral-halls', 'k3j4h5g6'), 'node-coral-halls--abyss--playlist-28--run-k3j4h5g6');
  const week = { place: 'saltworm-warrens', seas: 'abyss', playlist: null, finds: null } as const;
  assert.equal(launchRoom(week, 'saltworm-warrens', 'k3j4h5g6'), 'node-saltworm-warrens--abyss--run-k3j4h5g6');
});

/** A socket to the finder that writes down what it was sent and how it was closed. */
class FinderSocket {
  readonly sent: string[] = [];
  closed: [number, string] | null = null;
  private readonly heard = new Map<string, ((event: never) => void)[]>();
  readonly address: string;
  constructor(address: string) {
    this.address = address;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
  addEventListener(type: string, heard: (event: never) => void): void {
    this.heard.set(type, [...(this.heard.get(type) ?? []), heard]);
  }
  fire(type: string, event: object = {}): void {
    for (const heard of this.heard.get(type) ?? []) heard(event as never);
  }
}

/** The 18 Elite Dungeons a run is drawn from, and Overlook's social space, which names the port. */
const places = [...activitiesAt(await module, FRIDAY_NINE).elites, 'overlook-social'].map(
  (id) =>
    ({ id, name: id === 'overlook-social' ? 'Overlook' : id, kind: 'dungeon', continent: 'continent-1' }) as NodeInfo,
);
const link = { token: 'a'.repeat(64), finderAt: (base: string) => `ws://finder.test/v1/find/${base}` };

/** The screens at sea for a character of `level`, the Playlist's layer drawn on a page, every run gone into kept. */
async function atSea(level: number, signedIn = true, members = 1, roster?: () => Promise<unknown>) {
  const { window } = fakePage();
  const [sockets, into] = [[] as FinderSocket[], [] as string[]];
  let look = () => undefined as void;
  const world = { now: NOW, onSea: true };
  const clock = {
    now: () => world.now,
    every: (run: () => void) => void (look = run),
    open: (address: string) => sockets[sockets.push(new FinderSocket(address)) - 1] as never,
  };
  const trips = {
    enter: () => undefined,
    intoRun: (node: NodeInfo, run: string) => void into.push(`${node.id} ${run}`),
  };
  const gear = { level, prologueDone: true, activity: record } as GearState;
  const company = async () => ({ company: { leader: null, members: Array.from({ length: members }, () => ({})) } });
  const screens = startActivityScreens(
    module,
    places,
    () => null,
    trips,
    signedIn ? { ...link, roster: (roster ?? company) as never } : null,
    clock,
    () => gear,
    () => world.onSea,
  );
  await module;
  look();
  return { screens, window, sockets, into, root: drawn(screens), world, look: () => look() };
}

function drawn(screens: ActivityScreens) {
  const { ui, step } = fakeInterface(1600, 900);
  let built: Child = null;
  const frame = (events: UiEvent[] = []) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = screens.layer(ui))] }), events);
  const settle = () => (frame(), frame());
  return {
    find: (words: string): boolean => (settle(), wordsIn(built).includes(words)),
    click: (id: string) => {
      settle();
      const box = ui.boxOf(id);
      if (!box) return false;
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      frame([
        { kind: 'pointer', x, y },
        { kind: 'down', x, y, button: 0 },
        { kind: 'up', x, y, button: 0 },
      ]);
      return true;
    },
  };
}

test('a Playlist’s mark opens its screen beside its port; Launch goes into the run the server draws for it', async () => {
  const { screens, window, sockets, into, root } = await atSea(17);
  assert.equal(screens.playlist('overlook-port'), false, 'a port’s own mark is no Playlist');
  assert.equal(screens.playlist('overlook-playlist'), true);
  for (const words of ['PLAYLIST', 'Beside Overlook', 'ELITE PLAYLIST', 'Elite · Levels 15 to 19 · Foes at level 17'])
    assert.ok(root.find(words), words);
  assert.ok(root.find('Shadow spells deal double damage. Wearing Shadow, you take double.'), 'a modifier’s words');
  assert.equal(gearScreenOpen(), true, 'the game’s keys rest under it');
  assert.ok(root.click('playlist-launch'));
  assert.equal(sockets[0]?.address, 'ws://finder.test/v1/find/playlist-elite?launch', 'the server draws it');
  sockets[0]?.fire('open');
  assert.deepEqual(sockets[0]?.sent, [link.token]);
  assert.equal(into.length, 0, 'not before the server answers');
  sockets[0]?.fire('message', { data: '{"run":"node-coral-halls--elite--playlist-17--run-m9n8b7v6"}' });
  assert.deepEqual(into, ['coral-halls node-coral-halls--elite--playlist-17--run-m9n8b7v6']);
  assert.equal(gearScreenOpen(), false, 'closed as the run is gone into');
  screens.playlist('sunspire-playlist');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight' }));
  assert.ok(!root.click('playlist-find'), 'the Abyss Playlist is shut at 17: no search');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.equal(into.length, 1, 'a shut entry launches nothing');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.equal(gearScreenOpen(), false);
});

test('Find a Company on a playlist searches its one queue and goes into the run found for it', async () => {
  const { screens, sockets, into, root } = await atSea(17);
  screens.playlist('rimeholt-playlist');
  assert.ok(root.click('playlist-find'));
  assert.equal(sockets[0]?.address, 'ws://finder.test/v1/find/playlist-elite');
  sockets[0]?.fire('open');
  assert.deepEqual(sockets[0]?.sent, [link.token]);
  assert.ok(root.find('Finding a company · 0:00'));
  sockets[0]?.fire('message', { data: '{"run":"node-coral-halls--elite--playlist-17--run-m9n8b7v6"}' });
  assert.deepEqual(into, ['coral-halls node-coral-halls--elite--playlist-17--run-m9n8b7v6']);
});

test('playing alone, Launch goes into a run of an Elite Dungeon the page draws, as nothing is kept', async () => {
  const { screens, sockets, into, root } = await atSea(17, false);
  screens.playlist('overlook-playlist');
  assert.ok(root.click('playlist-launch'));
  assert.equal(sockets.length, 0, 'no server to ask');
  assert.match(into[0] ?? '', /^([a-z-]+) node-\1--elite--playlist-17--run-[a-z0-9]{8}$/);
});

test('the screen counts down each second it stands, and closes, its search stopped, once the player leaves the sea', async () => {
  const { screens, sockets, root, world, look } = await atSea(17);
  screens.playlist('overlook-playlist');
  assert.ok(root.find('Resets in 1d 00h'));
  world.now = NOW + 1_000;
  look();
  assert.ok(root.find('Resets in 23:59:59'), 'built again within the minute');
  assert.ok(root.click('playlist-find'));
  world.onSea = false;
  look();
  assert.equal(gearScreenOpen(), false, 'closed as the player went ashore');
  assert.deepEqual(sockets[0]?.closed, [1000, 'stopped'], 'its search stopped');
});

test('while Launch asks the server the screen says Launching…; an unanswered ask says the accounts did not answer', async () => {
  const { screens, sockets, root } = await atSea(17);
  screens.playlist('overlook-playlist');
  assert.ok(root.click('playlist-launch'));
  assert.ok(root.find('Launching…'));
  assert.ok(!root.find('Finding a company · 0:00'));
  sockets[0]?.fire('close', { code: 1006, reason: '' });
  assert.ok(root.find('The accounts did not answer. Try again.'));
});

test('Launch reads Go with your company once the Roster shows one, else Go alone', async () => {
  const alone = await atSea(17, true, 1);
  alone.screens.playlist('overlook-playlist');
  await new Promise((done) => setTimeout(done, 0));
  assert.ok(alone.root.find('Go alone'));
  const together = await atSea(17, true, 3);
  together.screens.playlist('overlook-playlist');
  await new Promise((done) => setTimeout(done, 0));
  assert.ok(together.root.find('Go with your company'));
});

test('a Roster answer to an earlier opening is not taken for the screen opened again', async () => {
  const answers: ((roster: unknown) => void)[] = [];
  const asked = () => new Promise<unknown>((answer) => answers.push(answer));
  const { screens, root, window } = await atSea(17, true, 1, asked);
  screens.playlist('overlook-playlist');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  screens.playlist('sunspire-playlist');
  // This opening's answer comes first; the earlier one's, late, must not overturn it.
  answers[1]?.({ company: null });
  await new Promise((done) => setTimeout(done, 0));
  answers[0]?.({ company: { leader: null, members: [{}, {}] } });
  await new Promise((done) => setTimeout(done, 0));
  assert.ok(root.find('Go alone'), 'the first opening’s company is not this one’s');
});

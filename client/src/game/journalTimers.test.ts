import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { thisWeekOf } from './activityWords.ts';
import { timersPanel } from './journalTimers.ts';
import { type FakeElement, FakeEvent, fakePage } from './pageForTests.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const FRIDAY_NINE = 29_919_420;
const FRIDAY_AT = FRIDAY_NINE * 60_000;
const named = { dungeon: (patrol: string, number: number) => `${patrol} ${number}`, place: (id: string) => id };
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);

const labelled = (root: FakeElement) => root.all().flatMap((node) => node.getAttribute('aria-label') ?? []);

async function opened() {
  const { root } = fakePage();
  const record = { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: true };
  const week = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), gatesAt(await module, 26, true), record, named);
  const panel = timersPanel(() => undefined);
  root.append(panel.node as never);
  panel.show(week, FRIDAY_AT + 1_000);
  return { root, panel };
}

const classed = (root: FakeElement, name: string) => root.all().filter((node) => node.classList.contains(name));

test('Today and This week each carry their reset’s icon and its one countdown; every row its icon and its name', async () => {
  const { root } = await opened();
  for (const words of ['Timers', 'Today', 'This week', 'Later', 'Dungeon of the day', 'Bounties'])
    assert.ok(root.find(words), words);
  for (const words of ['forsaken-cistern', 'saltworm-warrens', 'Abyss boon', 'Breaches'])
    assert.ok(root.find(words), words);
  assert.deepEqual(
    ['timer-day-reset', 'timer-week-reset'].map((key) => keyed(root, key)?.textContent),
    ['23:59:59', '3d 23h'],
  );
  const heads = classed(root, 'journal-timers-group');
  assert.deepEqual(
    heads.map((head) => head.all().filter((node) => node.tagName === 'IMG').length),
    [1, 1, 0],
    'the sun over Today, the page of the week over This week, nothing over Later',
  );
  const wells = classed(root, 'journal-timer-well');
  assert.equal(wells.length, 6, 'a well a row: the day’s dungeon, the bounties, the week’s two, the boon, Breaches');
  assert.ok(wells.every((well) => well.all().some((node) => node.tagName === 'IMG')));
  assert.equal(classed(root, 'journal-timer-count').length, 2, 'one countdown a reset, written once');
  assert.equal(root.find('Now'), undefined, 'every row is under way, so none says it');
  assert.equal(root.find('This Week'), undefined, 'no title but the panel’s own');
});

test('what each row stands for is drawn, not written: the seas and how they stand, the modifiers, the pay', async () => {
  const { root } = await opened();
  const labels = labelled(root);
  for (const words of ['Normal seas: Not taken', 'Elite seas: Taken', 'Abyss seas: Not taken'])
    assert.ok(labels.includes(words), words);
  const burn =
    'At Elite and Abyss seas, Burn (Shadow): Shadow spells deal double damage. Wearing Shadow, you take double.';
  assert.equal(labels.filter((label) => label === burn).length, 2, 'the day’s flame on the Elite and the Abyss seas');
  for (const words of ['Pays once: a Vestige.', 'Pays once: a richer cache.', 'Pays once: a Legendary Vestige.'])
    assert.ok(labels.includes(words), words);
  assert.ok(labels.includes('5 revives for the company.') && labels.includes('A wipe starts the run over.'));
  assert.ok(root.find('+25%'), 'the boon by XP’s glyph and what it adds');
  assert.deepEqual(
    classed(root, 'journal-level').map((level) => level.textContent),
    ['Lv26', 'Lv30'],
    'each level as its number',
  );
  assert.ok(
    labels.some((label) => label.startsWith('Lightswitch: ')),
    'a week’s modifier by its icon, its name and words read and said',
  );
  assert.equal(root.find('Lightswitch'), undefined, 'and not written on the row');
  for (const sentence of [
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
    'Once a week: a Legendary Vestige and Essence.',
    '5 revives for the company. A wipe starts the run over.',
    'Elite Dungeon of the week · Level 26',
    'Burn (Shadow)',
  ])
    assert.equal(root.find(sentence), undefined, `${sentence} is not written on the row`);
});

test('the foot says in words whatever is pointed at or focused, and is empty at rest', async () => {
  const { root, panel } = await opened();
  const foot = () => keyed(root, 'timers-said')?.textContent;
  assert.equal(foot(), '');
  const flame = root.all().find((node) => node.classList.contains('journal-on-seas'));
  flame?.dispatchEvent(new FakeEvent('pointerenter'));
  assert.equal(
    foot(),
    'At Elite and Abyss seas, Burn (Shadow): Shadow spells deal double damage. Wearing Shadow, you take double.',
  );
  (panel.list as unknown as FakeElement).dispatchEvent(new FakeEvent('pointerleave'));
  assert.equal(foot(), '');
  classed(root, 'journal-timers-clock')[0]?.dispatchEvent(new FakeEvent('pointerenter'));
  assert.equal(foot(), 'The day turns at this time, in your local time.');
  const rows = classed(root, 'journal-timer-row');
  assert.deepEqual(
    rows.map((row) => row.tabIndex),
    [0, -1, -1, -1, -1, -1],
    'one row a stop for Tab',
  );
  rows[0]?.focus();
  const down = new FakeEvent('keydown', { key: 'ArrowDown' });
  (panel.list as unknown as FakeElement).dispatchEvent(down);
  assert.equal(document.activeElement, rows[1], 'the arrows step between the rows');
  assert.deepEqual([rows[0]?.tabIndex, rows[1]?.tabIndex, down.defaultPrevented], [-1, 0, true]);
  rows[0]?.dispatchEvent(new FakeEvent('focus'));
  assert.match(foot() ?? '', /^Dungeon of the day\. Once a day at each tier/);
});

test('as the reset passes with the timers open the count stops at nothing, then the new day’s rows count anew', async () => {
  const { root } = fakePage();
  const panel = timersPanel(() => undefined);
  root.append(panel.node as never);
  const before = thisWeekOf(activitiesAt(await module, FRIDAY_NINE - 1), null, null, named);
  panel.show(before, FRIDAY_AT - 2_000);
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '0:02');
  const counted = keyed(root, 'timer-day-reset');
  panel.show(before, FRIDAY_AT + 500);
  assert.equal(keyed(root, 'timer-day-reset'), counted, 'the same word keeps its rows, rewriting only the count');
  assert.equal(counted?.textContent, '0:00', 'never below nothing while the new day is drawn');
  const after = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), null, null, named);
  panel.show(after, FRIDAY_AT + 1_000);
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '23:59:59');
  assert.ok(
    after.today.dungeons.every((row) => root.find(row.name)),
    'the new day’s dungeons',
  );
});

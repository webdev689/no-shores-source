import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import type { Interface, UiEvent } from '../ui/ui.ts';
import { activitiesAt, gatesAt } from './activities.ts';
import { type ThisWeek, thisWeekOf } from './activityWords.ts';
import { sizesOf } from './gearNodes.ts';
import { timersNode } from './journalTimers.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const FRIDAY_NINE = 29_919_420;
const FRIDAY_AT = FRIDAY_NINE * 60_000;
const named = { dungeon: (patrol: string, number: number) => `${patrol} ${number}`, place: (id: string) => id };
const SIZES = sizesOf(1280, 900, 1);

/** The timers drawn for `week`, frame by frame: the last tree built, and a step of frames hearing `events`. */
function timers(week: () => ThisWeek | null, now: () => number) {
  const { ui, step } = fakeInterface(1280, 900);
  let built: Node = {};
  const panel = () => timersNode(ui, week(), now(), SIZES, 720);
  const frame = (events: UiEvent[] = []) => step(() => (built = { width: 'grow', children: [panel()] }), events);
  frame();
  frame();
  return { ui, frame, tree: () => built };
}

async function opened() {
  const record = { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: true };
  const week = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), gatesAt(await module, 26, true), record, named);
  return timers(
    () => week,
    () => FRIDAY_AT + 1_000,
  );
}

/** The middle of what `id` was laid as last frame. */
const middleOf = (ui: Interface, id: string): { x: number; y: number } => {
  const box = ui.boxOf(id);
  assert.ok(box, `${id} is laid`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('Today and This week each carry their reset’s icon and its one countdown; every row its icon and its name', async () => {
  const { tree } = await opened();
  const said = wordsIn(tree());
  for (const words of ['Timers', 'TODAY', 'THIS WEEK', 'LATER', 'Dungeon of the day', 'Bounties'])
    assert.ok(said.includes(words), words);
  for (const words of ['forsaken-cistern', 'saltworm-warrens', 'Abyss boon', 'Breaches'])
    assert.ok(said.includes(words), words);
  assert.deepEqual(
    ['timer-day-reset', 'timer-week-reset'].map((id) => wordsIn(byId(tree(), id))[0]),
    ['23:59:59', '3d 23h'],
  );
  assert.equal(byId(tree(), 'timer-later-reset'), undefined, 'no countdown over Later');
  const rows = nodesOf(tree()).filter((node) => node.id?.startsWith('timer-row-'));
  assert.equal(rows.length, 6, 'a row each: the day’s dungeon, the bounties, the week’s two, the boon, Breaches');
  const drawn = (row: Node) =>
    nodesOf(row).some((node) => node.role === 'well' && nodesOf(node).some((inner) => inner.picture));
  assert.ok(rows.every(drawn), 'each its icon in a well');
  assert.equal(said.filter((words) => words === '23:59:59').length, 1, 'one countdown a reset, written once');
  assert.ok(!said.includes('Now') && !said.includes('This Week'), 'every row under way; no title but the panel’s');
});

test('what each row stands for is drawn, not written: the seas and how they stand, the modifiers, the pay', async () => {
  const { tree } = await opened();
  const said = wordsIn(tree());
  const labels = nodesOf(tree()).flatMap((node) => node.label ?? []);
  const burn =
    'At Elite and Abyss seas, Burn (Shadow): Shadow spells deal double damage. Wearing Shadow, you take double.';
  assert.ok(
    labels.some((label) => label.startsWith('Dungeon of the day. Once a day at each tier')),
    'read in full',
  );
  assert.ok(said.includes('+25%'), 'the boon by XP’s glyph and what it adds');
  assert.ok(said.includes('26') && said.includes('30') && said.includes('Lv'), 'each level as its number');
  for (const sentence of [
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
    'Once a week: a Legendary Vestige and Essence.',
    '5 revives for the company. A wipe starts the run over.',
    'Burn (Shadow)',
    burn,
  ])
    assert.ok(!said.includes(sentence), `${sentence} is not written on the rows`);
});

test('the foot says in words whatever is pointed at or focused, and is empty at rest', async () => {
  const { ui, frame, tree } = await opened();
  const foot = () => wordsIn(byId(tree(), 'timers-said')).join('');
  assert.equal(foot(), '');
  // The day's seas at Elite: taken, the day's flame on them, read as one.
  frame([{ kind: 'pointer', ...middleOf(ui, 'mark-day-0-1') }]);
  frame();
  assert.equal(
    foot(),
    'Elite seas: Taken. At Elite and Abyss seas, Burn (Shadow): Shadow spells deal double damage. Wearing Shadow, you take double.',
  );
  frame([{ kind: 'pointer', ...middleOf(ui, 'timer-day-reset') }]);
  frame();
  assert.equal(foot(), 'The day turns at this time, in your local time.');
  frame([{ kind: 'leave' }]);
  frame();
  assert.equal(foot(), '');
  ui.focusOn('timer-row-day');
  frame();
  assert.match(foot(), /^Dungeon of the day\. Once a day at each tier/);
  frame([{ kind: 'key', key: 'ArrowDown' }]);
  frame();
  assert.equal(ui.focusedId, 'timer-row-bounties', 'the arrows step between the rows');
});

test('as the reset passes with the timers open the count stops at nothing, then the new day’s rows count anew', async () => {
  const before = thisWeekOf(activitiesAt(await module, FRIDAY_NINE - 1), null, null, named);
  const after = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), null, null, named);
  let [week, now] = [before, FRIDAY_AT - 2_000];
  const { frame, tree } = timers(
    () => week,
    () => now,
  );
  const count = () => wordsIn(byId(tree(), 'timer-day-reset'))[0];
  assert.equal(count(), '0:02');
  now = FRIDAY_AT + 500;
  frame();
  assert.equal(count(), '0:00', 'never below nothing while the new day is drawn');
  [week, now] = [after, FRIDAY_AT + 1_000];
  frame();
  assert.equal(count(), '23:59:59');
  assert.ok(
    after.today.dungeons.every((row) => wordsIn(tree()).includes(row.name)),
    'the new day’s dungeons',
  );
});

test('the island of the character’s level says so, and stands lit among the day’s islands', async () => {
  const record = { day: 20_778, cleared: [1, 2], week: 2_968, elite: true, abyss: false, boon: true };
  const week = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), gatesAt(await module, 12, true), record, named, 12);
  const { ui, frame, tree } = timers(
    () => week,
    () => FRIDAY_AT,
  );
  const yours = week.today.dungeons.findIndex((row) => row.yours);
  assert.ok(yours >= 0);
  assert.ok(byId(tree(), `isle-${yours}`)?.fill, 'lit');
  frame([{ kind: 'pointer', ...middleOf(ui, `isle-${yours}`) }]);
  frame();
  assert.match(wordsIn(byId(tree(), 'timers-said')).join(''), /Your level is in its band\.$/);
});

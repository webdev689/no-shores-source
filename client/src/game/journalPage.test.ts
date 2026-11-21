import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { bannerFor, bannerUrl } from '../plus/journalArt.ts';
import { poolMarkUrl } from './journalIcons.ts';
import type { ThisWeek } from './activityWords.ts';
import { STEP_BACK } from './gearScreen.ts';
import { type JournalSource, startJournal } from './journalPage.ts';
import type { WrittenQuest } from './journalWords.ts';
import { type FakeElement, FakeEvent, fakePage } from './pageForTests.ts';

const FRIDAY_AT = 29_919_420 * 60_000;
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);
const classed = (root: FakeElement, name: string) => root.all().filter((node) => node.classList.contains(name));
const bounty = (words: string, target: number, count = 0, held = false, paid = false, pool = 0) => ({
  words,
  target,
  count,
  held,
  paid,
  pool,
  name: `Sample ${pool}`,
});
const BOARD = [
  bounty('Defeat 30 Grey Tithe foes.', 30),
  bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true),
  bounty('Sink or take 3 ships.', 3, 3, true, false, 1),
  bounty('Sink or take a ship of Elite rank or higher.', 1, 1, true, true, 1),
  bounty('Clear 2 dungeons.', 2, 0, false, false, 2),
  bounty('Clear 3 dungeons.', 3, 0, false, false, 2),
];
const sample = (id: string, kind: string): WrittenQuest => ({
  id,
  kind,
  name: `Sample ${kind} quest ${id}`,
  tale: 'A sample line of its tale.',
  steps: [{ name: 'Sample first step' }, { name: 'Sample second step' }],
});
const geared = (quests: readonly { id: string; step: number; done: boolean }[], bounties = BOARD) =>
  ({ prologueDone: true, day: 20_778, bounties, quests, bountyXp: 3_500, bountyAurem: 210 }) as unknown as GearState;
/** A day's and a week's word with nothing on but their resets. */
const weekEnding = (endsAt: number, day = 20_778): ThisWeek => ({
  today: { day, endsAt, pays: '', rewards: [], modifier: null, tiers: [], dungeons: [] },
  week: { endsAt: endsAt + 3 * 86_400_000, dungeons: [], boon: null },
});
function journalOf(source: JournalSource, now = () => FRIDAY_AT) {
  const { root, window } = fakePage();
  const journal = startJournal(source, now);
  root.append(journal.hourglass as never, journal.page() as never);
  return { root, window, journal, page: journal.page() as unknown as FakeElement };
}

test('with no quest written the Journal says so plainly, the bounties at its side, and its timers wait above', () => {
  const open = BOARD.map((one) => ({ ...one, held: false, paid: false, count: 0 }));
  const { root } = journalOf({ week: () => null, kept: () => geared([], open), written: [] });
  assert.ok(root.find('No quests yet. The story’s missions and side quests come later.'));
  assert.equal(
    root.all().some((node) => node.textContent.startsWith('Page ')),
    false,
    'no pages to turn',
  );
  assert.ok(root.find('0 / 6'));
  assert.equal(classed(root, 'journal-slot').length, 6, 'six empty frames');
  assert.ok(root.find('None taken yet. Take them at the bounty board in Overlook’s plaza.'));
  assert.equal(keyed(root, 'timers')?.hidden, true);
  assert.equal(root.find('This Week'), undefined);
});

test('the quests held are cards six a page, story missions first, each at its step, with the page and arrows to turn it', () => {
  const written = ['side', 'story', 'side', 'story', 'side', 'story', 'a-kind-to-come', 'side'].map((kind, index) =>
    sample(String.fromCharCode(97 + index), kind),
  );
  const held = written.map(({ id }, index) => ({ id, step: index % 2, done: id === 'd' }));
  const { root } = journalOf({ week: () => null, kept: () => geared(held), written });
  const cards = () => classed(root, 'journal-card');
  assert.ok(root.find('1 / 2') && root.find('8'), 'the page among its arrows, and how many are held by the title');
  assert.ok(root.all().some((node) => node.getAttribute('aria-label') === '8 held'));
  assert.deepEqual(
    cards().map((card) => card.dataset['key']),
    ['quest-b', 'quest-d', 'quest-f', 'quest-a', 'quest-c', 'quest-e'],
  );
  const first = cards()[0];
  assert.equal(
    first?.all().find((node) => node.tagName === 'IMG')?.['src' as never],
    bannerUrl(bannerFor('story', 'b')),
  );
  assert.ok(first?.find('2') && first.find('Sample second step'), 'its step’s number, from one, and its name');
  assert.ok(
    cards()[1]
      ?.all()
      .some((node) => node.tagName === 'IMG' && node['alt' as never] === 'Done'),
    'every step done, waiting to be finished: its tick',
  );
  assert.equal(keyed(root, 'quests-back')?.getAttribute('aria-disabled'), 'true');
  keyed(root, 'quests-next')?.click();
  assert.ok(root.find('2 / 2'));
  assert.deepEqual(
    cards().map((card) => card.dataset['key']),
    ['quest-h', 'quest-g'],
    'a kind to come after the side quests',
  );
  assert.equal(
    cards()[1]
      ?.all()
      .find((node) => node.tagName === 'IMG')?.['src' as never],
    bannerUrl(bannerFor('a-kind-to-come', 'g')),
  );
  assert.equal(keyed(root, 'quests-next')?.getAttribute('aria-disabled'), 'true');
});

test('a long name or tale stands whole in its card’s words and title, the card cutting short only what it shows', () => {
  const name = 'A sample story mission whose name runs far past the edge of any card it could stand on';
  const tale = 'A sample tale line long enough to wrap twice on the narrowest card, so the card cuts it short there.';
  const written = [{ ...sample('long', 'story'), name, tale }];
  const { root } = journalOf({ week: () => null, kept: () => geared([{ id: 'long', step: 0, done: false }]), written });
  const [shown] = classed(root, 'journal-card-name');
  const [told] = classed(root, 'journal-card-tale');
  assert.deepEqual(
    [shown?.textContent, shown?.['title' as never], told?.textContent, told?.['title' as never]],
    [name, name, tale, tale],
  );
});

test('each bounty taken is a tile marked where it counts, its state its look; the rest empty frames; its card under them', () => {
  const { root } = journalOf({ week: () => null, kept: () => geared([]), written: [] });
  const tiles = classed(root, 'bounty-tile');
  assert.deepEqual(
    tiles.map((tile) => tile.dataset['key']),
    ['bounty-1', 'bounty-2', 'bounty-3'],
  );
  assert.deepEqual(
    tiles.map((tile) => ['held', 'done', 'paid'].find((state) => tile.classList.contains(`bounty-tile-${state}`))),
    ['held', 'done', 'paid'],
  );
  assert.deepEqual(
    tiles.map((tile) => tile.all().find((node) => node.tagName === 'IMG')?.['src' as never]),
    [poolMarkUrl(0), poolMarkUrl(1), poolMarkUrl(1)],
  );
  assert.equal(classed(root, 'journal-slot').length, 3);
  assert.ok(root.find('3 / 6'));
  const said = () => keyed(root, 'bounty-said');
  assert.ok(said()?.find('Defeat 2 foes of Miniboss rank or higher.') && said()?.find('1 / 2'), 'the first at first');
  assert.ok(said()?.find('Land bounty') && said()?.find('+3,500'), 'its kind, and its XP by its glyph');
  tiles[1]?.dispatchEvent(new FakeEvent('pointerenter'));
  assert.ok(said()?.find('Sink or take 3 ships.') && said()?.find('Done. Turn it in at the bounty board.'));
  tiles[2]?.dispatchEvent(new FakeEvent('focus'));
  assert.ok(said()?.find('Turned in'));
  const presses = root.all().filter((node) => node.tagName === 'BUTTON' && node.textContent.startsWith('T'));
  assert.deepEqual(presses, [], 'taken and turned in at the board alone');
});

test('gear of another day’s board, kept at sea through the reset, shows no bounty until a room sends today’s', () => {
  const { root } = journalOf({ week: () => weekEnding(FRIDAY_AT, 20_779), kept: () => geared([]), written: [] });
  assert.equal(classed(root, 'bounty-tile').length, 0);
  assert.ok(root.find('Six a day, from the board in Overlook’s plaza.'));
  assert.equal(root.find('0 / 0'), undefined, 'no count without a board to count');
});

test('the hourglass or T drops the timers from the top; Escape, Close or the hourglass take them up, the focus going back', () => {
  const { root, window, journal, page } = journalOf({ week: () => null, kept: () => null, written: [] });
  const timers = () => keyed(root, 'timers');
  journal.hourglass.click();
  assert.equal(timers()?.hidden, false);
  assert.equal(journal.hourglass.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, keyed(root, 'timers-close'), 'the focus goes in');
  assert.ok([...classed(root, 'journal-quests'), ...classed(root, 'journal-bounties')].every((node) => node.inert));
  const step = new FakeEvent(STEP_BACK);
  page.dispatchEvent(step);
  assert.equal(step.defaultPrevented, true, 'Escape takes the timers up before the menu steps back');
  assert.equal(timers()?.hidden, true);
  assert.equal(document.activeElement, journal.hourglass);
  const press = (key: string) => {
    const event = new FakeEvent('keydown', { key });
    event.target = root;
    window.dispatchEvent(event);
  };
  press('t');
  assert.equal(timers()?.hidden, false);
  keyed(root, 'timers-close')?.click();
  assert.equal(timers()?.hidden, true);
  const again = new FakeEvent(STEP_BACK);
  page.dispatchEvent(again);
  assert.equal(again.defaultPrevented, false, 'with them up, Escape is the menu’s');
});

test('the timers stay down and the focus stays put as the minute, the day and the gear change under them', () => {
  let [now, week, gear] = [FRIDAY_AT - 2_000, weekEnding(FRIDAY_AT), geared([])];
  const { root, journal } = journalOf({ week: () => week, kept: () => gear, written: [] }, () => now);
  journal.hourglass.click();
  journal.page();
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '0:02');
  now = FRIDAY_AT + 1_000;
  journal.page();
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '0:00', 'never below nothing until the new day comes');
  [week, gear] = [weekEnding(FRIDAY_AT + 86_400_000, 20_779), { ...geared([]), day: 20_779 } as GearState];
  journal.page();
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '23:59:59');
  assert.equal(keyed(root, 'timers')?.hidden, false, 'still down');
  assert.equal(document.activeElement, keyed(root, 'timers-close'), 'the focus where it was');
  journal.hourglass.click();
  keyed(root, 'bounty-1')?.focus();
  const more = BOARD.map((one, place) => (place === 1 ? { ...one, target: 30, count: 13 } : one));
  gear = { ...geared([], more), day: 20_779 } as GearState;
  journal.page();
  assert.equal((document.activeElement as unknown as FakeElement).dataset['key'], 'bounty-1');
  assert.ok(keyed(root, 'bounty-said')?.find('13 / 30'), 'rebuilt with its new count');
});

test('a focused tile gone as the day turns leaves the focus on the page, not lost; T with Ctrl is the browser’s', () => {
  let week = weekEnding(FRIDAY_AT);
  const { root, window, journal } = journalOf({ week: () => week, kept: () => geared([]), written: [] });
  keyed(root, 'bounty-1')?.focus();
  week = weekEnding(FRIDAY_AT + 86_400_000, 20_779);
  journal.page();
  assert.equal(document.activeElement, journal.hourglass, 'no tile left, so the hourglass');
  const key = new FakeEvent('keydown', { key: 't' });
  Object.assign(key, { ctrlKey: true });
  key.target = root;
  window.dispatchEvent(key);
  assert.equal(keyed(root, 'timers')?.hidden, true);
  assert.equal(key.defaultPrevented, false);
});

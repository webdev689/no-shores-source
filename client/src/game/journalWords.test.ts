import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import type { QuestState } from '../network/questMessages.ts';
import { BANNER_KEYS, bannerFor } from '../plus/journalArt.ts';
import { bountyWords } from './bountyBoard.ts';
import { bountyColumnOf, countdownWords, questCardsOf, whenWords } from './journalWords.ts';
import type { QuestLine } from './quests/questBook.ts';

const bounty = (words: string, target: number, count = 0, held = false, paid = false, pool = 0) => ({
  words,
  target,
  count,
  held,
  paid,
  pool,
  name: 'Sample',
});
const BOARD = [
  bounty('Defeat 30 Grey Tithe foes.', 30),
  bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true),
  bounty('Sink or take 3 ships.', 3, 3, true, false, 1),
  bounty('Sink or take a ship of Elite rank or higher.', 1, 1, true, true, 1),
  bounty('Clear 2 dungeons.', 2, 0, false, false, 2),
  bounty('Clear 3 dungeons.', 3, 0, false, false, 2),
];
/** A sample road of two tasks, its opening scene one of the story's own. */
const sample = (id: string): QuestLine => ({
  id,
  name: `Sample quest ${id}`,
  faction: 0,
  begin: 'houseBegin',
  tasks: [
    { id: 'first', task: 'Sample first task', goals: [] },
    { id: 'second', task: 'Sample second task', goals: [] },
  ],
});
/** Where a character stands on the roads: walking quest `quest` (from 1) at `task`, each in `done` done. */
const walking = (quest: number, task: number, done: readonly number[], claimed = true): QuestState => ({
  ...{ quest, task, counts: [], done, choices: [], at: null, claimed },
});

test('a countdown reads in days and hours, then h:mm:ss, then m:ss, rounded up and never below nothing', () => {
  const ends = [0, -5_000, 400, 246_500, 247_000, 3_909_000, 2 * 86_400_000 + 4 * 3_600_000 + 59_000];
  assert.deepEqual(ends.map(countdownWords), ['0:00', '0:00', '0:01', '4:07', '4:07', '1:05:09', '2d 04h']);
});

test('a moment reads in the player’s own clock: the time today, the weekday within six days, the date past them', () => {
  const today = new Date(2026, 9, 2, 9, 0).getTime();
  assert.equal(whenWords(new Date(2026, 9, 2, 18, 5).getTime(), today), '18:05');
  assert.equal(whenWords(new Date(2026, 9, 4, 18, 0).getTime(), today), 'Sun 18:00');
  assert.equal(whenWords(new Date(2026, 9, 18, 18, 0).getTime(), today), 'Sun 18 Oct 18:00');
});

test('the roads are cards: the one walked at its task from one, each done at its last, all story missions in order', () => {
  const roads = [sample('opening'), sample('first-house'), sample('second-house')];
  const cards = questCardsOf(walking(3, 0, [1, 0, 0]), roads);
  assert.deepEqual(
    cards.map((card) => [card.id, card.kind, card.banner, card.step, card.stepName, card.done]),
    [
      ['opening', 'story', bannerFor('story', 'opening'), 2, 'Sample second task', true],
      ['second-house', 'story', bannerFor('story', 'second-house'), 1, 'Sample first task', false],
    ],
    'the opening done, the house walked; the house not begun shows nothing',
  );
  assert.equal(cards[0]?.tale, 'Hear all three houses before you choose. Start with the loudest.', 'its opening line');
  assert.deepEqual(
    questCardsOf(walking(1, 0, [0, 0, 0]), roads).map((card) => card.id),
    ['opening'],
    'a new one',
  );
  assert.deepEqual(questCardsOf(walking(1, 0, [], false), roads), [], 'nothing from a word not on their character');
  assert.deepEqual(questCardsOf(null, roads), [], 'nothing before any room’s word');
  assert.deepEqual(questCardsOf(walking(0, 0, [0, 0, 0]), roads), [], 'none walked and none done');
});

test('the bounties taken stand in the board’s order, each with its count, done or turned in, the rest slots', () => {
  const gear = { prologueDone: true, day: 20_778, bounties: BOARD } as unknown as GearState;
  const column = bountyColumnOf(gear);
  assert.deepEqual(
    column.taken.map((row) => [row.place, row.pool, bountyWords(row)]),
    [
      [1, 0, '1/2'],
      [2, 1, 'Done. Turn it in at the board.'],
      [3, 1, 'Turned in'],
    ],
  );
  assert.deepEqual([column.slots, column.said], [6, null]);
  const unheard = { taken: [], slots: 0, said: 'Six a day, from the board in Overlook’s plaza.' };
  assert.deepEqual(bountyColumnOf(null), unheard);
  assert.equal(bountyColumnOf({ ...gear, prologueDone: false }).said, 'The bounty board opens after the prologue.');
  const none = bountyColumnOf({ ...gear, bounties: BOARD.map((one) => ({ ...one, held: false, paid: false })) });
  assert.deepEqual(
    [none.taken.length, none.slots, none.said],
    [0, 6, 'None taken yet. Take them at the bounty board in Overlook’s plaza.'],
  );
});

test('every road the rules keep has a card to show: its banner drawn, a line of its tale and a task', () => {
  const cards = questCardsOf(walking(0, 0, [1, 1, 1, 1]));
  assert.equal(cards.length, 4, 'the opening and the three houses’ roads');
  for (const card of cards) {
    assert.ok(BANNER_KEYS.includes(card.banner), `${card.id}’s banner is drawn`);
    assert.ok(card.tale !== '' && card.stepName !== '', `${card.id} has a tale and a task`);
  }
});

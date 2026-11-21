import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { BANNER_KEYS, bannerFor } from '../plus/journalArt.ts';
import { bountyWords } from './bountyBoard.ts';
import {
  QUESTS_WRITTEN,
  type WrittenQuest,
  bountyColumnOf,
  countdownWords,
  questCardsOf,
  whenWords,
} from './journalWords.ts';

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
const sample = (id: string, kind: string, banner?: string): WrittenQuest => ({
  id,
  kind,
  name: `Sample ${kind} quest`,
  tale: 'A sample line of its tale.',
  ...(banner ? { banner } : {}),
  steps: [{ name: 'Sample first step' }, { name: 'Sample second step' }],
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

test('the quests held are cards, story missions first, each at its step from one under its banner, none the page lacks', () => {
  const written = [sample('side', 'side'), sample('story', 'story', 'side'), sample('to-come', 'a-kind-to-come')];
  const held = [
    { id: 'side', step: 1, done: false },
    { id: 'not-on-this-page', step: 0, done: false },
    { id: 'to-come', step: 7, done: false },
    { id: 'story', step: 0, done: true },
  ];
  assert.deepEqual(
    questCardsOf(held, written).map((card) => [card.id, card.banner, card.step, card.stepName, card.done]),
    [
      ['story', 'side', 1, 'Sample first step', true],
      ['side', bannerFor('side', 'side'), 2, 'Sample second step', false],
      ['to-come', bannerFor('a-kind-to-come', 'to-come'), 2, 'Sample second step', false],
    ],
  );
  assert.deepEqual(questCardsOf([], written), []);
});

test('the bounties taken stand in the board’s order, each with its count, done or turned in, the rest slots', () => {
  const gear = { prologueDone: true, day: 20_778, bounties: BOARD } as unknown as GearState;
  const column = bountyColumnOf(gear);
  assert.deepEqual(
    column.taken.map((row) => [row.place, row.pool, bountyWords(row)]),
    [
      [1, 0, '1 / 2'],
      [2, 1, 'Done. Turn it in at the bounty board.'],
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

test('every banner a quest written names is drawn, and every quest written has a step to show', () => {
  for (const quest of QUESTS_WRITTEN) {
    assert.ok(quest.banner === undefined || BANNER_KEYS.includes(quest.banner), `${quest.id}’s banner is drawn`);
    assert.ok(quest.steps.length > 0, `${quest.id} has a step`);
  }
});

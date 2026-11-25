import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_KIND, type PublicEvent } from '../network/publicMessages.ts';
import type { OtherPlayers } from '../player/others.ts';
import { chartMarksOf, mapMarksOf } from './mapMarks.ts';

const raid = (phase: number): PublicEvent => ({
  kind: PUBLIC_KIND.raid,
  phase,
  ground: [50, 50, 2],
  radius: 30,
  ticksLeft: 3600,
  nextKind: 1,
  nextGround: [0, 0, 0],
  nextTicks: 0,
  stage: 1,
  stages: 3,
  progress: 1000,
  needed: 1000,
  heroic: 0,
  heroicTicks: 0,
  bonus: true,
  marks: [],
  nextWaveTicks: 0,
});

test('the land map marks every other player in the room in their nameplate colour, and the zone event while it runs', () => {
  // Two players anywhere in the room, one in the viewer's company; a guest's empty name is in none.
  const plates = new Map([
    [2, { player: 2, name: 'Wren', level: 4, menu: false, tag: '' }],
    [3, { player: 3, name: '', level: 1, menu: false, tag: '' }],
  ]);
  const others = {
    placed: new Map([
      [2, { x: 900, y: -40 }],
      [3, { x: -5, y: 7 }],
    ]),
    plateOf: (number: number) => plates.get(number) ?? null,
  } as unknown as Pick<OtherPlayers, 'placed' | 'plateOf'>;
  const marks = mapMarksOf(raid(1), others, (name) => name === 'Wren');
  assert.deepEqual(marks.others, [
    { at: [900, -40], company: true },
    { at: [-5, 7], company: false },
  ]);
  assert.deepEqual(marks.events, [{ at: [50, 50], name: 'The Grey Tithe Raid', clock: '1:00' }]);
  assert.deepEqual(mapMarksOf(raid(2), others, () => false).events, [], 'over, it is marked no longer');
  assert.deepEqual(mapMarksOf(null, others, () => false).events, [], 'no event, none');
});

test('the sea map marks every other ship on the sea’s chart in its captain’s nameplate colour, never the player’s own', () => {
  const charted = [
    { player: 1, at: [10, 20] as const, name: 'Own_Ship' },
    { player: 2, at: [4_000_000, 90_000] as const, name: 'Wren' },
    { player: 3, at: [-5, 7] as const, name: '' },
  ];
  assert.deepEqual(
    chartMarksOf(charted, 1, (name) => name === 'Wren'),
    {
      others: [
        { at: [4_000_000, 90_000], company: true },
        { at: [-5, 7], company: false },
      ],
      events: [],
    },
  );
});

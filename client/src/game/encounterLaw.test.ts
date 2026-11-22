import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { type EncounterSeen, SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { COURT, encounterBanner, encounterBeat, encounterMarks, SEAL_NAMES, taskOf } from './encounterLaw.ts';

/** A dungeon of two rooms in a row of four cells: room 0 the Litany's (cells 0 and 1), room 1 the end. */
const layout = {
  cell: 3.2,
  columns: 4,
  rows: 1,
  cells: [0, 0, 1, 1],
  encounters: {
    seals: [
      {
        kind: SEAL_KIND.litany,
        room: 0,
        pieces: [
          [1.6, 1.6, 0],
          [4.8, 1.6, 0],
        ],
        pads: [],
        drowned: [],
        doors: [],
      },
      {
        kind: SEAL_KIND.weighing,
        room: 1,
        pieces: [
          [8, 1.6, 0],
          [11.2, 1.6, 0],
          [9.6, 1.6, 0],
        ],
        pads: [],
        drowned: [],
        doors: [],
      },
    ],
    anchors: [
      [8, 1.6, 0],
      [9.6, 1.6, 0],
      [11.2, 1.6, 0],
    ],
    reach: { rune: 0.9, plate: 1, relic: 3, anchor: 1, light: 1.25 },
  },
} as unknown as DungeonLayout;

const seen = (more: Partial<EncounterSeen> = {}): EncounterSeen => ({
  seals: [
    { kind: SEAL_KIND.litany, state: SEAL_STATE.running, progress: 0.5, marks: [2, 0], relic: 1 },
    { kind: SEAL_KIND.weighing, state: SEAL_STATE.waiting, progress: 0, marks: [0, 0], relic: 1 },
  ],
  woken: false,
  boss: 0,
  ward: 0,
  wardsBroken: 0,
  anchors: [0, 0, 0],
  reckoningTicks: 0,
  reckoningAt: 0,
  fury: 0,
  ...more,
});

test('the banner names the seal the player stands in, its task in a line, its progress and the seals broken', () => {
  const banner = encounterBanner(layout, seen(), [2, 1.6, 0]);
  assert.equal(banner?.title, 'The Litany');
  assert.equal(banner?.kicker, 'Seals broken 0 of 2');
  assert.equal(banner?.objective, 'Step on the runes in the order they light');
  assert.deepEqual(banner?.bar, { share: 0.5, label: '1 of 2' });
  const weighing = encounterBanner(layout, seen(), [9, 1.6, 0]);
  assert.equal(weighing?.objective, 'Hold both plates together', 'two plates in play');
  const between = encounterBanner(
    layout,
    seen({ seals: [{ ...seen().seals[0]!, state: SEAL_STATE.broken }, seen().seals[1]!] }),
    [-5, -5, 0],
  );
  assert.equal(between?.tone, 'next');
  assert.equal(between?.title, 'Broken 1 of 2');
});

test("every task is one plain line, and the Court's tells its ward and its Reckoning, the countdown written large", () => {
  assert.equal(taskOf(SEAL_KIND.weighing, 3), 'Hold all three plates together');
  assert.equal(taskOf(SEAL_KIND.ascent, 0), 'Climb to the seal stone');
  assert.equal(taskOf(SEAL_KIND.holdfast, 0), "Hold the relic's ring");
  const court = encounterBanner(layout, seen({ woken: true, boss: 7, ward: 1, anchors: [1, 0.4, 0] }), [9, 1.6, 0]);
  assert.deepEqual([court?.title, court?.objective, court?.bar?.label], [COURT, 'Break the anchors', '1 of 3']);
  const reckoning = encounterBanner(layout, seen({ woken: true, boss: 7, ward: 2, reckoningTicks: 601 }), [9, 1.6, 0]);
  assert.deepEqual([reckoning?.objective, reckoning?.clock, reckoning?.urgent], ['Stand in the light', '11', true]);
  assert.equal(encounterBanner(layout, seen({ woken: true, boss: 0 }), [9, 1.6, 0]), null, 'the Boss fallen: none');
  const words = [...Object.values(SEAL_NAMES), ...[1, 2, 3, 4].map((kind) => taskOf(kind, 3))];
  assert.ok(
    words.every((line) => !line.includes('—') && line.length <= 44),
    'short lines, no em dash',
  );
});

test('a seal broken, a ward and the Boss waking slide the banner in afresh', () => {
  const event = (kind: number) => ({ kind }) as FightEvent;
  assert.equal(encounterBeat([event(EVENT.sealBroken)]), 'stage');
  assert.equal(encounterBeat([event(EVENT.bossWoke)]), 'begun');
  assert.equal(encounterBeat([event(EVENT.hit)]), null);
});

test('a showing rune stands under a beam, the anchors only while a ward stands, and the light while warned', () => {
  const where = () => [10, 1.6, 0] as const;
  const showing = encounterMarks(
    layout.encounters!,
    seen({ seals: [{ ...seen().seals[0]!, progress: 0, marks: [1, 0] }, seen().seals[1]!] }),
    0,
    where,
  );
  const dark = encounterMarks(
    layout.encounters!,
    seen({ seals: [{ ...seen().seals[0]!, progress: 0, marks: [0, 0] }, seen().seals[1]!] }),
    0,
    where,
  );
  assert.ok(showing.length > dark.length, 'the showing rune adds its beam');
  const broken = seen({ seals: seen().seals.map((seal) => ({ ...seal, state: SEAL_STATE.broken })) });
  assert.equal(encounterMarks(layout.encounters!, broken, 0, where).length, 0, 'nothing once broken');
  const warded = encounterMarks(layout.encounters!, { ...broken, woken: true, ward: 1, boss: 7 }, 0, where);
  const warned = encounterMarks(
    layout.encounters!,
    { ...broken, woken: true, ward: 2, boss: 7, reckoningTicks: 30 },
    0,
    where,
  );
  assert.ok(warded.length > 0 && warned.length > warded.length);
});

test("the page's encounter events are the room's, from SealBroken to RelicDrained", () => {
  const judging = readFileSync(new URL('../../../crates/room/src/judging.rs', import.meta.url), 'utf8');
  const told = [...judging.matchAll(/^\s+(\w+) = (\d+),$/gm)].filter((row) => Number(row[2]) >= EVENT.sealBroken);
  const camel = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
  assert.equal(told.length, 7);
  for (const [, name = '', number] of told)
    assert.equal(EVENT[camel(name) as keyof typeof EVENT], Number(number), name);
});

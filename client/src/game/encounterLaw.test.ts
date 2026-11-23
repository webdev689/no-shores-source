import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { type EncounterSeen, SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import {
  COURT,
  encounterBanner,
  encounterBeat,
  encounterMarks,
  encounterPlaces,
  SEAL_NAMES,
  taskOf,
} from './encounterLaw.ts';

/** A dungeon of two rooms in a row of four cells: room 0 the Litany's (cells 0 and 1), room 1 the end. */
const layout = {
  cell: 3.2,
  columns: 4,
  rows: 1,
  cells: [0, 0, 1, 1],
  rooms: [
    { x: 0, y: 0, width: 2, depth: 1 },
    { x: 2, y: 0, width: 2, depth: 1 },
  ],
  end: 1,
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
    reach: { rune: 0.9, plate: 1, relic: 3, anchor: 1, light: 1.25, slam: 4 },
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
  furyTicks: 0,
  slamTicks: 0,
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
  assert.equal(taskOf(SEAL_KIND.ascent, 0), 'Climb to the seal stone together');
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

test("the Court's banner tells Fury's weight once it begins and warns of it a minute before", () => {
  const standing = [9, 1.6, 0] as const;
  const court = (more: Partial<EncounterSeen>) =>
    encounterBanner(layout, seen({ woken: true, boss: 7, ...more }), standing);
  assert.deepEqual(court({ fury: 4 })?.bonus, { text: 'Fury ×1.4', state: 'lost' });
  assert.deepEqual(court({ furyTicks: 60 * 60 })?.bonus, { text: 'Fury in 1:00', state: 'holds' });
  assert.deepEqual(court({ furyTicks: 42 * 60 - 30 })?.bonus, { text: 'Fury in 0:42', state: 'holds' });
  assert.equal(court({ furyTicks: 61 * 60 })?.bonus, null, 'no word before its last minute');
  assert.equal(court({ slamTicks: 30, ward: 1 })?.objective, 'Get clear of the Boss');
});

test("a Holdfast's banner says its relic's strength, and an Ascent's how many stand on its stone", () => {
  const holdfast = { kind: SEAL_KIND.holdfast, state: SEAL_STATE.running, progress: 0.2, marks: [1], relic: 0.4 };
  const held = encounterBanner(layout, seen({ seals: [holdfast, seen().seals[1]!] }), [2, 1.6, 0]);
  assert.deepEqual(held?.bonus, { text: 'Relic 40%', state: 'holds' });
  const low = encounterBanner(layout, seen({ seals: [{ ...holdfast, relic: 0.25 }, seen().seals[1]!] }), [2, 1.6, 0]);
  assert.deepEqual(low?.bonus, { text: 'Relic 25%', state: 'lost' });
  const ascent = { kind: SEAL_KIND.ascent, state: SEAL_STATE.running, progress: 0, marks: [2, 4], relic: 1 };
  const climbing = encounterBanner(layout, seen({ seals: [ascent, seen().seals[1]!] }), [2, 1.6, 0]);
  assert.equal(climbing?.bar?.label, '2 of 4');
  const empty = encounterBanner(
    layout,
    seen({ seals: [{ ...ascent, marks: [0, 0], progress: 0.25 }, seen().seals[1]!] }),
    [-5, -5, 0],
  );
  assert.equal(empty?.bar?.label, '25%', 'nobody in its room: how far it was held, never 0 of 0');
});

test("the compass marks each unbroken seal's room, then the Court once the Boss wakes, until it falls", () => {
  assert.deepEqual(encounterPlaces(layout, seen()), [
    { x: 3.2, y: 1.6, kind: 'event' },
    { x: (2 + 2 / 2) * 3.2, y: 1.6, kind: 'event' },
  ]);
  const one = seen({ seals: [{ ...seen().seals[0]!, state: SEAL_STATE.broken }, seen().seals[1]!] });
  assert.deepEqual(encounterPlaces(layout, one), [{ x: (2 + 2 / 2) * 3.2, y: 1.6, kind: 'event' }]);
  assert.deepEqual(encounterPlaces(layout, seen({ woken: true, boss: 7 })), [
    { x: (2 + 2 / 2) * 3.2, y: 1.6, kind: 'event' },
  ]);
  assert.deepEqual(encounterPlaces(layout, seen({ woken: true, boss: 0 })), []);
});

test('a wrong rune flashes red, a held ring shows its relic, and the warded Boss wears its dome, its slam and Fury', () => {
  const where = () => [10, 1.6, 0] as const;
  const colours = (marks: number[]) => {
    const found: string[] = [];
    for (let mark = 0; mark < marks.length; mark += 7) found.push(marks.slice(mark + 3, mark + 6).join(','));
    return found;
  };
  const wrong = encounterMarks(
    layout.encounters!,
    seen({ seals: [{ ...seen().seals[0]!, marks: [3, 0] }, seen().seals[1]!] }),
    0,
    where,
  );
  assert.ok(colours(wrong).includes('0.95,0.3,0.25'), 'red');
  const relic = (strength: number) => {
    const holdfast = { kind: SEAL_KIND.holdfast, state: SEAL_STATE.running, progress: 0, marks: [1], relic: strength };
    return encounterMarks(layout.encounters!, seen({ seals: [holdfast, seen().seals[1]!] }), 0, where);
  };
  assert.ok(relic(1).length > relic(0.25).length, 'its strength an arc, shorter as it drains');
  assert.notDeepEqual(colours(relic(1))[0], colours(relic(0.2))[0], 'held, its ring coloured by its strength');
  const broken = seen({ seals: seen().seals.map((each) => ({ ...each, state: SEAL_STATE.broken })) });
  const court = { ...broken, woken: true, boss: 7 };
  const plain = encounterMarks(layout.encounters!, court, 0, where);
  const warded = encounterMarks(layout.encounters!, { ...court, ward: 1 }, 0, where);
  const slamming = encounterMarks(layout.encounters!, { ...court, ward: 1, slamTicks: 60 }, 0, where);
  const furious = encounterMarks(layout.encounters!, { ...court, fury: 2 }, 0, where);
  assert.equal(plain.length, 0);
  assert.ok(warded.length > 0 && slamming.length > warded.length && furious.length > 0);
  assert.ok(
    colours(furious).every((colour) => colour === '1,0.22,0.16'),
    'Fury rings the Boss red',
  );
  const flashed = encounterMarks(layout.encounters!, court, 0, where, { at: 1, share: 0.5 });
  assert.ok(flashed.length > 0, "a landed Reckoning's flash");
});

test("each of a Litany's runes wears a glyph of its own, so no two read alike", () => {
  const where = () => null;
  const runes = encounterMarks(
    layout.encounters!,
    seen({ seals: [{ ...seen().seals[0]!, marks: [0, 0] }, seen().seals[1]!] }),
    0,
    where,
  );
  const half = runes.length / 2;
  const shape = (marks: number[], [x, y]: readonly number[]) => {
    const out: string[] = [];
    for (let mark = 0; mark < marks.length; mark += 7)
      out.push(`${((marks[mark] ?? 0) - (x ?? 0)).toFixed(3)},${((marks[mark + 1] ?? 0) - (y ?? 0)).toFixed(3)}`);
    return out.join(' ');
  };
  const [first, second] = layout.encounters!.seals[0]!.pieces;
  assert.notEqual(shape(runes.slice(0, half), first!), shape(runes.slice(half), second!));
});

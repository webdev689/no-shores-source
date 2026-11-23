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
  encounterCall,
  encounterMarks,
  encounterPlaces,
  foulOf,
  inFoulWater,
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
  assert.deepEqual([between?.tone, between?.title], ['next', 'The Weighing'], 'the next seal, by the way to it');
  const none = encounterBanner(
    layout,
    seen({ seals: seen().seals.map((each) => ({ ...each, state: 2 })) }),
    [-5, -5, 0],
  );
  assert.deepEqual([none?.tone, none?.title], ['next', 'Broken 2 of 2'], 'every seal broken, the Boss not yet up');
});

test('away from every seal the banner names the nearest unbroken one, never one running farther off', () => {
  // The Litany runs in room 0; the player stands past the east end, nearer the Weighing's room.
  const away = encounterBanner(layout, seen(), [20, 1.6, 0]);
  assert.deepEqual([away?.title, away?.tone], ['The Weighing', 'next'], 'named, as the line to the next seal');
  const west = encounterBanner(layout, seen(), [-3, 1.6, 0]);
  assert.deepEqual([west?.title, west?.tone], ['The Litany', 'next']);
  const inside = encounterBanner(layout, seen(), [2, 1.6, 0]);
  assert.deepEqual([inside?.title, inside?.tone], ['The Litany', 'running']);
  const woken = encounterBanner(layout, seen({ woken: true, boss: 7 }), [2, 1.6, 0]);
  assert.equal(woken?.title, COURT, 'the Court once the Boss wakes, wherever the player stands');
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

test('a showing rune stands under a beam, a seal broken shows none, and the light while warned', () => {
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
  const left = marksOf(encounterMarks(layout.encounters!, broken, 0, where));
  assert.ok(
    left.every((mark) => mark.colour === '0.78,0.55,1'),
    "nothing once broken but the Court's anchors",
  );
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
  assert.deepEqual(court({ fury: 4 })?.bonus, { text: 'Fury ×1.4', state: 'warns' });
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
  assert.deepEqual(low?.bonus, { text: 'Relic 25%', state: 'warns' });
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
  assert.ok(
    colours(plain).every((colour) => colour === '0.78,0.55,1'),
    'unwarded, only the anchors at rest',
  );
  assert.ok(warded.length > 0 && slamming.length > warded.length && furious.length > plain.length);
  assert.ok(
    colours(furious.slice(plain.length)).every((colour) => colour === '1,0.22,0.16'),
    'Fury rings the Boss red',
  );
  const flashed = encounterMarks(layout.encounters!, court, 0, where, { at: 1, share: 0.5 });
  assert.ok(flashed.length > 0, "a landed Reckoning's flash");
});

test("each of a six-rune Litany's runes wears a glyph of its own, so no two read alike however turned", () => {
  const pieces = [0, 1, 2, 3, 4, 5].map((nth) => [nth * 10, 0, 0] as const);
  const litany = { kind: SEAL_KIND.litany, room: 0, pieces, pads: [], drowned: [], doors: [] };
  const plan = { ...layout.encounters!, seals: [litany], anchors: [] };
  const state = { kind: SEAL_KIND.litany, state: SEAL_STATE.running, progress: 0, marks: [0, 0, 0, 0, 0, 0], relic: 1 };
  const runes = marksOf(encounterMarks(plan as never, seen({ seals: [state] }), 0, () => null));
  // Each rune's glyph as its vertices' distances from its middle, sorted: the same under any turn, so a glyph that is
  // another's turned reads alike here as it would on the floor. Its ring (the outermost band) is left out.
  const signature = (nth: number) =>
    runes
      .map((mark) => Math.hypot((mark.at[0] ?? 0) - nth * 10, mark.at[1] ?? 0))
      .filter((reach) => reach < 0.7)
      .map((reach) => reach.toFixed(3))
      .sort()
      .join(' ');
  for (let first = 0; first < 6; first += 1)
    for (let second = first + 1; second < 6; second += 1)
      assert.notEqual(signature(first), signature(second), `runes ${first} and ${second} read alike`);
});

/** The marks' colours, one a vertex, as "r,g,b" strings, and their places. */
const marksOf = (marks: readonly number[]) => {
  const found: { at: number[]; colour: string; alpha: number }[] = [];
  for (let mark = 0; mark < marks.length; mark += 7)
    found.push({
      at: marks.slice(mark, mark + 3),
      colour: marks.slice(mark + 3, mark + 6).join(','),
      alpha: marks[mark + 6] ?? 0,
    });
  return found;
};

test('each anchor shows, dim, while the Boss stands, brighter and under a beam while a ward stands', () => {
  const where = () => [10, 1.6, 0] as const;
  const broken = seen({ seals: seen().seals.map((each) => ({ ...each, state: SEAL_STATE.broken })) });
  const anchor = '0.78,0.55,1';
  const resting = marksOf(encounterMarks(layout.encounters!, seen(), 0, where)).filter(
    (mark) => mark.colour === anchor,
  );
  assert.ok(resting.length > 0, 'shown before the Boss wakes, so a player learns where they are');
  assert.ok(
    resting.every((mark) => mark.alpha <= 0.5 && mark.at[2]! <= 1.5),
    'dim, its beam short',
  );
  assert.ok(
    resting.some((mark) => mark.at[2]! > 1),
    'a short beam over it, so it is found across the end room',
  );
  const awake = marksOf(encounterMarks(layout.encounters!, { ...broken, woken: true, boss: 7 }, 0, where));
  assert.ok(
    awake.some((mark) => mark.colour === anchor),
    'shown while the Boss stands unwarded',
  );
  const warded = marksOf(encounterMarks(layout.encounters!, { ...broken, woken: true, boss: 7, ward: 1 }, 0, where));
  const lit = warded.filter((mark) => mark.colour === anchor);
  assert.ok(
    Math.max(...lit.map((mark) => mark.alpha)) > 0.5 && lit.some((mark) => mark.at[2]! > 1),
    'brighter, under a beam',
  );
  const fallen = encounterMarks(layout.encounters!, { ...broken, woken: true, boss: 0 }, 0, where);
  assert.equal(fallen.length, 0, 'none once the Boss has fallen');
});

test("an Ascent's pads are lit as its way up while it holds: each top's edge and faces, the last in gold", () => {
  const pads = [
    [0.4, 0.4, 2, 2, 1.6],
    [6.4, 0.4, 8, 2, 2],
  ] as const;
  const plan = {
    ...layout.encounters!,
    seals: [{ kind: SEAL_KIND.ascent, room: 0, pieces: [[7.2, 1.2, 2]], pads, drowned: [], doors: [] }],
    anchors: [],
  };
  const ascent = (state: number) =>
    seen({ seals: [{ kind: SEAL_KIND.ascent, state, progress: 0, marks: [0, 1], relic: 1 }] });
  const marks = marksOf(encounterMarks(plan as never, ascent(SEAL_STATE.running), 0, () => null));
  const onTop = (pad: readonly number[]) =>
    marks.filter(
      (mark) => mark.at[0]! >= pad[0]! - 0.1 && mark.at[0]! <= pad[2]! + 0.1 && Math.abs(mark.at[2]! - pad[4]!) < 0.1,
    );
  assert.ok(
    onTop(pads[0]).some((mark) => mark.colour === '0.55,0.66,0.9'),
    "the first pad's edge in the seal's blue",
  );
  assert.ok(
    onTop(pads[1]).some((mark) => mark.colour === '1,0.84,0.42'),
    "the last pad's edge in the stone's gold",
  );
  const faces = marks.filter((mark) => mark.at[2]! < pads[0][4] - 0.2 && mark.at[2]! > 0.5);
  assert.ok(faces.length > 0, 'a glow down the faces under each edge');
  const waiting = encounterMarks(plan as never, ascent(SEAL_STATE.waiting), 0, () => null);
  assert.ok(waiting.length > 0, 'lit while it waits too');
  assert.equal(encounterMarks(plan as never, ascent(SEAL_STATE.broken), 0, () => null).length, 0, 'none once broken');
});

test("an Ascent's banner warns that its foul water harms", () => {
  const ascent = { kind: SEAL_KIND.ascent, state: SEAL_STATE.running, progress: 0, marks: [0, 1], relic: 1 };
  const banner = encounterBanner(layout, seen({ seals: [ascent, seen().seals[1]!] }), [2, 1.6, 0]);
  assert.deepEqual(banner?.bonus, { text: 'Foul water harms', state: 'warns' });
});

test("a broken seal's room is not the banner's: standing in it, the banner names the next unbroken seal", () => {
  const states = seen().seals;
  const after = seen({
    seals: [
      { ...states[0]!, state: SEAL_STATE.broken },
      { ...states[1]!, state: 1 },
    ],
  });
  assert.equal(encounterBanner(layout, after, [2, 1.6, 0])?.title, 'The Weighing');
});

test("an Ascent's stone stands under its beam while nobody is in its room", () => {
  const pads = [[6.4, 0.4, 8, 2, 2]] as const;
  const plan = {
    ...layout.encounters!,
    seals: [{ kind: SEAL_KIND.ascent, room: 0, pieces: [[7.2, 1.2, 2]], pads, drowned: [], doors: [] }],
    anchors: [],
  };
  const nobody = seen({
    seals: [{ kind: SEAL_KIND.ascent, state: SEAL_STATE.running, progress: 0, marks: [0, 0], relic: 1 }],
  });
  const marks = marksOf(encounterMarks(plan as never, nobody, 0, () => null));
  assert.ok(
    marks.some((mark) => (mark.at[2] ?? 0) > 2 + 3),
    'a beam over the stone',
  );
});

test("the slam's inner ring fills over its two seconds: half its reach with one second left", () => {
  const broken = seen({ seals: seen().seals.map((each) => ({ ...each, state: SEAL_STATE.broken })) });
  const court = { ...broken, woken: true, boss: 7, ward: 1 };
  const where = () => [100, 100, 0] as const;
  const fill = (slamTicks: number) => {
    const marks = marksOf(encounterMarks(layout.encounters!, { ...court, slamTicks }, 0, where));
    const inner = marks.filter((mark) => mark.colour === '1,0.22,0.16' && Math.abs(mark.alpha - 0.25) < 1e-9);
    return Math.max(...inner.map((mark) => Math.hypot((mark.at[0] ?? 0) - 100, (mark.at[1] ?? 0) - 100)));
  };
  assert.ok(Math.abs(fill(60) - 2) < 1e-9, `half of 4 m: ${fill(60)}`);
  assert.ok(Math.abs(fill(1) - 4 * (1 - 1 / 120)) < 1e-9, 'all but a tick of it at the last');
});

test("a Weighing's plates in play stand under beams at rest, and a held one is filled gold", () => {
  const plates = (marks: number[]) =>
    marksOf(
      encounterMarks(
        layout.encounters!,
        seen({
          seals: [
            { ...seen().seals[0]!, state: 2 },
            { ...seen().seals[1]!, state: 1, marks },
          ],
        }),
        0,
        () => null,
      ),
    ).filter((mark) => mark.colour !== '0.78,0.55,1');
  const near = (marks: ReturnType<typeof plates>, x: number) =>
    marks.filter((mark) => Math.abs((mark.at[0] ?? 0) - x) < 1.1);
  assert.ok(
    near(plates([0, 0]), 8).some((mark) => (mark.at[2] ?? 0) > 3),
    'a beam at rest',
  );
  const held = near(plates([1, 0]), 8).filter((mark) => mark.colour === '1,0.84,0.42');
  assert.ok(
    held.some((mark) => Math.hypot((mark.at[0] ?? 0) - 8, (mark.at[1] ?? 0) - 1.6) < 0.01 && mark.at[2]! < 0.1),
    'filled to its middle',
  );
});

test("a relic's banner reddens under three tenths exactly as its refused sound plays, never a hair before or after", () => {
  const holdfast = (relic: number) => ({
    kind: SEAL_KIND.holdfast,
    state: SEAL_STATE.running,
    progress: 0,
    marks: [1],
    relic,
  });
  const bonus = (relic: number) =>
    encounterBanner(layout, seen({ seals: [holdfast(relic), seen().seals[1]!] }), [2, 1.6, 0])?.bonus;
  assert.deepEqual(bonus(0.297), { text: 'Relic 29%', state: 'warns' });
  assert.deepEqual(bonus(0.3), { text: 'Relic 30%', state: 'holds' });
  assert.deepEqual(bonus(0.29), { text: 'Relic 29%', state: 'warns' });
});

test('the Court calls over the middle of the view as its slam and its Reckoning are shown, and at nothing else', () => {
  const awake = { woken: true, boss: 9, ward: 1 };
  assert.equal(encounterCall(seen(awake)), null);
  assert.equal(encounterCall(seen({ ...awake, slamTicks: 90 })), 'Get clear!');
  assert.equal(encounterCall(seen({ ...awake, reckoningTicks: 300 })), 'Into the light!');
  assert.equal(
    encounterCall(seen({ ...awake, reckoningTicks: 300, slamTicks: 90 })),
    'Into the light!',
    'the light first',
  );
  assert.equal(encounterCall(seen({ woken: true, boss: 0, slamTicks: 90 })), null, 'the Boss fallen');
  for (const call of ['Get clear!', 'Into the light!']) assert.ok(!/[\u2013\u2014]/.test(call), 'no dashes');
});

test("the player stands in foul water only on a running Ascent's drowned floor, at its floor", () => {
  const drowned = {
    ...layout,
    encounters: {
      ...layout.encounters!,
      seals: [{ ...layout.encounters!.seals[0]!, kind: SEAL_KIND.ascent, drowned: [1] }, layout.encounters!.seals[1]!],
    },
  } as DungeonLayout;
  const ascent = (state: number) => ({ kind: SEAL_KIND.ascent, state, progress: 0, marks: [0, 1], relic: 1 });
  const running = seen({ seals: [ascent(SEAL_STATE.running), seen().seals[1]!] });
  assert.equal(inFoulWater(drowned, running, [4.8, 1.6, 0]), true, 'on a drowned cell');
  assert.equal(inFoulWater(drowned, running, [1.6, 1.6, 0]), false, 'on a dry cell of its room (a doorway)');
  assert.equal(inFoulWater(drowned, running, [4.8, 1.6, 0.4]), false, 'on a pad over it');
  for (const state of [SEAL_STATE.waiting, SEAL_STATE.broken])
    assert.equal(inFoulWater(drowned, seen({ seals: [ascent(state), seen().seals[1]!] }), [4.8, 1.6, 0]), false);
  // The room tells its harm among the encounters' events, to the player it harmed alone.
  const harm = (defender: number) => [{ kind: EVENT.drowned, defender, amount: 0.12 }] as unknown as FightEvent[];
  assert.equal(foulOf(drowned, running, [4.8, 1.6, 0], harm(7), 7), 'harmed');
  assert.equal(foulOf(drowned, running, [4.8, 1.6, 0], harm(8), 7), 'wet', "another's harm");
  assert.equal(foulOf(drowned, running, [4.8, 1.6, 0], [], 7), 'wet');
  assert.equal(foulOf(drowned, running, [1.6, 1.6, 0], harm(7), 7), null, 'out of it');
});

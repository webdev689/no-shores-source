import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { type BreachSeen, STONE } from '../network/breachMessages.ts';
import { numerals, roman, runMarks } from './breachMarks.ts';
import { breachPlanOf, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER } from './breachWords.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const plan = breachPlanOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);
const RUN: BreachSeen = {
  ...{ gate: false, tier: 0, phases: [2, 2, 2, 2, 2, 1], reached: 6, seals: 0, revives: -1 },
  ...{ stone: STONE.away, bearer: 0, stoneAt: [0, 0, 0], charge: 1, held: 0, lyingTicks: 0 },
  ...{ marked: [], raising: [], chests: 0, encounter: 0, stage: 0, stageTicks: 0, counts: [], bells: [] },
  ...{ bellFoes: [], broken: 0, ringTicks: 0, fontTicks: 0, boss: 0, warded: false, desk: 0, markedDesk: -1 },
  ...{ deskTicks: 0, writeTicks: 0, seen: false, wipeTicks: 0, rifts: [], riftHeld: [], kept: 0, takings: 0 },
  ...{ takingTicks: 0, awayShore: -1, away: [], wayBack: false, bareTicks: 0, heldBy: false, fill: 0 },
  ...{ woken: false, claims: 0, openTo: [], holders: [], inside: [] },
};
/** The vertices laid as points, and how many triangles: each vertex MARK_FLOATS numbers. */
const points = (marks: readonly number[]) =>
  Array.from({ length: marks.length / MARK_FLOATS }, (unused, nth) =>
    marks.slice(nth * MARK_FLOATS, nth * MARK_FLOATS + 3),
  );
const strokes = (marks: readonly number[]) => marks.length / MARK_FLOATS / 6;
const marked = (seen: Partial<BreachSeen>, more: Partial<Parameters<typeof runMarks>[3]> = {}) => {
  const marks: number[] = [];
  runMarks(plan, { ...RUN, ...seen }, marks, { feet: [0, 0, 0], living: [], foes: [], ...more });
  return marks;
};

test('numerals stand upright, I a stroke and V two, in a row turned to face the eye', () => {
  assert.deepEqual([0, 1, 3, 4].map(roman), ['I', 'II', 'IV', 'V']);
  const marks: number[] = [];
  numerals(marks, ['IV'], [10, 0, 5], [10, 20, 0], 1);
  assert.equal(strokes(marks), 3);
  const laid = points(marks);
  assert.ok(
    laid.every(([, y]) => Math.abs((y ?? 0) - 0) < 1e-9),
    'across the eye: all at one depth to it',
  );
  assert.ok(
    laid.every(([, , z]) => (z ?? 0) >= 4.9 && (z ?? 0) <= 6.1),
    'standing from its foot, a metre tall',
  );
});

test("while the taken are away the Steward's order stands over the court's mooring of their shore, each bell numbered", () => {
  const marks = marked({ encounter: ENCOUNTER.steward, awayShore: 1, bells: [2, 0, 4, 1, 3] });
  // III I V II IV over the mooring: 11 strokes; I to V over the shore's bells: 11 more.
  assert.equal(strokes(marks), 22);
  const glyphs = spaceSocket(plan, 'court', 'glyphs-is');
  assert.ok(glyphs);
  const near = points(marks).filter(([x, y]) => Math.hypot((x ?? 0) - glyphs[0], (y ?? 0) - glyphs[1]) < 5);
  assert.equal(near.length / 6, 11, "the order over the court's mooring of what is");
  assert.equal(strokes(marked({ encounter: ENCOUNTER.steward, bells: [2, 0, 4, 1, 3] })), 0, 'none taken');
});

test("the Choir's font is marked lit, but never which bell comes next; the marked desk is", () => {
  const ring = (inner: number) => 24 * 6 * MARK_FLOATS * inner;
  assert.equal(marked({ encounter: ENCOUNTER.choir, stage: 1, bells: [3, 1, 5], broken: 1 }).length, ring(1));
  const resting = marked({ encounter: ENCOUNTER.choir, stage: 1, fontTicks: 5 * 60 });
  assert.equal(resting.length, ring(0.5), 'resting: half its rest gone, half its ring');
  const desk = spaceSocket(plan, 'choir', 'lectern-3');
  const scrivener = marked({ encounter: ENCOUNTER.choir, stage: 2, markedDesk: 2 });
  assert.ok(desk && points(scrivener).every(([x, y]) => Math.hypot((x ?? 0) - desk[0], (y ?? 0) - desk[1]) <= 1.81));
});

test("each Watcher's light reaches 14 m along its facing, 40 degrees wide; the Mending's seams and their reach", () => {
  const post = spaceSocket(plan, 'ways', 'watcher-1');
  assert.ok(post);
  const watcher = { x: post[0], y: post[1], z: post[2], facing: 0, health: 1 };
  const light = points(marked({ encounter: ENCOUNTER.ways }, { foes: [watcher] }));
  assert.ok(light.length > 0);
  for (const [x, y] of light) {
    const [east, north] = [(x ?? 0) - post[0], post[1] - (y ?? 0)];
    assert.ok(Math.hypot(east, north) <= 14.01 && north > 0 && Math.abs(Math.atan2(east, north)) <= 0.35);
  }
  assert.equal(marked({ encounter: ENCOUNTER.ways }, { foes: [{ ...watcher, health: 0 }] }).length, 0, 'struck down');
  const seams = marked({ encounter: ENCOUNTER.mending, stage: 0, counts: [2, 0, 0] });
  const north = spaceSocket(plan, 'mending', 'seam-north');
  const far = Math.max(
    ...points(seams).map(([x, y]) => Math.hypot((x ?? 0) - (north?.[0] ?? 0), (y ?? 0) - (north?.[1] ?? 0))),
  );
  assert.ok(Math.abs(far - 4) < 0.01, `two fused: overtaken to 4 m, ${far}`);
});

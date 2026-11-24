import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { type BreachSeen, RIFT, STONE } from '../network/breachMessages.ts';
import { type MarkedFoe, numerals, roman, runMarks } from './breachMarks.ts';
import { breachPlanOf, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, NO_COUNTS } from './breachWords.ts';

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
type Point = readonly [number, number, number];
/** The marks laid for `seen`, the living standing at `living` and the foes `foes` (each its view and its type). */
const marked = (
  seen: Partial<BreachSeen>,
  more: { living?: readonly Point[]; foes?: readonly { view: MarkedFoe; type?: number }[] } = {},
  counts = NO_COUNTS,
) => {
  const marks: number[] = [];
  const { living = [], foes = [] } = more;
  runMarks(plan, { ...RUN, ...seen }, marks, { feet: [0, 0, 0], living: () => living, foes: () => foes, counts });
  return marks;
};
/** How far from `spot` across the ground each laid point stands. */
const apart = (marks: readonly number[], spot: Point) =>
  points(marks).map(([x, y]) => Math.hypot((x ?? 0) - spot[0], (y ?? 0) - spot[1]));
/** The vertices of `marks` laid within `reach` of `spot` across the ground, as marks of their own. */
const within = (marks: readonly number[], spot: Point, reach: number) =>
  apart(marks, spot).flatMap((far, nth) =>
    far <= reach ? marks.slice(nth * MARK_FLOATS, (nth + 1) * MARK_FLOATS) : [],
  );
/** How much of a whole turn round `spot` the rings in `marks` cover, radians: each quad (six vertices) spans from its
 *  second corner to its third. */
const covered = (marks: readonly number[], spot: Point) => {
  const bearing = ([x, y]: readonly number[]) => Math.atan2((x ?? 0) - spot[0], spot[1] - (y ?? 0));
  const laid = points(marks);
  let sum = 0;
  for (let quad = 0; quad + 5 < laid.length; quad += 6) {
    const turned = bearing(laid[quad + 2] ?? []) - bearing(laid[quad + 1] ?? []);
    sum += Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned)));
  }
  return sum;
};
/** The vertices of `marks` laid in `colour`, as marks of their own. */
const inColour = (marks: readonly number[], colour: readonly number[]) =>
  Array.from({ length: marks.length / MARK_FLOATS }, (unused, nth) =>
    marks.slice(nth * MARK_FLOATS, (nth + 1) * MARK_FLOATS),
  )
    .filter((vertex) => vertex.slice(3, 7).join() === colour.join())
    .flat();
const TURN = 2 * Math.PI;
const near = (one: number, other: number) => Math.abs(one - other) < 1e-6;
/** The colours laid, each as its numbers joined. */
const colours = (marks: readonly number[]) =>
  new Set(
    Array.from({ length: marks.length / MARK_FLOATS }, (unused, nth) =>
      marks.slice(nth * MARK_FLOATS + 3, nth * MARK_FLOATS + 7).join(),
    ),
  );

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
  const resting = marked({ encounter: ENCOUNTER.choir, stage: 1, fontTicks: 12.5 * 60 });
  assert.equal(resting.length, ring(0.5), 'resting: half its rest gone, half its ring');
  const desk = spaceSocket(plan, 'choir', 'lectern-3');
  assert.ok(desk);
  const scrivener = marked({ encounter: ENCOUNTER.choir, stage: 2, markedDesk: 2 });
  const reach = apart(scrivener, desk);
  assert.ok(reach.length > 0, 'the marked desk is ringed');
  assert.ok(Math.abs(Math.max(...reach) - 1.8) < 0.01, `as far as a body blots it from: ${Math.max(...reach)}`);
  assert.equal(marked({ encounter: ENCOUNTER.choir, stage: 2 }).length, 0, 'no desk marked, none ringed');
});

test("each Watcher's light reaches 14 m along its facing, 40 degrees wide, and its hearing 8 m round, in dashes", () => {
  const post = spaceSocket(plan, 'ways', 'watcher-1');
  assert.ok(post);
  const watcher = { x: post[0], y: post[1], z: post[2], facing: 0, health: 1 };
  const laid = points(marked({ encounter: ENCOUNTER.ways }, { foes: [{ view: watcher }] }));
  const from = (x = 0, y = 0) => Math.hypot(x - post[0], y - post[1]);
  const light = laid.filter(([x, y]) => from(x, y) > 8.01);
  assert.ok(light.length > 0);
  for (const [x, y] of light) {
    const [east, north] = [(x ?? 0) - post[0], post[1] - (y ?? 0)];
    assert.ok(from(x, y) <= 14.01 && north > 0 && Math.abs(Math.atan2(east, north)) <= 0.35);
  }
  // Its hearing goes all round it, broken into dashes: three fifths of the turn laid.
  const marks = marked({ encounter: ENCOUNTER.ways }, { foes: [{ view: watcher }] });
  const heard = apart(marks, post).flatMap((far, nth) =>
    far > 7.8 && far <= 8.01 ? marks.slice(nth * MARK_FLOATS, (nth + 1) * MARK_FLOATS) : [],
  );
  assert.ok(near(covered(heard, post), 0.6 * TURN), `${covered(heard, post)}`);
  const down = marked({ encounter: ENCOUNTER.ways }, { foes: [{ view: { ...watcher, health: 0 } }] });
  assert.equal(down.length, 0, 'none standing at its post');
  const seams = marked({ encounter: ENCOUNTER.mending, stage: 0, counts: [2, 0, 0] });
  const north = spaceSocket(plan, 'mending', 'seam-north');
  const far = Math.max(
    ...points(seams).map(([x, y]) => Math.hypot((x ?? 0) - (north?.[0] ?? 0), (y ?? 0) - (north?.[1] ?? 0))),
  );
  assert.ok(Math.abs(far - 4) < 0.01, `two fused: overtaken to 4 m, ${far}`);
});

test("the Shores' moorings are claimed where a Bulwark stands on one, held where a living player does, else free", () => {
  const was = spaceSocket(plan, 'hall', 'mooring-was');
  const whatIs = spaceSocket(plan, 'hall', 'mooring-is');
  assert.ok(was && whatIs);
  const shores = { encounter: ENCOUNTER.shores, stage: 1, rifts: [RIFT.shut, RIFT.shut], riftHeld: [0, 0] };
  const ringOf = (marks: readonly number[], spot: Point) => colours(within(marks, spot, 1.71));
  const free = ringOf(marked(shores), was);
  const bulwark = { view: { x: was[0] + 2, y: was[1], z: was[2], facing: 0, health: 1 }, type: 43 };
  const claimed = ringOf(marked(shores, { foes: [bulwark] }), was);
  const husk = ringOf(marked(shores, { foes: [{ ...bulwark, type: 39 }] }), was);
  const held = ringOf(marked(shores, { living: [[was[0], was[1] + 1, was[2] + 0.5]] }), was);
  const above = ringOf(marked(shores, { living: [[was[0], was[1], was[2] + 3]] }), was);
  assert.notDeepEqual(claimed, free, 'a Bulwark 2 m off claims it');
  assert.deepEqual(husk, free, 'any other foe does not');
  assert.notDeepEqual(held, free);
  assert.notDeepEqual(held, claimed);
  assert.deepEqual(above, free, 'a body 3 m above it holds nothing');
  assert.deepEqual(ringOf(marked(shores), whatIs), free);
});

test('each rift is ringed at its mouth and its way back, full while open, filling while held, in dashes while shut', () => {
  const mouth = spaceSocket(plan, 'hall', 'rift-was');
  const back = spaceSocket(plan, plan.shores['shores']?.[0] ?? '', 'rift');
  assert.ok(mouth && back);
  const ring = (state: number, held = 0) => {
    const marks = marked({ encounter: ENCOUNTER.shores, stage: 1, rifts: [state, RIFT.shut], riftHeld: [held, 0] });
    return [mouth, back].map((spot) => covered(within(marks, spot, 1.61), spot) / TURN);
  };
  const [open, half, shut] = [ring(RIFT.open), ring(RIFT.opening, 0.5), ring(RIFT.shut)];
  assert.ok(
    open.every((share) => near(share, 1)),
    `whole, at both ends: ${open}`,
  );
  assert.ok(
    half.every((share) => near(share, 0.5)),
    `half held, half its ring: ${half}`,
  );
  assert.ok(
    shut.every((share) => near(share, 0.6)),
    `shut: in dashes, with gaps: ${shut}`,
  );
});

test("the court's mooring of the taken's shore is ringed in an arc for each who must hold it, lit as each does", () => {
  const mooring = spaceSocket(plan, 'court', 'mooring-is');
  assert.ok(mooring);
  const steward = { encounter: ENCOUNTER.steward, awayShore: 1, bells: [2, 0, 4, 1, 3] };
  const counts = (held: number, needed: number) => ({ ...NO_COUNTS, mooring: { at: mooring, held, needed } });
  // The held arcs' gold, the free ones' pale white; each arc stops short of the next by a gap of 0.2 radians.
  const [lit, free] = [
    [1, 0.82, 0.4, 0.6],
    [0.9, 0.9, 0.95, 0.25],
  ];
  const share = (held: number, needed: number, colour: readonly number[]) =>
    covered(inColour(within(marked(steward, {}, counts(held, needed)), mooring, 1.71), colour), mooring);
  assert.ok(near(share(1, 2, lit), Math.PI - 0.2) && near(share(1, 2, free), Math.PI - 0.2), 'one of two lit');
  assert.ok(near(share(2, 2, lit), TURN - 0.4) && near(share(2, 2, free), 0), 'both');
  assert.ok(near(share(1, 1, lit), TURN - 0.2), 'one needed, one arc');
  assert.equal(share(0, 0, lit) + share(0, 0, free), 0, 'none left in the court to hold it, none ringed');
});

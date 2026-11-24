// What a Breach marks on its ground and over it, from what its room says (`BreachSeen`), its plan and what the page
// counts (`RunCounts`), in the mark rings the fight lays: the Mending's open seams and the ground each has overtaken;
// the Choir's font, lit or resting, and the desk marked; each Watcher's light and the reach it hears a sprint in; the
// Shores' moorings held, claimed or free and each rift open or shut; and, while the Steward has taken players away,
// its bells' order over the court's mooring of their shore, the mooring's holders, and each bell there numbered by its
// place so the court can call it. Which Choir bell comes next is never marked. A ring that warns is laid in dashes, so
// it reads without its colour. Nothing here judges a rule.
import { markRing } from '../combat/marks.ts';
import { type BreachSeen, RIFT } from '../network/breachMessages.ts';
import { type BreachPlan, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, NO_COUNTS, type RunCounts } from './breachWords.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number, number];

/** The room's reaches (crates/room/src/breach): a seam's overtaken ground at its first fusion and how much more each
 *  after; the font's, and how long it rests; the marked desk's blot; a Watcher's light, metres and half its width,
 *  and how near it hears a sprint; a mooring's, how far above or below it a body holds it, and how near a Bulwark
 *  claims it; how near a rift's mouth carries a body through. */
const OVERTAKEN_M = [2.5, 1.5] as const;
const FONT_REACH_M = 2.5;
const FONT_REST_TICKS = 25 * 60;
const BLOT_REACH_M = 1.8;
const SIGHT_M = 14;
const HALF_WIDE = (20 * Math.PI) / 180;
const HEARD_M = 8;
export const MOORING_REACH_M = 1.7;
const MOORING_RISE_M = 1.5;
const CLAIMED_M = MOORING_REACH_M + 0.5;
const RIFT_REACH_M = 1.6;
/** The Lattice's Bulwark, by its number in the rules' roster: the foe that claims a mooring it stands on; and the
 *  Idol, which stands at the Ways' posts as their Watchers. */
const BULWARK = 43;
const IDOL = 41;
/** The Mending's seams in the room's order, and which stand open at each of its first three stages (mending.rs). */
const SEAMS = ['seam-north', 'seam-west', 'seam-east'] as const;
const SEAMS_OPEN = [
  [true, false, false],
  [false, true, true],
  [true, true, true],
] as const;
/** The Watchers' posts, and how near one a foe stands to be taken for it, metres. */
const WATCHERS = 6;
const POSTED_M = 1.5;
/** The Shores' rifts and their moorings in the hall, what was then what is. */
const HALL_RIFTS = ['rift-was', 'rift-is'] as const;
const HALL_MOORINGS = ['mooring-was', 'mooring-is'] as const;
/** The colours: an open seam's violet, its overtaken edge's red, the font lit and resting, the desk marked, a
 *  Watcher's red light and its brighter edge, a mooring held, claimed and free, a rift open, and the numerals' pale
 *  gold. */
const COLOURS = {
  seam: [0.85, 0.4, 1, 0.6],
  overtaken: [1, 0.3, 0.3, 0.5],
  lit: [0.55, 0.85, 1, 0.6],
  resting: [0.6, 0.62, 0.7, 0.35],
  desk: [0.72, 0.55, 1, 0.65],
  watcher: [1, 0.22, 0.18, 0.22],
  edge: [1, 0.6, 0.5, 0.55],
  held: [1, 0.82, 0.4, 0.6],
  claimed: [1, 0.3, 0.25, 0.65],
  free: [0.9, 0.9, 0.95, 0.25],
  open: [0.55, 0.85, 1, 0.6],
  numeral: [1, 0.9, 0.6, 0.9],
} as const satisfies Record<string, Colour>;
/** How tall a numeral stands, metres: the court's order, and a bell's place over its bell. */
const ORDER_TALL_M = 0.9;
const BELL_TALL_M = 0.6;
const OVER_BELL_M = 2.6;
/** How many dashes a warning ring is laid in, and the share of each one's span it fills. */
const DASHES = 12;
const DASH_FILL = 0.6;

/** A foe as the marks read it: where it stands, the way it faces, and its health (none, fallen). */
export interface MarkedFoe {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly health: number;
}

/** What the run's marks read of the place each frame, each worked out only where an encounter asks for it: the
 *  player's feet, which the numerals turn to face; where each living player stands; every foe the room shows, with its
 *  type in the rules' roster; and what the page counts. */
export interface MarksOf {
  readonly feet: Point;
  readonly living: () => readonly Point[];
  readonly foes: () => readonly { readonly view: MarkedFoe; readonly type?: number }[];
  readonly counts?: RunCounts;
}

/** A ring that warns, laid in dashes round `spot` (or along `arc`): a danger reads by its broken edge as well as by its
 *  colour. */
export function dashedRing(
  marks: number[],
  spot: Point,
  inner: number,
  outer: number,
  colour: Colour,
  arc: readonly [number, number] = [0, 2 * Math.PI],
): void {
  const step = (arc[1] - arc[0]) / DASHES;
  for (let dash = 0; dash < DASHES; dash++) {
    const from = arc[0] + dash * step;
    markRing(marks, spot, inner, outer, colour, [from, from + step * DASH_FILL]);
  }
}

/** A mooring's ring: held by a living player of the company, claimed by the Lattice (in dashes), or free. */
export function mooringMark(marks: number[], spot: Point, state: 'held' | 'claimed' | 'free'): void {
  const ring = state === 'claimed' ? dashedRing : markRing;
  ring(marks, spot, MOORING_REACH_M - 0.2, MOORING_REACH_M, COLOURS[state]);
}

/** Whether a body at `body` stands on a mooring at `spot`, as the room holds one (shores.rs `held_by_players`). */
export const holdsMooring = (body: Point, spot: Point): boolean =>
  Math.hypot(body[0] - spot[0], body[1] - spot[1]) <= MOORING_REACH_M && Math.abs(body[2] - spot[2]) < MOORING_RISE_M;

/** The run's marks for the encounter under way, laid into `marks`. */
export function runMarks(plan: BreachPlan, seen: BreachSeen, marks: number[], read: MarksOf): void {
  const socket = (space: string, name: string) => spaceSocket(plan, space, name);
  if (seen.encounter === ENCOUNTER.mending)
    SEAMS.forEach((name, seam) => {
      const spot = socket('mending', name);
      const fused = seen.counts[seam] ?? 0;
      if (!spot) return;
      if (SEAMS_OPEN[seen.stage]?.[seam]) markRing(marks, spot, 1.1, 1.3, COLOURS.seam);
      const reach = OVERTAKEN_M[0] + OVERTAKEN_M[1] * (fused - 1);
      if (fused > 0) dashedRing(marks, spot, reach - 0.15, reach, COLOURS.overtaken);
    });
  if (seen.encounter === ENCOUNTER.choir) {
    const font = socket('choir', 'font');
    // The font rests after it cleanses, its ring filling again as it rests.
    const rested = 1 - Math.min(1, seen.fontTicks / FONT_REST_TICKS);
    if (font && seen.stage < 2)
      markRing(marks, font, FONT_REACH_M - 0.2, FONT_REACH_M, seen.fontTicks > 0 ? COLOURS.resting : COLOURS.lit, [
        0,
        rested * 2 * Math.PI,
      ]);
    const desk = seen.markedDesk >= 0 ? socket('choir', `lectern-${seen.markedDesk + 1}`) : null;
    if (desk) markRing(marks, desk, BLOT_REACH_M - 0.25, BLOT_REACH_M, COLOURS.desk);
  }
  if (seen.encounter === ENCOUNTER.ways) watchers(plan, marks, read);
  if (seen.encounter === ENCOUNTER.shores && seen.stage > 0) shores(plan, seen, marks, read);
  if (seen.encounter === ENCOUNTER.steward && seen.awayShore >= 0) stewardOrder(plan, seen, marks, read);
}

/** Each Watcher's light, 14 m along its facing and 40 degrees wide, its far edge brighter, and the reach it hears a
 *  sprint in, in dashes round its feet. */
function watchers(plan: BreachPlan, marks: number[], read: MarksOf): void {
  const foes = read.foes();
  for (let post = 1; post <= WATCHERS; post++) {
    const spot = spaceSocket(plan, 'ways', `watcher-${post}`);
    const watcher =
      spot &&
      foes.find(
        ({ view, type }) =>
          type === IDOL && view.health > 0 && Math.hypot(view.x - spot[0], view.y - spot[1]) <= POSTED_M,
      )?.view;
    if (!watcher) continue;
    const stands = [watcher.x, watcher.y, watcher.z] as const;
    const light = [watcher.facing - HALF_WIDE, watcher.facing + HALF_WIDE] as const;
    markRing(marks, stands, 0.4, SIGHT_M, COLOURS.watcher, light);
    markRing(marks, stands, SIGHT_M - 0.15, SIGHT_M, COLOURS.edge, light);
    dashedRing(marks, stands, HEARD_M - 0.12, HEARD_M, COLOURS.edge);
  }
}

/** The Shores' moorings, claimed where a Bulwark stands on one (shores.rs `held_by_bulwark`), held where a living
 *  player does, else free; each rift's mouth in the hall and its way back in its shore, open, opening as far as it is
 *  held, or shut in dashes. */
function shores(plan: BreachPlan, seen: BreachSeen, marks: number[], read: MarksOf): void {
  const ways = plan.shores['shores'] ?? [];
  HALL_MOORINGS.forEach((name, rift) => {
    const spot = spaceSocket(plan, 'hall', name);
    if (!spot) return;
    const claimed = read
      .foes()
      .some(
        ({ view, type }) =>
          type === BULWARK && view.health > 0 && Math.hypot(view.x - spot[0], view.y - spot[1]) <= CLAIMED_M,
      );
    const held = read.living().some((body) => holdsMooring(body, spot));
    mooringMark(marks, spot, claimed ? 'claimed' : held ? 'held' : 'free');
    const state = seen.rifts[rift] ?? RIFT.shut;
    const mouths = [spaceSocket(plan, 'hall', HALL_RIFTS[rift] ?? ''), spaceSocket(plan, ways[rift] ?? '', 'rift')];
    for (const mouth of mouths) {
      if (!mouth) continue;
      if (state === RIFT.shut) dashedRing(marks, mouth, RIFT_REACH_M - 0.2, RIFT_REACH_M, COLOURS.claimed);
      else
        markRing(marks, mouth, RIFT_REACH_M - 0.2, RIFT_REACH_M, COLOURS.open, [
          0,
          (state === RIFT.open ? 1 : (seen.riftHeld[rift] ?? 0)) * 2 * Math.PI,
        ]);
    }
  });
}

/** The Steward's bells' order (`seen.bells`, their places while the taken are away) over the court's mooring of their
 *  shore, every numeral turned to face the player's feet; the mooring ringed in as many arcs as must hold it, each lit
 *  as one does; and each bell in the shore numbered by its place. */
function stewardOrder(plan: BreachPlan, seen: BreachSeen, marks: number[], read: MarksOf): void {
  const { feet } = read;
  const shore = plan.shores['steward']?.[seen.awayShore];
  const glyphs = spaceSocket(plan, 'court', seen.awayShore === 0 ? 'glyphs-was' : 'glyphs-is');
  if (glyphs) numerals(marks, seen.bells.map(roman), glyphs, feet, ORDER_TALL_M);
  const mooring = (read.counts ?? NO_COUNTS).mooring;
  const arc = mooring && mooring.needed > 0 ? (2 * Math.PI) / mooring.needed : 0;
  for (let holder = 0; mooring && holder < mooring.needed; holder++) {
    const colour = holder < mooring.held ? COLOURS.held : COLOURS.free;
    markRing(marks, mooring.at, MOORING_REACH_M - 0.2, MOORING_REACH_M, colour, [
      holder * arc + 0.1,
      (holder + 1) * arc - 0.1,
    ]);
  }
  seen.bells.forEach((_place, place) => {
    const bell = shore && spaceSocket(plan, shore, `bell-${place + 1}`);
    if (bell) numerals(marks, [roman(place)], [bell[0], bell[1], bell[2] + OVER_BELL_M], feet, BELL_TALL_M);
  });
}

/** A place, counted from 0, as the numeral the court calls it by: I to V. */
export const roman = (place: number): string => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][place] ?? String(place + 1);

/** Each of `words` (numerals of I and V) written upright in a row, `tall` metres high, its foot's middle at `spot`,
 *  turned to face `toward`, as strokes laid into `marks`. */
export function numerals(marks: number[], words: readonly string[], spot: Point, toward: Point, tall: number): void {
  const [awayX, awayY] = [toward[0] - spot[0], toward[1] - spot[1]];
  const far = Math.hypot(awayX, awayY) || 1;
  // The viewer's right, looking from `toward` at the numerals.
  const right = [awayY / far, -awayX / far] as const;
  const [narrow, wide, letterGap, wordGap, thick] = [0.3, 0.7, 0.15, 0.6, 0.12].map((share) => share * tall) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const widths = words.map((word) => [...word].reduce((sum, letter) => sum + (letter === 'V' ? wide : narrow), 0));
  const letters = words.reduce((count, word) => count + Math.max(0, word.length - 1), 0);
  const whole = widths.reduce((sum, width) => sum + width, 0) + letters * letterGap + (words.length - 1) * wordGap;
  const world = (across: number, up: number): Point => [
    spot[0] + right[0] * across,
    spot[1] + right[1] * across,
    spot[2] + up,
  ];
  const stroke = (from: readonly [number, number], to: readonly [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const [sideways, upward] = [
      (-(to[1] - from[1]) / length) * (thick / 2),
      ((to[0] - from[0]) / length) * (thick / 2),
    ];
    const corners = [
      world(from[0] - sideways, from[1] - upward),
      world(to[0] - sideways, to[1] - upward),
      world(to[0] + sideways, to[1] + upward),
      world(from[0] + sideways, from[1] + upward),
    ];
    for (const corner of [0, 1, 2, 0, 2, 3]) marks.push(...(corners[corner] ?? spot), ...COLOURS.numeral);
  };
  let across = -whole / 2;
  for (const word of words) {
    for (const letter of word) {
      if (letter === 'V') {
        stroke([across, tall], [across + wide / 2, 0]);
        stroke([across + wide / 2, 0], [across + wide, tall]);
      } else stroke([across + narrow / 2, 0], [across + narrow / 2, tall]);
      across += (letter === 'V' ? wide : narrow) + letterGap;
    }
    across += wordGap - letterGap;
  }
}

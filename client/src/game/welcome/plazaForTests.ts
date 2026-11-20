// Overlook's plaza for the welcome's tests, laid as the city crate lays it.
import type { Post, StationInfo, Task, Ways } from '../nodes.ts';
import { plazaFrameOf, plazaPoint } from '../townsfolk.ts';
import type { NodeInfo } from '../worldData.ts';

/** Overlook's plaza as the city crate lays it, its middle at (1000, 2000), the sea to the south (+y): the arcades'
 *  front 50 m landward, a counter 1.6 m inside it and its keeper 1.8 m behind that, an alcove every 14.3 m from 32 m
 *  out either side of the portico. */
const ALCOVES = [
  ['mage', 'vault', 'armorsmith', 'weaponsmith', 'tailor', 'tack'],
  ['harbourmaster', 'vault', 'stormcallers', 'lamplighters', 'veiled', 'chandler'],
] as const;
const PITCH = 86 / 12;
export const STATIONS: StationInfo[] = ALCOVES.flatMap((kinds, row) =>
  kinds.map((kind, alcove) => {
    const across = (row === 0 ? -1 : 1) * (32 + PITCH * (2 * alcove + 1));
    return { kind, keeper: [1000 - across, 1946.6] as const, counter: [1000 - across, 1948.4] as const };
  }),
);
export const RING = [
  [870, 1940],
  [1130, 1940],
  [1130, 2060],
  [870, 2060],
] as const;
export const SPAWNS = [
  [940, 2056],
  [1060, 2056],
] as const;
export const FRAME = plazaFrameOf({ bounds: [870, 1940, 1130, 2060], spawns: SPAWNS });

/** The townsfolk's ways and posts as `townsfolk_life` lays them for a plaza 120 m deep, in the plaza's own frame
 *  (metres toward the sea, across): rows and columns, the line before the counters and the line at the parapet, each
 *  linking the points on it in turn; customers before each counter, lookers at seven views and talkers at five
 *  benches; a smith, a band of four with a dancer, a juggler, and a sweeper's round of the obelisk's ring. */
const ROWS = [-38, -14, 14, 34];
const COLUMNS = [-110, -70, -20, 20, 70, 110];
const [COUNTER_LINE, PARAPET_LINE] = [-46.5, 52];
const LINES: readonly { readonly row: boolean; readonly held: number; readonly ends: readonly [number, number] }[] = [
  ...ROWS.map((held) => ({ row: true, held, ends: [-110, 110] as const })),
  ...COLUMNS.map((held) => ({
    row: false,
    held,
    ends: [Math.abs(held) > 32 ? COUNTER_LINE : -38, PARAPET_LINE] as const,
  })),
  { row: true, held: PARAPET_LINE, ends: [-110, 110] },
  { row: false, held: -32.5, ends: [COUNTER_LINE, -38] },
  { row: false, held: 32.5, ends: [COUNTER_LINE, -38] },
  { row: true, held: COUNTER_LINE, ends: [-118, -32] },
  { row: true, held: COUNTER_LINE, ends: [32, 118] },
];
const placed: [number, number][] = [];
const points: { at: readonly [number, number]; name: string }[] = [];
const posts: Post[] = [];
const pointAt = (toward: number, across: number, name = ''): number => {
  const found = placed.findIndex(([one, two]) => Math.abs(one - toward) < 1e-6 && Math.abs(two - across) < 1e-6);
  if (found >= 0) {
    if (!points[found]?.name) (points[found] as { name: string }).name = name;
    return found;
  }
  placed.push([toward, across]);
  points.push({ at: plazaPoint(FRAME, toward, across), name });
  return points.length - 1;
};
const within = (line: (typeof LINES)[number], [toward, across]: readonly [number, number]) =>
  (line.row ? across : toward) >= line.ends[0] - 1e-6 && (line.row ? across : toward) <= line.ends[1] + 1e-6;
const post = (task: Task, toward: number, across: number, facing: number, keep: Post['keep'], from: number) =>
  posts.push({ task, at: plazaPoint(FRAME, toward, across), facing, keep, reached_from: from });
for (const line of LINES)
  for (const other of LINES.filter((each) => each.row !== line.row)) {
    const crossing = (line.row ? [line.held, other.held] : [other.held, line.held]) as [number, number];
    if (within(line, crossing) && within(other, crossing)) pointAt(...crossing);
  }
// The sea is south (+y): facing landward is north (0), seaward south (pi); across runs west (+across is -x).
const [LANDWARD, SEAWARD, WEST, EAST] = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
for (const { kind, counter } of STATIONS) {
  const across = 1000 - counter[0];
  post('hold', -48.5, across, LANDWARD, 'visited', pointAt(COUNTER_LINE, across, `counter:${kind}`));
}
const forge = 1000 - (STATIONS.find((station) => station.kind === 'weaponsmith')?.counter[0] ?? 0);
const between = forge + Math.sign(forge) * (86 / 12);
post('smith', -48.9, between, LANDWARD, 'kept', pointAt(COUNTER_LINE, between, 'smith'));
[-110, -80, -40, 0, 40, 80, 110].forEach((across, nth) =>
  post('idle', 58.4, across, SEAWARD, 'visited', pointAt(PARAPET_LINE, across, `view:seaward-${nth + 1}`)),
);
[-80, -40, 0, 40, 80].forEach((across, nth) => {
  const task = Math.abs(across) > 60 ? 'drink' : 'gesture';
  const from = pointAt(34, across, `bench:${nth + 1}`);
  post(task, 42.6, across - 0.75, WEST, 'visited', from);
  post(task, 42.6, across + 0.75, EAST, 'visited', from);
});
const band = pointAt(-14, -45, 'band');
const BAND: readonly [Task, number][] = [
  ['play_lute', -48.3],
  ['play_flute', -46.1],
  ['play_recorder', -43.9],
  ['play_tambourine', -41.7],
];
for (const [task, across] of BAND) post(task, -3.5, across, LANDWARD, 'kept', band);
post('dance', -7.5, -45, SEAWARD, 'kept', band);
post('juggle', -4, 45, LANDWARD, 'kept', pointAt(-14, 45, 'juggler'));
const SWEPT: readonly (readonly [number, number])[] = [
  [-11, -7],
  [-11, 7],
  [11, 7],
  [11, -7],
];
SWEPT.forEach(([toward, across], nth) => {
  const [nextToward, nextAcross] = SWEPT[(nth + 1) % SWEPT.length] as readonly [number, number];
  const facing = Math.atan2(-(nextAcross - across), -(nextToward - toward));
  post('sweep', toward, across, facing, { round: 0 }, pointAt(toward < 0 ? -14 : 14, across, `ring:${nth + 1}`));
});
const links: [number, number][] = [];
for (const line of LINES) {
  const lying = placed
    .map((place, index) => ({ place, index }))
    .filter(({ place }) => Math.abs(place[line.row ? 0 : 1] - line.held) < 1e-6 && within(line, place))
    .sort((one, two) => one.place[line.row ? 1 : 0] - two.place[line.row ? 1 : 0]);
  for (let nth = 1; nth < lying.length; nth++) links.push([lying[nth - 1]?.index ?? 0, lying[nth]?.index ?? 0]);
}
export const WAYS: Ways = { points, links };
export const POSTS: readonly Post[] = posts;

/** The plaza as a node of the world. */
export const SOCIAL: NodeInfo = {
  id: 'overlook-social',
  kind: 'social',
  name: 'Overlook',
  continent: 'continent-1',
  ring: RING,
  spawns: SPAWNS,
  centre: [1000, 2000],
  stations: STATIONS,
  ways: WAYS,
  posts: POSTS,
};

/** The courtyard's solids a body walks among, in the plaza's own frame (metres toward the sea, across), as the city
 *  crate lays them for a plaza 120 m deep (`crates/city/src/courtyard.rs`): round ones by their radius, boxes by their
 *  half sizes. */
const BAY = 86 / 12;
export const SOLIDS: readonly {
  readonly name: string;
  readonly at: readonly [number, number];
  readonly round?: number;
  readonly half?: readonly [number, number];
}[] = [
  ...[-1, 1].flatMap((side) => [
    ...Array.from({ length: 12 }, (unused, bay) => ({
      name: `arcade column ${side * (bay + 1)}`,
      at: [-50, side * (32 + BAY * (bay + 0.5))] as const,
      round: 0.45,
    })),
    ...Array.from({ length: 5 }, (unused, nth) => ({
      name: `alcove divider ${side * (nth + 1)}`,
      at: [-55, side * (32 + BAY * 2 * (nth + 1))] as const,
      half: [4.5, 0.3] as const,
    })),
    { name: `arcade end ${side}`, at: [-55, side * 118] as const, half: [5, 0.5] as const },
  ]),
  ...STATIONS.map(({ kind, counter }) => ({
    name: `${kind}'s counter at ${counter[0]}`,
    at: [counter[1] - 2000, 1000 - counter[0]] as const,
    half: [0.5, 2.5] as const,
  })),
  { name: 'portico and its steps', at: [-51, 0], half: [9, 26] },
  { name: 'obelisk steps', at: [0, 0], round: 8 },
  ...[-95, -45, 45, 95].map((across) => ({ name: `brazier ${across}`, at: [0, across] as const, round: 0.55 })),
  ...[-3, -2, -1, 0, 1, 2, 3].map((nth) => ({
    name: `bench ${nth * 40}`,
    at: [44, nth * 40] as const,
    half: [0.45, 2] as const,
  })),
  { name: 'seaward parapet', at: [60.5, 0], half: [0.5, 130] },
];

/** Where Shape may stand, in the plaza's own frame, as `visitor_spots` lays them for a plaza 120 m deep: beside each
 *  brazier, landward of the two outer benches, and before the portico's two ends. */
export const SHAPE_SPOTS: readonly (readonly [number, number])[] = [
  ...[-95, -45, 45, 95].map((across) => [2.5, across] as const),
  [40, -120],
  [40, 120],
  [-32, -30],
  [-32, 30],
];

/** The solid a body of `radius` at a place of the plaza's frame stands in, if any. */
export function solidAt(toward: number, across: number, radius: number): string | null {
  for (const { name, at, round, half } of SOLIDS) {
    const [inToward, inAcross] = [toward - at[0], across - at[1]];
    if (round !== undefined && Math.hypot(inToward, inAcross) < round + radius) return name;
    if (half && Math.abs(inToward) < half[0] + radius && Math.abs(inAcross) < half[1] + radius) return name;
  }
  return null;
}

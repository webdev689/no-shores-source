// Overlook's plaza for the welcome's tests, laid as the city crate lays it.
import type { StationInfo } from '../nodes.ts';
import { plazaFrameOf } from '../townsfolk.ts';
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

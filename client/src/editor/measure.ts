import type { WorldConstants } from '../rules/worldRules.ts';

/** A shape of known size the owner lays on the map to judge scale. */
export interface Reference {
  readonly key: string;
  readonly label: string;
  readonly shape: 'circle' | 'box';
  /** Circle: its radius. Box: half its width. */
  readonly halfWidthM: number;
  /** Circle: its radius. Box: half its height. */
  readonly halfHeightM: number;
}

/** The radius of a circle covering `km2` square kilometres. */
export function radiusForAreaM(km2: number): number {
  return Math.sqrt((km2 * 1_000_000) / Math.PI);
}

/** The straight distance between two world points, in kilometres. */
export function distanceKm(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.hypot(toX - fromX, toY - fromY) / 1000;
}

/** Daggerfall's map: 1,000 by 500 map pixels of 819.2 metres. */
const DAGGERFALL_MAP = { widthM: 819_200, heightM: 409_600 } as const;

/** The shapes to judge a continent's size by: the smallest and largest allowed, and Daggerfall's whole map. */
export function references(constants: WorldConstants): Reference[] {
  const smallest = radiusForAreaM(constants.minContinentKm2);
  const largest = radiusForAreaM(constants.maxContinentKm2);
  return [
    {
      key: 'smallest',
      label: `Smallest continent, ${constants.minContinentKm2.toLocaleString('en-US')} km²`,
      shape: 'circle',
      halfWidthM: smallest,
      halfHeightM: smallest,
    },
    {
      key: 'largest',
      label: `Largest continent, ${constants.maxContinentKm2.toLocaleString('en-US')} km²`,
      shape: 'circle',
      halfWidthM: largest,
      halfHeightM: largest,
    },
    {
      key: 'daggerfall',
      label: "Daggerfall's whole map, sea included, 819 × 410 km",
      shape: 'box',
      halfWidthM: DAGGERFALL_MAP.widthM / 2,
      halfHeightM: DAGGERFALL_MAP.heightM / 2,
    },
  ];
}

/** Where a continent's area stands against the allowed range. */
export type AreaStanding = 'empty' | 'too small' | 'fits' | 'too large';

export function areaStanding(km2: number, constants: WorldConstants): AreaStanding {
  if (km2 === 0) return 'empty';
  if (km2 < constants.minContinentKm2) return 'too small';
  if (km2 > constants.maxContinentKm2) return 'too large';
  return 'fits';
}

/** How far along the allowed range an area sits, 0 at the smallest and 1 at the largest, clamped. */
export function rangeFraction(km2: number, constants: WorldConstants): number {
  const fraction = (km2 - constants.minContinentKm2) / (constants.maxContinentKm2 - constants.minContinentKm2);
  return Math.min(1, Math.max(0, fraction));
}

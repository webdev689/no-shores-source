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

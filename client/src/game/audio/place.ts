// Where the player is, as the music and the ambience hear it: Overlook's social space, a node on an island whose
// climate sets its sound, the open sea, or a space of a Breach's run (its plan's key), under its gate's zone's
// climate. A continent with no climate of its own, or one not yet named here, sounds as Saltmere's temperate coast
// does, so no place is ever silent for want of a name.

import type { NodeKind } from '../worldData.ts';

/** The nine islands' climates, as content/world/layout.json names them. */
export const CLIMATES = [
  'temperate-coast',
  'highland',
  'woodland',
  'desert',
  'savanna',
  'rainforest',
  'steppe',
  'swamp',
  'tundra',
] as const;

export type Climate = (typeof CLIMATES)[number];

export type Place =
  | { readonly kind: 'social'; readonly climate: Climate }
  | { readonly kind: 'island'; readonly climate: Climate; readonly node: NodeKind }
  | { readonly kind: 'sea' }
  | { readonly kind: 'breach'; readonly climate: Climate; readonly space: string };

const isClimate = (name: string | null | undefined): name is Climate => CLIMATES.some((climate) => climate === name);

/** The place a node stands in, by its kind and its continent's climate; the sea where there is no node. */
export function placeOf(
  world: { readonly continents: readonly { readonly id: string; readonly climate: string | null }[] },
  node: { readonly kind: NodeKind; readonly continent: string } | null,
): Place {
  if (!node) return { kind: 'sea' };
  const named = world.continents.find((continent) => continent.id === node.continent)?.climate;
  const climate = isClimate(named) ? named : 'temperate-coast';
  return node.kind === 'social' ? { kind: 'social', climate } : { kind: 'island', climate, node: node.kind };
}

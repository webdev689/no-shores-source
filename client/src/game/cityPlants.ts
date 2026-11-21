// A city's trees and bushes (the city crate's `hub::plants`: the beds, pots and planters of Overlook's hub), drawn by
// the land's own plants: a tree as its climate's commonest tree, a bush as its commonest shrub, on the foot, turn and
// scale the plan gives each, among what the land's nature plants.
import type { CityPlant } from '../city/plan.ts';
import { castOf } from '../nature/cast.ts';
import { GRASS, type Kind } from '../nature/kinds.ts';
import { type Planted, TILE_M } from '../nature/scatter.ts';

/** The kind a growth stands as in a cast: its commonest tree (a tall kind that sways: rocks do not), or its commonest
 *  shrub (a low kind seen further off than grass). */
export function kindFor(kinds: readonly Kind[], growth: CityPlant['growth']): Kind | null {
  const fits = (kind: Kind) =>
    growth === 'tree' ? kind.layer === 'tall' && kind.swayM > 0 : kind.layer === 'low' && kind.reachM > GRASS.reachM;
  return kinds
    .filter(fits)
    .reduce<Kind | null>((best, kind) => (best && best.growth.chance >= kind.growth.chance ? best : kind), null);
}

/** A city's plants as the land's plantings, by its 64 m tile, in the world's metres. */
export function cityPlantings(
  plants: readonly CityPlant[],
  biome: string,
): (tileX: number, tileY: number) => readonly Planted[] {
  const kinds = castOf(biome).kinds;
  const byTile = new Map<string, Planted[]>();
  for (const { growth, at, turn, scale } of plants) {
    const kind = kindFor(kinds, growth);
    if (!kind) continue;
    const key = `${Math.floor(at[0] / TILE_M)},${Math.floor(at[1] / TILE_M)}`;
    const tile = byTile.get(key) ?? [];
    tile.push({ kind: kind.name, at: [at[0], at[1]], z: at[2], turn, scale });
    byTile.set(key, tile);
  }
  return (tileX, tileY) => byTile.get(`${tileX},${tileY}`) ?? [];
}

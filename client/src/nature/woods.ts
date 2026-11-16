// A biome's woods as the land is coloured where its trees are not drawn: from afar, past the far trees' reach, a
// wood is the colour of its canopy, and its groves and glades lie where the scatter's own grove field puts them
// (scatter.ts groveAt, which the terrain's shader runs too).
import type { Cast } from './kinds.ts';
import type { Colour } from './shapes.ts';
import { VERTEX_FLOATS } from './shapes.ts';

/** A biome's woods: its canopy's colour, how much of the ground its trees cover where they grow thickest (0..1), and
 *  how strongly they gather in the groves (0 evenly, 1 only there). */
export interface Woods {
  readonly canopy: Colour;
  readonly cover: number;
  readonly gather: number;
}

/** The side of a tall slot, metres: one tree at most stands in each. */
const SLOT_M = 8;

/** The mean colour of a mesh's leaves, and how wide its crown spreads (metres across, at size 1); null if leafless. */
function crownOf(vertices: Float32Array): { colour: Colour; across: number } | null {
  const sum = [0, 0, 0];
  let [weight, west, east] = [0, Infinity, -Infinity];
  for (let offset = 0; offset < vertices.length; offset += VERTEX_FLOATS) {
    const leaf = vertices[offset + 9] ?? 0;
    if (leaf < 0.5) continue;
    for (let channel = 0; channel < 3; channel++) sum[channel] += (vertices[offset + 6 + channel] ?? 0) * leaf;
    weight += leaf;
    const east0 = vertices[offset] ?? 0;
    [west, east] = [Math.min(west, east0), Math.max(east, east0)];
  }
  if (weight === 0) return null;
  return { colour: [sum[0] / weight, sum[1] / weight, sum[2] / weight], across: east - west };
}

/** The woods a cast grows: its tall leafy kinds, each weighted by how often it stands in a slot and how much of the
 *  slot its crown covers, at its thickest, in a grove. */
export function woodsOf(cast: Cast): Woods {
  const colour = [0, 0, 0];
  let [cover, gather, weight] = [0, 0, 0];
  for (const kind of cast.kinds) {
    // Kinds that grow only by water line its banks, not the land at large.
    if (kind.layer !== 'tall' || kind.growth.byWater?.only) continue;
    const plant = kind.plants[0];
    const crown = plant && crownOf(plant.far?.vertices ?? plant.near.vertices);
    if (!crown) continue;
    const size = (kind.sizes[0] + kind.sizes[1]) / 2;
    const area = (Math.PI / 4) * (crown.across * size) ** 2;
    const thickest = kind.growth.chance * (1 + Math.max(0, kind.growth.grove)) * Math.min(1, area / SLOT_M ** 2);
    for (let channel = 0; channel < 3; channel++) colour[channel] += (crown.colour[channel] ?? 0) * thickest;
    gather += Math.max(0, kind.growth.grove) * thickest;
    cover += thickest;
    weight += thickest;
  }
  if (weight === 0) return { canopy: [0, 0, 0], cover: 0, gather: 0 };
  return {
    canopy: [colour[0] / weight, colour[1] / weight, colour[2] / weight],
    cover: Math.min(1, cover),
    gather: gather / weight,
  };
}

// A biome's woods as the land is coloured where its trees are not drawn: from afar, past the far trees' reach, a
// wood is the colour of its canopy, and its groves and glades lie where the scatter's own grove field puts them
// (scatter.ts groveAt, which the terrain's shader runs too).
import { BIOMES, castOf } from './cast.ts';
import { formsOf } from './flora.ts';
import type { Cast } from './kinds.ts';

/** A colour, 0..1 a channel. */
export type Colour = readonly [number, number, number];

/** A biome's woods: its canopy's colour, how much of the ground its trees cover where they grow thickest (0..1), and
 *  how strongly they gather in the groves (0 evenly, 1 only there). */
export interface Woods {
  readonly canopy: Colour;
  readonly cover: number;
  readonly gather: number;
}

/** The side of a tall slot, metres: one tree at most stands in each. */
const SLOT_M = 8;

/** The woods a biome grows: its tall leafy kinds, each weighted by how often it stands in a slot and how much of the
 *  slot its crown covers, at its thickest, in a grove, coloured as its baked leaves are seen from above. */
export function woodsOf(cast: Cast): Woods {
  const biome = BIOMES.find((each) => castOf(each) === cast) ?? '';
  const forms = formsOf(cast, biome);
  const colour = [0, 0, 0];
  let [cover, gather, weight, first] = [0, 0, 0, 0];
  for (const kind of cast.kinds) {
    const form = forms[first];
    first += kind.forms;
    // Kinds that grow only by water line its banks, not the land at large.
    if (kind.layer !== 'tall' || kind.growth.byWater?.only || !form?.canopy) continue;
    const size = (kind.sizes[0] + kind.sizes[1]) / 2;
    const area = (Math.PI / 4) * (form.crown * size) ** 2;
    const thickest = kind.growth.chance * (1 + Math.max(0, kind.growth.grove)) * Math.min(1, area / SLOT_M ** 2);
    for (let channel = 0; channel < 3; channel++) colour[channel] += (form.canopy[channel] ?? 0) * thickest;
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

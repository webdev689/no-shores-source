import { COOL_CASTS } from './coolCasts.ts';
import type { Cast } from './kinds.ts';
import { WARM_CASTS } from './warmCasts.ts';

/** The nine casts, by the biome's key in the layout. Each is made the first time a landmass of it is drawn. */
const CASTS: Readonly<Record<string, () => Cast>> = { ...COOL_CASTS, ...WARM_CASTS };

/** The biomes' keys, in the layout's order. */
export const BIOMES = Object.keys(CASTS);

const made = new Map<string, Cast>();

/** A biome's cast, made once; an unknown biome grows nothing. */
export function castOf(biome: string): Cast {
  const known = made.get(biome);
  if (known) return known;
  const cast = CASTS[biome]?.() ?? { kinds: [], keepAtReach: 1 };
  made.set(biome, cast);
  return cast;
}

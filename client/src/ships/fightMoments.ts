// DFO's sea-fight moments as numbers and laws (navalFeel.js, navalShots.js): how near a ball whistles and a fall
// throws its water aboard, and whether a burning ship going down blows its magazine, drawn from its own seed so every
// machine that knows it sees the same. `FightFeel` plays them.

/** DFO's moments (navalFeel.js, navalShots.js): a ball whistles going by within this of its hull; a fall within this
 *  throws its water aboard; a burning ship going down blows its magazine at this share, this long into its going down
 *  (seconds, from and to). */
export const NEAR_MISS_M = 8;
export const NEAR_SPLASH_M = 6;
export const MAGAZINE_CHANCE = 0.55;
export const MAGAZINE_DELAY = [1.5, 4.5] as const;
/** A share in [0, 1) from `seed` and `salt`: a ship's own draw, the same on every machine that knows it. */
export function seedShare(seed: number, salt: number): number {
  let hash = Math.imul((seed >>> 0) ^ salt, 0x9e3779b1) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4_294_967_296;
}

/** Whether a ship of `seed` going down afire blows its magazine, and how long after (seconds); null if it does not. */
export function magazineOf(seed: number): number | null {
  if (seedShare(seed, 0x6a91) >= MAGAZINE_CHANCE) return null;
  return MAGAZINE_DELAY[0] + seedShare(seed, 0x2b7) * (MAGAZINE_DELAY[1] - MAGAZINE_DELAY[0]);
}

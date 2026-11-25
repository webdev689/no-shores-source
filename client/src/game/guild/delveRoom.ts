import type { Plot, Standing } from './outpostLaw.ts';

/**
 * The guild dungeon behind an outpost's Delve Gate: a run of a sea island's dungeon, laid afresh each week from the
 * guild's key, the same all week for every company of that guild. Its room is named after the outpost's own,
 * `node-<site>--guild-<key>`, then its tier at Elite or Abyss, then `--run-<instance>` (server/roomNames.ts reads it);
 * the page and the rooms draw its seed and style here alike, so the dungeon the page lays is the one the room plays.
 */

/** The tiers a run is named by, by the gear crate's numbers: Normal is written by none. */
const TIERS = ['normal', 'elite', 'abyss'] as const;
/** The styles a sea island's dungeon is laid in (`isle::Kind::dungeon`): a cove's, a ruin's and a quarry's. */
export const DELVE_STYLES = ['caverns', 'crypt', 'mines'] as const;
/** The tiers as a player reads them, by the same numbers. */
export const DELVE_WORDS: readonly string[] = ['Normal', 'Elite', 'Abyss'];
/** The Delve Gate's kind among an outpost's structures. */
export const GATE = 'gate';

/** A number for a name, the same every time: FNV-1a over its bytes, as `dungeon::lane::named` makes it. */
function named(name: string): number {
  let hash = 0x811c_9dc5;
  for (const byte of new TextEncoder().encode(name)) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
  return hash;
}

/** The guild dungeon's room before its instance, at `tier` (0 Normal, 1 Elite, 2 Abyss): the base a company's run of
 *  it is found by, or a new one named after (`runOf`). */
export function delveBase(key: string, site: string, tier: number): string {
  const marked = tier > 0 ? `--${TIERS[tier] ?? TIERS[0]}` : '';
  return `node-${site}--guild-${key}${marked}`;
}

/** The guild dungeon a guild's companies delve in a week (`guildLaw.ts` `weekOf`): its seed and its style's key. */
export function delveLaid(key: string, week: number): { readonly seed: number; readonly style: string } {
  const seed = named(`delve:${key}:${week}`);
  const style = DELVE_STYLES[named(`delve-style:${key}:${week}`) % DELVE_STYLES.length] ?? DELVE_STYLES[0];
  return { seed, style };
}

/** The plot's Delve Gate, or null where none is placed. */
export function gateOf(plot: Plot): Standing | null {
  return plot.structures.find((standing) => standing.kind === GATE) ?? null;
}

/** The highest tier the plot's Delve Gate opens its dungeon at (0 Normal to 2 Abyss), or null where no gate stands
 *  at a tier yet: a company may choose any tier up to it. */
export function gateTier(plot: Plot): number | null {
  const tier = gateOf(plot)?.tier ?? 0;
  return tier > 0 ? Math.min(tier, TIERS.length) - 1 : null;
}

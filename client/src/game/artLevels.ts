// An Art's level as its screen shows it: where the player stands with it (its level, its XP toward the next, the
// fragments owned) from the room's word, the faction that raises it, and its spells' numbers at that level, scaled
// exactly as the room scales them (crates/room/src/spells.rs), so the screen never promises what the room will not do.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import type { Standing } from '../network/gearMessages.ts';

/** An Art's highest level, where its spells are as written. */
export const LEVEL_MOST = 5;
/** How many fragments an Art's Core is chosen from. */
const FRAGMENTS = 6;
const ALL_OWNED = (1 << FRAGMENTS) - 1;

/** Where the player stands with an Art: its level, its XP toward the next, the XP that level's bar holds (0 at the
 *  highest) and the fragments owned, a bit each by place. */
export interface ArtLevel {
  readonly level: number;
  readonly xp: number;
  readonly bar: number;
  readonly owned: number;
}

/** Where the player stands with the Art numbered `art`. Until the room has said, an Art is at level 1 owning every
 *  fragment, so the screen locks nothing the room may allow; the room refuses what it must. */
export function levelOf(standing: Standing | undefined, art: number): ArtLevel {
  const place = arts.arts.findIndex((each) => each.id === art);
  const level = Math.min(LEVEL_MOST, Math.max(1, standing?.artLevels[place] ?? 1));
  const bar = arts.levels.xp[level - 1] ?? 0;
  const earned = Math.min(bar, standing?.artXp[place] ?? 0);
  return { level, xp: earned, bar, owned: standing ? (standing.artOwned[place] ?? 0) : ALL_OWNED };
}

/** Whether a fragment, by its place in its Art's list, is owned. */
export const owns = (standing: ArtLevel, fragment: number): boolean => ((standing.owned >> fragment) & 1) === 1;
/** How many of an Art's fragments are owned. */
export const ownedCount = (standing: ArtLevel): number =>
  Array.from({ length: FRAGMENTS }, (unused, fragment) => owns(standing, fragment)).filter(Boolean).length;
/** Whether the Art's bar is full, so its faction will raise it. */
export const ready = (standing: ArtLevel): boolean => standing.level < LEVEL_MOST && standing.xp >= standing.bar;

/** A level's share of its spells' harm and healing, and of how long they and what they give last. */
export const powerAt = (level: number): number => arts.levels.power[level - 1] ?? 1;
export const lastingAt = (level: number): number => arts.levels.lasting[level - 1] ?? 1;
/** The share its spells hold at a level, in words: "Spells at 70%". */
export const shareWords = (level: number): string => `Spells at ${Math.round(powerAt(level) * 100)}%`;

/** The faction that keeps an Art, raises it and sells its fragments. */
export function factionOf(art: number): (typeof factions.factions)[number] | undefined {
  return factions.factions.find((faction) => faction.art === art);
}

/** A faction's counter in words: "the Stormcallers' counter", "the Veiled's counter". */
function counterOf(name: string): string {
  const plain = name.replace(/^The /, '');
  return `the ${plain}${plain.endsWith('s') ? "'" : "'s"} counter`;
}

const RANKS = ['first', 'second', 'third', 'fourth', 'fifth'];

/** What the Art's bar says: its XP against the bar ("3,200 of 8,000"), full ("Ready to rise at the Stormcallers'
 *  counter"), or at the highest level. */
export function barWords(standing: ArtLevel, art: number): string {
  if (standing.level >= LEVEL_MOST) return 'Highest level';
  if (ready(standing)) return `Ready to rise at ${counterOf(factionOf(art)?.name ?? 'its faction')}`;
  return `${standing.xp.toLocaleString('en')} of ${standing.bar.toLocaleString('en')}`;
}

/** How a fragment not owned is had: as the Art rises, or bought from its faction. */
export function howHad(art: number): string {
  const counter = counterOf(factionOf(art)?.name ?? 'its faction');
  const rank = RANKS[factions.fragmentRank - 1] ?? `rank ${factions.fragmentRank}`;
  return `Rise the Art at ${counter}, or buy it there from their ${rank} rank.`;
}

/** The spells whose own life the room scales by the level's lasting; every spell's harm and healing it scales by the
 *  level's power, and nothing else of a spell. */
export const LASTING_LIFE: ReadonlySet<string> = new Set(['sunwell', 'duskraven', 'duskDaggers']);
/** The fragments whose seconds more the room scales by the lasting, as it adds them to what they lengthen. */
export const LASTING_MORE: ReadonlySet<string> = new Set(['gale', 'radiance', 'night', 'blades']);
/** What a spell or fragment gives and for how long, in seconds as combat's status.rs holds it (Momentum's Crit lasts
 *  as Quicken's Haste does), scaled by the lasting. The Arts' file does not hold these, so they are written here. */
export const GIVES: Readonly<Record<string, readonly [label: string, seconds: number]>> = {
  quicken: ['Haste lasts', 6],
  vanish: ['Veil lasts', 4],
  momentum: ['Crit lasts', 6],
  resolve: ['Crit lasts', 5],
};

/** The healing each second a spell gives through Linked, as combat's status.rs holds it (LINKED_HEAL), weighed by
 *  the level's power as the room weighs the Sunwell's. */
export const HEALS_A_SECOND: Readonly<Record<string, number>> = { sunwell: 5 };

/** A spell's or fragment's number `field` at `level`, as the room uses it, to a tenth. */
export function scaled(key: string, field: string, value: number, level: number): number {
  const lasting = (field === 'lifeS' && LASTING_LIFE.has(key)) || (field === 'moreS' && LASTING_MORE.has(key));
  const share = field === 'damage' || field === 'heal' ? powerAt(level) : lasting ? lastingAt(level) : 1;
  return Math.round(value * share * 10) / 10;
}

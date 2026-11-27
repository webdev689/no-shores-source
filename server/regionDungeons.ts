// The dungeons each region of an island offers from the sea, drawn afresh each day, and the tier a character meets
// one at: the rooms and the page draw both here alike, so the dungeon the page lays is the one its room plays. A
// region's dungeon is a run of a sea island's dungeon, laid by its seed and style in its island's band, entered from
// the sea while the ship lies off its region and left back to it. Its room is named
// `region-dungeon-<island>-r<region>-d<day>-n<slot>`, then its tier at Elite or Abyss, then `--run-<instance>`
// (`roomNames.ts` reads it).
import { named } from '../client/src/game/guild/delveRoom.ts';
import { regionDungeonRoom } from './roomNames.ts';

/** How many dungeons a region offers a day. */
export const REGION_DUNGEONS = 3;
/** The styles a region's dungeons are laid in: the six of the patrols' (`dungeon::STYLES`). */
export const REGION_STYLES = ['crypt', 'halls', 'cells', 'sanctum', 'caverns', 'mines'] as const;
/** The tiers as rooms are named by them, by the gear crate's numbers: Normal is written by none. */
const TIERS = ['normal', 'elite', 'abyss'] as const;

/** One of a region's dungeons on a day: its region's number on its island, its slot, the day, its seed and style. */
export interface RegionDungeon {
  readonly island: string;
  readonly region: number;
  readonly slot: number;
  readonly day: number;
  readonly seed: number;
  readonly style: (typeof REGION_STYLES)[number];
}

/** The day it is at Unix `minute`, as the rooms' clock turns at 09:00 UTC (`gear::clock::day_of`). */
export function dayOf(minute: number): number {
  return Math.floor((minute + 1440 - 540) / 1440);
}

/** The dungeons region `region` of `island` offers on `day`, each in a style of its own, shuffled by the day. */
export function regionDungeons(island: string, region: number, day: number): RegionDungeon[] {
  const order: number[] = REGION_STYLES.map((_style, index) => index);
  let draw = named(`region-styles:${island}:${region}:${day}`);
  for (let last = order.length - 1; last > 0; last--) {
    draw = Math.imul(draw ^ (draw >>> 15), 0x2c1b_3c6d) >>> 0;
    const pick = draw % (last + 1);
    [order[last], order[pick]] = [order[pick] ?? 0, order[last] ?? 0];
  }
  return Array.from({ length: REGION_DUNGEONS }, (_none, slot) => ({
    ...{ island, region, slot, day },
    seed: named(`region-dungeon:${island}:${region}:${day}:${slot}`),
    style: REGION_STYLES[order[slot] ?? 0] ?? 'crypt',
  }));
}

/** The tier (0 Normal, 1 Elite, 2 Abyss) a character meets a dungeon named `key` at on `day`: drawn among the `open`
 *  tiers their level opens (1 to 3), each as likely, and never under `least` (a patrol's harder seas). The draw keeps
 *  until the day turns or the character opens another tier. */
export function drawnTier(key: string, day: number, open: number, least = 0): number {
  const tiers = Math.max(1, Math.min(TIERS.length, open));
  return Math.min(TIERS.length - 1, Math.max(least, named(`tier:${key}:${day}:${tiers}`) % tiers));
}

/** A region's dungeon's room before its run's instance, at `tier`. */
export function regionDungeonBase(dungeon: RegionDungeon, tier: number): string {
  const marked = tier > 0 ? `--${TIERS[tier] ?? TIERS[0]}` : '';
  return `region-dungeon-${dungeon.island}-r${dungeon.region}-d${dungeon.day}-n${dungeon.slot}${marked}`;
}

/** The tiers a character of these seas' gates may set out at (null where open): Normal at least. */
export function openTiers(seas: readonly (string | null)[] | null | undefined): number {
  return Math.max(1, (seas ?? [null]).filter((shut) => shut === null).length);
}

/** The ask `open_run` opens a region's dungeon's run from, by its name and the Unix minute it opens: a sea island's
 *  dungeon's, in its island's band. Null for a name that is none, and for one drawn for a day other than today,
 *  yesterday (a run opened before the turn) or tomorrow (a page whose clock turned a little first). */
export function regionAsk(room: string, minute: number): string | null {
  const region = regionDungeonRoom(room);
  const drawn = region ? regionDungeons(region.island, region.region, region.day)[region.slot] : undefined;
  if (!region || !drawn || Math.abs(region.day - dayOf(minute)) > 1) return null;
  const dungeon = { seed: drawn.seed, style: drawn.style, continent: region.island };
  return JSON.stringify({ dungeon, tier: region.seas, minute });
}

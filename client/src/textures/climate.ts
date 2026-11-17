// Daggerfall files a texture set once per climate and season: a set's archive is its climate's base plus the set,
// plus 1 for winter or 2 for rain where the set has them. This moves an archive to a climate and season, as
// Daggerfall Unity's ClimateSwaps.ApplyClimate does.

export type Climate = 'desert' | 'mountain' | 'temperate' | 'swamp';
export type Season = 'summer' | 'winter' | 'rain';

export const CLIMATES: readonly Climate[] = ['desert', 'mountain', 'temperate', 'swamp'];
export const SEASONS: readonly Season[] = ['summer', 'winter', 'rain'];

const CLIMATE_BASE: Readonly<Record<Climate, number>> = { desert: 0, mountain: 100, temperate: 300, swamp: 400 };

/** The texture sets by their number within a climate. */
const SET = {
  terrain: 2,
  castle: 9,
  doors: 74,
  magesGuild: 35,
  marbleFloors: 41,
};
const EXTERIOR_SETS = new Set([7, 9, 12, 14, 17, 26, 29, 35, 38, 42, 58, 61, 64, 69, 79, 80, 82, 83]);
const INTERIOR_SETS = new Set([11, 16, 19, 20, 22, 23, 24, 25, 28, 37, 40, 41, 44, 45, 47, 48, 60, 63, 66, 68]);
const NATURE_WINTER_SETS = new Set([504, 506, 508, 510]);
const NATURE_SETS = new Set([500, 501, 502, 503, ...NATURE_WINTER_SETS]);

/** The archive's set (-1 for none), and whether the set has winter and rain turns. */
export interface SetInfo {
  readonly set: number;
  readonly winter: boolean;
  readonly rain: boolean;
}

export function setInfo(archive: number): SetInfo {
  if (archive > 499)
    return { set: NATURE_SETS.has(archive) ? archive : -1, winter: NATURE_WINTER_SETS.has(archive), rain: false };
  const set = archive - Math.trunc(archive / 100) * 100;
  if (set === SET.terrain) return { set, winter: true, rain: true };
  if (EXTERIOR_SETS.has(set)) return { set, winter: true, rain: false };
  if (set === SET.doors || INTERIOR_SETS.has(set)) return { set, winter: false, rain: false };
  return { set: -1, winter: false, rain: false };
}

/** The archive a set takes in `climate` and `season`. */
export function climateArchive(archive: number, record: number, climate: Climate, season: Season): number {
  // the door-frame tapestry never swaps
  if (archive % 100 === SET.doors && record === 3) return archive;
  const info = setInfo(archive);
  if (info.set === -1) return archive;
  const base = CLIMATE_BASE[climate];
  if (climate === 'swamp' && info.set === SET.marbleFloors) return archive;
  let winter = info.winter;
  if (climate === 'desert') winter = false;
  // as Daggerfall Unity reads it: a castle's records past 3 have no winter in any climate
  if ((climate === 'swamp' && info.set === SET.magesGuild) || (info.set === SET.castle && record > 3)) winter = false;
  if ((archive === 82 && record > 1) || archive === 77) winter = false;
  const keepsClimate = [75, 76, 77, 79, 80, 82, 83].includes(archive);
  if (archive < 500 && !keepsClimate) {
    if (season === 'winter' && winter) return base + info.set + 1;
    if (season === 'rain' && info.rain) return base + info.set + 2;
    return base + info.set;
  }
  return season === 'winter' && winter ? archive + 1 : archive;
}

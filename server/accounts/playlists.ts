/**
 * The Playlist's Find a Company: one queue for each playlist (`playlist-elite`, `playlist-abyss`) for the whole game,
 * whichever port it is opened from, banded by five levels from the level it opens at. A group found is sent into one of
 * the 18 Elite Dungeons, drawn by the server, at the playlist's tier with its foes at the band's level, as the rules
 * set out (`gear::playlist`, which the rooms judge; playlists.test.ts holds these numbers to the rules').
 */

/** Each playlist's tier in a room's name, the level it opens at and the levels its foes stand over a band's first. */
export const PLAYLISTS = {
  elite: { opens: 10, over: 2 },
  abyss: { opens: 20, over: 3 },
} as const;
export type PlaylistKey = keyof typeof PLAYLISTS;

/** The levels a band spans, the highest level, and the highest any foe stands at. */
const BAND_LEVELS = 5;
const LEVEL_MOST = 30;
const FOE_LEVEL_MOST = 32;

/** The 18 Elite Dungeons a playlist's run is drawn from, island by island (`gear::activities::ISLAND_PLACES`). */
export const ELITE_DUNGEONS = [
  'krakens-grotto',
  'pearl-tomb',
  'cinder-deep',
  'hollow-crypt',
  'black-tide-caverns',
  'pale-undercroft',
  'forsaken-cistern',
  'sandworn-vault',
  'smugglers-labyrinth',
  'silt-barrows',
  'deepwater-vault',
  'coral-halls',
  'barrow-halls',
  'saltworm-warrens',
  'mire-hollows',
  'rotwater-sewers',
  'frozen-sepulchre',
  'brine-catacombs',
] as const;

/** The playlist a finder's base is for (`playlist-elite`, `playlist-abyss`); null for any other base. */
export function playlistOf(base: string): PlaylistKey | null {
  const key = base.startsWith('playlist-') ? base.slice('playlist-'.length) : '';
  return key === 'elite' || key === 'abyss' ? key : null;
}

/** The band a level is matched in, 0 the first; null below the level the playlist opens at. */
export function playlistBand(key: PlaylistKey, level: number): number | null {
  const over = Math.min(level, LEVEL_MOST) - PLAYLISTS[key].opens;
  return over < 0 ? null : Math.floor(over / BAND_LEVELS);
}

/** The level a band's foes stand at: its first raised by the tier, never past 32. */
export function playlistFoesAt(key: PlaylistKey, band: number): number {
  const { opens, over } = PLAYLISTS[key];
  return Math.min(opens + band * BAND_LEVELS + over, FOE_LEVEL_MOST);
}

/** Why a seeker of `level` is matched in no band of a playlist. */
export function playlistShut(key: PlaylistKey): string {
  return `The ${key === 'elite' ? 'Elite' : 'Abyss'} Playlist opens at level ${PLAYLISTS[key].opens}.`;
}

/** A found group's run: an Elite Dungeon drawn by `pick` (one of `count`), at the playlist's tier, its foes at the
 *  band's level, before its instance. */
export function playlistRun(key: PlaylistKey, band: number, pick: (count: number) => number, instance: string): string {
  const place = ELITE_DUNGEONS[pick(ELITE_DUNGEONS.length)] ?? ELITE_DUNGEONS[0];
  return `node-${place}--${key}--playlist-${playlistFoesAt(key, band)}--run-${instance}`;
}

/** One of `count`, drawn from the server's own randomness. */
export function drawnOf(count: number): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % count;
}

// The night's lamps: the places that give light (a city's glowing solids), the light a player carries, and the ones
// nearest the eye each frame, as the sky's uniform lays them out. A lamp is lit only as the daylight fades.
import { LAMPS_MOST, type Lamp } from './skyUniform.ts';

/** A place that gives light: world metres (east, south, up), how far its light reaches, its colour at full, and a
 *  seed its flicker keeps to. */
export interface LampPlace {
  readonly at: readonly [number, number, number];
  readonly reachM: number;
  readonly light: readonly [number, number, number];
  readonly seed: number;
}

/** What the city drawn now lights, set by its view as it is shown and cleared with it. */
export const CITY_LAMPS: { current: readonly LampPlace[] } = { current: [] };
/** What the public events' props light now (their crystal, a chest opened), set each frame they are drawn. */
export const EVENT_LAMPS: { current: readonly LampPlace[] } = { current: [] };

/** A fire's light, linear red, green and blue. */
export const FIRELIGHT = [1.0, 0.62, 0.3] as const;

/** The lights a hand carries: a torch reaches less and flickers more than a lantern's shielded flame. */
const CARRIED = {
  torch: { reachM: 11, light: [1.0, 0.58, 0.26], flicker: 1 },
  lantern: { reachM: 13, light: [1.0, 0.74, 0.44], flicker: 0.4 },
} as const;
/** The carried light is held at the hand, this high over the carrier's feet. */
const HAND_M = 1.1;
/** A lamp is whole once it leads the first lamp left out by this much, metres, and fades to nothing as that one nears. */
const CUT_FADE_M = 10;

/** A light carried by someone standing with their feet at `feet` (world metres). */
export interface Carried {
  readonly light: 'torch' | 'lantern';
  readonly feet: readonly [number, number, number];
}

/** The light a left hand's layer (`torch_l`, `lantern`) carries, or null for none. */
export function carriedLight(left: string | null | undefined): 'torch' | 'lantern' | null {
  if (left?.startsWith('torch')) return 'torch';
  return left === 'lantern' ? 'lantern' : null;
}

/** How lit the lamps are by the daylight (0 night to 1 day): out by day, coming up through the dusk. */
export function lampsLit(daylight: number): number {
  const share = Math.min(1, Math.max(0, (0.6 - daylight) / 0.45));
  return share * share * (3 - 2 * share);
}

/** A flame's gentle flicker, near 1, never the same beat twice for two seeds. */
export function flicker(seed: number, seconds: number, depth = 1): number {
  const wave =
    Math.sin(seconds * 7.3 + seed * 12.9) * 0.5 +
    Math.sin(seconds * 13.1 + seed * 4.7) * 0.3 +
    Math.sin(seconds * 23.7 + seed * 8.1) * 0.2;
  return 1 - depth * 0.08 * (1 + wave);
}

/**
 * The lamps lit round the eye (world metres) now: the carried light first, at the carrier's hand, then the places
 * nearest the eye counting their reach, at most LAMPS_MOST in all, each flickering and dimmed as the daylight shows.
 * None by day.
 */
export function lampsRound(
  eye: readonly [number, number, number],
  places: readonly LampPlace[],
  carried: Carried | null,
  daylight: number,
  seconds: number,
): Lamp[] {
  const lit = lampsLit(daylight);
  if (lit <= 0) return [];
  const lamps: Lamp[] = [];
  const fromEye = (point: readonly [number, number, number]): Rgb => [
    point[0] - eye[0],
    point[1] - eye[1],
    point[2] - eye[2],
  ];
  if (carried) {
    const held = CARRIED[carried.light];
    const shown = lit * flicker(0, seconds, held.flicker);
    const hand = fromEye([carried.feet[0], carried.feet[1], carried.feet[2] + HAND_M]);
    lamps.push({ fromEye: hand, reachM: held.reachM, light: held.light.map((part) => part * shown) as Rgb });
  }
  const ranked = places
    .map((place) => ({ place, away: Math.hypot(...fromEye(place.at)) - place.reachM }))
    .sort((one, other) => one.away - other.away);
  const room = LAMPS_MOST - lamps.length;
  // A lamp near the cut fades by how far it leads the first left out, so none switches on or off as the eye moves.
  const cut = ranked[room]?.away ?? Infinity;
  for (const { place, away } of ranked.slice(0, room)) {
    const shown = lit * flicker(place.seed, seconds) * Math.min(1, (cut - away) / CUT_FADE_M);
    lamps.push({
      fromEye: fromEye(place.at),
      reachM: place.reachM,
      light: place.light.map((part) => part * shown) as Rgb,
    });
  }
  return lamps;
}

type Rgb = [number, number, number];

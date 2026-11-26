// The night's lamps: the places that give light (a city's glowing solids), the light a player carries, and the ones
// nearest the eye each frame, as the sky's uniform lays them out. A lamp is lit only as the daylight fades.
import { flicker, lightMotion, type LightMotion, motionCode } from './flicker.ts';
import { Nearest } from '../nearest.ts';
import { LAMPS_MOST, type Lamp } from './skyUniform.ts';

/** A place that gives light: world metres (east, south, up), how far its light reaches, its colour at full, a seed
 *  its flicker keeps to, and how it moves (a fire's flicker where none is named). */
export interface LampPlace {
  readonly at: readonly [number, number, number];
  readonly reachM: number;
  readonly light: readonly [number, number, number];
  readonly seed: number;
  readonly motion?: LightMotion;
}

/** A fire a place burns, drawn as the game's fire (../cinema/flames.ts): its base (world metres), how tall it burns,
 *  the seed it flickers by, the run of an edge it burns along, and whether it casts its own light as a fire does, or
 *  its light is a lamp of the place's, seeded alike (a lantern's flame behind its glass). */
export interface FirePlace {
  readonly at: readonly [number, number, number];
  readonly sizeM: number;
  readonly seed: number;
  readonly along?: readonly [number, number, number];
  readonly casts: boolean;
}

/** What the land drawn now lights and burns (a city, its layouts, the islands, a passage zone's hollow, the events'
 *  props), each view's kept apart: a view lights its own as it is shown and lets them go as it is cleared, never
 *  another's. */
export class CityLamps {
  private readonly byView = new Map<object, { lamps: readonly LampPlace[]; fires: readonly FirePlace[] }>();
  private every: readonly LampPlace[] = [];
  private burning: readonly FirePlace[] = [];
  /** Turns each time the fires change, so whoever draws them lights them again only then. */
  firesChanged = 0;

  /** Lights `view`'s lamps and fires in place of its last; none lets them go. */
  set(view: object, lamps: readonly LampPlace[], fires: readonly FirePlace[] = []): void {
    const before = this.byView.get(view)?.fires ?? [];
    if (lamps.length > 0 || fires.length > 0) this.byView.set(view, { lamps, fires });
    else this.byView.delete(view);
    this.every = [...this.byView.values()].flatMap((each) => each.lamps);
    if (before.length === 0 && fires.length === 0) return;
    this.burning = [...this.byView.values()].flatMap((each) => each.fires);
    this.firesChanged++;
  }

  /** Every view's lamps. */
  get current(): readonly LampPlace[] {
    return this.every;
  }

  /** Every view's fires. */
  get fires(): readonly FirePlace[] {
    return this.burning;
  }
}

/** The land's lamps and fires, as every view lights them. */
export const CITY_LAMPS = new CityLamps();
/** What the public events' props light now (their crystal, a chest opened), set each frame they are drawn. */
export const EVENT_LAMPS: { current: readonly LampPlace[] } = { current: [] };

/** A fire's light, linear red, green and blue. */
export const FIRELIGHT = [1.0, 0.62, 0.3] as const;

type Point = readonly [number, number, number];

/** A seed from where a light stands, the same each time it is built, never below 0. */
export function seedAt([x, y, z]: Point): number {
  const mixed = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return Math.floor((mixed - Math.floor(mixed)) * 4093);
}

/** A glowing thing's lamp: from `place`, a lantern's light reaching some ten metres, a great one's (`largest` metres
 *  across) more, up to sixty, and brighter. */
export function glowLamp(place: Point, largest: number, seed: number, motion: LightMotion): LampPlace {
  const strength = Math.min(1.3, 1 + largest / 40);
  return {
    at: place,
    reachM: Math.min(60, 9 + 2 * largest),
    light: [FIRELIGHT[0] * strength, FIRELIGHT[1] * strength, FIRELIGHT[2] * strength],
    seed,
    motion,
  };
}

/** A lantern's flame as a share of its glass's narrowest side, and the least and most it burns, metres. */
const LANTERN_FLAME = { share: 0.6, least: 0.1, most: 0.35 } as const;

/** A lantern whose glass stands round `middle`, `narrowest` across at its narrowest and `largest` at its largest: its
 *  flame inside, its base a little under the middle, and its light at the middle, flickering as the flame does. */
export function lanternLights(
  middle: Point,
  narrowest: number,
  largest: number,
): { readonly fire: FirePlace; readonly lamp: LampPlace } {
  const seed = seedAt(middle);
  const sizeM = Math.min(LANTERN_FLAME.most, Math.max(LANTERN_FLAME.least, narrowest * LANTERN_FLAME.share));
  return {
    fire: { at: [middle[0], middle[1], middle[2] - sizeM * 0.4], sizeM, seed, casts: false },
    lamp: glowLamp(middle, largest, seed, 'lantern'),
  };
}

/** A fire burning on glowing coals `wide` across whose top stands at `top`, a little sunk into them, casting its own
 *  light: as tall as the coals are wide and a fifth more, half a metre to four. */
export function coalsFire(top: Point, wide: number, coalsM: number): FirePlace {
  const base: Point = [top[0], top[1], top[2] - coalsM * 0.2];
  return { at: base, sizeM: Math.min(4, Math.max(0.5, wide * 1.2)), seed: seedAt(top), casts: true };
}

/** The lights a hand carries: a torch reaches less and flickers more than a lantern's shielded flame. */
const CARRIED = {
  torch: { reachM: 11, light: [1.0, 0.58, 0.26], flicker: 1 },
  lantern: { reachM: 13, light: [1.0, 0.74, 0.44], flicker: 0.4 },
} as const;
/** The carried light is held at the hand, this high over the carrier's feet. */
export const HAND_M = 1.1;
/** A lamp no brighter than this at full shows on nothing, so it takes no place among the few lit. */
const FAINTEST = 0.05;
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

/** A flame's flicker, the one every light in the game flickers by (../sky/flicker.ts). */
export { flicker };

/** The seed a carried light flickers by, on land and under ground: no place's. */
export const CARRIED_SEED = 4095;

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
    const shown = lit * flicker(CARRIED_SEED, seconds, held.flicker);
    const hand = fromEye([carried.feet[0], carried.feet[1], carried.feet[2] + HAND_M]);
    lamps.push({ fromEye: hand, reachM: held.reachM, light: held.light.map((part) => part * shown) as Rgb });
  }
  const room = LAMPS_MOST - lamps.length;
  // Every city lamp weighed each frame, only the few nearest kept: one past the room, the first left out.
  ranked.clear();
  for (let index = 0; index < places.length; index++) {
    const { at, reachM, light } = places[index] as LampPlace;
    if (Math.max(...light) < FAINTEST) continue;
    ranked.offer(index, Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]) - reachM);
  }
  // A lamp near the cut fades by how far it leads the first left out, so none switches on or off as the eye moves.
  const cut = ranked.count > room ? (ranked.away[room] ?? Infinity) : Infinity;
  for (let nth = 0; nth < Math.min(room, ranked.count); nth++) {
    const place = places[ranked.order[nth] ?? 0] as LampPlace;
    // As the shader takes it, a float32, so a glow moving with this lamp moves as its light does.
    const motion = Math.fround(motionCode(place.motion ?? 'fire', place.seed));
    const shown = lit * lightMotion(motion, seconds) * Math.min(1, (cut - (ranked.away[nth] ?? 0)) / CUT_FADE_M);
    lamps.push({
      fromEye: fromEye(place.at),
      reachM: place.reachM,
      light: place.light.map((part) => part * shown) as Rgb,
      motion,
    });
  }
  return lamps;
}

type Rgb = [number, number, number];

/** The places nearest the eye past their reach, as many as are lit and the first left out. */
const ranked = new Nearest(LAMPS_MOST + 1);

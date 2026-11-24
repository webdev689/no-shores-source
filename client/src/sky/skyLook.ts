import type { SkyReading } from './skyLaw.ts';
import type { SkyLook } from './skyUniform.ts';

type Colour = readonly [number, number, number];

const mix = (from: Colour, to: Colour, share: number): Colour => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];
const scale = (colour: Colour, factor: number): Colour => [colour[0] * factor, colour[1] * factor, colour[2] * factor];
const add = (first: Colour, second: Colour): Colour => [
  first[0] + second[0],
  first[1] + second[1],
  first[2] + second[2],
];
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
/** WGSL's smoothstep, for the TypeScript that mirrors the sky's shaders. */
export const smooth = (low: number, high: number, value: number): number => {
  const share = clamp01((value - low) / (high - low));
  return share * share * (3 - 2 * share);
};
const luminance = (colour: Colour): number => 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];

/** The sun's light above the air, and how much of each colour the air takes per air mass: red least, blue most. */
const SUN_ABOVE: Colour = [1.08, 1.06, 1.04];
const AIR_TAKES: Colour = [0.04, 0.085, 0.2];
/**
 * The clear sky's zenith and horizon at four heights of the sun: by night (18 degrees under), at the end of civil
 * twilight (6 under, still a blue sky), with the sun on the horizon (the glow toward it is the shader's) and by day.
 */
const NIGHT_ZENITH: Colour = [0.016, 0.03, 0.085];
const NIGHT_HORIZON: Colour = [0.03, 0.055, 0.12];
const CIVIL_ZENITH: Colour = [0.05, 0.11, 0.28];
const CIVIL_HORIZON: Colour = [0.15, 0.22, 0.38];
const SET_ZENITH: Colour = [0.17, 0.29, 0.56];
const SET_HORIZON: Colour = [0.48, 0.6, 0.76];
const DAY_ZENITH: Colour = [0.2, 0.42, 0.8];
const DAY_HORIZON: Colour = [0.7, 0.81, 0.92];
const NIGHT_SUN = -0.31;
const CIVIL_SUN = -0.105;
const DAY_SUN = 0.3;
/** A whole deck's grey by day, a storm's under it, and sand's tan in the air. */
const OVERCAST: Colour = [0.6, 0.63, 0.66];
const STORM: Colour = [0.16, 0.18, 0.22];
const SAND_AIR: Colour = [0.78, 0.62, 0.42];
/** Moonlight at a full moon high in a clear sky, what it adds to the sky's blue, and the night's least light, so a
 *  moonless night still shows shapes. */
const FULL_MOON: Colour = [0.2, 0.24, 0.34];
const MOON_SKY: Colour = [0.035, 0.055, 0.1];
const NIGHT_FLOOR: Colour = [0.06, 0.07, 0.1];
/** The clouds' drift on their plane, cells a second at a steering flow of 30 m/s, and where their pattern repeats. */
const DRIFT_CELLS_S = 0.004;
const DRIFT_WRAP = 1024;
/** A cloud pattern is carried only from the start of its spell, world seconds, so a steering flow that changes from one
 *  latitude to the next never sets it racing; over the spell's last share the next pattern fades in. */
const CLOUD_SPELL_S = 600;
const CLOUD_FADE = 0.25;

/** The clouds' two patterns on their plane, in noise cells: the spell's now and the next, each carried from its own
 *  spell's start and set apart by a whole number of cells, and how far the next has faded in. */
export function cloudDrift(steeringMS: number, worldS: number): Pick<SkyLook, 'drift' | 'driftNext' | 'driftFade'> {
  const spells = worldS / CLOUD_SPELL_S;
  const index = Math.floor(spells);
  const placed = (spell: number): [number, number] => [
    (steeringMS / 30) * DRIFT_CELLS_S * (worldS - spell * CLOUD_SPELL_S),
    (((spell * 157) % DRIFT_WRAP) + DRIFT_WRAP) % DRIFT_WRAP,
  ];
  return { drift: placed(index), driftNext: placed(index + 1), driftFade: smooth(1 - CLOUD_FADE, 1, spells - index) };
}
/** The sun's height (its sine) where its light is gone and the key passes to the moon, and where the moon's is whole. */
const SUN_GONE = -0.03;
const MOON_KEYED = -0.08;
/** The fog's density, per metre, in a thick bank, a heavy fall and a sandstorm. */
export const FOG_BANK = 0.004;
const FALL_HAZE = 0.0012;
const SAND_HAZE = 0.006;

/** A clear sky's colour at a height of the sun (its sine), from the four stages. */
function clearSky(up: number, night: Colour, civil: Colour, set: Colour, day: Colour): Colour {
  if (up < CIVIL_SUN) return mix(night, civil, smooth(NIGHT_SUN, CIVIL_SUN, up));
  if (up < 0) return mix(civil, set, smooth(CIVIL_SUN, 0, up));
  return mix(set, day, smooth(0, DAY_SUN, up));
}

/** The air mass the sun's light crosses at a height whose sine is `up` (Kasten and Young's), held finite at the horizon. */
function airMass(up: number): number {
  const degrees = (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;
  return 1 / (Math.max(up, 0) + 0.50572 * Math.pow(Math.max(degrees, 0) + 6.07995, -1.6364));
}

/** The sun's light at the ground in a clear sky: whiter overhead, gold low down, nothing once it has set. */
export function sunLight(up: number): Colour {
  const mass = airMass(up);
  const through: Colour = [
    SUN_ABOVE[0] * Math.exp(-AIR_TAKES[0] * mass),
    SUN_ABOVE[1] * Math.exp(-AIR_TAKES[1] * mass),
    SUN_ABOVE[2] * Math.exp(-AIR_TAKES[2] * mass),
  ];
  return scale(through, smooth(-0.03, 0.03, up));
}

/**
 * How the sky looks for a reading: the sun's light by its height and the cloud over it; the moon's by its phase; the
 * sky's colours from day through twilight to night, greyed under cloud and darkened in a storm; the light from above
 * and below; the fog; and the clouds' drift, carried by the steering flow through world time, so it is the same in
 * every browser (cloudDrift). `flash` is lightning's, 0 to 1.
 */
export function lookOf(reading: SkyReading, worldS: number, flash: number): SkyLook {
  const { sun, moon, cloud, storm, fog, sand, falling, daylight } = reading;
  const cover = clamp01(cloud);
  const dimmed = (1 - 0.72 * cover * cover) * (1 - 0.45 * storm) * (1 - 0.6 * fog) * (1 - 0.5 * sand);
  const sunAtGround = scale(sunLight(sun[2]), dimmed);
  const moonUp = smooth(-0.05, 0.25, moon[2]);
  const moonShown = reading.moonLit * moonUp * (1 - daylight);
  const moonAtGround = scale(FULL_MOON, moonShown * (1 - 0.85 * cover));
  // The key light is the sun until it has wholly set, then the moon, risen through the dusk from nothing: the light
  // swaps sides of the sky only while it is dark, so no shadow or lit face turns at once.
  const byMoon = sun[2] < SUN_GONE;
  const keyLight = byMoon ? scale(moonAtGround, smooth(SUN_GONE, MOON_KEYED, sun[2])) : sunAtGround;
  const key = byMoon ? moon : sun;
  const moonSky = scale(MOON_SKY, moonShown * (1 - 0.7 * cover));
  const clearZenith = add(clearSky(sun[2], NIGHT_ZENITH, CIVIL_ZENITH, SET_ZENITH, DAY_ZENITH), moonSky);
  const clearHorizon = add(clearSky(sun[2], NIGHT_HORIZON, CIVIL_HORIZON, SET_HORIZON, DAY_HORIZON), moonSky);
  // A deck is as bright as the clear sky above it would be, a little of that sky's blue showing through.
  const skyLight = Math.max(luminance(clearHorizon) / luminance(DAY_HORIZON), 0.05);
  const grey = add(scale(mix(OVERCAST, STORM, storm), skyLight * 0.75), scale(clearHorizon, 0.2 - 0.14 * storm));
  const greyed = Math.pow(cover, 1.5) * 0.9;
  const zenith = mix(clearZenith, scale(grey, 0.85), greyed);
  let horizon = mix(clearHorizon, grey, greyed);
  horizon = mix(horizon, scale(SAND_AIR, skyLight), sand * 0.8);
  // A flash lights the whole sky and the air under it, and so the ground it falls on and what that throws back.
  const flashed = (colour: Colour, tint: Colour, share: number) => add(colour, scale(tint, flash * share));
  // In a sandstorm the light from above comes through the dust: the sky's light is the dust's.
  const overhead = mix(zenith, horizon, sand);
  // Eased up, so twilight's ground keeps more of the day's light than its darkening zenith alone would give.
  const skyShare = Math.pow(clamp01(luminance(overhead) / luminance(DAY_ZENITH)), 0.6);
  const ambientSky = flashed(
    add(
      scale(mix(overhead, [0.36, 0.36, 0.36], 0.75), (0.35 / 0.41) * skyShare),
      add(scale(NIGHT_FLOOR, 1 - skyShare), scale(moonAtGround, 0.5)),
    ),
    [0.5, 0.52, 0.62],
    0.5,
  );
  const ambientGround = add(scale(sunAtGround, 0.12 * smooth(0, 0.2, sun[2])), scale(ambientSky, 0.7));
  const fogDensity = FOG_BANK * fog + FALL_HAZE * falling + SAND_HAZE * sand;
  const fogColour = flashed(
    mix(horizon, scale(grey, 0.95), clamp01(fog * 0.8 + falling * 0.5)),
    [0.6, 0.62, 0.75],
    0.5,
  );
  return {
    key,
    keyBright: clamp01(luminance(keyLight) / luminance(sunLight(1))),
    keyLight,
    sun,
    daylight,
    moon,
    moonLit: reading.moonLit,
    zenith: flashed(zenith, [0.55, 0.6, 0.75], 0.6),
    horizon: flashed(horizon, [0.6, 0.62, 0.75], 0.5),
    cloud: cover,
    storm,
    ambientSky,
    ambientGround,
    wetness: reading.wetness,
    snowShare: reading.snowShare,
    snowCover: reading.snowCover,
    fogColour,
    fogDensity,
    wind: reading.wind,
    gust: reading.gust,
    falling,
    sand,
    flash,
    // The stars come out as twilight ends; a bright moon washes out the faint ones.
    stars: smooth(-0.02, -0.25, sun[2]) * (1 - 0.6 * moonShown) * (1 - 0.5 * cover),
    starTurn: reading.starTurn,
    ...cloudDrift(reading.steeringMS, worldS),
    worldS,
    latitude: (reading.latitudeDeg * Math.PI) / 180,
    moonPhase: reading.moonPhase,
  };
}

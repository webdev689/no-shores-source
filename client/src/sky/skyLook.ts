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
const smooth = (low: number, high: number, value: number): number => {
  const share = clamp01((value - low) / (high - low));
  return share * share * (3 - 2 * share);
};
const luminance = (colour: Colour): number => 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];

/** The sun's light above the air, and how much of each colour the air takes per air mass: red least, blue most. */
const SUN_ABOVE: Colour = [1.08, 1.06, 1.04];
const AIR_TAKES: Colour = [0.08, 0.16, 0.36];
/** The sky by day, at twilight's start (the sun on the horizon) and by night; and the glow low toward a setting sun. */
const DAY_ZENITH: Colour = [0.2, 0.42, 0.8];
const DAY_HORIZON: Colour = [0.7, 0.81, 0.92];
const DUSK_ZENITH: Colour = [0.12, 0.2, 0.42];
const DUSK_HORIZON: Colour = [0.95, 0.58, 0.34];
const NIGHT_ZENITH: Colour = [0.006, 0.011, 0.028];
const NIGHT_HORIZON: Colour = [0.018, 0.026, 0.052];
/** A whole deck's grey by day, a storm's under it, and sand's tan in the air. */
const OVERCAST: Colour = [0.6, 0.63, 0.66];
const STORM: Colour = [0.24, 0.26, 0.3];
const SAND_AIR: Colour = [0.78, 0.62, 0.42];
/** Moonlight at a full moon high in a clear sky, and the night's least light, so a moonless night still shows shapes. */
const FULL_MOON: Colour = [0.07, 0.085, 0.13];
const STARLIGHT: Colour = [0.018, 0.022, 0.036];
/** The clouds' drift on their plane, cells a second at a steering flow of 30 m/s, and where their pattern repeats. */
const DRIFT_CELLS_S = 0.004;
const DRIFT_WRAP = 1024;
/** The fog's density, per metre, in a thick bank, a heavy fall and a sandstorm. */
const FOG_BANK = 0.004;
const FALL_HAZE = 0.0012;
const SAND_HAZE = 0.006;

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
 * every browser. `flash` is lightning's, 0 to 1.
 */
export function lookOf(reading: SkyReading, worldS: number, flash: number): SkyLook {
  const { sun, moon, cloud, storm, fog, sand, falling, daylight } = reading;
  const cover = clamp01(cloud);
  const dimmed = (1 - 0.72 * cover * cover) * (1 - 0.45 * storm) * (1 - 0.6 * fog) * (1 - 0.5 * sand);
  const sunAtGround = scale(sunLight(sun[2]), dimmed);
  const moonUp = smooth(-0.05, 0.25, moon[2]);
  const moonAtGround = scale(FULL_MOON, reading.moonLit * moonUp * (1 - 0.85 * cover) * (1 - daylight));
  // The key light is whichever body gives more: the sun by day, the moon once the sun has set.
  const sunBright = luminance(sunAtGround);
  const byMoon = sunBright < luminance(moonAtGround) || sun[2] < -0.02;
  const keyLight = byMoon ? moonAtGround : sunAtGround;
  const key = byMoon ? moon : sun;
  // Twilight runs from the sun on the horizon to 12 degrees under it.
  const twilight = smooth(-0.21, 0.0, sun[2]);
  const high = smooth(0.0, 0.35, sun[2]);
  let zenith = mix(mix(NIGHT_ZENITH, DUSK_ZENITH, twilight), DAY_ZENITH, high);
  let horizon = mix(mix(NIGHT_HORIZON, DUSK_HORIZON, twilight), DAY_HORIZON, high);
  const grey = scale(mix(OVERCAST, STORM, storm), Math.max(daylight, 0.02));
  const greyed = Math.pow(cover, 1.5) * 0.9;
  zenith = mix(zenith, scale(grey, 0.85), greyed);
  horizon = mix(horizon, grey, greyed);
  horizon = mix(horizon, scale(SAND_AIR, Math.max(daylight, 0.05)), sand * 0.8);
  const skyBright = luminance(mix(horizon, zenith, 0.6));
  const ambientSky = add(
    scale(mix(zenith, [0.36, 0.36, 0.36], 0.75), 0.35 / 0.41),
    add(STARLIGHT, scale(moonAtGround, 0.6)),
  );
  const ambientGround = add(scale(sunAtGround, 0.12 * smooth(0, 0.2, sun[2])), scale(ambientSky, 0.7));
  const fogDensity = FOG_BANK * fog + FALL_HAZE * falling + SAND_HAZE * sand;
  const fogColour = mix(horizon, scale(grey, 0.95), clamp01(fog * 0.8 + falling * 0.5));
  const steer = (reading.steeringMS / 30) * DRIFT_CELLS_S * worldS;
  const drift: [number, number] = [((steer % DRIFT_WRAP) + DRIFT_WRAP) % DRIFT_WRAP, 0];
  return {
    key,
    keyBright: clamp01(luminance(keyLight) / luminance(sunLight(1))),
    keyLight,
    sun,
    daylight,
    moon,
    moonLit: reading.moonLit,
    zenith: add(zenith, scale([0.55, 0.6, 0.75], flash * 0.6)),
    horizon: add(horizon, scale([0.6, 0.62, 0.75], flash * 0.5)),
    cloud: cover,
    storm,
    ambientSky: add(ambientSky, scale([0.5, 0.52, 0.62], flash * 0.5)),
    ambientGround,
    wetness: reading.wetness,
    snowShare: reading.snowShare,
    fogColour,
    fogDensity,
    wind: reading.wind,
    gust: reading.gust,
    falling,
    sand,
    flash,
    stars: smooth(-0.02, -0.25, sun[2]) * (1 - cover) * (skyBright < 0.2 ? 1 : 0.5),
    starTurn: reading.starTurn,
    drift,
  };
}

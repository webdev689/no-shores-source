// How every light in the game moves: a flame's flicker and a glow's breath, each in TypeScript and its WGSL twin, so a
// flame drawn, the light it casts on land, at sea or under ground, and a figure lit by it all move together. Both are
// seeded by their source: two lights never move in step, and one source's flame and light always do.

/** How many frames a second a flame is drawn at, as a figure's sprite is: its flicker holds through each. */
export const FLAME_FRAMES_PER_SECOND = 10;
/** How fast a glow breathes, radians a second: one slow swell in about seven seconds. */
export const BREATH_RATE = 0.9;

/** A seed's place in its cycle, 0 to 1: where its flame's frames turn and where its breath starts. */
export function lightPhase(seed: number): number {
  const turned = seed * 0.618034;
  return turned - Math.floor(turned);
}

/** The frame of its flicker a flame of `seed` shows at `seconds`: each source's frames turn at a moment of its own. */
export function flameFrame(seed: number, seconds: number): number {
  return Math.floor(seconds * FLAME_FRAMES_PER_SECOND + lightPhase(seed));
}

/** A flame's flicker at `seconds`, held through each of its frames: full at most, never below 1 - 0.2 `depth`. */
export function flicker(seed: number, seconds: number, depth = 1): number {
  const held = flameFrame(seed, seconds) / FLAME_FRAMES_PER_SECOND;
  const phase = lightPhase(seed) * 6.2832;
  const wave =
    0.5 * Math.sin(held * 7.3 + phase * 3) +
    0.3 * Math.sin(held * 13.1 + phase * 5) +
    0.2 * Math.sin(held * 23.7 + phase * 7);
  return 1 - depth * 0.1 * (1 + wave);
}

/** A glow's slow breath at `seconds`: crystal, fungus, a rune or a portal swelling to full and fading to 1 - 0.4
 *  `depth`, smoothly, not in a flame's frames. */
export function breath(seed: number, seconds: number, depth = 1): number {
  return 1 - depth * 0.2 * (1 - Math.cos(seconds * BREATH_RATE + lightPhase(seed) * 6.2832));
}

/** How a light on land moves: a fire's flicker, a lantern's shallower one behind its glass, or a stone's breath (crystal,
 *  a sunstone, a ruin's crown). */
export type LightMotion = 'fire' | 'lantern' | 'stone';
const MOTIONS: readonly LightMotion[] = ['fire', 'lantern', 'stone'];

/** A light's motion as one number a glow can take from its lamp in a shader: its kind's place (1 fire, 2 lantern,
 *  3 stone) and its seed's phase as the fraction; 0 is none. Kept off the next whole number, so a float32 keeps it. */
export function motionCode(motion: LightMotion, seed: number): number {
  return MOTIONS.indexOf(motion) + 1 + Math.min(lightPhase(seed), 0.999);
}

/** How lit a light of motion `code` is at `seconds`: as `flicker` or `breath` by its kind and its seed's phase. As
 *  `light_motion` shades it. */
export function lightMotion(code: number, seconds: number): number {
  const kind = Math.floor(code);
  const seed = (code - kind) / 0.618034;
  return kind === 3 ? breath(seed, seconds, 0.75) : flicker(seed, seconds, kind === 2 ? 0.35 : 1);
}

/** The same in WGSL: `light_flicker(seed, time, depth)`, `light_breath(seed, time, depth)` and `light_motion(code,
 *  time)`. */
export const LIGHT_MOTION_WGSL = /* wgsl */ `
fn light_phase(seed: f32) -> f32 {
  return fract(seed * 0.618034);
}

fn light_flicker(seed: f32, time: f32, depth: f32) -> f32 {
  let held = floor(time * ${FLAME_FRAMES_PER_SECOND.toFixed(1)} + light_phase(seed)) / ${FLAME_FRAMES_PER_SECOND.toFixed(1)};
  let phase = light_phase(seed) * 6.2832;
  let wave = 0.5 * sin(held * 7.3 + phase * 3.0) + 0.3 * sin(held * 13.1 + phase * 5.0) + 0.2 * sin(held * 23.7 + phase * 7.0);
  return 1.0 - depth * 0.1 * (1.0 + wave);
}

fn light_breath(seed: f32, time: f32, depth: f32) -> f32 {
  return 1.0 - depth * 0.2 * (1.0 - cos(time * ${BREATH_RATE.toFixed(3)} + light_phase(seed) * 6.2832));
}

fn light_motion(code: f32, time: f32) -> f32 {
  let kind = floor(code);
  let seed = fract(code) / 0.618034;
  let flame = light_flicker(seed, time, select(1.0, 0.35, kind == 2.0));
  return select(flame, light_breath(seed, time, 0.75), kind == 3.0);
}
`;

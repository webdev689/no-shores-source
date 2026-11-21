// The Lattice's crystal as every shader draws it: the city's solids where a module wears it, and the public events'
// props. Red where the sun reaches it, graded to purple in its shadows, a sharp glint off each flat facet the sun
// catches, and its core glowing through it, more where a face is seen straight on (the eye looking into it) and more
// as the night falls. Where it glows brightest it also gives light into the light layer (`CRYSTAL_HOT`).

/** Its colour lit, in its shadows, and its core's glow, linear. */
export const CRYSTAL = {
  red: [0.55, 0.035, 0.05],
  shadow: [0.2, 0.03, 0.3],
  core: [1.5, 0.13, 0.1],
} as const;

/** The light its brightest core gives into the light layer: hot enough that a core at full glow passes the layer's
 *  brightness (lightLayer.ts LIGHT.from), and red once cut. */
export const CRYSTAL_HOT = [2.6, 0.75, 0.6] as const;

/** The light its glow throws round it at night (a lamp's), linear. */
export const CRYSTAL_LAMP = [1.0, 0.16, 0.12] as const;

const vec = (colour: readonly number[]) => `vec3f(${colour.map((part) => part.toFixed(3)).join(', ')})`;

/** `crystal_colour`: the crystal at a point measured from the eye, facing `normal`, `sun` of the sun reaching it (the
 *  shadow map's share), its core's `glow` (0 dark to its depths, 1 alight). Reads the sky's uniform (SKY_WGSL). */
export const CRYSTAL_WGSL = /* wgsl */ `
fn crystal_colour(normal: vec3f, from_eye: vec3f, glow: f32, sun: f32) -> vec3f {
  let facing = normalize(normal);
  let toward_eye = -normalize(from_eye);
  let direct = max(dot(facing, sky_state.key.xyz), 0.0) * sun;
  // Red in the sun, purple in its shadows; the deep crystal at a shard's root darker than its lit point.
  let body = mix(${vec(CRYSTAL.shadow)}, ${vec(CRYSTAL.red)}, clamp(direct * 1.8, 0.0, 1.0)) * mix(0.4, 1.0, sqrt(glow));
  let light = sky_ambient(facing) + sky_direct(facing, sun) * 1.6 + sky_lamps(from_eye, facing);
  // Each facet is flat: one turned to mirror the sun to the eye flashes.
  let glint = pow(max(dot(reflect(-toward_eye, facing), sky_state.key.xyz), 0.0), 40.0) * sun;
  let into = clamp(dot(facing, toward_eye), 0.0, 1.0);
  // By day the sun shows the body and its facets, the core only a light within; by night the core burns.
  let core = glow * (0.15 + 0.85 * into * into) * mix(1.6, 0.35, sky_state.sun.w);
  return body * light + sky_state.key_light.rgb * glint * 1.4 + ${vec(CRYSTAL.core)} * core;
}
`;

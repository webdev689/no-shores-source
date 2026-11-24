// How the game lights a Lattice figure's picture (figureView.ts), in WGSL and as the same sums here for the tests.
// The forge renders the Lattice bright, its crystal lit from within, so drawn as a man is drawn they would stand out
// of the light round them: their whole figure is shaded a share darker than a man's, and only the crystal's bright,
// strongly hued points (its shards' tips and veins) glow of themselves, never lit below a floor, at night too.

/** The light a Lattice figure takes as a share of a man's; how bright and how strongly hued a texel must be to be
 *  its crystal's glowing point; and the least light such a point shows at. */
export const LATTICE_SHADE = { body: 0.78, glowBrightest: 0.72, glowChroma: 0.4, glowFloor: 0.7 } as const;

type Rgb = readonly [number, number, number];

/** The light a Lattice figure's texel `texel` is drawn in, where a man's would be drawn in `light`. */
export function latticeLit(texel: Rgb, light: Rgb): Rgb {
  const brightest = Math.max(...texel);
  const glows = brightest > LATTICE_SHADE.glowBrightest && brightest - Math.min(...texel) > LATTICE_SHADE.glowChroma;
  const [red, green, blue] = light.map((part) =>
    glows ? Math.max(part, LATTICE_SHADE.glowFloor) : part * LATTICE_SHADE.body,
  );
  return [red ?? 0, green ?? 0, blue ?? 0];
}

/** `latticeLit` in WGSL. */
export const LATTICE_SHADE_WGSL = /* wgsl */ `
fn lattice_lit(texel: vec3f, light: vec3f) -> vec3f {
  let brightest = max(texel.r, max(texel.g, texel.b));
  let chroma = brightest - min(texel.r, min(texel.g, texel.b));
  if (brightest > ${LATTICE_SHADE.glowBrightest} && chroma > ${LATTICE_SHADE.glowChroma}) {
    return max(light, vec3f(${LATTICE_SHADE.glowFloor}));
  }
  return light * ${LATTICE_SHADE.body};
}
`;

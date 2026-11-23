// How a billboard (a puff of smoke, a sea fight's puff) fades as the eye comes to it: a flat picture facing the eye
// shows as a sheet across the whole view when the eye stands in or against it, so it fades softly to nothing over
// the last couple of metres to its near side. The same in the shaders (`NEAR_FADE_WGSL`) as here.

/** Its near side's distance from the eye (metres) where it is gone, and where it is whole. */
export const NEAR_FADE_M = [0.3, 2.5] as const;

/** How much of a billboard shows with its near side `metres` from the eye: 0 to 1, eased. */
export function nearFade(metres: number): number {
  const share = Math.min(1, Math.max(0, (metres - NEAR_FADE_M[0]) / (NEAR_FADE_M[1] - NEAR_FADE_M[0])));
  return share * share * (3 - 2 * share);
}

/** `near_fade(metres)`, as `nearFade`. */
export const NEAR_FADE_WGSL = /* wgsl */ `
fn near_fade(metres: f32) -> f32 {
  return smoothstep(${NEAR_FADE_M[0].toFixed(2)}, ${NEAR_FADE_M[1].toFixed(2)}, metres);
}
`;

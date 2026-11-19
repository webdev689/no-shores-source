// A dungeon's light: no sky and no sun, each torch a warm light that flickers and fades to nothing at its reach, and
// a faint cold light everywhere so a wall past a torch still reads. The page lights the figures by the same sums the
// shader lights the walls by (`LIGHT_WGSL`).

type Colour = readonly [number, number, number];
type Torch = readonly [number, number, number, number];

/** The faint cold light everywhere, and a torch's warm light at its foot. */
export const COLD: Colour = [0.2, 0.21, 0.26];
export const WARM: Colour = [1.5, 0.95, 0.5];
/** An open portal's face, a cold bright light. */
export const PORTAL: Colour = [0.85, 0.95, 1.4];
/** A flame's own glow, as the city's braziers glow. */
export const FLAME: Colour = [1.4, 1.0, 0.5];

/** How bright a torch burns at `time`, by its number among the dungeon's: a gentle flicker, never two in step. */
export function flicker(time: number, number: number): number {
  return 0.88 + 0.07 * Math.sin(time * 9.3 + number * 2.17) + 0.05 * Math.sin(time * 15.1 + number * 4.41);
}

/** How much of a torch's light reaches `distance` metres off: all of it at the torch, none at `reach`. */
export function falloff(distance: number, reach: number): number {
  const share = Math.max(0, 1 - distance / reach);
  return share * share;
}

/** The light at a point at `time`, from the torches (x, y, z and each one's number) and the cold light: what a
 *  figure standing there is lit by. */
export function lightAt(
  torches: readonly Torch[],
  reach: number,
  point: Colour,
  time: number,
): [number, number, number] {
  const light: [number, number, number] = [...COLD];
  for (const [x, y, z, number] of torches) {
    const strength = falloff(Math.hypot(x - point[0], y - point[1], z - point[2]), reach) * flicker(time, number);
    for (let channel = 0; channel < 3; channel++)
      light[channel] = (light[channel] ?? 0) + (WARM[channel] ?? 0) * strength;
  }
  return light;
}

const vector = (colour: Colour) => `vec3f(${colour.map((value) => value.toFixed(3)).join(', ')})`;

/** The same light in WGSL: `torch_light(point, normal, time)` sums the torches the view holds, each turned by how
 *  squarely it faces the surface; the cold light comes from no way at all. */
export const LIGHT_WGSL = /* wgsl */ `
const COLD = ${vector(COLD)};
const WARM = ${vector(WARM)};
const FLAME = ${vector(FLAME)};
const PORTAL_LIGHT = ${vector(PORTAL)};

fn flicker(time: f32, number: f32) -> f32 {
  return 0.88 + 0.07 * sin(time * 9.3 + number * 2.17) + 0.05 * sin(time * 15.1 + number * 4.41);
}

fn torch_light(point: vec3f, normal: vec3f, time: f32) -> vec3f {
  var light = COLD;
  for (var index = 0u; index < u32(view.torches.x); index++) {
    let torch = torches[index];
    let towards = torch.xyz - point;
    let distance = length(towards);
    let share = max(0.0, 1.0 - distance / view.torches.y);
    // Half the light wraps round, so a face turned a little away from a torch still catches some.
    let facing = 0.5 + 0.5 * dot(normal, towards / max(distance, 1e-3));
    light += WARM * share * share * facing * flicker(time, torch.w);
  }
  return light;
}
`;

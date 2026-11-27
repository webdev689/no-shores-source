// Which windows of a lit city glow at night ([[Overlook's City Below Is Lit at Night, in Detail]]): a share of each
// district's lit as the daylight fades, each window going dark at its own hour, drawn from its own seed. The rule is
// written once here and handed to the city's shaders as WGSL, so a test reads the numbers the GPU draws by.
import { lampsLit } from '../sky/lamps.ts';

/** The districts a cell may belong to, in the order the cell table numbers them (1 on): what the city crate's
 *  `District` serialises as. Number 0 is a cell of none (an avenue, the landmark), lit as houses are. */
export const DISTRICTS = ['market', 'noble', 'temple', 'guild', 'harbour', 'residential'] as const;
export type District = (typeof DISTRICTS)[number];

/** A district's windows at night: the share lit as the dusk comes, and the hours past noon between which a lit one
 *  goes dark, each at its own (9 is nine at night, 18 the dawn, so a window going dark at 18 burns all night). The
 *  markets and the harbour keep the most lit and the latest; the noble quarter is lit well at dusk and dark early;
 *  the temples' few burn through the night. */
export const WINDOW_NIGHTS: Readonly<Record<District, { lit: number; darkFrom: number; darkTo: number }>> = {
  market: { lit: 0.62, darkFrom: 9.5, darkTo: 17 },
  noble: { lit: 0.5, darkFrom: 8.5, darkTo: 11.5 },
  temple: { lit: 0.32, darkFrom: 17.5, darkTo: 18 },
  guild: { lit: 0.42, darkFrom: 9, darkTo: 13 },
  harbour: { lit: 0.58, darkFrom: 10, darkTo: 18 },
  residential: { lit: 0.45, darkFrom: 9, darkTo: 14.5 },
};

/** A window's warm light at full, linear red, green and blue: a lamp's behind glass, brighter than a lit wall so the
 *  windows read from the sea at night. */
export const WINDOW_LIGHT = [1.6, 0.98, 0.46] as const;

/** A building's windows as the forged buildings lay them (`buildings.ts` WINDOW_M): one a storey apart along a wall,
 *  each 2 m wide over a 0.9 m sill, the run's ends kept 0.5 m clear; drawn on the far masses and hulls 1.8 m tall. */
export const WINDOW_RHYTHM = { storey: 3.2, width: 2, sill: 0.9, height: 1.8, clear: 0.5 } as const;

/** Hours past noon at a world hour (0 to 24): noon 0, midnight 12. */
export const pastNoon = (hour: number): number => (((hour + 12) % 24) + 24) % 24;

/** The district a cell's number names (0 for none: lit as houses are). */
export const districtOf = (code: number): District => DISTRICTS[code - 1] ?? 'residential';

/** Whether one window glows at `hour` under `daylight` (0 night to 1 day), by its district and its two draws (0 to 1):
 *  the first says whether it is lit tonight, the second when it goes dark. Its light is the lamps' as they come up
 *  through the dusk (`lampsLit`), so a share, not only yes or no. */
export function windowGlow(district: District, lit: number, dark: number, hour: number, daylight: number): number {
  const night = WINDOW_NIGHTS[district];
  if (lit >= night.lit) return 0;
  const goesDark = night.darkFrom + dark * (night.darkTo - night.darkFrom);
  return pastNoon(hour) < goesDark ? lampsLit(daylight) : 0;
}

/** The share of a district's windows glowing at `hour` at full night: what a far wall's windows average to. */
export function windowShare(district: District, hour: number): number {
  const night = WINDOW_NIGHTS[district];
  const span = Math.max(night.darkTo - night.darkFrom, 1e-3);
  return night.lit * Math.min(1, Math.max(0, (night.darkTo - pastNoon(hour)) / span));
}

const wgslNumber = (value: number): string => (Number.isInteger(value) ? `${value}.0` : `${value}`);

/** The rule as WGSL: `window_glow(code, lit, dark, hour, daylight)` and `window_share(code, hour)`, the district by
 *  its cell number, and `lamps_lit(daylight)` as `lampsLit` gives it. */
export const WINDOW_WGSL = /* wgsl */ `
const WINDOW_NIGHTS = array<vec3f, ${DISTRICTS.length}>(
${DISTRICTS.map((district) => {
  const { lit, darkFrom, darkTo } = WINDOW_NIGHTS[district];
  return `  vec3f(${[lit, darkFrom, darkTo].map(wgslNumber).join(', ')}),`;
}).join('\n')}
);
const WINDOW_LIGHT = vec3f(${WINDOW_LIGHT.map(wgslNumber).join(', ')});

fn lamps_lit(daylight: f32) -> f32 {
  return smoothstep(0.0, 1.0, clamp((0.6 - daylight) / 0.45, 0.0, 1.0));
}

fn past_noon(hour: f32) -> f32 {
  return ((hour + 12.0) % 24.0 + 24.0) % 24.0;
}

fn window_night(code: u32) -> vec3f {
  let number = select(code, ${DISTRICTS.indexOf('residential') + 1}u, code == 0u);
  return WINDOW_NIGHTS[min(number - 1u, ${DISTRICTS.length - 1}u)];
}

fn window_glow(code: u32, lit: f32, dark: f32, hour: f32, daylight: f32) -> f32 {
  let night = window_night(code);
  let goes_dark = night.y + dark * (night.z - night.y);
  return select(0.0, lamps_lit(daylight), lit < night.x && past_noon(hour) < goes_dark);
}

fn window_share(code: u32, hour: f32) -> f32 {
  let night = window_night(code);
  return night.x * clamp((night.z - past_noon(hour)) / max(night.z - night.y, 1e-3), 0.0, 1.0);
}
`;

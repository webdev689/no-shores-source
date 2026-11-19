// The pictures a spell leaves as it lands and as an Anima is cast: the impact star, a flame's burst, the mark over the
// foe a raven's bolt seeks, an orb's afterimage, and each Art's sigil on the ground. Each is made cell by cell in its
// element's four stops, as the spells' own pictures are, and made once for each of its steps.
import {
  BODY,
  CLEAR,
  DARK,
  HOT,
  LIGHT,
  type Sprite,
  hashOf,
  kept,
  orbSprite,
  sprite,
  stepOf,
  within,
} from './spellPixels.ts';

type Flat = readonly [number, number];

const IMPACTS = new Map<number, Sprite>();

/** A spell's impact at frame `frame` of its three: a four-ray star white-hot at its heart (17 cells), then a ring of
 *  light (25 cells), then a broken ring cooling to the element's body (31 cells); none after. */
export function impactSprite(frame: number): Sprite | null {
  if (frame < 0 || frame > 2) return null;
  return kept(IMPACTS, frame, () => {
    if (frame === 0)
      return sprite(17, 17, (across, up) => {
        const [wide, long] = [Math.min(Math.abs(across), Math.abs(up)), Math.max(Math.abs(across), Math.abs(up))];
        if (long <= 1.5) return HOT;
        if (wide === 0) return long <= 5 ? HOT : long <= 7 ? LIGHT : BODY;
        if (wide === 1 && long <= 4) return LIGHT;
        return CLEAR;
      });
    const [size, radius, stop] = frame === 1 ? [25, 11.5, LIGHT] : [31, 14.5, BODY];
    return sprite(size, size, (across, up) => {
      const apart = Math.hypot(across, up);
      if (Math.abs(apart - radius) > 0.8) return CLEAR;
      // The last ring breaks into twelve pieces.
      const piece = Math.floor(((Math.atan2(up, across) + Math.PI) / (2 * Math.PI)) * 12);
      return frame === 2 && piece % 2 ? CLEAR : stop;
    });
  });
}

/** A flame's tongue: a teardrop pointing up and leaning `lean` cells across over its height, as a polygon. */
const tongue = (base: number, lean: number, height: number, half: number): Flat[] => [
  [base - half, 0],
  [base - half * 0.6 + lean * 0.5, height * 0.55],
  [base + lean, height],
  [base + half * 0.6 + lean * 0.5, height * 0.55],
  [base + half, 0],
];
const TONGUES = [tongue(-6, -7, 22, 5), tongue(0, 0, 30, 6.5), tongue(6, 7, 22, 5)] as const;
const FLAMES = new Map<number, Sprite>();

/** A flame's burst at step `step` of its four: three tongues of fire 31 cells across rising from its foot, white-hot
 *  at their roots, thinning and cooling as it goes. Its middle is a third of the way up. */
export function flameSprite(step: number): Sprite {
  const shown = Math.min(3, Math.max(0, step));
  return kept(FLAMES, shown, () => {
    const rise = [0.7, 1, 1, 0.85][shown] ?? 1;
    return sprite(31, 31, (across, up) => {
      const [height, inside] = [
        up + 10,
        (scale: number) => TONGUES.some((polygon) => within(across / scale, (up + 10) / (scale * rise), polygon)),
      ];
      if (height < 0 || !inside(1)) return CLEAR;
      if (hashOf(shown, across, up) < [0, 0.1, 0.3, 0.55][shown]!) return CLEAR;
      if (inside(0.55) && height < 16) return shown < 2 ? HOT : LIGHT;
      if (inside(0.8)) return shown < 3 ? LIGHT : BODY;
      return shown < 3 ? BODY : DARK;
    });
  });
}

const RETICLES = new Map<number, Sprite>();

/** The mark over a foe a raven's bolt is flying at: a diamond broken open at its corners, 11 cells, its edge lit and
 *  white-hot in turn by `step`. */
export function reticleSprite(step: number): Sprite {
  const shown = step % 2;
  return kept(RETICLES, shown, () =>
    sprite(11, 11, (across, up) => {
      const apart = Math.abs(across) + Math.abs(up);
      if (apart !== 5 || across === 0 || up === 0) return apart <= 1 ? (shown ? HOT : LIGHT) : CLEAR;
      return shown ? LIGHT : HOT;
    }),
  );
}

const AFTERIMAGES = new Map<number, Sprite>();

/** An orb's afterimage at `strike`: the orb's cells on every other row, none brighter than its element's body. */
export function afterimageSprite(strike: number): Sprite {
  const orb = orbSprite(strike);
  return kept(AFTERIMAGES, Math.floor(strike) & 15, () => {
    const cells = orb.cells.map((stop, index) =>
      stop === CLEAR || Math.floor(index / orb.width) % 2 ? CLEAR : Math.min(stop, BODY),
    );
    return { ...orb, cells };
  });
}

/** A sigil is 63 cells across, each three of a figure's pixels: 3 m. Its four rings' radii, outermost first (cells). */
export const SIGIL_CELLS = 63;
const SIGIL_RINGS = [30, 23, 16, 9] as const;
/** A sigil's states past its charge: the release, then three steps fading. */
export const SIGIL_RELEASED = 5;
export const SIGIL_STATES = 9;
const SIGILS = new Map<number, Sprite>();

/** Whether a cell `across` and `up` of a sigil's middle is in its Art's own figure: Storm's eight spokes, Divine's sun
 *  and its rays, Shadow's crescent. */
function inFigure(art: number, across: number, up: number): boolean {
  const apart = Math.hypot(across, up);
  if (art === 1) {
    const angle = Math.atan2(up, across);
    const spoke = Math.abs(((((angle / (Math.PI / 4)) % 1) + 1) % 1) - 0.5) * 2;
    return apart > 9 && apart < 30 && spoke > 1 - 1.2 / apart;
  }
  if (art === 2) {
    if (apart <= 6) return true;
    const angle = Math.atan2(up, across) + Math.PI / 8;
    const ray = Math.abs(((((angle / (Math.PI / 4)) % 1) + 1) % 1) - 0.5) * 2;
    return apart > 9 && apart < 16 && ray > 1 - 1.4 / apart;
  }
  return apart <= 20 && Math.hypot(across - 7, up - 3) > 16 && apart > 9;
}

/** An Art's sigil (1 Storm, 2 Divine, 3 Shadow) in `state`: 0 to 4 its rings lit from the outside in, the newest
 *  white-hot, its figure lit with the last; SIGIL_RELEASED all of it white-hot; then three steps cooling and breaking
 *  up, the last dark. */
export function sigilSprite(art: number, state: number): Sprite {
  const shown = Math.min(SIGIL_STATES - 1, Math.max(0, state));
  return kept(SIGILS, art * 16 + shown, () => {
    const fading = shown - SIGIL_RELEASED;
    const gone = [0, 0, 0.25, 0.5][fading] ?? 0;
    const cooled = [HOT, HOT, LIGHT, BODY][fading] ?? DARK;
    return sprite(SIGIL_CELLS, SIGIL_CELLS, (across, up) => {
      const apart = Math.hypot(across, up);
      const ring = SIGIL_RINGS.findIndex((radius) => Math.abs(apart - radius) <= 0.7);
      const figure = ring < 0 && inFigure(art, across, up);
      if (ring < 0 && !figure) return CLEAR;
      if (fading > 0)
        return hashOf(art, across, up, fading) < gone ? CLEAR : figure ? Math.max(DARK, cooled - 1) : cooled;
      if (shown === SIGIL_RELEASED) return figure ? LIGHT : HOT;
      if (figure) return shown >= SIGIL_RINGS.length ? LIGHT : DARK;
      return ring < shown ? (ring === shown - 1 ? HOT : LIGHT) : DARK;
    });
  });
}

/** Which of a sigil's states it shows `ticks` into a cast's `charge` ticks (lighting a ring each quarter), or, once
 *  `released` ticks after its release (null before), the release's own two frames and its fading after, a step every
 *  four frames; past them, none. */
export function sigilState(ticks: number, charge: number, released: number | null): number | null {
  if (released === null) return 1 + stepOf(ticks / Math.max(1, charge), SIGIL_RINGS.length);
  if (released < 2) return SIGIL_RELEASED;
  const fading = SIGIL_RELEASED + 1 + Math.floor((released - 2) / 4);
  return fading < SIGIL_STATES ? fading : null;
}

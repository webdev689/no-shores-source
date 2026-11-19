// The Art's screen's picture, the screen's centre of drama as a subclass's figure is Destiny's: a scene drawn cell by
// cell in the Art's glow ramp, each cell one of its four stops or none. Storm is a stormy sky split by forked bolts that
// strike in turn; Divine a sun rising with wings of flame, embers drifting off it; Shadow a starfield round a crescent
// holding a raven's eye, stars lighting in crosses. The still cells are worked out once for an Art and a size; each step
// lays the moving ones over them, a few steps a second, so the menu's frames pay next to nothing. The scene fades out
// toward the left in a dither, where the screen's words and tiles stand.

import { GLOW_RAMPS, type GlowElement } from '../elementGlow.ts';

/** How long a step lasts (ms), how many steps run before the scene repeats, and the step shown with less motion. */
export const SCENE_STEP_MS = 160;
export const SCENE_STEPS = 48;
export const STILL_STEP = 1;

/** A cell's tone: 0 none, else a stop of the Art's ramp from its dark (1) to white-hot (4). */
export type Tone = 0 | 1 | 2 | 3 | 4;

/** A scene for an Art at a size: its cells across and down, the still cells, which cells the fade keeps, and how to lay
 *  a step's moving cells over them. */
export interface Scene {
  readonly cols: number;
  readonly rows: number;
  readonly still: Uint8Array;
  readonly kept: Uint8Array;
  readonly moving: (put: Put, step: number) => void;
}

/** Lays a tone on a cell; outside the scene, or where the fade leaves none, nothing. */
type Put = (x: number, y: number, tone: Tone) => void;
type Point = readonly [number, number];

/** The step shown `millis` milliseconds into the scene, or the still one. */
export function sceneStep(millis: number, still: boolean): number {
  return still ? STILL_STEP : Math.floor(Math.max(0, millis) / SCENE_STEP_MS) % SCENE_STEPS;
}

/** A whole number from 0 to 1 at a cell, the same for the same seed. */
function hash(x: number, y: number, seed: number): number {
  let mixed = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 1103515245);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise from 0 to 1, repeating every `wrap` lattice rows down, so a scroll of whole rows loops. */
function noise(x: number, y: number, seed: number, wrap = 1 << 20): number {
  const [left, top] = [Math.floor(x), Math.floor(y)];
  const [across, down] = [x - left, y - top];
  const [easeX, easeY] = [across * across * (3 - 2 * across), down * down * (3 - 2 * down)];
  const [high, low] = [((top % wrap) + wrap) % wrap, (((top + 1) % wrap) + wrap) % wrap];
  const above = hash(left, high, seed) + (hash(left + 1, high, seed) - hash(left, high, seed)) * easeX;
  const below = hash(left, low, seed) + (hash(left + 1, low, seed) - hash(left, low, seed)) * easeX;
  return above + (below - above) * easeY;
}

/** Two octaves of noise. */
const clouds = (x: number, y: number, seed: number) => noise(x, y, seed) * 0.65 + noise(x * 2, y * 2, seed + 7) * 0.35;

/** A share of the 4 × 4 ordered dither: a cell is kept where its share is under the amount wanted. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number) => ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;

/** A run of numbers from a seed, each from 0 to 1. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
/** A loop of the scene as a turn: a sway that comes back to where it began. */
const turn = (step: number, times: number, phase = 0) => Math.sin((step / SCENE_STEPS) * Math.PI * 2 * times + phase);

/** What each Art's scene is built from: the still cells laid by `lay`, the size of its middle, and its moving cells. */
interface Builder {
  readonly lay: (put: Put) => void;
  readonly moving: (put: Put, step: number) => void;
}
type Make = (cols: number, rows: number, focus: Point, size: number) => Builder;

/** Storm: dark clouds over a ridge, rain slanting under them, and four forked bolts striking in turn, each lighting the
 *  clouds round its root and the ground where it lands. */
const storm: Make = (cols, rows, [focusX, focusY], size) => {
  const base = Math.round(focusY - size * 0.05);
  const ridge = Int16Array.from({ length: cols }, (unused, x) =>
    Math.round(rows * 0.9 + (noise(x / 12, 0, 3) - 0.5) * 14 + noise(x / 4, 0, 4) * 3),
  );
  const ground = (x: number) => ridge[clamp(x, 0, cols - 1)] ?? rows;
  const cloud = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      cloud[y * cols + x] = clouds(x / 13, y / 7, 11) * 0.66 + clamp((base - y) / (size * 1.2) + 0.42) * 0.6;
  const cloudAt = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : (cloud[y * cols + x] ?? 0));
  const random = seeded(29);
  // The first is the scene's own, at its middle and the widest; the rest strike round it in turn.
  const bolts = [0.1, -0.95, 0.85, -0.4, 0.55].map((offset, nth) => {
    let x = Math.round(focusX + offset * size);
    // Each bolt leaves from inside the clouds over where it strikes.
    let y = base;
    while (y > 0 && cloudAt(x, y) <= 0.86) y--;
    y = Math.max(0, y - 3);
    const trunk: Point[] = [];
    const branches: Point[][] = [];
    let way = random() < 0.5 ? -1 : 1;
    while (y < ground(x)) {
      trunk.push([x, y]);
      const roll = random();
      if (roll < 0.14) way = -way;
      else if (roll < 0.26) trunk.push([(x += way), y]);
      if (random() < 0.4) x += way;
      if (y > base && branches.length < 4 && random() < 0.08) {
        const branch: Point[] = [];
        const out = -way;
        let [branchX, branchY] = [x, y];
        const long = 6 + Math.floor(random() * size * 0.55);
        for (let along = 0; along < long; along++) {
          branch.push([branchX, branchY++]);
          if (random() < 0.6) branch.push([(branchX += out), branchY]);
        }
        branches.push(branch);
      }
      y++;
    }
    return { trunk, branches, main: nth === 0, begins: [0, 10, 19, 29, 38][nth] ?? 0 };
  });
  const drops = Array.from({ length: Math.round(cols * 0.35) }, () => ({
    x: Math.floor(random() * cols * 1.3),
    start: random(),
    pace: 1 + Math.floor(random() * 2),
  }));
  /** The clouds round a bolt's root lit by its flash: brightest near, fading out in a dither. */
  const flash = (put: Put, [rootX, rootY]: Point, reach: number) => {
    for (let y = Math.max(0, Math.round(rootY - reach * 0.8)); y <= base + 4; y++)
      for (let x = Math.round(rootX - reach); x <= rootX + reach; x++) {
        const far = Math.hypot(x - rootX, (y - rootY) * 1.4) / reach;
        if (far > 1 || cloudAt(x, y) <= 0.86 || dither(x, y) > 1.15 - far) continue;
        put(x, y, far < 0.35 ? 3 : 2);
      }
  };
  return {
    lay(put) {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const here = cloudAt(x, y);
          const near = 1 - Math.abs(x - focusX) / (size * 2.6);
          if (y >= ground(x)) put(x, y, y === ground(x) && dither(x, y) < near * 0.5 ? 2 : 1);
          else if (here > 0.86) {
            // The clouds' bellies catch the light over the scene's middle.
            const belly = cloudAt(x, y + 1) <= 0.86 && near > 0.3;
            put(x, y, belly ? 2 : 1);
          } else if (here > 0.8 && dither(x, y) < 0.5) put(x, y, 1);
        }
    },
    moving(put, step) {
      const span = Math.max(1, rows * 0.9 - base);
      for (const drop of drops) {
        const fall = (drop.start * span + (step * drop.pace * span) / SCENE_STEPS) % span;
        const [x, y] = [Math.round(drop.x - fall / 3), Math.round(base + fall)];
        if (y + 1 < ground(x) && cloudAt(x, y) < 0.86) [put(x, y, drop.pace === 2 ? 2 : 1), put(x - 1, y + 1, 1)];
      }
      for (const bolt of bolts) {
        const since = (step - bolt.begins + SCENE_STEPS) % SCENE_STEPS;
        // A strike, a fade, a second strike and its afterglow, as lightning flickers; the scene's own holds longer.
        const flicker = bolt.main ? ([4, 4, 3, 0, 4, 4, 3, 2, 2, 1] as const) : ([4, 3, 0, 4, 2, 1] as const);
        const core = flicker[since] ?? 0;
        if (core === 0) continue;
        const lit = core === 4;
        const root = bolt.trunk[0] ?? [0, 0];
        if (lit || since === 1) flash(put, root, size * (bolt.main ? 1.7 : 1.1) * (lit ? 1 : 0.6));
        const wide = bolt.main ? 2 : 1;
        for (const [x, y] of bolt.trunk) {
          if (lit && bolt.main)
            for (const off of [-3, -2, wide + 1, wide + 2]) if (dither(x + off, y) < 0.5) put(x + off, y, 2);
          if (lit) [put(x - 1, y, 3), put(x + wide, y, 3)];
          for (let across = 0; across < wide; across++) put(x + across, y, core);
        }
        for (const branch of bolt.branches) for (const [x, y] of branch) if (core > 1) put(x, y, (core - 1) as Tone);
        const [endX, endY] = bolt.trunk[bolt.trunk.length - 1] ?? [0, 0];
        if (!lit) continue;
        const splash = bolt.main ? 1.5 : 1;
        for (let y = endY - 5; y <= endY + 2; y++)
          for (let x = endX - 9; x <= endX + 9; x++) {
            const far = Math.hypot(x - endX, (y - endY) * 1.6) / splash;
            if (far < 2.2) put(x, y, 4);
            else if (far < 4.5 && dither(x, y) < 0.7) put(x, y, 3);
            else if (far < 6.5 && dither(x, y) < 0.35) put(x, y, 2);
          }
        const lights = size * 0.8 * splash;
        for (let x = Math.round(endX - lights); x <= endX + lights; x++)
          if (dither(x, 1) < 1.1 - Math.abs(x - endX) / lights) [put(x, ground(x), 2), put(x, ground(x) + 1, 1)];
      }
    },
  };
};

/** Divine: a sun rising over a sea, its rays turning, two wings of flame flickering from its flanks, embers drifting up,
 *  and its light broken on the water. */
const divine: Make = (cols, rows, [focusX, focusY], size) => {
  const horizon = Math.round(focusY + size * 0.5);
  const radius = size * 0.5;
  const sunY = horizon - radius * 0.62;
  // Each wing cell's heat, hottest at the root and along each feather's middle.
  const heat = new Map<number, number>();
  for (const side of [-1, 1])
    for (let feather = 0; feather < 6; feather++) {
      const angle = ((8 + feather * 11) * Math.PI) / 180;
      const long = size * (2.3 - feather * 0.26);
      const [rootX, rootY] = [focusX + side * radius * 0.7, sunY + radius * 0.15];
      for (let along = 0; along <= 1; along += 0.5 / long) {
        const x = rootX + side * Math.cos(angle) * along * long;
        const y = rootY - Math.sin(angle) * along * long - 0.18 * long * along * along;
        const wide = (1 - along) * size * 0.15 + 1;
        for (let down = Math.floor(y - wide); down <= y + wide; down++)
          for (let across = Math.floor(x - wide); across <= x + wide; across++) {
            const off = Math.hypot(across - x, down - y) / wide;
            if (off > 1 || down >= horizon) continue;
            const key = down * cols + across;
            heat.set(key, Math.max(heat.get(key) ?? 0, (1 - along) * 0.7 + (1 - off) * 0.3));
          }
      }
    }
  const random = seeded(53);
  const embers = Array.from({ length: 64 }, () => ({
    x: focusX + (random() - 0.5) * size * 5,
    start: random(),
    pace: 1 + Math.floor(random() * 2),
    phase: random() * Math.PI * 2,
    hot: random() < 0.4,
  }));
  const sun = (put: Put, rise: number) => {
    const middleY = sunY - rise;
    for (let y = Math.floor(middleY - radius * 1.2); y < horizon; y++)
      for (let x = Math.floor(focusX - radius * 1.2); x <= focusX + radius * 1.2; x++) {
        const far = Math.hypot(x + 0.5 - focusX, y + 0.5 - middleY) / radius;
        if (far < 0.55) put(x, y, 4);
        else if (far < 0.8) put(x, y, far < 0.72 || dither(x, y) < 0.5 ? 4 : 3);
        else if (far < 1) put(x, y, far < 0.92 || dither(x, y) < 0.5 ? 3 : 2);
        else if (far < 1.18 && dither(x, y) < 0.5 * (1.18 - far) * 5.5) put(x, y, 2);
      }
  };
  return {
    lay(put) {
      for (let y = horizon; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const deep = (y - horizon) / Math.max(1, rows - horizon);
          if (y === horizon) put(x, y, Math.abs(x - focusX) < size * 1.6 ? 2 : 1);
          else if (dither(x, y) < 0.06 + deep * 0.3 || clouds(x / 10, y / 2, 61) > 0.68) put(x, y, 1);
        }
    },
    moving(put, step) {
      for (let ray = 0; ray < 12; ray++) {
        const angle = ((ray * 30 + (Math.floor(step / 2) % 4) * 7.5) * Math.PI) / 180;
        const reach = radius * (ray % 2 === 0 ? 2.3 : 1.75);
        for (let far = radius * 1.25; far < reach; far += 0.5) {
          const [x, y] = [Math.round(focusX + Math.cos(angle) * far), Math.round(sunY - Math.sin(angle) * far)];
          if (y < horizon && dither(x, y) < 1.2 - (far - radius) / (reach - radius))
            put(x, y, far < radius * 1.6 ? 2 : 1);
        }
      }
      // Flames climb: the noise is scrolled up a whole loop of its rows each time round.
      for (const [key, hot] of heat) {
        const [x, y] = [key % cols, Math.floor(key / cols)];
        const flicker = noise(x * 0.3, y * 0.3 + (step * 32) / SCENE_STEPS, 71, 32);
        const value = hot + (flicker - 0.5) * 0.55;
        if (value > 0.8) put(x, y, 3);
        else if (value > 0.55) put(x, y, 2);
        else if (value > 0.36) put(x, y, 1);
      }
      sun(put, Math.round(turn(step, 1) + 1));
      const span = Math.max(1, horizon - size * 0.2);
      for (const ember of embers) {
        const climb = (ember.start * span + (step * ember.pace * span) / SCENE_STEPS) % span;
        const x = Math.round(ember.x + turn(step, 2, ember.phase) * 1.5);
        const y = Math.round(horizon - 1 - climb);
        put(x, y, ember.hot ? 4 : 3);
        put(x, y + 1, 2);
      }
      for (let y = horizon + 1; y < rows; y++) {
        const down = (y - horizon) / Math.max(1, rows - horizon);
        const wide = radius * 0.8 * (1 - down * 0.6);
        for (let x = Math.floor(focusX - wide); x <= focusX + wide; x++)
          if (y % 2 === 1 && hash(Math.floor(x / 3), y, Math.floor(step / 2) % 24) > 0.5 + down * 0.3)
            put(x, y, y - horizon < 4 ? 3 : 2);
      }
    },
  };
};

/** Shadow: stars and a dusky nebula round a crescent, the rest of its disc faint, a raven's eye glowing in its hollow
 *  that looks about and blinks; stars light in crosses one after another. */
/** The step the raven's eye begins to blink at. */
const BLINK = 31;

const shadow: Make = (cols, rows, [focusX, focusY], size) => {
  const radius = size * 0.66;
  const hollow: Point = [focusX + radius * 0.38, focusY - radius * 0.2];
  const inMoon = (x: number, y: number) => Math.hypot(x + 0.5 - focusX, y + 0.5 - focusY) < radius;
  const inHollow = (x: number, y: number) => Math.hypot(x + 0.5 - hollow[0], y + 0.5 - hollow[1]) < radius * 0.88;
  const random = seeded(97);
  const crosses = Array.from({ length: 14 }, (unused, nth) => {
    let place: Point = [0, 0];
    do place = [Math.round(focusX + (random() - 0.5) * size * 5), Math.round(random() * rows * 0.9)];
    while (inMoon(place[0], place[1]));
    return { place, begins: Math.round((nth * SCENE_STEPS) / 14) };
  });
  const eye: Point = [focusX + radius * 0.16, focusY - radius * 0.1];
  return {
    lay(put) {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          if (inMoon(x, y)) {
            const edge = radius - Math.hypot(x + 0.5 - focusX, y + 0.5 - focusY);
            const inner = Math.hypot(x + 0.5 - hollow[0], y + 0.5 - hollow[1]) - radius * 0.88;
            if (inner < 0) {
              if (dither(x, y) < 0.22) put(x, y, 1);
            } else if (edge < 1.2) put(x, y, 4);
            else if (inner < 1.5) put(x, y, dither(x, y) < 0.5 ? 2 : 1);
            else put(x, y, edge < 3.5 || dither(x, y) < 0.3 ? 3 : 2);
            continue;
          }
          const near = clamp(1 - Math.hypot(x - focusX, (y - focusY) * 1.4) / (size * 3.2));
          const dust = clouds(x / 20, y / 11, 41) * near;
          if (dust > 0.32 && dither(x, y) < (dust - 0.32) * 3.5) put(x, y, dust > 0.5 && dither(x, y) < 0.25 ? 2 : 1);
          const star = hash(x, y, 5);
          if (star < 0.011) put(x, y, star < 0.0012 ? 4 : star < 0.004 ? 3 : 2);
        }
    },
    moving(put, step) {
      for (const { place, begins } of crosses) {
        const since = (step - begins + SCENE_STEPS) % SCENE_STEPS;
        const arms = ([[3], [4, 3], [4, 3, 2], [4, 3, 2, 1], [3, 2], [2]] as const)[since];
        if (!arms) continue;
        const [x, y] = place;
        arms.forEach((tone, far) => {
          if (far === 0) return put(x, y, tone);
          for (const [across, down] of [
            [far, 0],
            [-far, 0],
            [0, far],
            [0, -far],
          ] as const)
            put(x + across, y + down, tone);
        });
      }
      // The eye: its lids close and open once a loop, and it glances left and right.
      const open = ([0.5, 0, 0.5] as const)[step - BLINK] ?? 1;
      const [wide, tall] = [radius * 0.36, radius * 0.15 * open];
      const look = Math.round(turn(step, 2) * 1.4);
      const [eyeX, eyeY] = eye;
      for (let y = Math.floor(eyeY - radius * 0.2); y <= eyeY + radius * 0.2; y++)
        for (let x = Math.floor(eyeX - wide - 1); x <= eyeX + wide + 1; x++) {
          const across = (x + 0.5 - eyeX) / wide;
          const lid = tall * (1 - across * across);
          const down = Math.abs(y + 0.5 - eyeY);
          if (Math.abs(across) > 1 || !inHollow(x, y)) continue;
          if (open === 0) {
            if (down < 0.75) put(x, y, 3);
          } else if (Math.abs(down - lid) < 0.75) put(x, y, 3);
          else if (down < lid) {
            const bead = Math.hypot(x + 0.5 - eyeX - look, y + 0.5 - eyeY) / (radius * 0.14);
            put(x, y, bead < 0.45 ? 4 : bead < 1 ? 3 : 1);
          }
        }
    },
  };
};

const MAKERS: Readonly<Record<string, Make>> = { storm, divine, shadow };

/** The scene for the Art keyed `art` (storm, divine, shadow) in `cols` by `rows` cells, its middle at `focusX`
 *  across; an Art without one is empty. */
export function sceneOf(art: string, cols: number, rows: number, focusX: number): Scene {
  const [across, down] = [Math.max(0, Math.floor(cols)), Math.max(0, Math.floor(rows))];
  const size = Math.max(8, Math.min(down * 0.34, across * 0.26));
  const focus: Point = [Math.round(focusX), Math.round(down * 0.42)];
  const kept = new Uint8Array(across * down);
  // Gone left of the scene's middle by 3.2 of its sizes, whole from 1.2 sizes in, in a dither between.
  for (let y = 0; y < down; y++)
    for (let x = 0; x < across; x++)
      kept[y * across + x] = dither(x, y) < (x - (focus[0] - size * 3.2)) / (size * 2) ? 1 : 0;
  const still = new Uint8Array(across * down);
  const builder = MAKERS[art]?.(across, down, focus, size);
  const putInto =
    (cells: Uint8Array): Put =>
    (x, y, tone) => {
      const cell = y * across + x;
      if (x >= 0 && y >= 0 && x < across && y < down && kept[cell]) cells[cell] = tone;
    };
  builder?.lay(putInto(still));
  return { cols: across, rows: down, still, kept, moving: builder?.moving ?? (() => undefined) };
}

/** The scene's tones at `step`: its still cells with the step's moving cells laid over them. */
export function sceneFrame(scene: Scene, step: number, out = new Uint8Array(scene.still.length)): Uint8Array {
  out.set(scene.still);
  const { cols, rows, kept } = scene;
  scene.moving(
    (x, y, tone) => {
      const [across, down] = [Math.round(x), Math.round(y)];
      const cell = down * cols + across;
      if (across >= 0 && down >= 0 && across < cols && down < rows && kept[cell]) out[cell] = tone;
    },
    ((step % SCENE_STEPS) + SCENE_STEPS) % SCENE_STEPS,
  );
  return out;
}

/** Paints tones into RGBA in `element`'s ramp: none clear, each stop opaque. */
export function paintScene(tones: Uint8Array, element: GlowElement, out: Uint8ClampedArray): void {
  const ramp = GLOW_RAMPS[element];
  for (let cell = 0; cell < tones.length; cell++) {
    const stop = ramp[(tones[cell] ?? 0) - 1];
    const start = cell * 4;
    if (!stop) {
      out[start + 3] = 0;
      continue;
    }
    [out[start], out[start + 1], out[start + 2], out[start + 3]] = [stop[0] * 255, stop[1] * 255, stop[2] * 255, 255];
  }
}

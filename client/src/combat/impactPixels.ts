// The pictures a blow throws up where it lands, made cell by cell as the spells' are: stars, rings, slashes, flames,
// forks and glyphs in four hard stops of a ramp, laid upright to the eye or flat on the ground as mark vertices. Each
// shape is made once for its inputs and kept, so a frame only lays what it already has.
import { GLOW_RAMPS, type GlowLook, type Rgb } from '../elementGlow.ts';
import { RAMP, swingRampColour } from './swingLook.ts';
import { BODY, CELL_M, CLEAR, DARK, HOT, LIGHT, type Sprite, hashOf, sprite, stopOf } from './spellPixels.ts';

type Point = readonly [number, number, number];
/** A ramp's four stops, dark to white-hot. */
export type Ramp = readonly [Rgb, Rgb, Rgb, Rgb];

const hex = (code: string): Rgb => [
  Number.parseInt(code.slice(1, 3), 16) / 255,
  Number.parseInt(code.slice(3, 5), 16) / 255,
  Number.parseInt(code.slice(5, 7), 16) / 255,
];
const rampOf = (codes: readonly [string, string, string, string]): Ramp =>
  codes.map(hex) as unknown as readonly [Rgb, Rgb, Rgb, Rgb];
const swingRamp = (code: number): Ramp =>
  [0, 1, 2, 3].map((stop) => swingRampColour(code, stop, [1, 1, 1]) as unknown as Rgb) as unknown as Ramp;

/** Bare steel where a plain blow lands; the gold of a crit, a parry and a riposte; the dust a body throws up; and the
 *  chips a body breaks into, its darks. */
export const STEEL: Ramp = rampOf(['#2a3340', '#8fa6c8', '#cfe0ff', '#ffffff']);
export const GOLD: Ramp = swingRamp(RAMP.gold);
export const DUST: Ramp = swingRamp(RAMP.dust);
export const CHIPS: Ramp = rampOf(['#1c1712', '#3a3026', '#57493a', '#7a6852']);
/** Blaze's ash on the ground: charred black, its edge still glowing in Blaze's stops. */
export const ASH: Ramp = [hex('#16110e'), GLOW_RAMPS[1][1], GLOW_RAMPS[1][2], GLOW_RAMPS[1][3]];

/** The ramp a blow burns in: its element's, else steel. */
export const rampFor = (look: GlowLook): Ramp => (look ? GLOW_RAMPS[look] : STEEL);

/** How far over the ground a flat picture lies (metres), over the marks. */
const LIFT = 0.035;
/** A picture nearer the eye than this (metres) is not laid: it would fill the view. */
const NEAR_M = 0.6;
/** A 4 by 4 ordered dither's order, for thinning a picture in steps. */
const ORDER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Whether a cell at a column and a row is kept when a picture keeps `share` of its cells (0 none, 1 all). */
export const kept = (column: number, row: number, share: number): boolean =>
  (ORDER[(row & 3) * 4 + (column & 3)] ?? 0) < share * 16;

/** A shape lit as pixel art: a cell in it with a side off it at `edge`, its heart white-hot, the rest `fill`. */
function shaded(
  width: number,
  height: number,
  inside: (across: number, up: number) => boolean,
  heart: (across: number, up: number) => boolean,
  edge: number,
  fill: number,
): Sprite {
  const solid = sprite(width, height, (across, up) => (inside(across, up) ? fill : CLEAR));
  return sprite(width, height, (across, up) => {
    const [column, row] = [across + (width - 1) / 2, (height - 1) / 2 - up];
    if (stopOf(solid, column, row) === CLEAR) return CLEAR;
    const neighbours = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const;
    if (neighbours.some(([side, down]) => stopOf(solid, column + side, row + down) === CLEAR)) return edge;
    return heart(across, up) ? HOT : fill;
  });
}

const madeSprites = new Map<string, Sprite>();
/** The sprite kept under `key`, made by `make` the first time it is asked for. */
function cached(key: string, make: () => Sprite): Sprite {
  let made = madeSprites.get(key);
  if (!made) {
    made = make();
    madeSprites.set(key, made);
  }
  return made;
}

/** A star of four rays `radius` cells long, white-hot at its heart and cooling to its tips, with four short diagonal
 *  rays when `diagonals`, rimmed a cell round in its ramp's dark so it reads even over a figure flashed white: the
 *  frame a blow lands on. */
export function starSprite(radius: number, diagonals = true): Sprite {
  const reach = Math.max(2, Math.round(radius));
  return cached(`star:${reach}:${diagonals}`, () => {
    const size = reach * 2 + 3;
    const lit = sprite(size, size, (across, up) => {
      const [far, near] = [Math.max(Math.abs(across), Math.abs(up)), Math.min(Math.abs(across), Math.abs(up))];
      const share = far / reach;
      if (Math.hypot(across, up) <= reach * 0.26 + 0.5) return HOT;
      if (near <= Math.max(0, 2.2 * (1 - share)) + 0.01 && far <= reach)
        return share < 0.45 ? HOT : share < 0.75 ? LIGHT : BODY;
      const slant = Math.abs(Math.abs(across) - Math.abs(up));
      if (diagonals && slant < 0.5 && Math.hypot(across, up) <= reach * 0.42) return LIGHT;
      return CLEAR;
    });
    return rimmed(lit);
  });
}

/** `picture` with every clear cell beside one of its own (across or up and down) in the ramp's dark. */
function rimmed(picture: Sprite): Sprite {
  const { width } = picture;
  const cells = picture.cells.map((stop, index) => {
    if (stop !== CLEAR) return stop;
    const [column, row] = [index % width, Math.floor(index / width)];
    const sides = [stopOf(picture, column - 1, row), stopOf(picture, column + 1, row)];
    sides.push(stopOf(picture, column, row - 1), stopOf(picture, column, row + 1));
    return sides.some((side) => side !== CLEAR) ? DARK : CLEAR;
  });
  return { ...picture, cells };
}

/** A ring `radius` cells round, `thick` cells across, in stop `stop`; broken into sixteenths by `broken` (the share
 *  of them gone), each `seed` choosing its own. */
export function ringSprite(radius: number, stop: number, thick = 1, broken = 0, seed = 0): Sprite {
  const reach = Math.max(1, Math.round(radius));
  return cached(`ring:${reach}:${stop}:${thick}:${broken}:${seed}`, () => {
    const size = (reach + thick) * 2 + 1;
    return sprite(size, size, (across, up) => {
      if (Math.abs(Math.hypot(across, up) - reach) > thick / 2 + 0.25) return CLEAR;
      const sixteenth = Math.floor(((Math.atan2(up, across) / (2 * Math.PI) + 1) % 1) * 16);
      return broken > 0 && hashOf(seed, sixteenth) < broken ? CLEAR : stop;
    });
  });
}

/** A slash `length` cells long through its middle at `turn` sixteenths of a turn from flat, two cells thick: `stop`
 *  along it, a stop darker at each end, rimmed in the ramp's dark. */
export function slashSprite(turn: number, length: number, stop: number): Sprite {
  const way = ((Math.round(turn) % 8) + 8) % 8;
  return cached(`slash:${way}:${length}:${stop}`, () => {
    const angle = (way * Math.PI) / 8;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const half = Math.round(length / 2);
    const size = half * 2 + 5;
    const cut = sprite(size, size, (across, up) => {
      const along = across * cos + up * sin;
      const aside = -across * sin + up * cos;
      if (Math.abs(along) > half || aside < -0.5 || aside > 1) return CLEAR;
      return Math.abs(along) > half * 0.7 ? Math.max(BODY, stop - 1) : stop;
    });
    return rimmed(cut);
  });
}

/** Blaze's puff where a blow lands: three tongues of flame climbing `rise` (0 to 1) of their height, flickering by
 *  `flicker`, cooling a stop as `cool` (0 to 2) grows. */
export function tonguesSprite(rise: number, flicker: number, cool: number): Sprite {
  const [height, step, sway] = [Math.round(9 + rise * 10), Math.round(cool), ((flicker % 8) + 8) % 8];
  return cached(`tongues:${height}:${sway}:${step}`, () => {
    const tongues = [
      { middle: -4, tall: height * 0.68, wide: 2.6 },
      { middle: 0, tall: height, wide: 3.4 },
      { middle: 4, tall: height * 0.78, wide: 2.6 },
    ];
    const inside = (across: number, up: number) =>
      tongues.some(({ middle, tall, wide }) => {
        const climbed = (up + 9) / tall;
        if (climbed < 0 || climbed > 1) return false;
        const shift = Math.round((hashOf(sway, middle, Math.floor(up / 3)) - 0.5) * 2);
        return Math.abs(across - middle - shift) <= wide * (1 - climbed) ** 0.7 + 0.2;
      });
    const heart = (across: number, up: number) => Math.abs(across) <= 1 && up < -9 + height * 0.35;
    const lit = shaded(13, 21, inside, heart, BODY, LIGHT);
    const cells = lit.cells.map((stop) => (stop === CLEAR ? CLEAR : Math.max(DARK, stop - step)));
    return { ...lit, cells };
  });
}

/** Volt's spark where a blow lands: four forks, each a jagged line `reach` cells out struck afresh at each `strike`,
 *  white-hot at the heart cooling outward, with a halo a stop darker; `cool` stops darker in all. */
export function forksSprite(reach: number, strike: number, cool: number): Sprite {
  return cached(`forks:${reach}:${strike % 16}:${cool}`, () => {
    const size = reach * 2 + 3;
    const core = new Map<number, number>();
    const mark = (column: number, row: number, stop: number) => {
      const key = row * size + column;
      core.set(key, Math.max(core.get(key) ?? CLEAR, stop));
    };
    for (let fork = 0; fork < 4; fork++) {
      let angle = Math.PI / 4 + (fork * Math.PI) / 2 + (hashOf(strike, fork) - 0.5) * 0.6;
      let [across, up] = [0, 0];
      for (let leg = 0; leg < 3; leg++) {
        const length = reach / 3;
        const [toAcross, toUp] = [across + Math.cos(angle) * length, up + Math.sin(angle) * length];
        const steps = Math.ceil(length * 1.5);
        for (let step = 0; step <= steps; step++) {
          const [atAcross, atUp] = [across + ((toAcross - across) * step) / steps, up + ((toUp - up) * step) / steps];
          const share = Math.hypot(atAcross, atUp) / reach;
          mark(
            Math.round(atAcross) + reach + 1,
            reach + 1 - Math.round(atUp),
            share < 0.35 ? HOT : share < 0.7 ? LIGHT : BODY,
          );
        }
        [across, up] = [toAcross, toUp];
        angle += (hashOf(strike, fork, leg) - 0.5) * 1.3;
      }
    }
    // Each fork two cells thick: its line, and the cell under it a stop darker.
    return sprite(size, size, (across, up) => {
      const [column, row] = [across + (size - 1) / 2, (size - 1) / 2 - up];
      const own = core.get(row * size + column) ?? CLEAR;
      const over = core.get((row - 1) * size + column) ?? CLEAR;
      const stop = Math.max(own, over - 1);
      return stop === CLEAR ? CLEAR : Math.max(DARK, stop - cool);
    });
  });
}

/** Cosmic's star where a blow lands: six rays `reach` cells long turned `turn` sixteenths of a turn, dots of dusk
 *  between them, `cool` stops darker in all. */
export function sixStarSprite(reach: number, turn: number, cool: number): Sprite {
  const way = ((Math.round(turn) % 16) + 16) % 16;
  return cached(`six:${reach}:${way}:${cool}`, () => {
    const size = reach * 2 + 1;
    const turned = (way * 2 * Math.PI) / 16;
    return sprite(size, size, (across, up) => {
      const apart = Math.hypot(across, up);
      if (apart <= 1.5) return Math.max(DARK, HOT - cool);
      for (let ray = 0; ray < 6; ray++) {
        const angle = turned + (ray * Math.PI) / 3;
        const along = across * Math.cos(angle) + up * Math.sin(angle);
        const aside = Math.abs(-across * Math.sin(angle) + up * Math.cos(angle));
        if (along > 0 && along <= reach && aside <= 1.1 * (1 - along / reach) + 0.35)
          return Math.max(DARK, (along < reach * 0.4 ? LIGHT : BODY) - cool + (along < 2.5 ? 1 : 0));
      }
      const between = ((((Math.atan2(up, across) - turned) / (Math.PI / 3)) % 1) + 1) % 1;
      return Math.abs(apart - reach * 0.55) < 0.6 && Math.abs(between - 0.5) < 0.08 ? DARK : CLEAR;
    });
  });
}

/** A shield cracked through, eleven cells by thirteen: its rim in light, a white-hot crack down it, its face dark. */
export const CRACKED_SHIELD: Sprite = sprite(11, 13, (across, up) => {
  const width = up > -1 ? 5 : 5 - (-1 - up) * 0.9;
  if (Math.abs(across) > width + 0.01 || up > 6 || up < -6) return CLEAR;
  const crack = [1, 0, -1, 0, 1, 1, 0, -1, -1, 0, 1, 0, -1][6 - up] ?? 0;
  if (across === crack || (across === crack + 1 && up % 3 === 0)) return HOT;
  return Math.abs(across) > width - 1 || up === 6 ? LIGHT : DARK;
});

/** A spiral of two arms `reach` cells out turned `turn` sixteenths of a turn: Cosmic's swirl left on the ground. */
export function swirlSprite(reach: number, turn: number): Sprite {
  const way = ((Math.round(turn) % 16) + 16) % 16;
  return cached(`swirl:${reach}:${way}`, () => {
    const size = reach * 2 + 1;
    const turned = (way * 2 * Math.PI) / 16;
    return sprite(size, size, (across, up) => {
      const apart = Math.hypot(across, up);
      if (apart > reach || apart < 1) return CLEAR;
      const angle = Math.atan2(up, across) - turned - (apart / reach) * Math.PI * 1.5;
      const arm = (((angle / Math.PI) % 1) + 1) % 1;
      return arm < 0.22 ? (apart < reach * 0.5 ? LIGHT : BODY) : CLEAR;
    });
  });
}

/** A disc `radius` cells round, its edge ragged a cell in or out row by row, a rim a stop lighter: an ash scorch
 *  left on the ground. */
export function scorchSprite(radius: number, stop: number): Sprite {
  return cached(`scorch:${radius}:${stop}`, () => {
    const size = radius * 2 + 3;
    return sprite(size, size, (across, up) => {
      const reach = radius + Math.round((hashOf(up, across > 0 ? 1 : 2) - 0.5) * 2.4);
      const far = Math.hypot(across, up);
      if (far > reach) return CLEAR;
      return far > reach - 1 ? Math.min(HOT, stop + 1) : stop;
    });
  });
}

/** Lays `picture` upright with its middle at `middle`, turned to an eye at `eye` as a figure's card is, each cell
 *  `cell` metres in `ramp`'s stops, keeping `share` of its cells by the ordered dither: mark vertices, every one fully
 *  opaque. Each row's run of one stop is one quad. A picture too near the eye is left out. */
export function layUpright(
  out: number[],
  picture: Sprite,
  ramp: Ramp,
  middle: Point,
  eye: Point,
  cell = CELL_M,
  share = 1,
): void {
  const [toX, toY] = [middle[0] - eye[0], middle[1] - eye[1]];
  if (Math.hypot(toX, toY, middle[2] - eye[2]) < NEAR_M) return;
  const apart = Math.hypot(toX, toY);
  const [rightX, rightY] = apart > 1e-6 ? [-toY / apart, toX / apart] : [1, 0];
  layRuns(out, picture, ramp, share, middle, [rightX * cell, rightY * cell, 0], [0, 0, cell]);
}

/** Lays `picture` flat on the ground about `centre`, its rows running north to south, each cell `cell` metres. */
export function layFlat(out: number[], picture: Sprite, ramp: Ramp, centre: Point, cell = CELL_M, share = 1): void {
  layRuns(out, picture, ramp, share, [centre[0], centre[1], centre[2] + LIFT], [cell, 0, 0], [0, -cell, 0]);
}

/** Each sprite's runs, made once: for each row's run of one stop, its row, first column, end and stop. */
const madeRuns = new WeakMap<Sprite, Int16Array>();
function runsOf(picture: Sprite, share: number): Int16Array {
  const whole = share >= 1;
  const known = whole ? madeRuns.get(picture) : undefined;
  if (known) return known;
  const runs: number[] = [];
  const stopAt = (column: number, row: number) =>
    whole || kept(column, row, share) ? stopOf(picture, column, row) : CLEAR;
  for (let row = 0; row < picture.height; row++)
    for (let column = 0; column < picture.width;) {
      const stop = stopAt(column, row);
      let end = column + 1;
      while (end < picture.width && stopAt(end, row) === stop) end++;
      if (stop !== CLEAR) runs.push(row, column, end, stop);
      column = end;
    }
  const made = Int16Array.from(runs);
  if (whole) madeRuns.set(picture, made);
  return made;
}

/** Each run of `picture` as a quad about `middle`, a column `across` and a row `up` apart (metres, as vectors). */
function layRuns(
  out: number[],
  picture: Sprite,
  ramp: Ramp,
  share: number,
  middle: Point,
  across: Point,
  up: Point,
): void {
  const runs = runsOf(picture, share);
  const halfWidth = picture.width / 2;
  const halfHeight = picture.height / 2;
  for (let index = 0; index < runs.length; index += 4) {
    const colour = ramp[runs[index + 3] ?? 0];
    if (!colour) continue;
    const top = halfHeight - (runs[index] ?? 0);
    const left = (runs[index + 1] ?? 0) - halfWidth;
    const right = (runs[index + 2] ?? 0) - halfWidth;
    quadOut(out, middle, across, up, left, right, top, top - 1, colour);
  }
}

/** One quad about `middle` from column `left` to `right` and row `top` to `bottom`, each a step of `across` and `up`. */
function quadOut(
  out: number[],
  middle: Point,
  across: Point,
  up: Point,
  left: number,
  right: number,
  top: number,
  bottom: number,
  colour: Rgb,
): void {
  for (let corner = 0; corner < 6; corner++) {
    // The corners in turn: left top, right top, right bottom; left top, right bottom, left bottom.
    const column = corner === 1 || corner === 2 || corner === 4 ? right : left;
    const height = corner === 0 || corner === 1 || corner === 3 ? top : bottom;
    out.push(
      middle[0] + across[0] * column + up[0] * height,
      middle[1] + across[1] * column + up[1] * height,
      middle[2] + across[2] * column + up[2] * height,
      colour[0],
      colour[1],
      colour[2],
      1,
    );
  }
}

/** A line from `from` to `to`, `width` metres across, turned to face `eye`, in one opaque colour. */
export function layLine(out: number[], eye: Point, from: Point, to: Point, width: number, colour: Rgb): void {
  const [alongX, alongY, alongZ] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const [lookX, lookY, lookZ] = [eye[0] - from[0], eye[1] - from[1], eye[2] - from[2]];
  const sideX = alongY * lookZ - alongZ * lookY;
  const sideY = alongZ * lookX - alongX * lookZ;
  const sideZ = alongX * lookY - alongY * lookX;
  const length = Math.hypot(sideX, sideY, sideZ);
  if (length < 1e-9) return;
  const half = width / 2 / length;
  // A quad whose columns run along the side and whose one row runs from `from` to `to`.
  quadOut(out, from, [sideX * half, sideY * half, sideZ * half], [alongX, alongY, alongZ], -1, 1, 1, 0, colour);
}

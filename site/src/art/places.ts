// The places the scenes stand on: an isle of rock with its cliffs, a town stepping up it in terraces to a beacon, a
// quay with its lanterns, broken walls, and the Lattice's crystal in faceted shards with their light round them.
import { lantern } from './light.ts';
import { box, dot, glow, halo, inkAt, land, line, patternOn, ridge, shape, type Ink, type Sheet } from './sheet.ts';

export interface Rock {
  /** The rock's body, the face that catches the light, and its crest. */
  readonly hue: Ink;
  readonly lit: Ink;
  readonly edge: Ink;
}

export const ROCK: Rock = { hue: '#090e18', lit: '#152036', edge: '#2a3a58' };

/**
 * An isle of rock side on from `left` to `right`, rising from `waterline` to `top` at `peak` (a share of its width):
 * a hill whose line is broken by the rock, its faces streaked downward and its crest lit. Returns each column's
 * height, so what stands on it finds the ground.
 */
export function isle(
  sheet: Sheet,
  random: () => number,
  span: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly waterline: number;
    readonly peak?: number;
  },
  rock: Rock = ROCK,
): number[] {
  const width = span.right - span.left;
  const peak = span.peak ?? 0.5;
  const rough = ridge(random, width, 0, 1, 0.6);
  const heights = rough.map((noise, column) => {
    const across = column / width;
    const away = across < peak ? (peak - across) / peak : (across - peak) / (1 - peak);
    const hill = Math.max(0, 1 - away ** 1.6) ** 0.7;
    const rise = Math.max(0, Math.min(1, hill * (0.86 + noise * 0.14)));
    return span.waterline - (span.waterline - span.top) * rise;
  });
  land(sheet, heights, rock.hue, span.waterline + 1, span.left);
  const streaks = heights.map(() => random());
  heights.forEach((height, column) => {
    const x = span.left + column;
    dot(sheet, x, height, rock.edge);
    const fall = Math.abs((heights[column + 1] ?? height) - height);
    for (let row = Math.round(height) + 1; row < span.waterline; row++) {
      const down = (row - height) / (span.waterline - height + 1);
      const streak = (streaks[column] ?? 0) > 0.6 ? 0.2 : 0;
      if (patternOn(x, row, 0.4 - down * 0.5 + streak + (fall > 1 ? 0.2 : 0))) dot(sheet, x, row, rock.lit);
    }
  });
  return heights;
}

/** Where a town's houses are drawn into for their lights to flicker apart, when a scene keeps them apart. */
export interface TownLook {
  /** Wall, wall in shadow, roof, roof lit by the sky. */
  readonly wall: Ink;
  readonly wallDark: Ink;
  readonly roof: Ink;
  readonly roofLit: Ink;
  /** A lit window, and one lit low. */
  readonly window: Ink;
  readonly windowDim: Ink;
}

export const TOWN: TownLook = {
  wall: '#1c2640',
  wallDark: '#121a2d',
  roof: '#0a1020',
  roofLit: '#26344f',
  window: '#ffc95a',
  windowDim: '#b8742a',
};

function house(
  sheet: Sheet,
  random: () => number,
  place: { readonly x: number; readonly ground: number; readonly wide: number; readonly tall: number },
  look: TownLook,
  lights: Sheet | undefined,
): void {
  const { x, ground, wide, tall } = place;
  const top = ground - tall;
  box(sheet, x, top, wide, tall, look.wall);
  box(sheet, x + wide - Math.max(1, Math.floor(wide / 3)), top, Math.max(1, Math.floor(wide / 3)), tall, look.wallDark);
  const peak = Math.ceil(wide / 2) + 1;
  shape(
    sheet,
    [
      [x - 1, top + 1],
      [x + wide / 2, top - peak],
      [x + wide + 1, top + 1],
    ],
    look.roof,
  );
  line(sheet, x - 1, top, x + wide / 2, top - peak + 1, look.roofLit);
  if (random() < 0.4) box(sheet, x + wide - 3, top - peak + 1, 2, 3, look.roof);
  for (let floor = top + 2; floor < ground - 2; floor += 4)
    for (let column = x + 1; column < x + wide - 1; column += 3) {
      if (random() < 0.55) continue;
      const ink = random() < 0.6 ? look.window : look.windowDim;
      box(sheet, column, floor, 1, 2, ink);
      if (lights && ink === look.window) box(lights, column, floor, 1, 2, '#fff1c4');
    }
}

/**
 * A town stepping up an isle between `from` and `to` in terraces, from the summit's shoulder down to `lowest`: each a
 * row of houses on its retaining wall, the rows behind standing higher. Lit windows go into `lights` too where a
 * scene keeps them apart to flicker.
 */
export function town(
  sheet: Sheet,
  random: () => number,
  ground: readonly number[],
  left: number,
  span: readonly [number, number],
  lowest: number,
  look: TownLook = TOWN,
  lights?: Sheet,
): void {
  const groundAt = (x: number): number => ground[Math.round(x) - left] ?? Number.POSITIVE_INFINITY;
  const highest = Math.min(...ground.slice(span[0] - left, span[1] - left));
  const terraces = Math.max(2, Math.round((lowest - highest) / 12));
  for (let terrace = 0; terrace <= terraces; terrace++) {
    const level = Math.round(highest + 8 + ((lowest - highest - 8) * terrace) / terraces);
    const row: { x: number; ground: number; wide: number; tall: number }[] = [];
    let x = span[0] + Math.floor(random() * 5);
    while (x < span[1]) {
      const wide = 5 + Math.floor(random() * 6);
      if (groundAt(x) <= level - 2 && groundAt(x + wide) <= level - 2 && random() < 0.72)
        row.push({ x, ground: level, wide, tall: 5 + Math.floor(random() * 6) });
      x += wide + 1 + Math.floor(random() * 3);
    }
    for (const home of row) house(sheet, random, home, look, lights);
    if (row.length === 0) continue;
    const first = row[0];
    const last = row[row.length - 1];
    if (!first || !last) continue;
    for (let column = first.x - 1; column < last.x + last.wide + 1; column++) {
      dot(sheet, column, level, look.roofLit);
      if (patternOn(column, level + 1, 0.5)) dot(sheet, column, level + 1, look.wallDark);
      dot(sheet, column, level + 2, look.wallDark);
    }
  }
  // The road up: a switchback from the quay to the summit's shoulder, a lamp at each turn.
  const inside = (level: number, share: number): number => {
    const columns = ground
      .map((height, column) => [height, left + column] as const)
      .filter(([height]) => height <= level - 4);
    const within = columns.map(([, column]) => column).filter((column) => column >= span[0] && column <= span[1]);
    return within.length ? Math.min(...within) + (Math.max(...within) - Math.min(...within)) * share : span[0];
  };
  const turns = Math.max(2, terraces);
  let from: [number, number] = [inside(lowest, 0.3), lowest];
  for (let turn = 1; turn <= turns; turn++) {
    const level = lowest - ((lowest - highest - 8) * turn) / turns;
    const to: [number, number] = [inside(level, turn % 2 === 0 ? 0.3 : 0.7), level];
    line(sheet, from[0], from[1], to[0], to[1], look.roofLit);
    line(sheet, from[0], from[1] + 1, to[0], to[1] + 1, look.wallDark);
    dot(sheet, to[0], to[1] - 2, look.window);
    if (lights) dot(lights, to[0], to[1] - 2, '#fff1c4');
    from = to;
  }
}

/** A beacon tower on the summit at `x`: its stones, the fire in its basket and the light it throws far. */
export function beacon(
  sheet: Sheet,
  x: number,
  ground: number,
  tall: number,
  look: TownLook = TOWN,
  lights?: Sheet,
): void {
  const top = ground - tall;
  halo(sheet, x, top - 3, tall * 1.4, ['#1a2238', '#2a2a38', '#4a3424', '#8a5420']);
  shape(
    sheet,
    [
      [x - 4, ground],
      [x - 3, top],
      [x + 3, top],
      [x + 4, ground],
    ],
    look.wall,
  );
  box(sheet, x + 1, top, 3, tall, look.wallDark);
  for (let course = top + 3; course < ground; course += 4) box(sheet, x - 3, course, 7, 1, look.roof);
  box(sheet, x - 5, top - 1, 11, 2, look.roof);
  box(sheet, x - 1, top + 5, 2, 3, look.window);
  for (let tongue = -3; tongue <= 3; tongue++) {
    const high = 5 - Math.abs(tongue);
    for (let row = 0; row < high; row++) dot(sheet, x + tongue, top - 2 - row, row < 2 ? '#ffe08a' : '#ff9a3a');
  }
  glow(sheet, x, top - 4, 6, '#fff1c4', 0.5);
  if (lights) {
    glow(lights, x, top - 4, 5, '#fff1c4', 0.7);
    box(lights, x - 1, top + 5, 2, 3, '#fff1c4');
  }
}

/** A stone quay along `row` from `from` to `to`: its face, its edge, posts, and a lantern at each place given. */
export function quay(
  sheet: Sheet,
  row: number,
  span: readonly [number, number],
  lanterns: readonly number[],
  lights?: Sheet,
): void {
  const [from, to] = span;
  box(sheet, from, row, to - from, 5, '#121a2b');
  box(sheet, from, row, to - from, 1, '#2c3a56');
  for (let stone = from; stone < to; stone += 6) box(sheet, stone, row + 2 + ((stone / 6) % 2), 1, 2, '#0a101c');
  for (let post = from + 3; post < to; post += 14) box(sheet, post, row - 2, 2, 2, '#1d140f');
  for (const x of lanterns) {
    box(sheet, x, row - 7, 1, 7, '#1d140f');
    lantern(sheet, x, row - 8, 9);
    if (lights) dot(lights, x, row - 8, '#fff1c4');
  }
}

/** Ruined walls between two columns on `ground`: gables broken, windows empty, `hole` showing through them. */
export function ruins(
  sheet: Sheet,
  random: () => number,
  span: readonly [number, number],
  ground: number,
  inks: { readonly wall: Ink; readonly dark: Ink; readonly hole: Ink },
): void {
  const [from, to] = span;
  for (let x = from; x < to;) {
    const wide = 5 + Math.floor(random() * 10);
    const tall = 8 + Math.floor(random() * 22);
    const gable = random() < 0.5;
    for (let column = 0; column < wide; column++) {
      const peak = gable ? Math.min(column, wide - 1 - column) * 0.9 : 0;
      const broken = Math.floor(random() * random() * tall * 0.6);
      const height = tall + peak - broken;
      box(sheet, x + column, ground - height, 1, height, column > wide * 0.65 ? inks.dark : inks.wall);
    }
    for (let row = ground - tall + 4; row < ground - 3; row += 5)
      for (let column = x + 2; column < x + wide - 2; column += 4)
        if (random() < 0.55 && inkAt(sheet, column, row)) box(sheet, column, row, 2, 3, inks.hole);
    x += wide + 1 + Math.floor(random() * 5);
  }
}

/** The crystal's two strains: a shadowed face, a middle face, a lit face, the edge and the light round it. */
const STRAINS = [
  { shadow: '#3a1c5c', mid: '#6a38a8', face: '#9a5ee0', edge: '#e6c8ff', glow: ['#1c0f30', '#2c1648', '#46226e'] },
  { shadow: '#5a1830', mid: '#a02e4c', face: '#d84a66', edge: '#ffc4d0', glow: ['#220c16', '#3a1222', '#5e1a32'] },
] as const;

/** A shard from `base` up `tall` cells, leaning by `lean`: three faces, a bright edge and a lit tip. */
export function crystal(sheet: Sheet, x: number, base: number, tall: number, lean: number, strain: 0 | 1): void {
  const wide = Math.max(2, Math.round(tall / 3.2));
  const tip: [number, number] = [x + lean, base - tall];
  const inks = STRAINS[strain];
  const shoulder = Math.round(tall * 0.22);
  shape(
    sheet,
    [
      [x - wide, base],
      [x - wide + lean * 0.7, base - tall + shoulder],
      tip,
      [x + wide + lean * 0.7 + 1, base - tall + shoulder],
      [x + wide + 1, base],
    ],
    inks.mid,
  );
  shape(
    sheet,
    [[x - wide, base], [x - wide + lean * 0.7, base - tall + shoulder], tip, [x - 1 + lean * 0.3, base]],
    inks.shadow,
  );
  shape(
    sheet,
    [[x + 1 + lean * 0.3, base], tip, [x + wide + lean * 0.7 + 1, base - tall + shoulder], [x + wide + 1, base]],
    inks.face,
  );
  line(sheet, x + lean * 0.3, base - 1, tip[0], tip[1] + 1, inks.edge);
  dot(sheet, tip[0], tip[1], '#ffffff');
}

/** The light rising in rings off a cluster at `x`, drawn before what stands in front of it. */
export function crystalLight(sheet: Sheet, x: number, base: number, size: number, strain: 0 | 1): void {
  halo(sheet, x, base - size * 0.4, size * 1.9, STRAINS[strain].glow);
}

/** A cluster of shards round one root, and motes drifting up off it; its light is `crystalLight`'s. */
export function cluster(
  sheet: Sheet,
  random: () => number,
  x: number,
  base: number,
  size: number,
  strain: 0 | 1,
): void {
  for (let shard = 0; shard < 6; shard++) {
    const lean = Math.round((random() - 0.5) * size * 0.7);
    const tall = Math.round(size * (0.4 + random() * 0.65));
    const kind = random() < 0.7 ? strain : ((1 - strain) as 0 | 1);
    crystal(sheet, x + Math.round((random() - 0.5) * size * 0.8), base, tall, lean, kind);
  }
  for (let mote = 0; mote < size; mote++)
    dot(sheet, x + (random() - 0.5) * size * 2.2, base - size * 0.5 - random() * size * 1.6, STRAINS[strain].edge);
}

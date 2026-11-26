// What stands on a scene's land, side on, at the few cells a patrol zone's picture gives it: the far land in two
// ranges, trees, a windmill whose sails may be broken, standing stones, a fence along the ground, a watchtower with a
// lit window, a shrine's posts and roof, and a small fire. Each stands on `ground`, a row, at `x`, its foot there; inks come from the scene's own light.
import { lantern, type Light, range } from './light.ts';
import { box, dot, glow, line, patternOn, shape, type Ink, type Sheet } from './sheet.ts';

/** The darkest ink a scene's nearest land takes. */
export const DARK = '#03050a';
const FLAME = ['#fff1c4', '#ffc04a', '#ff7a2a'] as const;

/** A tree `tall` cells high: a pine's tiers to a point, or an oak's round crown dithered at its edge. */
export function tree(sheet: Sheet, x: number, ground: number, tall: number, pine: boolean, ink: Ink): void {
  box(sheet, x, ground - Math.round(tall * 0.3), 1, Math.round(tall * 0.3), ink);
  if (pine) {
    for (let tier = 0; tier < 3; tier++) {
      const top = ground - tall + Math.round((tier * tall) / 4);
      const wide = 1 + tier + Math.round(tall / 8);
      shape(
        sheet,
        [
          [x - wide, top + Math.round(tall / 3)],
          [x + 0.5, top],
          [x + wide + 1, top + Math.round(tall / 3)],
        ],
        ink,
      );
    }
    return;
  }
  const reach = Math.max(2, Math.round(tall * 0.38));
  const middle = ground - tall + reach;
  for (let row = -reach; row <= reach; row++)
    for (let column = -reach; column <= reach; column++) {
      const away = Math.hypot(column, row * 1.15) / reach;
      if (away < 0.8 || (away < 1 && patternOn(x + column, middle + row, (1 - away) * 4)))
        dot(sheet, x + column, middle + row, ink);
    }
}

/** A windmill: its tapering tower, a cap, a lit window, and four sails turned by `turn` radians, `broken` ones short. */
export function windmill(
  sheet: Sheet,
  [x, ground]: readonly [number, number],
  tall: number,
  look: { readonly ink: Ink; readonly lit: Ink; readonly turn: number; readonly broken?: boolean },
): void {
  const wide = Math.max(3, Math.round(tall / 4));
  shape(
    sheet,
    [
      [x - wide, ground],
      [x - wide / 2, ground - tall],
      [x + wide / 2 + 1, ground - tall],
      [x + wide + 1, ground],
    ],
    look.ink,
  );
  shape(
    sheet,
    [
      [x - wide / 2 - 1, ground - tall],
      [x + 0.5, ground - tall - 3],
      [x + wide / 2 + 2, ground - tall],
    ],
    look.ink,
  );
  box(sheet, x, ground - Math.round(tall * 0.5), 1, 2, look.lit);
  const hub: [number, number] = [x, ground - tall + 1];
  for (let sail = 0; sail < 4; sail++) {
    const angle = look.turn + (sail * Math.PI) / 2;
    const long = tall * (look.broken && sail % 2 === 1 ? 0.35 : 0.8);
    const tip: [number, number] = [hub[0] + Math.cos(angle) * long, hub[1] + Math.sin(angle) * long];
    line(sheet, hub[0], hub[1], tip[0], tip[1], look.ink);
    // The sail's lattice, a cell off its stock.
    const side: [number, number] = [-Math.sin(angle) * 2, Math.cos(angle) * 2];
    for (let along = 0.35; along < 1; along += 0.16) {
      const spot: [number, number] = [hub[0] + (tip[0] - hub[0]) * along, hub[1] + (tip[1] - hub[1]) * along];
      line(sheet, spot[0], spot[1], spot[0] + side[0], spot[1] + side[1], look.ink);
    }
  }
}

/** Standing stones in a ring seen side on: `count` stones of uneven height, the middle ones farther and lower. */
export function stones(
  sheet: Sheet,
  random: () => number,
  [x, ground]: readonly [number, number],
  count: number,
  inks: readonly [Ink, Ink],
): void {
  for (let stone = 0; stone < count; stone++) {
    const across = Math.round((stone - (count - 1) / 2) * 4);
    const far = 1 - Math.abs(across) / (count * 2 + 1);
    const tall = Math.round(5 + random() * 4 - far * 2);
    const left = x + across;
    box(sheet, left, ground - tall, 2, tall, inks[0]);
    dot(sheet, left, ground - tall, inks[1]);
    if (random() < 0.5) dot(sheet, left + 1, ground - tall, inks[1]);
  }
}

/** A post and rail fence following `heights` (a row each column) from `from` to `to`. */
export function fence(sheet: Sheet, heights: readonly number[], [from, to]: readonly [number, number], ink: Ink): void {
  for (let column = from; column < to; column++) {
    const ground = Math.round(heights[column] ?? sheet.height);
    dot(sheet, column, ground - 2, ink);
    if ((column - from) % 4 === 0) box(sheet, column, ground - 3, 1, 3, ink);
  }
}

/** A stone watchtower: its body, a crenellated top, a lit window and a lantern at its door. */
export function watchtower(
  sheet: Sheet,
  [x, ground]: readonly [number, number],
  tall: number,
  inks: readonly [Ink, Ink],
): void {
  const wide = Math.max(4, Math.round(tall / 3.5));
  box(sheet, x - wide / 2, ground - tall, wide, tall, inks[0]);
  box(sheet, x + wide / 2 - 1, ground - tall, 1, tall, inks[1]);
  for (let tooth = 0; tooth < wide + 2; tooth += 2)
    box(sheet, x - wide / 2 - 1 + tooth, ground - tall - 2, 1, 2, inks[0]);
  box(sheet, x - 1, ground - Math.round(tall * 0.7), 2, 2, '#c0802c');
  glow(sheet, x, ground - Math.round(tall * 0.7), 4, '#7a4416', 0.5);
  lantern(sheet, x + wide / 2 + 1, ground - 4, 5);
}

/** A shrine: a stepped base, two posts, a roof sweeping up at its ends, and a lantern hung between its posts. */
export function shrine(sheet: Sheet, [x, ground]: readonly [number, number], wide: number, ink: Ink): void {
  box(sheet, x - wide / 2 - 2, ground - 2, wide + 4, 2, ink);
  box(sheet, x - wide / 2, ground - 4, wide, 2, ink);
  const tall = Math.round(wide * 0.9);
  box(sheet, x - wide / 2 + 1, ground - tall, 2, tall - 4, ink);
  box(sheet, x + wide / 2 - 3, ground - tall, 2, tall - 4, ink);
  shape(
    sheet,
    [
      [x - wide / 2 - 4, ground - tall - 1],
      [x - wide / 2 - 2, ground - tall - 4],
      [x + wide / 2 + 2, ground - tall - 4],
      [x + wide / 2 + 4, ground - tall - 1],
      [x + wide / 2, ground - tall + 1],
      [x - wide / 2, ground - tall + 1],
    ],
    ink,
  );
  lantern(sheet, x, ground - tall + 5, 6);
}

/** A small fire, `high` rows tall at its tallest, standing on (x, y). */
export function fire(sheet: Sheet, [x, y]: readonly [number, number], high: number): void {
  const reach = Math.max(1, Math.round(high / 2.5));
  for (let tongue = -reach; tongue <= reach; tongue++) {
    const tall = high - Math.abs(tongue) * (high / (reach + 1)) + ((tongue * 5) % 2);
    for (let row = 0; row < tall; row++)
      dot(
        sheet,
        x + tongue + Math.round(Math.sin(row / 2 + tongue) * 0.6),
        y - row,
        (row < tall * 0.35 ? FLAME[0] : row < tall * 0.7 ? FLAME[1] : FLAME[2]) ?? '',
      );
  }
}

/** The far land at the horizon, in two ranges, the nearer darker. */
export function ranges(sheet: Sheet, random: () => number, light: Light, horizon: number, wide = sheet.width): void {
  range(sheet, random, {
    ...{ left: 0, width: wide, top: horizon - Math.round(sheet.height * 0.14), foot: horizon - 2 },
    ...{ floor: horizon + 1, ink: light.ranges[0] ?? '', rough: 0.55 },
  });
  range(sheet, random, {
    ...{ left: Math.round(wide * 0.15), width: Math.round(wide * 0.7), top: horizon - Math.round(sheet.height * 0.07) },
    ...{ foot: horizon, floor: horizon + 1, ink: light.ranges[1] ?? '', rough: 0.6 },
  });
}

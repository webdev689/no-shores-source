// The pictures The Game's sections and Home's rows show of play itself: Overlook's court with the keepers at their
// counters in its arcades, a duel by firelight on a hamlet's path, and a dungeon's gate in a hillside.
import { seeded } from '../../../client/src/seeded.ts';
import { clouds, lantern, LIGHTS, range, sky, stars } from './light.ts';
import {
  box,
  disc,
  dot,
  halo,
  inkAt,
  land,
  line,
  makeSheet,
  patternOn,
  ridge,
  shape,
  type Ink,
  type Sheet,
} from './sheet.ts';

const WIDE = 320;
const TALL = 180;

/** A thick stroke: a line `thick` cells across. */
function stroke(
  sheet: Sheet,
  from: readonly [number, number],
  to: readonly [number, number],
  thick: number,
  ink: Ink,
): void {
  for (let across = -Math.floor(thick / 2); across < thick - Math.floor(thick / 2); across++)
    for (let down = -Math.floor(thick / 2); down < thick - Math.floor(thick / 2); down++)
      line(sheet, from[0] + across, from[1] + down, to[0] + across, to[1] + down, ink);
}

/** A townsperson standing, side on, in a coat; `tall` cells high. */
function person(sheet: Sheet, x: number, ground: number, tall: number, ink: Ink): void {
  const head = Math.max(2, Math.round(tall * 0.12));
  disc(sheet, x, ground - tall + head, head, head, ink);
  shape(
    sheet,
    [
      [x - head, ground - tall + head * 2],
      [x + head, ground - tall + head * 2],
      [x + head + 1, ground - tall * 0.35],
      [x - head - 1, ground - tall * 0.35],
    ],
    ink,
  );
  box(sheet, x - head + 1, ground - tall * 0.36, 2, tall * 0.36, ink);
  box(sheet, x + head - 2, ground - tall * 0.36, 2, tall * 0.36, ink);
}

/** One bay of an arcade: two columns under an arch, an alcove behind with a keeper at a counter under a hung lamp. */
function bay(sheet: Sheet, x: number, floor: number, wide: number, goods: Ink): void {
  const stone = { face: '#2a3044', dark: '#1a1e2c', lit: '#4a5268' };
  const top = floor - 62;
  box(sheet, x + 4, top + 16, wide - 8, 46, '#0c0e16');
  halo(sheet, x + wide / 2, top + 26, 24, ['#1a1410', '#2a1c12', '#4a2c14']);
  box(sheet, x + wide / 2 - 1, top + 14, 1, 8, '#2a2420');
  lantern(sheet, x + Math.round(wide / 2), top + 24, 8);
  person(sheet, x + Math.round(wide / 2), floor - 14, 24, '#070810');
  box(sheet, x + 5, floor - 16, wide - 10, 16, '#2a1d16');
  box(sheet, x + 5, floor - 16, wide - 10, 1, '#6a4a30');
  for (let good = 0; good < Math.floor((wide - 12) / 5); good++) box(sheet, x + 7 + good * 5, floor - 19, 3, 3, goods);
  for (const column of [x, x + wide - 4]) {
    box(sheet, column, top + 8, 4, 54, stone.face);
    box(sheet, column + 3, top + 8, 1, 54, stone.dark);
    box(sheet, column - 1, top + 6, 6, 3, stone.lit);
    box(sheet, column - 1, floor - 3, 6, 3, stone.lit);
  }
  for (let column = 0; column < wide; column++) {
    const rise = Math.sqrt(Math.max(0, 1 - ((column - wide / 2) / (wide / 2)) ** 2)) * 10;
    for (let row = top; row < top + 16 - rise; row++) dot(sheet, x + column, row, stone.face);
    dot(sheet, x + column, top + 16 - rise, stone.lit);
  }
}

/** A banner stand: a pole, a crossbar and a hanging banner in a colour, its folds shaded. */
function banner(sheet: Sheet, x: number, floor: number, cloth: Ink, fold: Ink): void {
  box(sheet, x, floor - 50, 2, 50, '#1d140f');
  box(sheet, x - 7, floor - 48, 16, 2, '#1d140f');
  for (let row = 0; row < 26; row++)
    for (let column = -6; column < 8; column++) {
      if (row > 20 && Math.abs(column - 0.5) < row - 20) continue;
      dot(sheet, x + column, floor - 46 + row, column % 4 === 0 || column % 4 === 1 ? fold : cloth);
    }
}

/** Overlook's court at night: keepers at their counters in the arcades, the factions' banners, a brazier, townsfolk. */
function overlookCourt(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const light = LIGHTS.night;
  sky(sheet, light, 70);
  stars(sheet, seeded(101), light, 120, 40);
  box(sheet, 0, 40, WIDE, 34, '#0e1424');
  for (let gable = 0; gable < WIDE; gable += 28) {
    shape(
      sheet,
      [
        [gable - 2, 42],
        [gable + 13, 28 + ((gable * 7) % 9)],
        [gable + 28, 42],
      ],
      '#0a0f1c',
    );
    if ((gable / 28) % 2 === 0) box(sheet, gable + 10, 50, 3, 4, '#c0802c');
  }
  const floor = 142;
  box(sheet, 0, 70, WIDE, floor - 70, '#141a28');
  for (let bayIndex = 0; bayIndex < 5; bayIndex++)
    bay(
      sheet,
      4 + bayIndex * 64,
      floor,
      56,
      ['#9a5a1c', '#6a7a3a', '#8a4a3a', '#c0a060', '#5a6a8a'][bayIndex] ?? '#9a5a1c',
    );
  box(sheet, 0, floor, WIDE, TALL - floor, '#1c2232');
  for (let row = floor + 4; row < TALL; row += 5 + Math.floor((row - floor) / 6))
    box(sheet, 0, row, WIDE, 1, '#141824');
  for (let column = 0; column < WIDE; column += 16)
    line(sheet, column, floor, column + (column - 160) * 0.4, TALL, '#141824');
  const brazier: [number, number] = [160, 166];
  halo(sheet, brazier[0], brazier[1] - 4, 20, ['#1e1a1e', '#2a1e1a', '#4a2a18']);
  box(sheet, brazier[0] - 6, brazier[1] - 8, 13, 4, '#120c08');
  box(sheet, brazier[0] - 1, brazier[1] - 4, 3, 10, '#120c08');
  for (let tongue = -4; tongue <= 4; tongue++) {
    const high = 9 - Math.abs(tongue) * 1.6;
    for (let row = 0; row < high; row++)
      dot(
        sheet,
        brazier[0] + tongue,
        brazier[1] - 9 - row,
        row < high * 0.35 ? '#fff1c4' : row < high * 0.7 ? '#ffc04a' : '#ff7a2a',
      );
  }
  banner(sheet, 70, floor + 6, '#2a5aa8', '#1e4480');
  banner(sheet, 250, floor + 6, '#c06a20', '#9a5018');
  banner(sheet, 290, floor + 10, '#6a3aa8', '#4e2a80');
  for (const [x, ground, tall] of [
    [36, 170, 30],
    [104, 166, 26],
    [118, 168, 28],
    [210, 172, 30],
    [226, 170, 26],
  ] as const)
    person(sheet, x, ground, tall, '#05070d');
  return sheet;
}

/** A fighter side on, `facing` 1 to the right: legs braced, coat, a weapon held at `hand` and pointing to `tip`. */
function fighter(
  sheet: Sheet,
  x: number,
  ground: number,
  facing: 1 | -1,
  pose: { readonly hand: readonly [number, number]; readonly tip: readonly [number, number]; readonly hood?: boolean },
  ink: Ink,
): void {
  const side = (across: number): number => x + across * facing;
  stroke(sheet, [side(2), ground - 30], [side(13), ground], 4, ink);
  stroke(sheet, [side(-2), ground - 30], [side(-12), ground], 4, ink);
  shape(
    sheet,
    [
      [side(-6), ground - 30],
      [side(6), ground - 30],
      [side(8), ground - 54],
      [side(-4), ground - 54],
    ],
    ink,
  );
  shape(
    sheet,
    [
      [side(-6), ground - 34],
      [side(-14), ground - 14],
      [side(-1), ground - 28],
    ],
    ink,
  );
  disc(sheet, side(3), ground - 60, 5, 5, ink);
  if (pose.hood)
    shape(
      sheet,
      [
        [side(-4), ground - 56],
        [side(8), ground - 58],
        [side(1), ground - 70],
      ],
      ink,
    );
  else {
    shape(
      sheet,
      [
        [side(-7), ground - 63],
        [side(12), ground - 63],
        [side(3), ground - 70],
      ],
      ink,
    );
    box(sheet, Math.min(side(-8), side(13)), ground - 64, 22, 2, ink);
  }
  stroke(sheet, [side(5), ground - 52], pose.hand, 3, ink);
  stroke(sheet, [side(-3), ground - 52], [side(-11), ground - 42], 3, ink);
  stroke(sheet, pose.hand, pose.tip, 2, '#b8c0cc');
  box(sheet, pose.hand[0] - 2, pose.hand[1] - 1, 4, 2, '#7a4a16');
}

/** A duel by firelight on a hamlet's path at night: a captain and a raider squaring off, a brazier between them. */
function duel(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 116;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(111), light, 180, horizon - 30);
  clouds(sheet, seeded(112), light, { top: 34, depth: 40, count: 5 });
  range(sheet, seeded(113), {
    left: 0,
    width: WIDE,
    top: horizon - 30,
    foot: horizon - 8,
    floor: TALL,
    ink: light.ranges[0] ?? '',
  });
  range(sheet, seeded(114), {
    left: 0,
    width: WIDE,
    top: horizon - 14,
    foot: horizon,
    floor: TALL,
    ink: light.ranges[1] ?? '',
  });
  for (const [x, wide, tall] of [
    [18, 26, 20],
    [260, 34, 24],
    [292, 22, 16],
  ] as const) {
    box(sheet, x, horizon - tall, wide, tall, '#0c1220');
    shape(
      sheet,
      [
        [x - 2, horizon - tall + 1],
        [x + wide / 2, horizon - tall - wide / 3],
        [x + wide + 2, horizon - tall + 1],
      ],
      '#080d18',
    );
    box(sheet, x + Math.round(wide / 3), horizon - tall + 6, 3, 4, '#c0802c');
  }
  const ground = ridge(seeded(115), WIDE, horizon - 2, horizon + 4, 0.4);
  land(sheet, ground, '#0c1018', TALL);
  for (let row = horizon + 4; row < TALL; row++)
    for (let column = 0; column < WIDE; column++)
      if (Math.abs(column - 160 - (row - horizon) * 0.2) < 14 + (row - horizon) * 0.6 && patternOn(column, row, 0.45))
        dot(sheet, column, row, '#1e1a1e');
  const fire: [number, number] = [160, 142];
  halo(sheet, fire[0], fire[1] - 10, 96, ['#0e1220', '#181822', '#2a1e1c', '#4a2a18', '#7a3e1a']);
  const body = '#040509';
  fighter(sheet, 108, 168, 1, { hand: [126, 116], tip: [156, 96] }, body);
  fighter(sheet, 214, 168, -1, { hand: [200, 102], tip: [178, 84], hood: true }, body);
  // The edge of each figure that faces the fire takes its light: every such cell is found first, then lit, so a lit
  // cell never makes its neighbour an edge in turn.
  const rim: [number, number, Ink][] = [];
  for (let row = 60; row < TALL; row++)
    for (let column = 80; column < 250; column++) {
      if (inkAt(sheet, column, row) !== body) continue;
      const toward = column < fire[0] ? 1 : -1;
      if (inkAt(sheet, column + toward, row) === body) continue;
      const reach = Math.hypot(column - fire[0], row - fire[1]);
      rim.push([column, row, reach < 60 ? '#e07a2a' : '#7a3e1a']);
    }
  for (const [column, row, ink] of rim) dot(sheet, column, row, ink);
  box(sheet, fire[0] - 7, fire[1], 14, 4, '#1d140f');
  stroke(sheet, [fire[0] - 5, fire[1] + 4], [fire[0] - 8, 168], 2, '#1d140f');
  stroke(sheet, [fire[0] + 5, fire[1] + 4], [fire[0] + 8, 168], 2, '#1d140f');
  const flames = seeded(116);
  for (let tongue = 0; tongue < 12; tongue++) {
    const base = fire[0] - 6 + flames() * 12;
    const high = 6 + flames() * 14;
    for (let row = 0; row < high; row++) {
      const wide = 2 * (1 - row / high);
      for (let column = -wide; column <= wide; column++)
        dot(
          sheet,
          base + column + Math.sin(row / 2 + tongue) * 0.8,
          fire[1] - row,
          row < high * 0.3 ? '#fff1c4' : row < high * 0.65 ? '#ffc04a' : '#ff7a2a',
        );
    }
  }
  for (let spark = 0; spark < 26; spark++)
    dot(sheet, fire[0] + (flames() - 0.5) * 40, fire[1] - 24 - flames() * 70, '#ffc04a');
  return sheet;
}

/** A dungeon's gate in a hillside at night: a stone arch over steps down into the dark, a brazier either side. */
function dungeon(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 104;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(121), light, 200, horizon - 20);
  clouds(sheet, seeded(122), light, { top: 24, depth: 36, count: 5 });
  range(sheet, seeded(123), {
    left: 0,
    width: WIDE,
    top: horizon - 26,
    foot: horizon - 6,
    floor: TALL,
    ink: light.ranges[0] ?? '',
  });
  const hill = ridge(seeded(124), WIDE, 40, 74, 0.5).map((height, column) => height + Math.abs(column - 160) * 0.35);
  land(sheet, hill, '#0a0f1a', TALL);
  hill.forEach((height, column) => {
    dot(sheet, column, height, '#24324c');
    for (let row = Math.round(height) + 1; row < TALL; row++)
      if (patternOn(column, row, 0.3 - (row - height) / 140)) dot(sheet, column, row, '#141c2c');
  });
  const stone = { face: '#3a4256', dark: '#262c3a', lit: '#5a6278' };
  const [gateX, gateY, gateW, gateH] = [160, 150, 64, 78];
  halo(sheet, gateX, gateY - 30, 70, ['#101624', '#161a28']);
  box(sheet, gateX - gateW / 2 - 10, gateY - gateH, gateW + 20, gateH, stone.face);
  for (let row = gateY - gateH; row < gateY; row += 6)
    for (
      let column = gateX - gateW / 2 - 10 + ((row / 6) % 2 === 0 ? 0 : 6);
      column < gateX + gateW / 2 + 10;
      column += 12
    )
      box(sheet, column, row, 1, 6, stone.dark);
  for (let row = gateY - gateH; row < gateY; row += 6)
    box(sheet, gateX - gateW / 2 - 10, row, gateW + 20, 1, stone.dark);
  box(sheet, gateX - gateW / 2 - 14, gateY - gateH - 6, gateW + 28, 7, stone.lit);
  box(sheet, gateX - gateW / 2 - 14, gateY - gateH, gateW + 28, 1, stone.dark);
  const archTop = gateY - gateH + 18;
  for (let row = archTop; row < gateY; row++)
    for (let column = -gateW / 2 + 6; column < gateW / 2 - 6; column++) {
      const arch = row < archTop + 18 ? Math.hypot(column, (row - archTop - 18) * 1.4) < gateW / 2 - 6 : true;
      if (!arch) continue;
      const depth = (row - archTop) / (gateY - archTop);
      dot(
        sheet,
        gateX + column,
        row,
        depth > 0.55 ? '#020306' : patternOn(gateX + column, row, depth * 1.6) ? '#020306' : '#0a0c12',
      );
    }
  for (let step = 0; step < 6; step++) {
    const row = gateY - 4 - step * 5;
    const inset = step * 3;
    if (row < archTop + 24) break;
    box(sheet, gateX - gateW / 2 + 10 + inset, row, gateW - 20 - inset * 2, 1, '#2a3040');
  }
  halo(sheet, gateX, gateY - 22, 16, ['#0c1a2a', '#12304a']);
  dot(sheet, gateX, gateY - 24, '#7ad0ff');
  for (const side of [-1, 1]) {
    const x = gateX + side * (gateW / 2 + 22);
    halo(sheet, x, gateY - 34, 36, ['#1a1416', '#2a1a14', '#4a2a16']);
    box(sheet, x - 1, gateY - 30, 3, 30, '#120c08');
    shape(
      sheet,
      [
        [x - 7, gateY - 34],
        [x + 8, gateY - 34],
        [x + 5, gateY - 28],
        [x - 4, gateY - 28],
      ],
      '#120c08',
    );
    for (let tongue = -4; tongue <= 4; tongue++) {
      const high = 10 - Math.abs(tongue) * 2 + ((tongue * 5) % 3);
      for (let row = 0; row < high; row++)
        dot(
          sheet,
          x + tongue + Math.round(Math.sin(row / 2 + tongue)),
          gateY - 35 - row,
          row < high * 0.35 ? '#fff1c4' : row < high * 0.7 ? '#ffc04a' : '#ff7a2a',
        );
    }
  }
  box(sheet, 0, gateY, WIDE, TALL - gateY, '#0a0e16');
  for (let row = gateY; row < TALL; row++)
    for (let column = 0; column < WIDE; column++)
      if (Math.abs(column - gateX) < 30 + (row - gateY) * 1.2 && patternOn(column, row, 0.35))
        dot(sheet, column, row, '#1e222e');
  return sheet;
}

export const GAME_SCENES: Readonly<Record<string, () => Sheet>> = { 'overlook-court': overlookCourt, duel, dungeon };

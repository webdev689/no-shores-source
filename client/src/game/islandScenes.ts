// The island's land and sea scenes, painted as `islandArt.ts` paints the rest: a patrol zone's hills, landmark,
// hamlet and three landing zones; an Elite Dungeon's gate in its hillside; a mission's ground; a world boss rising
// from a burning sea; an outpost's palisade on its strand.
import { DARK, fence, fire, ranges, shrine, stones, tree, watchtower, windmill } from '../art/landmarks.ts';
import { clouds, lantern, type Light, LIGHTS, mist, moon, range, sea, sky, stars } from '../art/light.ts';
import { ruins, town } from '../art/places.ts';
import { box, dot, halo, land, patternOn, ridge, shape, type Sheet } from '../art/sheet.ts';
import { burning, ship } from '../art/ships.ts';

/** A patrol zone's lights by its place: dawn over the downs, a clear night, or the Tithe's mist. */
const PATROL_LIGHTS: readonly Light[] = [LIGHTS.dawn, LIGHTS.night, LIGHTS.mist];

/** A patrol zone: its hills fading into the distance, its landmark on the middle hills (a windmill, a watchtower or
 *  standing stones), a hamlet's lit windows, trees and a fence on the near downs, the path winding up between them,
 *  and its three landing zones, each a lantern on a post with a brass pennant. */
export function patrol(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = PATROL_LIGHTS[Math.floor(random() * PATROL_LIGHTS.length)] ?? LIGHTS.dawn;
  const horizon = Math.round(height * 0.46);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * (light === LIGHTS.night ? 1 : 0.35)), horizon - 14);
  if (light !== LIGHTS.mist)
    moon(sheet, light, Math.round(width * (0.12 + 0.76 * random())), Math.round(height * 0.14), 4);
  clouds(sheet, random, light, {
    top: Math.round(height * 0.12),
    depth: Math.round(height * 0.22),
    count: 5,
    litBelow: light === LIGHTS.dawn,
  });
  box(sheet, 0, horizon, width, height - horizon, light.ranges[1] ?? DARK);
  ranges(sheet, random, light, horizon);
  const back = light.ranges[1] ?? '';
  const middle = range(sheet, random, {
    ...{ left: 0, width, top: Math.round(height * 0.42), foot: Math.round(height * 0.58), floor: height },
    ...{ ink: light.ranges[2] ?? '', rim: light.ranges[0] ?? '', rough: 0.5 },
  });
  // Its landmark on the highest of the middle hills, the hamlet on another.
  const crest = middle.indexOf(Math.min(...middle.slice(4, width - 4)));
  const landmark = random();
  const summit: [number, number] = [crest, Math.round(middle[crest] ?? height * 0.5) + 1];
  if (landmark < 0.34)
    windmill(sheet, summit, Math.round(height * 0.16), {
      ink: light.ranges[3] ?? DARK,
      lit: '#c0802c',
      turn: random(),
      broken: random() < 0.4,
    });
  else if (landmark < 0.67) watchtower(sheet, summit, Math.round(height * 0.2), [light.ranges[3] ?? DARK, back]);
  else stones(sheet, random, summit, 5, [light.ranges[3] ?? DARK, light.ranges[0] ?? '']);
  const hamlet = ((crest + Math.round(width * (0.3 + 0.2 * random()))) % (width - 24)) + 12;
  town(sheet, random, middle, 0, [hamlet - 12, hamlet + 12], Math.round((middle[hamlet] ?? height * 0.5) + 6));
  for (let wood = 0; wood < 7; wood++) {
    const x = Math.round(random() * width);
    tree(
      sheet,
      x,
      Math.round(middle[x] ?? height * 0.5) + 1,
      4 + Math.round(random() * 3),
      random() < 0.5,
      light.ranges[3] ?? DARK,
    );
  }
  mist(sheet, Math.round(height * 0.56), Math.round(height * 0.1), light.haze, light === LIGHTS.mist ? 0.55 : 0.3);
  const near = range(sheet, random, {
    ...{ left: 0, width, top: Math.round(height * 0.64), foot: Math.round(height * 0.76), floor: height },
    ...{ ink: light.ranges[3] ?? DARK, rim: back, rough: 0.45 },
  });
  near.forEach((rise, column) => {
    for (let row = Math.round(rise) + 2; row < height; row++)
      if (patternOn(column, row, 0.22 - (row - rise) / 120)) dot(sheet, column, row, light.ranges[2] ?? '');
  });
  const path = (row: number) =>
    Math.round(width * 0.5 + Math.sin(row / 5) * width * 0.07 * ((row - height * 0.6) / height));
  for (let row = Math.round(height * 0.6); row < height; row++)
    for (
      let column = -1 - Math.round((row - height * 0.6) / 12);
      column <= 1 + Math.round((row - height * 0.6) / 12);
      column++
    ) {
      const x = path(row) + column;
      if ((near[x] ?? height) < row && patternOn(x, row, 0.55)) dot(sheet, x, row, back);
    }
  fence(sheet, near, [Math.round(width * 0.06), Math.round(width * 0.4)], light.ranges[1] ?? '');
  for (let wood = 0; wood < 4; wood++) {
    const x = Math.round(width * (0.55 + 0.45 * random()));
    tree(sheet, x, Math.round(near[x] ?? height * 0.7) + 1, 9 + Math.round(random() * 5), random() < 0.6, DARK);
  }
  for (const share of [0.17, 0.5, 0.83]) {
    const x = Math.round(width * (share + 0.04 * (random() - 0.5)));
    const ground = Math.round(near[x] ?? height * 0.7) + 1;
    halo(sheet, x, ground - 12, 9, ['#1e1a1e', '#2a1e16']);
    box(sheet, x, ground - 12, 1, 12, '#1d140f');
    shape(
      sheet,
      [
        [x + 1, ground - 12],
        [x + 7, ground - 11],
        [x + 1, ground - 9],
      ],
      '#d9a04a',
    );
    lantern(sheet, x, ground - 13, 5);
  }
}

/** An Elite Dungeon's gate in a hillside at night: a stone arch over steps down into the dark, a brazier either side
 *  and its light within, violet for the week's Abyss. */
export function dungeon(sheet: Sheet, random: () => number, abyss: boolean): void {
  const { width, height } = sheet;
  const light = abyss
    ? LIGHTS.crystal
    : ([LIGHTS.night, LIGHTS.mist, LIGHTS.dawn][Math.floor(random() * 3)] ?? LIGHTS.night);
  const horizon = Math.round(height * 0.55);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 1.2), horizon - 12);
  clouds(sheet, random, light, { top: Math.round(height * 0.12), depth: Math.round(height * 0.2), count: 3 });
  box(sheet, 0, horizon, width, height - horizon, light.ranges[1] ?? DARK);
  ranges(sheet, random, light, horizon);
  const middle = width / 2;
  const hill = ridge(random, width, height * 0.24, height * 0.42, 0.5).map(
    (rise, column) => rise + Math.abs(column - middle) * 0.35,
  );
  land(sheet, hill, '#0a0f1a', height);
  hill.forEach((rise, column) => {
    dot(sheet, column, rise, '#24324c');
    for (let row = Math.round(rise) + 1; row < height; row++)
      if (patternOn(column, row, 0.3 - (row - rise) / 70)) dot(sheet, column, row, '#141c2c');
  });
  const stone = { face: '#3a4256', dark: '#262c3a', lit: '#5a6278' };
  const [gateW, gateH, gateY] = [Math.round(width * 0.26), Math.round(height * 0.5), Math.round(height * 0.86)];
  const [gateX, left] = [Math.round(middle), Math.round(middle - gateW / 2 - 5)];
  halo(sheet, gateX, gateY - gateH / 2, Math.round(gateW * 1.1), ['#101624', '#161a28']);
  box(sheet, left, gateY - gateH, gateW + 10, gateH, stone.face);
  for (let row = gateY - gateH; row < gateY; row += 4) {
    box(sheet, left, row, gateW + 10, 1, stone.dark);
    for (let column = left + ((row / 4) % 2 === 0 ? 0 : 4); column < left + gateW + 10; column += 8)
      box(sheet, column, row, 1, 4, stone.dark);
  }
  box(sheet, left - 2, gateY - gateH - 3, gateW + 14, 4, stone.lit);
  const archTop = gateY - gateH + 9;
  const opening = gateW / 2 - 3;
  for (let row = archTop; row < gateY; row++)
    for (let column = -opening; column < opening; column++) {
      if (row < archTop + 9 && Math.hypot(column, (row - archTop - 9) * 1.4) >= opening) continue;
      const depth = (row - archTop) / (gateY - archTop);
      dot(
        sheet,
        gateX + column,
        row,
        depth > 0.55 || patternOn(gateX + column, row, depth * 1.6) ? '#020306' : '#0a0c12',
      );
    }
  for (let step = 0; step < 5; step++) {
    const row = gateY - 2 - step * 3;
    if (row < archTop + 12) break;
    box(sheet, gateX - opening + 3 + step * 2, row, opening * 2 - 6 - step * 4, 1, '#2a3040');
  }
  const glows = [
    ['#0c1a2a', '#12304a', '#1a4a6a', '#7ad0ff'],
    ['#0c2018', '#123a26', '#1a5a34', '#8affb0'],
    ['#2a1408', '#4a2410', '#7a3a14', '#ffc04a'],
  ];
  const within = abyss
    ? ['#1a1030', '#2e1a52', '#4a2a80', '#d8b8ff']
    : (glows[Math.floor(random() * glows.length)] ?? []);
  halo(sheet, gateX, gateY - Math.round(gateH * 0.3), Math.round(opening * 0.9), within.slice(0, 3));
  dot(sheet, gateX, gateY - Math.round(gateH * 0.32), within[3] ?? '#7ad0ff');
  // Its hill's trees, clear of the gate.
  for (let wood = 0; wood < 6; wood++) {
    const x = Math.round(
      random() < 0.5 ? random() * (gateX - gateW) : gateX + gateW + random() * (width - gateX - gateW),
    );
    tree(sheet, x, Math.round(hill[x] ?? height * 0.4) + 2, 6 + Math.round(random() * 6), random() < 0.6, '#060a12');
  }
  // The keystone's rune, lit.
  box(sheet, gateX - 1, gateY - gateH - 2, 2, 2, abyss ? '#c9a2ff' : '#f3cf86');
  for (const side of [-1, 1]) {
    const x = Math.round(gateX + side * (gateW / 2 + 12));
    halo(sheet, x, gateY - 16, 18, ['#1a1416', '#2a1a14', '#4a2a16']);
    box(sheet, x, gateY - 14, 2, 14, '#120c08');
    box(sheet, x - 3, gateY - 16, 8, 3, '#120c08');
    fire(sheet, [x + 1, gateY - 17], 7);
  }
  box(sheet, 0, gateY, width, height - gateY, '#0a0e16');
  for (let row = gateY; row < height; row++)
    for (let column = 0; column < width; column++)
      if (Math.abs(column - gateX) < opening + (row - gateY) * 1.2 && patternOn(column, row, 0.35))
        dot(sheet, column, row, '#1e222e');
}

/** A mission's lights by its place: the Tithe's mist, the first grey of morning, or fire at dusk. */
const MISSION_LIGHTS: readonly Light[] = [LIGHTS.mist, LIGHTS.dawn, LIGHTS.ember];

/** A mission's ground: broken walls under its banner, a shrine with its lantern, or a windmill with its sails broken,
 *  by its place; a lantern lit on a post, and mist lying low over it all. */
export function mission(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = MISSION_LIGHTS[Math.floor(random() * MISSION_LIGHTS.length)] ?? LIGHTS.mist;
  const horizon = Math.round(height * 0.62);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 0.4), horizon - 20);
  if (light !== LIGHTS.mist)
    moon(sheet, light, Math.round(width * (0.1 + 0.2 * random())), Math.round(height * 0.18), 5);
  clouds(sheet, random, light, {
    top: Math.round(height * 0.1),
    depth: Math.round(height * 0.3),
    count: 6,
    litBelow: light !== LIGHTS.mist,
  });
  box(sheet, 0, horizon, width, height - horizon, light.ranges[2] ?? DARK);
  ranges(sheet, random, light, horizon);
  const ground = ridge(random, width, height * 0.74, height * 0.8, 0.4);
  land(sheet, ground, light.ranges[3] ?? DARK, height);
  const foot = (x: number) => Math.round(ground[Math.round(x)] ?? height * 0.78) + 1;
  const kind = random();
  const middle = Math.round(width * (0.3 + 0.25 * random()));
  if (kind < 0.34) {
    halo(sheet, middle, foot(middle) - 16, 30, ['#141016', '#1e1614', '#2a1c14']);
    ruins(sheet, random, [middle - Math.round(width * 0.26), middle + Math.round(width * 0.2)], foot(middle), {
      wall: light.ranges[1] ?? '#29323e',
      dark: light.ranges[3] ?? DARK,
      hole: '#c0802c',
    });
    const pole = middle + Math.round(width * 0.26);
    const base = foot(pole);
    box(sheet, pole, base - 30, 1, 30, '#1d140f');
    box(sheet, pole - 5, base - 29, 11, 1, '#1d140f');
    for (let row = 0; row < 16; row++)
      for (let column = -4; column < 6; column++) {
        if (row > 11 && Math.abs(column - 0.5) < row - 11) continue;
        dot(sheet, pole + column, base - 28 + row, column % 3 === 0 ? '#5a1e18' : '#8a2e22');
      }
  } else if (kind < 0.67) {
    halo(sheet, middle, foot(middle) - 20, 32, ['#1a1416', '#2a1c16', '#3a2416', '#4a2c16']);
    shrine(sheet, [middle, foot(middle)], 28, DARK);
    for (const side of [-1, 1]) tree(sheet, middle + side * 28, foot(middle + side * 28), 22, true, DARK);
  } else {
    halo(sheet, middle, foot(middle) - 24, 34, ['#141016', '#1e1614', '#2a1c14']);
    windmill(sheet, [middle, foot(middle)], Math.round(height * 0.42), {
      ink: DARK,
      lit: '#c0802c',
      turn: 0.3 + random(),
      broken: true,
    });
    if (light === LIGHTS.ember)
      for (let ember = 0; ember < 18; ember++)
        dot(sheet, middle + (random() - 0.5) * 20, foot(middle) - 10 - random() * 30, '#ffc04a');
  }
  const post = Math.round(width * 0.86);
  box(sheet, post, foot(post) - 8, 1, 8, '#1d140f');
  lantern(sheet, post, foot(post) - 9, 9);
  mist(sheet, Math.round(height * 0.66), Math.round(height * 0.2), light.haze, light === LIGHTS.mist ? 0.5 : 0.3);
}

/** A world boss rising from an ember sea: its shoulders and horned head black against the fire, the edges facing the
 *  fire lit, its eyes and its open maw burning, tentacles breaking the water round it, foam at its foot, and a ship
 *  broken and burning off to one side. */
export function boss(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = LIGHTS.ember;
  const horizon = Math.round(height * 0.66);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 0.4), horizon - 30);
  const fromAbove = { top: Math.round(height * 0.16), depth: Math.round(height * 0.3), count: 6, litBelow: true };
  clouds(sheet, random, light, fromAbove);
  sea(sheet, random, light, horizon, [{ x: Math.round(width * 0.5), wide: 9, ink: '#6a3424', core: '#c0602a' }]);
  const [middle, top] = [Math.round(width * (0.42 + 0.12 * random())), Math.round(height * 0.14)];
  halo(sheet, middle, Math.round(height * 0.42), Math.round(width * 0.42), [
    '#2a1210',
    '#3e1a14',
    '#5a2416',
    '#7a3418',
  ]);
  const body = '#050306';
  const onBody = (across: number, down: number): [number, number] => [middle + width * across, top + height * down];
  shape(
    sheet,
    [
      onBody(-0.46, 0.56),
      onBody(-0.26, 0.3),
      onBody(-0.12, 0.12),
      onBody(-0.07, 0),
      onBody(0.07, 0),
      onBody(0.12, 0.12),
      onBody(0.26, 0.3),
      onBody(0.46, 0.56),
    ],
    body,
  );
  for (const side of [-1, 1]) {
    shape(
      sheet,
      [onBody(side * 0.05, 0.02), onBody(side * 0.22, -0.12), onBody(side * 0.2, -0.08), onBody(side * 0.09, 0.07)],
      body,
    );
    const eye = onBody(side * 0.035, 0.08).map(Math.round) as [number, number];
    halo(sheet, eye[0], eye[1], 5, ['#3a1210', '#8a2a14', '#e0602a']);
    box(sheet, eye[0] - 1, eye[1], 2, 1, '#ffd9a0');
  }
  // Its maw open under its eyes: a red throat behind two rows of teeth.
  const [mawX, mawY] = onBody(0, 0.17).map(Math.round) as [number, number];
  const maw = Math.max(4, Math.round(width * 0.05));
  for (let row = 0; row < maw / 2; row++)
    for (let column = -maw + row; column <= maw - row; column++)
      dot(
        sheet,
        mawX + column,
        mawY + row,
        row < 1 ? '#ff7a2a' : patternOn(mawX + column, mawY + row, 0.5) ? '#8a2a14' : '#4a1208',
      );
  for (let tooth = -maw + 1; tooth < maw; tooth += 2) {
    dot(sheet, mawX + tooth, mawY, '#e8dcc8');
    dot(sheet, mawX + tooth, mawY + Math.max(1, Math.round(maw / 2) - 1), '#e8dcc8');
  }
  // The edges that face the fire below catch it.
  for (let row = top - Math.round(height * 0.12); row < horizon; row++)
    for (let column = 0; column < width; column++) {
      const here = sheet.cells[row * width + column];
      if (here !== body) continue;
      const open = (across: number, down: number) => sheet.cells[(row + down) * width + column + across] !== body;
      if ((open(-1, 0) || open(1, 0)) && patternOn(column, row, 0.6))
        dot(sheet, column, row, row > horizon - height * 0.25 ? '#c0602a' : '#7a3e1a');
    }
  for (let arm = 0; arm < 4; arm++) {
    const base = Math.round(width * (arm < 2 ? 0.08 + arm * 0.14 : 0.62 + (arm - 2) * 0.12) + random() * 6);
    const reach = Math.round(height * (0.14 + random() * 0.12));
    let [x, y] = [base, horizon + 3];
    for (let step = 0; step < reach; step++) {
      const thick = Math.max(1, Math.round(3 * (1 - step / reach)));
      box(sheet, Math.round(x), Math.round(y), thick, 1, body);
      if (step % 3 === 0 && thick > 1) dot(sheet, Math.round(x) + thick, Math.round(y), '#7a3e1a');
      x += Math.sin(step / 4 + arm) * 0.9;
      y -= 1;
    }
  }
  for (let column = 0; column < width; column++)
    if (sheet.cells[(horizon + 3) * width + column] === body || patternOn(column, horizon + 4, 0.15))
      for (const down of [3, 4]) if (random() < 0.5) dot(sheet, column, horizon + down, '#d9a07a');
  burning(sheet, random, Math.round(width * 0.88), horizon + 2, Math.round(width * 0.06), '#0a0606');
}

/** An outpost's strand at dawn: its palisade of stakes, the watchtower with its lantern and pennant, a ship off it. */
export function outpost(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = LIGHTS.dawn;
  const horizon = Math.round(height * 0.55);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 0.4), horizon - 24);
  clouds(sheet, random, light, {
    top: Math.round(height * 0.16),
    depth: Math.round(height * 0.22),
    count: 4,
    litBelow: true,
  });
  ranges(sheet, random, light, horizon, Math.round(width * 0.4));
  sea(sheet, random, light, horizon, [{ x: Math.round(width * 0.8), wide: 6, ink: '#7a7480', core: '#b0907c' }]);
  ship(sheet, Math.round(width * 0.82), horizon + 6, Math.round(width * 0.14), {
    ...{ hull: '#0a0e18', wale: '#2a3048', sail: '#4a4a5a', shade: '#343848', rig: '#0e1220', masts: 2 },
    ...{ facing: -1, furled: true, reflection: '#0a101c' },
  });
  const strand = ridge(random, width, height * 0.7, height * 0.76, 0.4).map((rise, column) => rise + column * 0.04);
  land(sheet, strand, '#1a1a1e', height);
  strand.forEach((rise, column) => {
    dot(sheet, column, rise, '#4a4446');
    for (let row = Math.round(rise) + 1; row < height; row++)
      if (patternOn(column, row, 0.35 - (row - rise) / 60)) dot(sheet, column, row, '#2a282c');
  });
  const start = Math.round(width * (0.12 + 0.08 * random()));
  for (let stake = 0; stake < 13; stake++) {
    const x = start + stake * 4;
    const ground = Math.round(strand[x] ?? height * 0.74) + 1;
    const tall = 12 + (stake % 3);
    box(sheet, x, ground - tall, 3, tall, '#1d140f');
    box(sheet, x, ground - tall, 1, tall, '#3a2a1c');
    dot(sheet, x + 1, ground - tall - 1, '#1d140f');
  }
  const tower = start + 22;
  const base = Math.round(strand[tower] ?? height * 0.74) + 1;
  box(sheet, tower, base - 34, 8, 34, '#1d140f');
  box(sheet, tower, base - 34, 2, 34, '#3a2a1c');
  box(sheet, tower - 2, base - 37, 12, 3, '#120c08');
  lantern(sheet, tower + 4, base - 30, 8);
  box(sheet, tower + 4, base - 47, 1, 10, '#120c08');
  shape(
    sheet,
    [
      [tower + 5, base - 47],
      [tower + 12, base - 45],
      [tower + 5, base - 43],
    ],
    '#c0802c',
  );
}

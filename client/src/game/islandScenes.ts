// The island's land scenes, painted as `islandArt.ts` paints the rest: a patrol zone's hills, landmark, hamlet and
// three landing zones, and an Elite Dungeon's gate in its hillside.
import { DARK, fence, fire, ranges, stones, tree, watchtower, windmill } from '../art/landmarks.ts';
import { clouds, lantern, type Light, LIGHTS, mist, moon, range, sky, stars } from '../art/light.ts';
import { town } from '../art/places.ts';
import { box, dot, halo, land, patternOn, ridge, shape, type Sheet } from '../art/sheet.ts';

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

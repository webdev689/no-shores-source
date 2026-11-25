// The pictures of the story's turns ashore and below: the depths the captain sinks through toward the light that
// calls, a ruined port overtaken by the Lattice's crystal, and Saltmere's shore where the captain wakes at first light.
import { seeded } from '../../../client/src/seeded.ts';
import { figure } from './figures.ts';
import { clouds, LIGHTS, mist, range, sea, sky, stars } from './light.ts';
import { beacon, cluster, crystalLight, isle, ruins, town } from './places.ts';
import { box, dot, fade, glow, halo, land, line, makeSheet, patternOn, ridge, shape, type Sheet } from './sheet.ts';

const WIDE = 320;
const TALL = 180;

/** The depths: light from the surface far above, the captain sinking, and below a faint light that calls. */
function depths(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  fade(sheet, 0, TALL, ['#2a5070', '#1c3a58', '#132a44', '#0c1e34', '#071426', '#040c1a', '#020610', '#010409']);
  const random = seeded(41);
  for (let column = 0; column < WIDE; column++) {
    const wave = Math.round(2 + Math.sin(column / 7) * 1.5 + Math.sin(column / 3.1) * 0.8);
    for (let row = 0; row < wave; row++) dot(sheet, column, row, '#5a8aa8');
    if (column % 9 < 4) dot(sheet, column, wave + 1, '#3e6a8a');
  }
  for (let ray = 0; ray < 7; ray++) {
    const x = 30 + ray * 44 + random() * 18;
    const wide = 3 + random() * 5;
    for (let row = 4; row < 120; row++)
      for (let column = -wide; column <= wide; column++) {
        const shaft = Math.round(x + column + row * 0.35);
        if (patternOn(shaft, row, 0.28 * (1 - row / 120) * (1 - Math.abs(column) / (wide + 1))))
          dot(sheet, shaft, row, '#3e6a8a');
      }
  }
  for (let mote = 0; mote < 90; mote++)
    dot(sheet, random() * WIDE, 10 + random() * 150, random() < 0.3 ? '#4a7090' : '#2a4864');
  halo(sheet, 176, 170, 78, ['#06121e', '#0a1c2c', '#0e2a3c', '#1a4656', '#2e6a78']);
  glow(sheet, 176, 170, 9, '#a8e6ff', 0.8);
  dot(sheet, 176, 170, '#f4fbff');
  figure(sheet, 'sinking', 146, 46, ['#02040a', '#0c1a2c', '#3a5068']);
  for (let bubble = 0; bubble < 22; bubble++) {
    const x = 152 + random() * 20;
    const y = 44 - random() * 40;
    dot(sheet, x, y, '#6a9ab8');
    if (random() < 0.3) dot(sheet, x + 1, y, '#3c5a78');
  }
  return sheet;
}

/** A ruined port by the sea at night, its walls overtaken by the crystal's red and purple, their light on the water. */
function ruinedPort(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 126;
  const light = LIGHTS.crystal;
  sky(sheet, light, horizon);
  stars(sheet, seeded(51), light, 160, horizon - 30);
  clouds(sheet, seeded(56), light, { top: 30, depth: 50, count: 6, litBelow: true });
  range(sheet, seeded(57), {
    left: 0,
    width: WIDE,
    top: horizon - 34,
    foot: horizon - 12,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
    rim: '#4a2c66',
  });
  sea(sheet, seeded(52), light, horizon, [
    { x: 72, wide: 5, ink: '#4a2470', core: '#9a5ee0' },
    { x: 178, wide: 7, ink: '#5e1a32', core: '#d84a66' },
    { x: 262, wide: 4, ink: '#4a2470', core: '#9a5ee0' },
  ]);
  const clusters = [
    [46, 22, 0],
    [112, 18, 1],
    [176, 36, 1],
    [236, 26, 0],
    [292, 16, 1],
  ] as const;
  for (const [x, size, strain] of clusters) crystalLight(sheet, x, horizon - 4, size, strain);
  const hill = ridge(seeded(53), WIDE, horizon - 22, horizon - 6, 0.5);
  land(sheet, hill, light.ranges[2] ?? '', horizon + 1);
  ruins(sheet, seeded(54), [12, 308], horizon - 6, { wall: '#22193a', dark: '#160f28', hole: '#3a1a48' });
  shape(
    sheet,
    [
      [150, horizon - 6],
      [150, horizon - 58],
      [156, horizon - 64],
      [162, horizon - 54],
      [170, horizon - 70],
      [178, horizon - 50],
      [178, horizon - 6],
    ],
    '#1e1632',
  );
  box(sheet, 150, horizon - 58, 2, 52, '#3a2c56');
  for (const [x, y] of [
    [156, horizon - 46],
    [168, horizon - 46],
    [156, horizon - 28],
  ] as const)
    box(sheet, x, y, 4, 7, '#0a0714');
  const random = seeded(55);
  for (const [x, size, strain] of clusters) cluster(sheet, random, x, horizon - 4, size, strain);
  box(sheet, 0, horizon, WIDE, 2, '#0a0714');
  return sheet;
}

/** Saltmere's shore at first light: the captain on the sand at the tide line, a broken plank, Overlook on its rock. */
function shore(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 96;
  const light = LIGHTS.dawn;
  sky(sheet, light, horizon);
  stars(sheet, seeded(61), light, 60, 34);
  clouds(sheet, seeded(66), light, { top: 44, depth: 40, count: 8, litBelow: true });
  sea(sheet, seeded(62), light, horizon, [{ x: 96, wide: 9, ink: '#8a7a78', core: '#c8a88a' }]);
  const island = { left: 196, right: 344, top: 38, waterline: horizon + 4, peak: 0.55 };
  const ground = isle(sheet, seeded(63), island, { hue: '#141a28', lit: '#222a3c', edge: '#4a5266' });
  town(sheet, seeded(64), ground, island.left, [214, 330], horizon - 4, {
    wall: '#262e42',
    wallDark: '#1a2132',
    roof: '#121826',
    roofLit: '#3a4256',
    window: '#e0a04a',
    windowDim: '#7a5a3a',
  });
  const summit = ground.indexOf(Math.min(...ground.slice(40, 120)));
  beacon(sheet, island.left + summit, Math.round(ground[summit] ?? island.top) + 2, 16);
  mist(sheet, horizon - 6, 14, light.haze, 0.35);
  const beach = ridge(seeded(65), WIDE, 134, 146, 0.4).map((height, column) => height + column * 0.06);
  for (let wash = 0; wash < 3; wash++)
    beach.forEach((height, column) => {
      const row = Math.round(height - 3 - wash * 3 + Math.sin(column / (9 + wash * 4)) * 1.5);
      if (patternOn(column, row, 0.7 - wash * 0.25)) dot(sheet, column, row, '#b8c0cc');
    });
  land(sheet, beach, '#5a5450', TALL);
  beach.forEach((height, column) => {
    dot(sheet, column, height, '#8a8078');
    for (let row = Math.round(height) + 1; row < TALL; row++)
      if (patternOn(column, row, 0.2 + (row - height) / 70)) dot(sheet, column, row, '#3a3638');
  });
  figure(sheet, 'lying', 98, Math.round(beach[120] ?? 140) - 4, ['#08090e', '#2a2f3c', '#a08a78']);
  shape(
    sheet,
    [
      [168, 152],
      [204, 147],
      [205, 151],
      [169, 156],
    ],
    '#3a2a1e',
  );
  line(sheet, 168, 152, 204, 147, '#5a4030');
  line(sheet, 228, 160, 252, 150, '#2e2018');
  for (let pebble = 0; pebble < 40; pebble++) {
    const x = (pebble * 37) % WIDE;
    dot(sheet, x, (beach[x] ?? 150) + 4 + ((pebble * 13) % 20), '#7a726a');
  }
  return sheet;
}

export const LAND_SCENES: Readonly<Record<string, () => Sheet>> = { depths, 'ruined-port': ruinedPort, shore };

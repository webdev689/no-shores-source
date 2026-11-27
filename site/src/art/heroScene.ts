// Home's scene, Overlook by night, in two layers: the picture, and its lights alone (windows, lanterns, the beacon)
// for the page to flicker over it. The town stands to the right and low, so the logo, the first line and Play sit over
// open sky at every width.
import { seeded } from '../../../client/src/seeded.ts';
import { clouds, LIGHTS, moon, range, sea, sky, stars } from '../../../client/src/art/light.ts';
import { beacon, isle, quay, town } from '../../../client/src/art/places.ts';
import { ship } from '../../../client/src/art/ships.ts';
import { logoSheet } from './logo.ts';
import { box, dot, land, makeSheet, patternOn, ridge, type Sheet } from '../../../client/src/art/sheet.ts';

export const HERO = { width: 640, height: 300, horizon: 212 } as const;

/** The ships at anchor before Overlook: where each lies, its size and which way it swings. */
const ANCHORED = [
  { x: 150, water: 8, length: 26, facing: -1, masts: 2 },
  { x: 262, water: 14, length: 40, facing: 1, masts: 3 },
  { x: 372, water: 6, length: 22, facing: -1, masts: 2 },
  { x: 318, water: 40, length: 62, facing: -1, masts: 3 },
] as const;

/** Overlook by night: the town stepping up Saltmere's rock to its beacon, the quay's lanterns, ships at anchor. */
export function heroLayers(): { back: Sheet; lights: Sheet } {
  const { width, height, horizon } = HERO;
  const back = makeSheet(width, height);
  const lights = makeSheet(width, height);
  const light = LIGHTS.night;
  sky(back, light, horizon);
  stars(back, seeded(1), light, 420, horizon - 30);
  moon(back, light, 86, 58, 11);
  clouds(back, seeded(7), light, { top: 120, depth: 60, count: 7, litBelow: false });
  range(back, seeded(2), {
    left: 0,
    width: 260,
    top: horizon - 14,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
    rough: 0.5,
  });
  range(back, seeded(8), {
    left: 20,
    width: 150,
    top: horizon - 8,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[1] ?? '',
    rough: 0.6,
  });
  sea(back, seeded(3), light, horizon, [
    { x: 86, wide: 6, ink: '#6e7a8e', core: '#c8d0dc' },
    { x: 470, wide: 9, ink: '#7a4416', core: '#d99a36', from: horizon + 16 },
    { x: 528, wide: 8, ink: '#7a4416', core: '#c0802c', from: horizon + 16 },
  ]);
  const island = { left: 430, right: width + 60, top: 96, waterline: horizon + 14, peak: 0.55 };
  const ground = isle(back, seeded(4), island);
  const summit = ground.indexOf(Math.min(...ground.slice(60, 220)));
  town(back, seeded(5), ground, island.left, [452, 640], horizon - 4, undefined, lights);
  beacon(back, island.left + summit, Math.round(ground[summit] ?? island.top) + 2, 26, undefined, lights);
  quay(back, horizon + 12, [440, 600], [470, 528, 584], lights);
  for (const anchored of ANCHORED) {
    const waterline = horizon + anchored.water;
    ship(back, anchored.x, waterline, anchored.length, {
      hull: '#04070d',
      wale: '#1c2a40',
      sail: '#3a4558',
      shade: '#283244',
      rig: '#0a101c',
      masts: anchored.masts,
      facing: anchored.facing,
      furled: true,
      lantern: true,
      ports: anchored.length > 40 ? '#c0802c' : undefined,
      reflection: '#03060c',
    });
    dot(
      lights,
      Math.round(anchored.x - (anchored.length / 2) * 1.05 * anchored.facing),
      waterline - Math.round(anchored.length * 0.25),
      '#fff1c4',
    );
  }
  const near = ridge(seeded(6), 230, height - 30, height - 8, 0.6).map((value, column) => value + column * 0.04);
  land(back, near, '#03050a', height);
  near.forEach((value, column) => {
    if (patternOn(column, Math.round(value), 0.6)) dot(back, column, value, light.ranges[2] ?? '');
  });
  box(back, 0, height - 1, width, 1, '#03050a');
  return { back, lights };
}

/** The picture a shared link unfolds into: the hero, its lights lit, twice its size, the logo over its sky. */
export function shareCard(): Sheet {
  const { back, lights } = heroLayers();
  const scale = 2;
  const card = makeSheet(back.width * scale, back.height * scale);
  for (let row = 0; row < card.height; row++)
    for (let column = 0; column < card.width; column++) {
      const from = Math.floor(row / scale) * back.width + Math.floor(column / scale);
      card.cells[row * card.width + column] = lights.cells[from] || back.cells[from] || '';
    }
  const logo = logoSheet();
  const left = Math.round((card.width - logo.width * scale) / 2) - 40;
  const top = 70;
  for (let row = 0; row < logo.height * scale; row++)
    for (let column = 0; column < logo.width * scale; column++) {
      const ink = logo.cells[Math.floor(row / scale) * logo.width + Math.floor(column / scale)];
      if (ink) card.cells[(top + row) * card.width + left + column] = ink;
    }
  return card;
}

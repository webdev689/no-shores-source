// The pictures out on the Pale Expanse: the open water and a burned port, the Grey Tithe's sails in the mist, Thule's
// flagship over a broken ship, and a captain's own ship under full sail. Each is drawn from fixed seeds, the same at
// every build.
import { seeded } from '../../../client/src/seeded.ts';
import { clouds, LIGHTS, mist, moon, range, sea, sky, stars } from './light.ts';
import { ruins } from './places.ts';
import { burning, ship } from './ships.ts';
import { dot, glow, halo, line, lightOn, makeSheet, patternOn, type Sheet } from './sheet.ts';

export const WIDE = 320;
export const TALL = 180;

/** Smoke rising from `x, y` and leaning with the wind, thinning as it climbs. */
function smoke(sheet: Sheet, random: () => number, x: number, y: number, high: number, ink: string): void {
  for (let row = 0; row < high; row++)
    for (let column = -6 - row / 3; column < 6 + row / 3; column++) {
      const drift = Math.round(x + column + row * 0.7 + Math.sin(row / 6) * 3);
      if (patternOn(drift, y - row, 0.55 - row / (high * 1.3) + (random() - 0.5) * 0.25))
        dot(sheet, drift, y - row, ink);
    }
}

/** The Pale Expanse: open water under the stars, a far coast, and on it a burned port still smoking. */
function expanse(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 112;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(11), light, 210, horizon - 20);
  halo(sheet, 240, horizon, 70, ['#160f1c', '#24141c', '#3a1c1c']);
  clouds(sheet, seeded(16), light, { top: 40, depth: 40, count: 5 });
  range(sheet, seeded(13), {
    left: 120,
    width: 200,
    top: horizon - 20,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
    rim: '#2a2030',
  });
  range(sheet, seeded(17), {
    left: 170,
    width: 150,
    top: horizon - 10,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[1] ?? '',
  });
  ruins(sheet, seeded(14), [204, 284], horizon - 4, { wall: '#1c2236', dark: '#121628', hole: '#4a1e14' });
  for (const [x, y] of [
    [214, horizon - 12],
    [236, horizon - 20],
    [262, horizon - 9],
  ] as const)
    glow(sheet, x, y, 3, '#e0602a', 0.8);
  glow(sheet, 240, horizon - 6, 18, '#7a2a14', 0.5);
  lightOn(sheet, 240, horizon - 10, 34, '#3a2220', 0.45);
  smoke(sheet, seeded(15), 236, horizon - 12, 80, '#262838');
  sea(sheet, seeded(12), light, horizon, [{ x: 240, wide: 5, ink: '#5a2414', core: '#c0602a' }]);
  ship(sheet, 76, horizon + 34, 44, {
    hull: '#04070d',
    wale: '#1c2a40',
    sail: '#56627a',
    shade: '#3a4558',
    rig: '#0a101c',
    lantern: true,
    wake: '#4a5a74',
    reflection: '#04080f',
  });
  return sheet;
}

/** The Grey Tithe: grey, unmarked sails closing out of the mist on one ship with its lantern lit. */
function greyTithe(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 100;
  const light = LIGHTS.mist;
  sky(sheet, light, horizon);
  stars(sheet, seeded(21), light, 24, 30);
  clouds(sheet, seeded(23), light, { top: 6, depth: 70, count: 14 });
  sea(sheet, seeded(22), light, horizon, [{ x: 70, wide: 4, ink: '#7a4416', core: '#c0802c', from: horizon + 34 }]);
  const grey = { hull: '#262d38', wale: '#3a4250', rig: '#1e242e', facing: -1 as const, wake: '#5a6472' };
  ship(sheet, 262, horizon + 4, 22, { ...grey, sail: '#5a626e', shade: '#4a525e', hull: '#2c343f' });
  mist(sheet, horizon - 26, 34, light.haze, 0.45, 120);
  ship(sheet, 292, horizon + 16, 36, { ...grey, sail: '#8a929e', shade: '#6a727e' });
  mist(sheet, horizon - 10, 30, light.haze, 0.3, 140);
  ship(sheet, 206, horizon + 36, 64, {
    ...grey,
    sail: '#a8b0ba',
    shade: '#7a828e',
    masts: 3,
    ports: '#141a22',
    reflection: '#0e141c',
  });
  mist(sheet, horizon + 30, 24, light.haze, 0.22);
  ship(sheet, 70, horizon + 34, 40, {
    hull: '#05080e',
    wale: '#22303e',
    sail: '#3e4a5a',
    shade: '#2c3644',
    rig: '#0a0e14',
    lantern: true,
    reflection: '#06090e',
  });
  return sheet;
}

/** Thule's flagship, far bigger, over a captain's ship broken apart: fire, splinters, smoke, a red dusk behind. */
function thule(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 104;
  const light = LIGHTS.ember;
  sky(sheet, light, horizon);
  stars(sheet, seeded(31), light, 60, 40);
  clouds(sheet, seeded(34), light, { top: 50, depth: 46, count: 8, litBelow: true });
  sea(sheet, seeded(32), light, horizon, [{ x: 112, wide: 12, ink: '#7a3a1c', core: '#e07a2a', from: horizon + 40 }]);
  ship(sheet, 214, horizon + 52, 132, {
    hull: '#020204',
    wale: '#1a0e0e',
    sail: '#120c10',
    shade: '#0a0608',
    rig: '#050304',
    masts: 3,
    facing: -1,
    ports: '#e0602a',
    reflection: '#080406',
  });
  const splinters = seeded(33);
  burning(sheet, seeded(36), 110, horizon + 44, 46, '#2a1810');
  smoke(sheet, seeded(35), 104, horizon + 20, 100, '#140c10');
  for (let piece = 0; piece < 30; piece++) {
    const angle = splinters() * Math.PI * 1.3 + Math.PI * 0.85;
    const reach = 8 + splinters() * 34;
    const x = 104 + Math.cos(angle) * reach;
    const y = horizon + 30 + Math.sin(angle) * reach * 0.7;
    line(sheet, x, y, x + 2, y + (splinters() < 0.5 ? 1 : -1), splinters() < 0.35 ? '#ffa040' : '#2a1a12');
  }
  return sheet;
}

/** A captain's own ship under full sail by moonlight, its wake white behind it, other ships far off on their way. */
function underSail(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 108;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(71), light, 220, horizon - 20);
  moon(sheet, light, 258, 32, 9);
  clouds(sheet, seeded(73), light, { top: 50, depth: 40, count: 6, litBelow: false });
  range(sheet, seeded(74), {
    left: 0,
    width: 120,
    top: horizon - 8,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
  });
  sea(sheet, seeded(72), light, horizon, [{ x: 258, wide: 6, ink: '#6e7a8e', core: '#c8d0dc' }]);
  const far = { hull: '#0a0f19', sail: '#3a4558', shade: '#283244', rig: '#0a0f19' };
  ship(sheet, 34, horizon + 3, 16, far);
  ship(sheet, 300, horizon + 4, 18, { ...far, facing: -1 });
  ship(sheet, 146, horizon + 56, 96, {
    hull: '#06090f',
    wale: '#6a4a24',
    sail: '#d8d0ba',
    shade: '#9a927e',
    rig: '#0c1018',
    masts: 3,
    lantern: true,
    ports: '#1a1410',
    pennant: '#ffd36e',
    wake: '#a8b8cc',
    reflection: '#050a12',
  });
  return sheet;
}

export const SEA_SCENES: Readonly<Record<string, () => Sheet>> = {
  expanse,
  'grey-tithe': greyTithe,
  thule,
  'under-sail': underSail,
};

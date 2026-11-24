// The website's pictures, each by its name: what stands where and in which light. Each is drawn from a fixed seed, so
// a picture is the same at every build. What each shows comes from the premise and the owner's decisions: Overlook a
// lantern-lit port on Saltmere, the Grey Tithe's grey unmarked sails, Thule's flagship, the call in the deep, the
// ruined ports overtaken by the Lattice's red and purple crystal, the shore the captain wakes on.
import { seeded } from '../../../client/src/seeded.ts';
import { cluster, figure, isle, lantern, moon, nightSky, PALETTE, ruins, sea, ship, stars, town } from './parts.ts';
import {
  box,
  disc,
  dot,
  fade,
  glow,
  land,
  lightOn,
  line,
  makeSheet,
  patternOn,
  ridge,
  shape,
  type Sheet,
} from './sheet.ts';

const WIDE = 320;
const TALL = 180;

/** Overlook by night: the town climbing Saltmere's rock over its harbour, ships at anchor, the Pale Expanse beyond. */
function overlookLayers(): { back: Sheet; lights: Sheet } {
  const width = 480;
  const height = 200;
  const horizon = 128;
  const back = makeSheet(width, height);
  const lights = makeSheet(width, height);
  const random = seeded(1);
  nightSky(back, random, horizon);
  moon(back, 88, 38, 9);
  land(back, ridge(seeded(2), 150, horizon - 6, horizon, 0.5), PALETTE.far.hue, horizon + 1, 10);
  sea(back, seeded(3), horizon, [
    { x: 88, wide: 5, ink: PALETTE.moon[0] },
    { x: 300, wide: 10, ink: PALETTE.gold.deep, from: horizon + 10 },
    { x: 336, wide: 7, ink: PALETTE.gold.mid, from: horizon + 10 },
  ]);
  const left = 250;
  const ground = isle(back, seeded(4), left, width + 20, 52, horizon + 10);
  town(back, seeded(5), ground, left, [272, 470], 70, lights);
  box(back, 250, horizon + 8, 110, 3, PALETTE.timber);
  for (let post = 254; post < 360; post += 12) box(back, post, horizon + 11, 2, 6, PALETTE.timber);
  for (const post of [262, 298, 334]) {
    lantern(back, post, horizon + 5, 7);
    dot(lights, post, horizon + 5, PALETTE.gold.white);
  }
  const look = { hull: '#05080f', sail: PALETTE.grey.shade, shade: PALETTE.grey.hull, lantern: true, furled: true };
  ship(back, 204, horizon + 22, 46, { ...look, masts: 3 });
  ship(back, 150, horizon + 13, 28, { ...look, facing: -1 });
  ship(back, 402, horizon + 30, 34, look);
  for (const [x, y] of [
    [181, horizon + 13],
    [138, horizon + 6],
    [386, horizon + 22],
  ] as const)
    dot(lights, x, y, PALETTE.gold.white);
  const rocks = ridge(seeded(6), width, height - 22, height - 6, 0.6);
  land(back, rocks.slice(0, 170), PALETTE.rock.hue, height);
  return { back, lights };
}

/** The Pale Expanse: open water under the stars, and a burned port standing broken on a far coast. */
function expanse(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 112;
  nightSky(sheet, seeded(11), horizon);
  sea(sheet, seeded(12), horizon, [{ x: 236, wide: 4, ink: PALETTE.ember.deep }]);
  const coast = ridge(seeded(13), 200, horizon - 14, horizon, 0.5);
  land(sheet, coast, PALETTE.far.hue, horizon + 1, 150);
  ruins(sheet, seeded(14), [196, 280], horizon - 6, '#263450', PALETTE.ember.deep);
  glow(sheet, 236, horizon - 4, 22, PALETTE.ember.deep, 0.45);
  lightOn(sheet, 236, horizon - 8, 30, '#4a2a22', 0.5);
  const smoke = seeded(15);
  for (let row = 0; row < 70; row++)
    for (let column = -8 - row / 4; column < 8 + row / 4; column++) {
      const x = 236 + column + row * 0.6;
      if (patternOn(Math.round(x), horizon - 10 - row, 0.5 - row / 160 + (smoke() - 0.5) * 0.3))
        dot(sheet, x, horizon - 10 - row, '#1a2030');
    }
  ship(sheet, 70, horizon + 30, 30, {
    hull: '#04070d',
    sail: PALETTE.grey.shade,
    shade: PALETTE.grey.hull,
    lantern: true,
  });
  return sheet;
}

/** The Grey Tithe: grey, unmarked sails closing out of the mist on one ship with its lantern lit. */
function greyTithe(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 104;
  const overcast = ['#0b1019', '#121a26', '#1a2330', '#232d3b', '#2d3746', PALETTE.grey.mist];
  fade(sheet, 0, horizon, overcast);
  stars(sheet, seeded(21), 30, 40);
  sea(sheet, seeded(22), horizon, [{ x: 82, wide: 4, ink: PALETTE.gold.deep, from: horizon + 40 }]);
  const grey = { hull: PALETTE.grey.hull, sail: PALETTE.grey.sail, shade: PALETTE.grey.shade, facing: -1 as const };
  ship(sheet, 248, horizon + 6, 26, { ...grey, hull: '#28303b', sail: '#6d7580', shade: '#4d5560' });
  ship(sheet, 290, horizon + 16, 34, grey);
  ship(sheet, 208, horizon + 34, 52, { ...grey, masts: 3 });
  for (let row = horizon - 30; row < horizon + 14; row++)
    for (let column = 150; column < WIDE; column++)
      if (patternOn(column, row, 0.18 * Math.sin(((row - horizon + 30) / 44) * Math.PI)))
        dot(sheet, column, row, PALETTE.grey.mist);
  ship(sheet, 82, horizon + 40, 40, { hull: '#04070d', sail: '#4a5568', shade: '#2c3546', lantern: true });
  return sheet;
}

/** Thule's flagship, far bigger, through a captain's ship: the smaller hull broken, fire and splinters. */
function thule(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 96;
  nightSky(sheet, seeded(31), horizon, ['#06070c', '#0c0d16', '#14141f', '#1e1a24', '#2a1f24', '#3a2420']);
  sea(sheet, seeded(32), horizon, [{ x: 120, wide: 12, ink: PALETTE.ember.deep, from: horizon + 44 }]);
  ship(sheet, 206, horizon + 50, 120, { hull: '#010204', sail: '#0d1018', shade: '#06080d', masts: 3, facing: -1 });
  const bow = 128;
  const water = horizon + 44;
  const wreck = '#2e1c14';
  shape(
    sheet,
    [
      [bow - 46, water - 12],
      [bow - 6, water - 4],
      [bow - 10, water + 2],
      [bow - 44, water],
    ],
    wreck,
  );
  shape(
    sheet,
    [
      [bow - 2, water - 18],
      [bow + 16, water - 2],
      [bow + 4, water + 2],
      [bow - 8, water - 6],
    ],
    wreck,
  );
  line(sheet, bow - 46, water - 12, bow - 6, water - 4, PALETTE.ember.deep);
  line(sheet, bow - 30, water - 10, bow - 40, water - 46, wreck);
  line(sheet, bow + 4, water - 12, bow + 20, water - 40, wreck);
  shape(
    sheet,
    [
      [bow - 46, water - 40],
      [bow - 34, water - 38],
      [bow - 36, water - 26],
      [bow - 47, water - 28],
    ],
    '#3a3a40',
  );
  glow(sheet, bow - 8, water - 10, 26, PALETTE.ember.deep, 0.6);
  glow(sheet, bow - 8, water - 10, 13, PALETTE.ember.mid, 0.6);
  glow(sheet, bow - 8, water - 12, 5, PALETTE.ember.bright, 0.8);
  lightOn(sheet, bow + 30, water - 30, 34, '#2a1a16', 0.5);
  const splinters = seeded(33);
  for (let piece = 0; piece < 26; piece++) {
    const angle = splinters() * Math.PI * 1.2 + Math.PI * 0.9;
    const reach = 8 + splinters() * 30;
    const x = bow - 6 + Math.cos(angle) * reach;
    const y = water - 14 + Math.sin(angle) * reach * 0.7;
    line(sheet, x, y, x + 2, y + (splinters() < 0.5 ? 1 : -1), splinters() < 0.3 ? PALETTE.ember.bright : '#2a1a12');
  }
  return sheet;
}

/** The depths: the captain sinking from the light above, and far below a faint light that calls. */
function depths(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  fade(sheet, 0, TALL, ['#1c3550', '#132840', '#0c1c30', '#071322', '#040b16', '#020610', '#020610']);
  const random = seeded(41);
  for (let ray = 0; ray < 6; ray++) {
    const x = 60 + ray * 42 + random() * 16;
    for (let row = 0; row < 90; row++)
      if (patternOn(Math.round(x + row * 0.3), row, 0.25 * (1 - row / 90))) dot(sheet, x + row * 0.3, row, '#2a4a66');
  }
  figure(sheet, 'sinking', 146, 40, ['#02040a', '#0c1a2c', '#3a5068']);
  for (let bubble = 0; bubble < 16; bubble++) dot(sheet, 150 + random() * 18, 38 - random() * 34, '#3c5a78');
  glow(sheet, 176, 168, 70, '#0d2236', 0.7);
  glow(sheet, 176, 168, 30, '#3c6a7c', 0.6);
  glow(sheet, 176, 168, 12, '#8ac8dc', 0.6);
  glow(sheet, 176, 168, 6, PALETTE.crystal.cold, 0.7);
  dot(sheet, 176, 168, '#f4fbff');
  return sheet;
}

/** A ruined port by the sea, its walls overtaken by the crystal's red and purple. */
function ruinedPort(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 128;
  nightSky(sheet, seeded(51), horizon, ['#05060d', '#0a0a17', '#110f20', '#18132a', '#201733', '#2a1a3a']);
  sea(sheet, seeded(52), horizon, [{ x: 150, wide: 10, ink: PALETTE.crystal.deep }]);
  const hill = ridge(seeded(53), WIDE, horizon - 22, horizon - 4, 0.5);
  land(sheet, hill, '#0b0a14', horizon + 1);
  ruins(sheet, seeded(54), [20, 300], horizon - 8, '#1d1b2e', '#2a1a3a');
  shape(
    sheet,
    [
      [94, horizon - 2],
      [94, horizon - 50],
      [102, horizon - 56],
      [108, horizon - 48],
      [116, horizon - 60],
      [130, horizon - 46],
      [130, horizon - 2],
    ],
    '#1f1c30',
  );
  box(sheet, 94, horizon - 50, 2, 48, '#3a3452');
  for (const [x, y] of [
    [100, horizon - 44],
    [118, horizon - 44],
    [100, horizon - 28],
  ] as const)
    box(sheet, x, y, 4, 6, '#0b0814');
  const random = seeded(55);
  for (const [x, size] of [
    [52, 22],
    [118, 34],
    [176, 18],
    [232, 28],
    [286, 16],
  ] as const)
    cluster(sheet, random, x, horizon - 6, size);
  box(sheet, 0, horizon, WIDE, 3, '#0b0a14');
  for (let place = 0; place < 40; place++)
    dot(sheet, random() * WIDE, horizon - 10 - random() * 40, PALETTE.crystal.bright);
  return sheet;
}

/** Saltmere's shore at the first grey of morning: the captain on the sand at the tide line, Overlook's lights above. */
function shore(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 92;
  fade(sheet, 0, horizon, [...PALETTE.sky.slice(1, 5), ...PALETTE.dawn.slice(0, 3)]);
  stars(sheet, seeded(61), 50, 36);
  sea(sheet, seeded(62), horizon, []);
  const ground = isle(sheet, seeded(63), 196, 340, 30, horizon + 4);
  town(sheet, seeded(64), ground, 196, [222, 316], 26);
  const beach = ridge(seeded(65), WIDE, 132, 142, 0.4).map((height, column) => height + column * 0.08);
  land(sheet, beach, PALETTE.sand[1], TALL);
  beach.forEach((height, column) => {
    dot(sheet, column, height, PALETTE.sand[2]);
    for (let row = Math.round(height) + 1; row < TALL; row++)
      if (patternOn(column, row, 0.25 + (row - height) / 90)) dot(sheet, column, row, PALETTE.sand[0]);
    if (column % 3 !== 0) dot(sheet, column, height - 2 - (column % 5 === 0 ? 1 : 0), '#6f7a88');
  });
  figure(sheet, 'lying', 100, Math.round(beach[120] ?? 140) - 4, ['#08090e', '#2a2f3c', '#a08a78']);
  shape(
    sheet,
    [
      [166, 150],
      [196, 146],
      [197, 149],
      [167, 153],
    ],
    PALETTE.timber,
  );
  return sheet;
}

/** A captain's own ship under full sail on open water, other ships far off on their own way. */
function underSail(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 104;
  nightSky(sheet, seeded(71), horizon);
  moon(sheet, 262, 30, 7);
  sea(sheet, seeded(72), horizon, [{ x: 262, wide: 5, ink: PALETTE.moon[0] }]);
  ship(sheet, 40, horizon + 4, 14, { hull: '#0a0f19', sail: '#3a4558', shade: '#283244' });
  ship(sheet, 288, horizon + 3, 12, { hull: '#0a0f19', sail: '#3a4558', shade: '#283244', facing: -1 });
  ship(sheet, 150, horizon + 52, 78, { hull: '#05080f', sail: '#c9c2ae', shade: '#8a8472', masts: 3, lantern: true });
  for (let foam = 0; foam < 30; foam++) dot(sheet, 196 + foam, horizon + 50 + (foam % 3), '#9fb0c4');
  return sheet;
}

/** The three Arts as three flames on a quay at night: Storm's electric, Divine's fire, Shadow's cosmic. */
function arts(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 110;
  nightSky(sheet, seeded(81), horizon);
  sea(sheet, seeded(82), horizon, []);
  box(sheet, 0, 132, WIDE, 48, PALETTE.timber);
  for (let plank = 136; plank < TALL; plank += 6) box(sheet, 0, plank, WIDE, 1, '#1c130e');
  const flames = [
    { x: 90, inks: ['#1b3a66', '#4f8fe0', '#cfe8ff'] },
    { x: 160, inks: ['#6a2a10', '#e07a24', '#ffe08a'] },
    { x: 230, inks: ['#2a1450', '#7a4ad0', '#e2c8ff'] },
  ] as const;
  for (const flame of flames) {
    box(sheet, flame.x - 1, 96, 3, 36, '#120c08');
    box(sheet, flame.x - 5, 88, 11, 9, '#120c08');
    glow(sheet, flame.x, 84, 30, flame.inks[0], 0.55);
    glow(sheet, flame.x, 84, 14, flame.inks[1], 0.65);
    disc(sheet, flame.x, 84, 3, 5, flame.inks[1]);
    disc(sheet, flame.x, 85, 1.5, 3, flame.inks[2]);
    lightOn(sheet, flame.x, 140, 22, flame.inks[0], 0.4);
  }
  for (let fork = 0; fork < 5; fork++) dot(sheet, 84 + fork * 3, 72 - (fork % 2) * 2, '#cfe8ff');
  for (let star = 0; star < 8; star++) dot(sheet, 222 + ((star * 7) % 17), 70 + ((star * 5) % 13), '#e2c8ff');
  return sheet;
}

/** Gear: a blade standing in a crate beside a helm and a breastplate, under a lantern. */
function gear(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  fade(sheet, 0, TALL, ['#0c0e14', '#141218', '#1a1519', '#120e10']);
  for (let board = 0; board < WIDE; board += 14) box(sheet, board, 0, 1, 130, '#0a080a');
  box(sheet, 0, 130, WIDE, 50, '#241912');
  box(sheet, 0, 130, WIDE, 1, '#3a2a1e');
  lantern(sheet, 160, 30, 40);
  line(sheet, 160, 0, 160, 26, '#2a2420');
  const steel = { dark: '#3c4048', mid: '#7c828c', lit: '#d4d8de' };
  box(sheet, 96, 104, 28, 26, '#3a2a1e');
  box(sheet, 96, 104, 28, 2, '#5a4430');
  line(sheet, 110, 104, 110, 46, steel.mid);
  line(sheet, 111, 104, 111, 48, steel.lit);
  box(sheet, 102, 100, 18, 2, PALETTE.gold.deep);
  box(sheet, 190, 60, 2, 70, '#2a1d16');
  box(sheet, 176, 62, 30, 2, '#2a1d16');
  shape(
    sheet,
    [
      [168, 66],
      [182, 64],
      [191, 72],
      [200, 64],
      [214, 66],
      [210, 82],
      [206, 120],
      [176, 120],
      [172, 82],
    ],
    steel.dark,
  );
  shape(
    sheet,
    [
      [172, 68],
      [182, 66],
      [190, 74],
      [190, 118],
      [178, 118],
      [175, 82],
    ],
    steel.mid,
  );
  line(sheet, 179, 72, 181, 114, steel.lit);
  for (const row of [92, 104]) box(sheet, 176, row, 32, 1, '#2a2e36');
  shape(
    sheet,
    [
      [226, 128],
      [228, 104],
      [236, 96],
      [246, 96],
      [254, 104],
      [256, 128],
    ],
    steel.dark,
  );
  shape(
    sheet,
    [
      [230, 126],
      [231, 106],
      [238, 99],
      [242, 99],
      [242, 126],
    ],
    steel.mid,
  );
  box(sheet, 230, 110, 22, 2, '#0c0e14');
  box(sheet, 240, 112, 2, 14, '#0c0e14');
  line(sheet, 241, 90, 241, 97, PALETTE.gold.deep);
  dot(sheet, 233, 104, steel.lit);
  lightOn(sheet, 160, 40, 110, '#5a4430', 0.25);
  return sheet;
}

/** A ship's bell hung from a post on Overlook's quay at night, a lantern beside it, ships at anchor beyond. */
function bell(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 112;
  nightSky(sheet, seeded(91), horizon);
  moon(sheet, 262, 34, 8);
  sea(sheet, seeded(92), horizon, [
    { x: 262, wide: 4, ink: PALETTE.moon[0] },
    { x: 112, wide: 4, ink: PALETTE.gold.deep, from: horizon + 4 },
  ]);
  const look = { hull: '#05080f', sail: PALETTE.grey.shade, shade: PALETTE.grey.hull, lantern: true, furled: true };
  ship(sheet, 236, horizon + 10, 34, { ...look, masts: 3 });
  ship(sheet, 52, horizon + 6, 22, { ...look, facing: -1 });
  box(sheet, 0, 138, WIDE, 42, PALETTE.timber);
  box(sheet, 0, 138, WIDE, 1, '#4a3424');
  for (let board = 0; board < WIDE; board += 18) box(sheet, board, 139, 1, 41, '#1a120d');
  for (let row = 146; row < TALL; row += 9) box(sheet, 0, row, WIDE, 1, '#20160f');
  box(sheet, 116, 36, 5, 103, '#1d140f');
  box(sheet, 116, 36, 1, 103, '#3a2a1e');
  box(sheet, 116, 34, 80, 5, '#1d140f');
  box(sheet, 116, 34, 80, 1, '#3a2a1e');
  line(sheet, 121, 62, 142, 39, '#1d140f');
  line(sheet, 122, 62, 143, 39, '#1d140f');
  const bronze = { deep: PALETTE.gold.deep, mid: '#b97a2a', lit: PALETTE.gold.mid, bright: PALETTE.gold.bright };
  line(sheet, 172, 39, 172, 50, '#2a2420');
  box(sheet, 168, 49, 9, 4, bronze.deep);
  const body: ReadonlyArray<readonly [number, number]> = [
    [163, 53],
    [182, 53],
    [186, 62],
    [188, 80],
    [195, 90],
    [150, 90],
    [157, 80],
    [159, 62],
  ];
  shape(sheet, body, bronze.mid);
  shape(
    sheet,
    [
      [164, 55],
      [170, 55],
      [168, 80],
      [158, 88],
      [160, 78],
      [161, 62],
    ],
    bronze.lit,
  );
  line(sheet, 164, 57, 162, 82, bronze.bright);
  shape(
    sheet,
    [
      [179, 55],
      [182, 55],
      [186, 64],
      [187, 81],
      [193, 89],
      [184, 89],
      [182, 70],
    ],
    bronze.deep,
  );
  box(sheet, 150, 89, 46, 2, bronze.deep);
  box(sheet, 152, 74, 41, 1, bronze.deep);
  disc(sheet, 172, 93, 3, 3, bronze.deep);
  line(sheet, 172, 95, 173, 122, '#8a7458');
  line(sheet, 173, 95, 174, 122, '#5a4a38');
  disc(sheet, 173, 123, 2, 2, '#8a7458');
  box(sheet, 112, 60, 5, 2, '#1d140f');
  line(sheet, 112, 62, 112, 66, '#2a2420');
  lantern(sheet, 112, 70, 12);
  box(sheet, 109, 67, 7, 7, '#2a2420');
  box(sheet, 110, 68, 5, 5, PALETTE.gold.bright);
  dot(sheet, 112, 70, PALETTE.gold.white);
  return sheet;
}

/** Every picture the pages may name, by its name. */
export const SCENES: Readonly<Record<string, () => Sheet>> = {
  overlook: () => overlookLayers().back,
  'overlook-lights': () => overlookLayers().lights,
  expanse,
  'grey-tithe': greyTithe,
  thule,
  depths,
  'ruined-port': ruinedPort,
  shore,
  'under-sail': underSail,
  arts,
  gear,
  bell,
};

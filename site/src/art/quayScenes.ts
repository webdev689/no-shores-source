// The pictures on Overlook's quay and under its roofs: the three Arts as three flames, gear under a lantern, and a
// ship's bell on its post, the panel's picture.
import { seeded } from '../../../client/src/seeded.ts';
import { lantern, LIGHTS, moon, range, sea, sky, stars } from '../../../client/src/art/light.ts';
import { ship } from '../../../client/src/art/ships.ts';
import {
  box,
  disc,
  dot,
  fade,
  glow,
  halo,
  lightOn,
  line,
  makeSheet,
  patternOn,
  shape,
  type Ink,
  type Sheet,
} from '../../../client/src/art/sheet.ts';

const WIDE = 320;
const TALL = 180;

/** Planks of a quay from `top` to the foot: their faces, the seams between, and the edge catching the night. */
function planks(sheet: Sheet, top: number, inks: { readonly face: Ink; readonly seam: Ink; readonly edge: Ink }): void {
  box(sheet, 0, top, WIDE, TALL - top, inks.face);
  box(sheet, 0, top, WIDE, 1, inks.edge);
  for (let row = top + 4; row < TALL; row += 3 + Math.floor((row - top) / 8)) box(sheet, 0, row, WIDE, 1, inks.seam);
  for (let row = top + 1; row < TALL; row++)
    for (let column = 0; column < WIDE; column++)
      if ((column + row * 7) % 53 === 0) box(sheet, column, row, 1, 3, inks.seam);
}

/** Ships at anchor beyond the quay, their sails furled. */
function anchored(sheet: Sheet, ships: readonly (readonly [number, number, number, 1 | -1])[]): void {
  for (const [x, waterline, length, facing] of ships)
    ship(sheet, x, waterline, length, {
      hull: '#04070d',
      wale: '#1c2a40',
      sail: '#3a4558',
      shade: '#283244',
      rig: '#0a101c',
      masts: length > 30 ? 3 : 2,
      facing,
      furled: true,
      lantern: true,
      reflection: '#03060c',
    });
}

/** The three Arts as three flames in iron braziers on the quay: Storm's electric, Divine's fire, Shadow's cosmic. */
function arts(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 108;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(81), light, 200, horizon - 20);
  range(sheet, seeded(83), {
    left: 0,
    width: WIDE,
    top: horizon - 10,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
  });
  sea(sheet, seeded(82), light, horizon);
  anchored(sheet, [
    [40, horizon + 6, 22, 1],
    [282, horizon + 8, 30, -1],
  ]);
  planks(sheet, 132, { face: '#2a1d16', seam: '#1a120d', edge: '#4a3424' });
  const flames = [
    { x: 90, inks: ['#0e1e38', '#1b3a66', '#4f8fe0', '#cfe8ff'] },
    { x: 160, inks: ['#2a1208', '#6a2a10', '#e07a24', '#ffe08a'] },
    { x: 230, inks: ['#160a2c', '#2a1450', '#7a4ad0', '#e2c8ff'] },
  ] as const;
  for (const flame of flames) {
    halo(sheet, flame.x, 80, 40, flame.inks.slice(0, 3));
    lightOn(sheet, flame.x, 144, 34, flame.inks[1], 0.5);
  }
  for (const flame of flames) {
    const iron = '#120c08';
    box(sheet, flame.x - 1, 96, 3, 37, iron);
    line(sheet, flame.x - 7, 132, flame.x, 118, iron);
    line(sheet, flame.x + 7, 132, flame.x, 118, iron);
    shape(
      sheet,
      [
        [flame.x - 8, 88],
        [flame.x + 9, 88],
        [flame.x + 5, 97],
        [flame.x - 4, 97],
      ],
      iron,
    );
    box(sheet, flame.x - 8, 88, 17, 1, '#3a2a1e');
    for (let tongue = -5; tongue <= 5; tongue++) {
      const high = 14 - Math.abs(tongue) * 2 + ((tongue * 7) % 3);
      for (let row = 0; row < high; row++) {
        const ink = row < high * 0.35 ? flame.inks[3] : row < high * 0.7 ? flame.inks[2] : flame.inks[1];
        dot(sheet, flame.x + tongue + Math.round(Math.sin(row / 2 + tongue) * 0.8), 87 - row, ink);
      }
    }
  }
  for (let fork = 0; fork < 6; fork++)
    line(sheet, 80 + fork * 4, 62 - (fork % 2) * 4, 82 + fork * 4, 58 + (fork % 2) * 4, '#cfe8ff');
  for (let ember = 0; ember < 10; ember++) dot(sheet, 152 + ((ember * 7) % 17), 60 - ((ember * 11) % 18), '#ffe08a');
  for (let star = 0; star < 12; star++) dot(sheet, 220 + ((star * 7) % 21), 56 + ((star * 5) % 17), '#e2c8ff');
  return sheet;
}

/** Gear: a blade standing in a crate beside a breastplate on its stand and a helm, under a hanging lantern. */
function gear(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  fade(sheet, 0, 130, ['#0a0c12', '#100f15', '#161318', '#1a1519']);
  for (let board = 0; board < WIDE; board += 13) {
    box(sheet, board, 0, 1, 130, '#08070a');
    for (let knot = 0; knot < 3; knot++) dot(sheet, board + 6, 20 + ((board * 7 + knot * 41) % 100), '#0c0b0e');
  }
  box(sheet, 0, 130, WIDE, 50, '#241912');
  box(sheet, 0, 130, WIDE, 1, '#3a2a1e');
  for (let row = 134; row < TALL; row += 5) box(sheet, 0, row, WIDE, 1, '#1a120d');
  line(sheet, 160, 0, 160, 24, '#2a2420');
  halo(sheet, 160, 32, 120, ['#120f12', '#1a1516', '#241c18', '#30241c']);
  box(sheet, 155, 24, 11, 14, '#2a2420');
  box(sheet, 157, 26, 7, 10, '#ffd36e');
  lantern(sheet, 160, 31, 12);
  const steel = { dark: '#3c4048', mid: '#7c828c', lit: '#d4d8de' };
  box(sheet, 94, 104, 32, 26, '#3a2a1e');
  box(sheet, 94, 104, 32, 2, '#5a4430');
  for (const x of [97, 121]) box(sheet, x, 106, 2, 24, '#2a1d16');
  line(sheet, 110, 104, 110, 44, steel.mid);
  line(sheet, 111, 104, 111, 46, steel.lit);
  dot(sheet, 110, 43, steel.lit);
  box(sheet, 101, 98, 20, 3, '#9a5a1c');
  box(sheet, 109, 90, 3, 8, '#3a2414');
  disc(sheet, 110, 88, 2, 2, '#c0802c');
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
  for (const row of [92, 104]) for (let rivet = 178; rivet < 206; rivet += 6) dot(sheet, rivet, row - 1, steel.lit);
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
  line(sheet, 241, 88, 241, 97, '#9a5a1c');
  line(sheet, 242, 88, 246, 84, '#c0802c');
  dot(sheet, 233, 104, steel.lit);
  for (const [x, wide] of [
    [110, 22],
    [191, 30],
    [241, 22],
  ] as const)
    for (let column = -wide; column <= wide; column++)
      if (patternOn(x + column, 131, 0.5)) dot(sheet, x + column + 6, 131, '#120c08');
  lightOn(sheet, 160, 40, 120, '#5a4430', 0.22);
  glow(sheet, 160, 31, 3, '#fff1c4', 0.9);
  return sheet;
}

/** A ship's bell hung from a post on Overlook's quay at night, a lantern beside it, ships at anchor beyond. */
function bell(): Sheet {
  const sheet = makeSheet(WIDE, TALL);
  const horizon = 112;
  const light = LIGHTS.night;
  sky(sheet, light, horizon);
  stars(sheet, seeded(91), light, 200, horizon - 20);
  moon(sheet, light, 262, 34, 8);
  range(sheet, seeded(93), {
    left: 0,
    width: WIDE,
    top: horizon - 8,
    foot: horizon,
    floor: horizon + 1,
    ink: light.ranges[0] ?? '',
  });
  sea(sheet, seeded(92), light, horizon, [
    { x: 262, wide: 4, ink: '#6e7a8e', core: '#c8d0dc' },
    { x: 112, wide: 4, ink: '#7a4416', core: '#c0802c', from: horizon + 4 },
  ]);
  anchored(sheet, [
    [236, horizon + 12, 40, 1],
    [52, horizon + 6, 24, -1],
  ]);
  planks(sheet, 138, { face: '#2a1d16', seam: '#1a120d', edge: '#4a3424' });
  const wood = '#1d140f';
  box(sheet, 116, 36, 5, 103, wood);
  box(sheet, 116, 36, 1, 103, '#3a2a1e');
  box(sheet, 116, 34, 80, 5, wood);
  box(sheet, 116, 34, 80, 1, '#3a2a1e');
  line(sheet, 121, 62, 142, 39, wood);
  line(sheet, 122, 62, 143, 39, wood);
  const bronze = { deep: '#7a4a16', mid: '#b97a2a', lit: '#d99a36', bright: '#ffd36e' };
  line(sheet, 172, 39, 172, 50, '#2a2420');
  box(sheet, 168, 49, 9, 4, bronze.deep);
  shape(
    sheet,
    [
      [163, 53],
      [182, 53],
      [186, 62],
      [188, 80],
      [195, 90],
      [150, 90],
      [157, 80],
      [159, 62],
    ],
    bronze.mid,
  );
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
  box(sheet, 112, 60, 5, 2, wood);
  line(sheet, 112, 62, 112, 66, '#2a2420');
  lantern(sheet, 112, 70, 16);
  box(sheet, 109, 67, 7, 7, '#2a2420');
  box(sheet, 110, 68, 5, 5, bronze.bright);
  dot(sheet, 112, 70, '#fff1c4');
  lightOn(sheet, 112, 70, 40, '#5a3a1c', 0.35);
  return sheet;
}

export const QUAY_SCENES: Readonly<Record<string, () => Sheet>> = { arts, gear, bell };

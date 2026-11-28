// A region's dungeon of the day painted on its tile, as the island's other scenes are (`islandScenes.ts`): the way
// down its style builds above ground, set in a hillside under the sky its tier brings, its light within. A crypt's
// mausoleum among leaning graves, the halls' gatehouse between two towers, the cells' barred grate under a gibbet, the
// sanctum's broken portico, the caverns' jagged mouth hung with roots, and the mines' timbered adit under its
// headframe. At Elite and Abyss something looks back out of the dark.
import { DARK, fire, ranges, tree } from '../art/landmarks.ts';
import { clouds, lantern, type Light, LIGHTS, mist, sky, stars } from '../art/light.ts';
import { box, disc, dot, halo, land, line, patternOn, ridge, type Sheet, shape } from '../art/sheet.ts';

/** Each tier's sky, and the light its dungeon burns within: amber, ember red, the Abyss's violet. */
const SKIES: readonly (readonly Light[])[] = [
  [LIGHTS.dawn, LIGHTS.night, LIGHTS.mist],
  [LIGHTS.ember],
  [LIGHTS.crystal],
];
const WITHIN: readonly (readonly string[])[] = [
  ['#2a1408', '#4a2410', '#7a3a14', '#ffc04a'],
  ['#2a0806', '#4a100c', '#7a1a12', '#ff6a4a'],
  ['#1a1030', '#2e1a52', '#4a2a80', '#d8b8ff'],
];
const STONE = { face: '#3a4256', dark: '#262c3a', lit: '#5a6278', deep: '#020306' } as const;
const WOOD = { face: '#3a2616', dark: '#22160c', lit: '#5a3a1e' } as const;

/** Where the way down stands on the sheet: its middle, its foot and the size of its opening. */
interface Door {
  readonly x: number;
  readonly foot: number;
  readonly wide: number;
  readonly tall: number;
}

/** Fills an opening with the dark going down, dithered toward its foot, and its light within. */
function opening(sheet: Sheet, door: Door, arched: boolean, tier: number): void {
  const half = Math.round(door.wide / 2);
  const top = door.foot - door.tall;
  for (let row = top; row < door.foot; row++)
    for (let column = -half; column < half; column++) {
      if (arched && row < top + half && Math.hypot(column + 0.5, row - top - half) > half) continue;
      const depth = (row - top) / door.tall;
      dot(sheet, door.x + column, row, depth > 0.5 || patternOn(column, row, depth * 1.8) ? STONE.deep : '#0a0c12');
    }
  const glow = WITHIN[tier] ?? WITHIN[0] ?? [];
  halo(sheet, door.x, door.foot - Math.round(door.tall * 0.3), Math.round(half * 0.9), glow.slice(0, 3));
  dot(sheet, door.x, door.foot - Math.round(door.tall * 0.32), glow[3] ?? '#ffc04a');
  // At Elite and Abyss two eyes catch the light, high in the dark.
  if (tier > 0)
    for (const side of [-1, 1]) dot(sheet, door.x + side * 2, top + Math.round(door.tall * 0.45), glow[3] ?? '');
}

/** Courses of stone over a wall, each fourth row a joint, every eighth column a bond. */
function coursed(sheet: Sheet, left: number, top: number, wide: number, tall: number): void {
  box(sheet, left, top, wide, tall, STONE.face);
  for (let row = top; row < top + tall; row += 4) {
    box(sheet, left, row, wide, 1, STONE.dark);
    for (let column = left + ((row - top) % 8 === 0 ? 0 : 4); column < left + wide; column += 8)
      box(sheet, column, row, 1, 4, STONE.dark);
  }
}

/** A crypt's mausoleum: a pediment on two columns over its door, its graves leaning round it. */
function mausoleum(sheet: Sheet, random: () => number, door: Door, tier: number): void {
  const [wide, tall] = [door.wide + 18, door.tall + 6];
  coursed(sheet, door.x - wide / 2, door.foot - tall, wide, tall);
  shape(
    sheet,
    [
      [door.x - wide / 2 - 3, door.foot - tall],
      [door.x + wide / 2 + 3, door.foot - tall],
      [door.x, door.foot - tall - 10],
    ],
    STONE.lit,
  );
  shape(
    sheet,
    [
      [door.x - wide / 2 + 2, door.foot - tall - 1],
      [door.x + wide / 2 - 2, door.foot - tall - 1],
      [door.x, door.foot - tall - 7],
    ],
    STONE.dark,
  );
  for (const side of [-1, 1]) box(sheet, door.x + side * (door.wide / 2 + 4) - 2, door.foot - tall, 4, tall, STONE.lit);
  opening(sheet, door, false, tier);
  for (let grave = 0; grave < 7; grave++) {
    const x = Math.round(random() * sheet.width);
    if (Math.abs(x - door.x) < wide / 2 + 6) continue;
    const lean = Math.round(random() * 2 - 1);
    const ground = door.foot + Math.round(random() * 6);
    box(sheet, x, ground - 7, 4, 7, STONE.dark);
    dot(sheet, x + lean, ground - 8, STONE.dark);
    dot(sheet, x + 2 + lean, ground - 8, STONE.dark);
  }
}

/** The halls' gatehouse: a square tower either side of an arched gate, their crenels, a banner on each. */
function gatehouse(sheet: Sheet, door: Door, tier: number): void {
  const tower = Math.round(door.wide * 0.6);
  const tall = door.tall + 22;
  coursed(sheet, door.x - door.wide / 2 - 2, door.foot - door.tall - 8, door.wide + 4, door.tall + 8);
  for (const side of [-1, 1]) {
    const left = side < 0 ? door.x - door.wide / 2 - tower : door.x + door.wide / 2;
    coursed(sheet, left, door.foot - tall, tower, tall);
    for (let crenel = 0; crenel < tower; crenel += 4) box(sheet, left + crenel, door.foot - tall - 3, 2, 3, STONE.lit);
    box(sheet, left + tower / 2 - 2, door.foot - tall + 6, 4, 9, tier === 2 ? '#4a2a80' : '#6a1a14');
    box(sheet, left + tower / 2 - 1, door.foot - tall + 9, 2, 1, '#d9a04a');
  }
  opening(sheet, door, true, tier);
  // The portcullis drawn half up.
  for (let column = -door.wide / 2 + 2; column < door.wide / 2; column += 3)
    box(sheet, door.x + column, door.foot - door.tall, 1, Math.round(door.tall * 0.35), '#1a1c22');
}

/** The cells' grate: a squat stone mouth barred over the dark, a gibbet's cage beside it. */
function grate(sheet: Sheet, random: () => number, door: Door, tier: number): void {
  coursed(sheet, door.x - door.wide / 2 - 8, door.foot - door.tall - 6, door.wide + 16, door.tall + 6);
  box(sheet, door.x - door.wide / 2 - 10, door.foot - door.tall - 8, door.wide + 20, 3, STONE.lit);
  opening(sheet, door, false, tier);
  for (let column = -door.wide / 2 + 1; column < door.wide / 2; column += 3)
    box(sheet, door.x + column, door.foot - door.tall, 1, door.tall, '#14161c');
  box(sheet, door.x - door.wide / 2, door.foot - Math.round(door.tall * 0.6), door.wide, 1, '#14161c');
  const post = door.x + (random() < 0.5 ? -1 : 1) * (door.wide / 2 + 22);
  box(sheet, post, door.foot - door.tall - 18, 2, door.tall + 18, WOOD.dark);
  box(sheet, post, door.foot - door.tall - 18, 10, 2, WOOD.dark);
  line(sheet, post + 9, door.foot - door.tall - 16, post + 9, door.foot - door.tall - 10, '#14161c');
  for (let row = 0; row < 8; row++)
    for (const edge of [6, 12]) dot(sheet, post + edge, door.foot - door.tall - 10 + row, '#2a2c34');
  box(sheet, post + 6, door.foot - door.tall - 10, 7, 1, '#2a2c34');
  box(sheet, post + 6, door.foot - door.tall - 3, 7, 1, '#2a2c34');
}

/** The sanctum's portico: steps up to a row of columns, one broken, under a cracked pediment; a round window lit. */
function portico(sheet: Sheet, random: () => number, door: Door, tier: number): void {
  const wide = door.wide + 30;
  for (let step = 0; step < 3; step++)
    box(sheet, door.x - wide / 2 - 4 + step * 2, door.foot - step * 2, wide + 8 - step * 4, 2, STONE.lit);
  coursed(sheet, door.x - wide / 2 + 4, door.foot - door.tall - 10, wide - 8, door.tall + 4);
  opening(sheet, { ...door, foot: door.foot - 6 }, true, tier);
  const broken = Math.floor(random() * 4);
  for (let column = 0; column < 4; column++) {
    const x = Math.round(door.x - wide / 2 + 2 + (column * (wide - 6)) / 3);
    const top = column === broken ? door.foot - Math.round(door.tall * 0.5) : door.foot - door.tall - 12;
    box(sheet, x, top, 3, door.foot - 6 - top, STONE.lit);
    box(sheet, x + 2, top, 1, door.foot - 6 - top, STONE.dark);
  }
  shape(
    sheet,
    [
      [door.x - wide / 2, door.foot - door.tall - 12],
      [door.x + wide / 2, door.foot - door.tall - 12],
      [door.x, door.foot - door.tall - 24],
    ],
    STONE.face,
  );
  line(sheet, door.x + 3, door.foot - door.tall - 22, door.x - 2, door.foot - door.tall - 13, STONE.deep);
  const glow = WITHIN[tier] ?? WITHIN[0] ?? [];
  disc(sheet, door.x, door.foot - door.tall - 17, 3, 3, glow[2] ?? '');
  dot(sheet, door.x, door.foot - door.tall - 17, glow[3] ?? '');
}

/** The caverns' mouth: jagged rock round the dark, its teeth hanging and roots trailing over it, crystals within. */
function caveMouth(sheet: Sheet, random: () => number, door: Door, tier: number): void {
  const half = door.wide / 2 + 8;
  const rim: [number, number][] = [];
  for (let step = 0; step <= 16; step++) {
    const turn = Math.PI * (step / 16);
    const rough = 1 + (random() - 0.5) * 0.35;
    rim.push([door.x - Math.cos(turn) * half * rough, door.foot - Math.sin(turn) * (door.tall + 8) * rough]);
  }
  shape(sheet, rim, '#2a3040');
  opening(sheet, { ...door, wide: door.wide + 4 }, true, tier);
  for (let tooth = -door.wide / 2; tooth < door.wide / 2; tooth += 3) {
    const long = 2 + Math.round(random() * 5);
    line(sheet, door.x + tooth, door.foot - door.tall, door.x + tooth, door.foot - door.tall + long, '#2a3040');
  }
  for (let root = 0; root < 5; root++) {
    const x = door.x + Math.round((random() - 0.5) * door.wide * 1.4);
    line(
      sheet,
      x,
      door.foot - door.tall - 8,
      x + Math.round(random() * 4 - 2),
      door.foot - door.tall + 6 + Math.round(random() * 8),
      '#141c18',
    );
  }
  const glow = WITHIN[tier] ?? WITHIN[0] ?? [];
  for (const side of [-1, 1]) {
    const x = door.x + side * Math.round(door.wide * 0.3);
    line(sheet, x, door.foot - 1, x + side, door.foot - 6, glow[3] ?? '');
  }
}

/** The mines' adit: two posts and a lintel of timber over the dark, rails running out, a headframe's wheel above. */
function adit(sheet: Sheet, door: Door, tier: number): void {
  opening(sheet, door, false, tier);
  for (const side of [-1, 1])
    box(
      sheet,
      door.x + side * (door.wide / 2) - (side > 0 ? 0 : 3),
      door.foot - door.tall - 3,
      3,
      door.tall + 3,
      WOOD.face,
    );
  box(sheet, door.x - door.wide / 2 - 5, door.foot - door.tall - 5, door.wide + 10, 3, WOOD.lit);
  for (const rail of [-3, 3]) line(sheet, door.x + rail, door.foot - 2, door.x + rail * 4, sheet.height, '#4a4e58');
  const [wheelX, wheelY] = [door.x + door.wide + 6, door.foot - door.tall - 22];
  line(sheet, wheelX - 10, door.foot, wheelX, wheelY, WOOD.dark);
  line(sheet, wheelX + 10, door.foot, wheelX, wheelY, WOOD.dark);
  for (let spoke = 0; spoke < 8; spoke++) {
    const turn = (spoke / 8) * Math.PI * 2;
    line(sheet, wheelX, wheelY, wheelX + Math.cos(turn) * 6, wheelY + Math.sin(turn) * 6, WOOD.lit);
  }
  lantern(sheet, door.x - door.wide / 2 - 8, door.foot - door.tall + 2, 6);
}

/** A region's dungeon of `style` at `tier` (0 Normal to 2 Abyss), on its sheet. */
export function depths(sheet: Sheet, random: () => number, style: string, tier: number): void {
  const { width, height } = sheet;
  const lights = SKIES[tier] ?? SKIES[0] ?? [LIGHTS.night];
  const light = lights[Math.floor(random() * lights.length)] ?? LIGHTS.night;
  const horizon = Math.round(height * 0.55);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 1.2), horizon - 12);
  clouds(sheet, random, light, { top: Math.round(height * 0.12), depth: Math.round(height * 0.2), count: 3 });
  box(sheet, 0, horizon, width, height - horizon, light.ranges[1] ?? DARK);
  ranges(sheet, random, light, horizon);
  const middle = width / 2;
  const hill = ridge(random, width, height * 0.26, height * 0.44, 0.5).map(
    (rise, column) => rise + Math.abs(column - middle) * 0.3,
  );
  land(sheet, hill, '#0a0f1a', height);
  hill.forEach((rise, column) => dot(sheet, column, rise, '#24324c'));
  const door: Door = {
    x: Math.round(middle),
    foot: Math.round(height * 0.84),
    wide: Math.round(width * 0.12),
    tall: Math.round(height * 0.3),
  };
  for (let wood = 0; wood < 5; wood++) {
    const x = Math.round(random() < 0.5 ? random() * width * 0.3 : width * 0.7 + random() * width * 0.3);
    tree(sheet, x, Math.round(hill[x] ?? height * 0.4) + 2, 6 + Math.round(random() * 6), style !== 'crypt', '#060a12');
  }
  if (style === 'crypt') mausoleum(sheet, random, door, tier);
  else if (style === 'halls') gatehouse(sheet, door, tier);
  else if (style === 'cells') grate(sheet, random, door, tier);
  else if (style === 'sanctum') portico(sheet, random, door, tier);
  else if (style === 'caverns') caveMouth(sheet, random, door, tier);
  else adit(sheet, door, tier);
  if (style !== 'mines' && style !== 'caverns')
    for (const side of [-1, 1]) fire(sheet, [Math.round(door.x + side * (door.wide / 2 + 16)), door.foot - 4], 6);
  box(sheet, 0, door.foot, width, height - door.foot, '#0a0e16');
  for (let row = door.foot; row < height; row++)
    for (let column = 0; column < width; column++)
      if (Math.abs(column - door.x) < door.wide / 2 + (row - door.foot) * 1.2 && patternOn(column, row, 0.35))
        dot(sheet, column, row, '#1e222e');
  if (tier === 2) mist(sheet, door.foot - 10, 14, '#2a1a40', 0.4);
}

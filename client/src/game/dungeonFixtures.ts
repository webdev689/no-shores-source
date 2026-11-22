// A dungeon's lights that are not wall torches, drawn where the layout stands them: a brazier on its legs, a cluster
// of candles, glowing crystals, a lantern on its chain, a hearth's fire and a cluster of glowing fungus. Each is shaped by where it stands, so no
// two are alike and every machine draws them the same.
import type { MeshBuilder } from '../models/model.ts';
import { FIXTURE } from './dungeonLayout.ts';
import { box, COLOUR, IRON } from './dungeonMesh.ts';

type Point = readonly [number, number, number];
type Picture = readonly [number, number];

/** A number from 0 to 1 drawn from a point and a count, the same everywhere. */
function seeded(x: number, y: number, count: number): number {
  let hash = (Math.round(x * 100) * 73856093) ^ (Math.round(y * 100) * 19349663) ^ (count * 83492791);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** A pointed spike from a square foot `half` wide at `foot` to `tip`, each side a triangle facing out. */
function spike(mesh: MeshBuilder, picture: Picture, foot: Point, tip: Point, half: number): void {
  const [x, y, z] = foot;
  const corners: Point[] = [
    [x - half, y - half, z],
    [x + half, y - half, z],
    [x + half, y + half, z],
    [x - half, y + half, z],
  ];
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length] ?? corner;
    const out: Point = [corner[0] + next[0] - 2 * x, corner[1] + next[1] - 2 * y, half];
    mesh.tri(picture, [next, corner, tip], out, [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ]);
  });
}

/** A flame from its foot up `tall`, a narrow spike of glow. */
function flame(mesh: MeshBuilder, [x, y, z]: Point, tall: number): void {
  spike(mesh, [COLOUR.glow, 0], [x, y, z], [x, y, z + tall], tall * 0.3);
}

/** A brazier: an iron bowl on three legs, embers heaped in it and flames over them; the light is over the bowl. */
function brazier(mesh: MeshBuilder, [x, y, z]: Point): void {
  const rim = z - 0.15;
  for (let leg = 0; leg < 3; leg++) {
    const turn = (leg / 3) * Math.PI * 2 + seeded(x, y, 0) * 2;
    const [legX, legY] = [x + Math.cos(turn) * 0.22, y + Math.sin(turn) * 0.22];
    box(mesh, IRON, [legX - 0.03, legY - 0.03, 0], [legX + 0.03, legY + 0.03, rim - 0.12]);
  }
  box(mesh, IRON, [x - 0.3, y - 0.3, rim - 0.16], [x + 0.3, y + 0.3, rim - 0.12]);
  box(mesh, IRON, [x - 0.33, y - 0.33, rim - 0.12], [x + 0.33, y + 0.33, rim], false);
  box(mesh, [COLOUR.ember, 0], [x - 0.27, y - 0.27, rim - 0.12], [x + 0.27, y + 0.27, rim - 0.03]);
  for (let tongue = 0; tongue < 4; tongue++) {
    const [shiftX, shiftY] = [seeded(x, y, tongue + 1) - 0.5, seeded(y, x, tongue + 1) - 0.5];
    flame(mesh, [x + shiftX * 0.3, y + shiftY * 0.3, rim - 0.04], 0.25 + seeded(x, y, tongue + 9) * 0.25);
  }
}

/** A cluster of three to five candles round where the light stands, each a stick of wax with its own small flame. */
function candles(mesh: MeshBuilder, [x, y, z]: Point): void {
  const count = 3 + Math.floor(seeded(x, y, 0) * 3);
  const base = z - 0.26;
  for (let candle = 0; candle < count; candle++) {
    const turn = (candle / count) * Math.PI * 2 + seeded(x, y, 1) * 3;
    const out = candle === 0 ? 0 : 0.06 + seeded(x, y, candle + 2) * 0.08;
    const [candleX, candleY] = [x + Math.cos(turn) * out, y + Math.sin(turn) * out];
    const tall = 0.08 + seeded(x, y, candle + 7) * 0.14;
    box(
      mesh,
      [COLOUR.wax, 0],
      [candleX - 0.022, candleY - 0.022, base],
      [candleX + 0.022, candleY + 0.022, base + tall],
    );
    flame(mesh, [candleX, candleY, base + tall], 0.05);
  }
}

/** Five to eight crystals grown from the floor of their bed, each leaning out from its wall, all inside its box. */
function crystals(mesh: MeshBuilder, [x, y]: Point, bed: Bed): void {
  const count = 5 + Math.floor(seeded(x, y, 0) * 4);
  for (let crystal = 0; crystal < count; crystal++) {
    const half = 0.035 + seeded(x, y, crystal + 20) * 0.035;
    const foot = footIn(bed, half, seeded(x, y, crystal + 2), seeded(y, x, crystal + 2));
    const tall = 0.3 + seeded(y, x, crystal + 9) * (bed.box[4] - 0.35);
    const lean = 0.05 + seeded(x, y, crystal + 30) * 0.2;
    const aside = (seeded(y, x, crystal + 30) - 0.5) * 0.3;
    const tip = within(
      bed,
      [foot[0] + bed.out[0] * lean - bed.out[1] * aside, foot[1] + bed.out[1] * lean + bed.out[0] * aside],
      0.01,
    );
    spike(mesh, [COLOUR.crystal, 0], [foot[0], foot[1], 0], [tip[0], tip[1], tall], half);
  }
}

/** A lantern: an iron frame round glowing glass, hung by a chain from a hook over it. */
function lantern(mesh: MeshBuilder, [x, y, z]: Point): void {
  box(mesh, IRON, [x - 0.13, y - 0.13, z - 0.2], [x + 0.13, y + 0.13, z - 0.16]);
  box(mesh, IRON, [x - 0.11, y - 0.11, z + 0.12], [x + 0.11, y + 0.11, z + 0.17]);
  box(mesh, [COLOUR.lanternGlass, 0], [x - 0.1, y - 0.1, z - 0.16], [x + 0.1, y + 0.1, z + 0.12], false);
  for (const [cornerX, cornerY] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const)
    box(
      mesh,
      IRON,
      [x + cornerX * 0.12 - 0.015, y + cornerY * 0.12 - 0.015, z - 0.16],
      [x + cornerX * 0.12 + 0.015, y + cornerY * 0.12 + 0.015, z + 0.12],
    );
  box(mesh, IRON, [x - 0.012, y - 0.012, z + 0.17], [x + 0.012, y + 0.012, z + 0.55]);
}

/** A hearth's fire: embers on its floor and flames leaping over them. */
function hearthFire(mesh: MeshBuilder, [x, y, z]: Point): void {
  const floor = z - 0.35;
  box(mesh, [COLOUR.ember, 0], [x - 0.3, y - 0.18, floor], [x + 0.3, y + 0.18, floor + 0.08]);
  for (let tongue = 0; tongue < 6; tongue++) {
    const [shiftX, shiftY] = [seeded(x, y, tongue + 1) - 0.5, seeded(y, x, tongue + 1) - 0.5];
    flame(mesh, [x + shiftX * 0.5, y + shiftY * 0.25, floor + 0.06], 0.25 + seeded(x, y, tongue + 9) * 0.35);
  }
}

/** Six to ten fungi grown from the floor of their bed, each a pale stalk under a glowing cap, all inside its box. */
function fungus(mesh: MeshBuilder, [x, y]: Point, bed: Bed): void {
  const count = 6 + Math.floor(seeded(x, y, 0) * 5);
  for (let cap = 0; cap < count; cap++) {
    const wide = 0.04 + seeded(x, y, cap + 20) * 0.06;
    const [footX, footY] = footIn(bed, wide, seeded(x, y, cap + 2), seeded(y, x, cap + 2));
    const tall = 0.1 + seeded(y, x, cap + 9) * (bed.box[4] - wide * 0.6 - 0.12);
    box(mesh, [COLOUR.wax, 0], [footX - 0.012, footY - 0.012, 0], [footX + 0.012, footY + 0.012, tall]);
    spike(mesh, [COLOUR.fungus, 0], [footX, footY, tall - 0.01], [footX, footY, tall + wide * 0.6], wide);
  }
}

/** Where a cluster of crystals or fungus grows: its solid's box (min x, min y, max x, max y, top), and the way out
 *  from its wall into the room. */
export interface Bed {
  readonly box: readonly [number, number, number, number, number];
  readonly out: readonly [number, number];
}

/** A point kept inside a bed's box, `margin` in from its sides. */
function within({ box: [minX, minY, maxX, maxY] }: Bed, [x, y]: readonly [number, number], margin: number) {
  return [Math.min(maxX - margin, Math.max(minX + margin, x)), Math.min(maxY - margin, Math.max(minY + margin, y))];
}

/** A foot `half` wide somewhere in a bed, by two numbers from 0 to 1, so it stands wholly inside the box. */
function footIn({ box: [minX, minY, maxX, maxY] }: Bed, half: number, across: number, down: number) {
  return [
    minX + half + across * Math.max(0, maxX - minX - 2 * half),
    minY + half + down * Math.max(0, maxY - minY - 2 * half),
  ];
}

/** A fixture's bed: the solid among the layout's boxes that holds where its light burns, and the way from it to its
 *  cell's middle, which is out from the wall it stands against; none for a fixture with no solid. */
export function bedOf(
  layout: { readonly cell: number; readonly boxes: readonly (readonly [number, number, number, number, number])[] },
  [x = 0, y = 0]: readonly number[],
): Bed | null {
  const box = layout.boxes.find(([minX, minY, maxX, maxY]) => x > minX && x < maxX && y > minY && y < maxY);
  if (!box) return null;
  const [awayX, awayY] = [
    (Math.floor(x / layout.cell) + 0.5) * layout.cell - x,
    (Math.floor(y / layout.cell) + 0.5) * layout.cell - y,
  ];
  return { box, out: Math.abs(awayX) >= Math.abs(awayY) ? [Math.sign(awayX), 0] : [0, Math.sign(awayY)] };
}

/** One fixture as the layout stands it: x, y, the light's height and its kind (`FIXTURE`); a cluster grows in its bed,
 *  or in one 0.6 m by 0.4 m round its light, against a wall to the north, when it is given none. */
export function fixtureMesh(mesh: MeshBuilder, [x, y, z, kind]: readonly number[], given?: Bed | null): void {
  const where: Point = [x ?? 0, y ?? 0, z ?? 0];
  const bed: Bed = given ?? {
    box: [where[0] - 0.3, where[1] - 0.2, where[0] + 0.3, where[1] + 0.2, kind === FIXTURE.fungus ? 0.5 : 0.9],
    out: [0, 1],
  };
  if (kind === FIXTURE.brazier) brazier(mesh, where);
  else if (kind === FIXTURE.candles) candles(mesh, where);
  else if (kind === FIXTURE.crystals) crystals(mesh, where, bed);
  else if (kind === FIXTURE.lantern) lantern(mesh, where);
  else if (kind === FIXTURE.hearth) hearthFire(mesh, where);
  else if (kind === FIXTURE.fungus) fungus(mesh, where, bed);
}

// A dungeon's lights that are not wall torches, drawn where the layout stands them: a brazier on its legs, a cluster
// of candles, glowing crystals, a lantern on its chain and a hearth's fire. Each is shaped by where it stands, so no
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

/** Five to eight crystals grown from the floor round where the light stands, each leaning out from the cluster. */
function crystals(mesh: MeshBuilder, [x, y]: Point): void {
  const count = 5 + Math.floor(seeded(x, y, 0) * 4);
  for (let crystal = 0; crystal < count; crystal++) {
    const turn = (crystal / count) * Math.PI * 2 + seeded(x, y, 1) * 4;
    const out = seeded(x, y, crystal + 2) * 0.35;
    const [footX, footY] = [x + Math.cos(turn) * out, y + Math.sin(turn) * out];
    const tall = 0.35 + seeded(y, x, crystal + 2) * 0.9;
    const lean = 0.15 + out * 0.6;
    const tip: Point = [footX + Math.cos(turn) * lean, footY + Math.sin(turn) * lean, tall];
    spike(mesh, [COLOUR.crystal, 0], [footX, footY, 0], tip, 0.05 + seeded(x, y, crystal + 20) * 0.06);
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

/** One fixture as the layout stands it: x, y, the light's height and its kind (`FIXTURE`). */
export function fixtureMesh(mesh: MeshBuilder, [x, y, z, kind]: readonly number[]): void {
  const where: Point = [x ?? 0, y ?? 0, z ?? 0];
  if (kind === FIXTURE.brazier) brazier(mesh, where);
  else if (kind === FIXTURE.candles) candles(mesh, where);
  else if (kind === FIXTURE.crystals) crystals(mesh, where);
  else if (kind === FIXTURE.lantern) lantern(mesh, where);
  else if (kind === FIXTURE.hearth) hearthFire(mesh, where);
}

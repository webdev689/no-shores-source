import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS } from '../elementGlow.ts';
import { MARK_FLOATS } from './marks.ts';
import {
  BODY,
  CELL_M,
  CLEAR,
  DARK,
  FIRE_BIRD,
  HOT,
  LIGHT,
  Laid,
  RAVEN,
  STAR,
  billboard,
  birdSprite,
  groundSprite,
  bladeSprite,
  hashOf,
  novaSprite,
  orbSprite,
  puffSprite,
  sprite,
  stepOf,
  stopOf,
  sunSprite,
  within,
  type Sprite,
} from './spellPixels.ts';

type Point = readonly [number, number, number];

const cellsAt = (picture: Sprite, stop: number) => picture.cells.filter((cell) => cell === stop).length;
const vertices = (laid: Laid) => {
  const out = laid.laid();
  return Array.from({ length: out.length / MARK_FLOATS }, (unused, index) =>
    out.slice(index * MARK_FLOATS, (index + 1) * MARK_FLOATS),
  );
};
/** The rows of a sprite at or above its middle that hold any cell. */
const litAbove = (picture: Sprite) =>
  Array.from({ length: Math.ceil(picture.height / 2) - 1 }, (unused, row) => row).filter((row) =>
    Array.from({ length: picture.width }, (unused, column) => stopOf(picture, column, row)).some((stop) => stop >= 0),
  ).length;

test('a sprite is laid row by row from the top, measured from its middle, and is clear off its edges', () => {
  const picture = sprite(3, 3, (across, up) => (across === 1 && up === 1 ? HOT : CLEAR));
  assert.equal(stopOf(picture, 2, 0), HOT, 'right and up is the top right corner');
  assert.equal(stopOf(picture, 0, 2), CLEAR);
  assert.equal(stopOf(picture, -1, 0), CLEAR);
  assert.equal(stopOf(picture, 0, 3), CLEAR);
});

test('a hash is the same for the same parts, between 0 and 1, and differs for others', () => {
  assert.equal(hashOf(3, 7), hashOf(3, 7));
  assert.notEqual(hashOf(3, 7), hashOf(7, 3));
  for (let part = 0; part < 200; part++) {
    const value = hashOf(part, 11);
    assert.ok(value >= 0 && value < 1);
  }
});

test('a share is in the step it has reached, and never past the last', () => {
  assert.equal(stepOf(0, 4), 0);
  assert.equal(stepOf(0.24, 4), 0);
  assert.equal(stepOf(0.25, 4), 1);
  assert.equal(stepOf(1, 4), 3);
  assert.equal(stepOf(-0.5, 4), 0);
});

test('a point is within a polygon only inside it', () => {
  const square = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ] as const;
  assert.ok(within(1, 1, square));
  assert.ok(!within(3, 1, square));
  assert.ok(!within(1, -0.5, square));
});

test("a picture stands upright at its middle, turned square to the eye, in its element's own stops", () => {
  const picture = sprite(3, 3, (across, up) => (across === 0 || up === 0 ? LIGHT : CLEAR));
  const out = new Laid();
  const middle: Point = [10, 0, 1];
  billboard(out, picture, 2, middle, [0, 0, 1]);
  const corners = vertices(out);
  assert.ok(corners.length > 0);
  for (const [x = 0, y = 0, z = 0, red, green, blue, opacity] of corners) {
    assert.equal(x, 10, 'square to an eye looking along the east');
    assert.ok(Math.abs(y) <= 1.5 * CELL_M + 1e-9 && Math.abs(z - 1) <= 1.5 * CELL_M + 1e-9);
    assert.deepEqual([red, green, blue], [...(GLOW_RAMPS[2][LIGHT] ?? [])]);
    assert.equal(opacity, 1);
  }
});

test("each row's run of one stop is one quad, and a mirrored picture is laid the other way across", () => {
  const picture = sprite(4, 1, (across) => (across < 0 ? DARK : HOT));
  const out = new Laid();
  billboard(out, picture, 1, [0, -10, 0], [0, 0, 0]);
  assert.equal(out.length, 2 * 6 * MARK_FLOATS, 'two runs, each two triangles');
  const mirrored = new Laid();
  billboard(mirrored, picture, 1, [0, -10, 0], [0, 0, 0], { flip: true });
  const firstX = (vertex: readonly number[] | undefined) => vertex?.[0] ?? 0;
  assert.equal(firstX(vertices(out)[0]), -firstX(vertices(mirrored)[0]));
});

test('a picture nearer the eye than a body is not drawn', () => {
  const out = new Laid();
  billboard(out, STAR, 3, [0.2, 0, 1.6], [0, 0, 1.6]);
  assert.equal(out.length, 0);
});

test('an orb is white-hot at its heart and dark at its rim, and its crackle is struck afresh', () => {
  const orb = orbSprite(4);
  assert.equal(orb.width, 21);
  assert.equal(stopOf(orb, 10, 10), HOT);
  assert.equal(stopOf(orb, 10, 6), BODY);
  assert.notDeepEqual(orb.cells, orbSprite(5).cells);
  assert.equal(orbSprite(4), orbSprite(20), 'made once, its crackle repeating every sixteen strikes');
  assert.ok(orb.cells.every((cell) => cell >= CLEAR && cell <= HOT));
});

test("the sun's rays turn with it, a sixteenth of a turn at a time", () => {
  const sun = sunSprite(0);
  assert.equal(stopOf(sun, 18, 18), HOT);
  assert.equal(stopOf(sun, 18 + 15, 18), BODY, 'a long ray points along its turn');
  assert.equal(stopOf(sun, 18 + 15, 18 + 2), CLEAR, 'and is narrow');
  assert.notDeepEqual(sunSprite(Math.PI / 8).cells, sun.cells);
  assert.equal(sunSprite(0.01), sun, 'a turn less than a step is the same picture, made once');
});

test("a bird's wings beat: up over its back, then down below its belly", () => {
  for (const shape of [FIRE_BIRD, RAVEN]) {
    const [up, down] = [birdSprite(shape, 0, 0), birdSprite(shape, 2, 0)];
    assert.ok(litAbove(up) > litAbove(down), 'the wings are higher on the up beat');
    assert.notDeepEqual(birdSprite(shape, 1, 0).cells, up.cells);
  }
});

test('the fire bird burns white-hot through its body; the raven only at its eye', () => {
  assert.ok(cellsAt(birdSprite(FIRE_BIRD, 0, 0), HOT) > 10);
  const ravenHot = cellsAt(birdSprite(RAVEN, 0, 0), HOT);
  assert.ok(ravenHot > 0 && ravenHot <= 4, `the raven has ${ravenHot} white-hot cells`);
});

test('a blade a quarter turn round is the same blade turned', () => {
  const [flat, turned] = [bladeSprite(0), bladeSprite(Math.PI / 2)];
  assert.equal(cellsAt(flat, HOT), cellsAt(turned, HOT));
  assert.equal(stopOf(flat, 12 + 8, 12), HOT, 'pointing along its turn');
  assert.equal(stopOf(turned, 12, 12 - 8), HOT, 'pointing up a quarter turn on');
});

test("Vanish's puff swells as it goes and thins; Mend's ring swells and cools", () => {
  const filled = (picture: Sprite) => picture.cells.filter((cell) => cell !== CLEAR).length;
  assert.ok(filled(puffSprite(0.6, 9)) > filled(puffSprite(0, 9)));
  assert.ok(filled(puffSprite(0.99, 9)) < filled(puffSprite(0.6, 9)));
  assert.ok(cellsAt(novaSprite(0), HOT) > 0);
  assert.equal(cellsAt(novaSprite(0.99), HOT), 0);
  assert.ok(cellsAt(novaSprite(0.99), BODY) > cellsAt(novaSprite(0), BODY));
});

test('a picture laid on the ground lies flat at its middle, a cell a run', () => {
  const out = new Laid();
  groundSprite(out, STAR, 1, [5, 5, 2], 0.1);
  for (const [x = 0, y = 0, z = 0] of vertices(out)) {
    assert.ok(Math.abs(x - 5) <= 0.25 + 1e-9 && Math.abs(y - 5) <= 0.25 + 1e-9, 'within the picture');
    assert.ok(z > 2 && z < 2.1, 'just over the ground');
  }
});

test("a bird's flicker is one of a few, each made once, and its outline alone flickers", () => {
  assert.equal(birdSprite(FIRE_BIRD, 1, 3), birdSprite(FIRE_BIRD, 1, 11));
  const [still, flickered] = [birdSprite(FIRE_BIRD, 1, 0), birdSprite(FIRE_BIRD, 1, 1)];
  assert.equal(cellsAt(still, HOT), cellsAt(flickered, HOT));
});

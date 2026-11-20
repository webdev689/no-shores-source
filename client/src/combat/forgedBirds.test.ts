import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Texels, birdPath, flickered, forgedBird, loadForgedBirds, spriteOfTexels } from './forgedBirds.ts';
import { BODY, CLEAR, DARK, HOT, LIGHT } from './spellPixels.ts';

/** A strip one row of texels, each `[light, cover]` out of 255. */
const strip = (texels: readonly (readonly [number, number])[]): Texels => ({
  width: texels.length,
  height: 1,
  data: texels.flatMap(([light, cover]) => [light, light, light, cover]),
});

test("a forge frame's light falls into its element's four stops, and a texel less than half covered is none", () => {
  const picture = spriteOfTexels(
    strip([
      [20, 255],
      [100, 255],
      [170, 255],
      [230, 255],
      [255, 100],
    ]),
  );
  assert.deepEqual([...picture.cells], [DARK, BODY, LIGHT, HOT, CLEAR]);
});

test("only a bird's outline flickers: some of its cells gone or a step lighter, its inside as drawn", () => {
  const solid = spriteOfTexels({
    width: 5,
    height: 5,
    data: Array.from({ length: 25 }, () => [100, 100, 100, 255]).flat(),
  });
  const outline = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24];
  const patterns = Array.from({ length: 8 }, (unused, flicker) => flickered(solid, outline, flicker));
  for (const shown of patterns)
    assert.deepEqual(
      [6, 7, 8, 11, 12, 13, 16, 17, 18].map((cell) => shown.cells[cell]),
      Array(9).fill(BODY),
    );
  const edges = patterns.flatMap((shown) => outline.map((cell) => shown.cells[cell]));
  assert.ok(edges.includes(CLEAR) && edges.includes(LIGHT) && edges.includes(BODY), 'gone, lit and as drawn, in turn');
});

test("a bird's beats come from the forge's published pictures; none is drawn before all of that bird's have", async () => {
  const asked: string[] = [];
  const settled = () => new Promise((done) => setImmediate(done));
  assert.equal(forgedBird('raven', 2, 1, 0), null, 'not yet come');
  const raven = (path: string) => path.includes('/raven-');
  loadForgedBirds((path) => {
    asked.push(path);
    return Promise.resolve(raven(path) && path !== birdPath('raven', 1, 1) ? strip([[200, 255]]) : null);
  });
  await settled();
  assert.equal(asked.length, 40, 'both birds, five views of four beats each');
  assert.ok(asked.includes('@art/arts/birds/fire-4-3.png'));
  assert.equal(forgedBird('raven', 2, 1, 0), null, 'one of its frames not come, the bird stays the spell’s own');
  loadForgedBirds((path) => Promise.resolve(raven(path) ? strip([[200, 255]]) : null));
  await settled();
  assert.equal(forgedBird('raven', 2, 5, 3)?.width, 1, 'all come; beat 5 is beat 1');
  assert.equal(forgedBird('fire', 2, 1, 0), null, 'a bird none of whose frames came stays the spell’s own');
});

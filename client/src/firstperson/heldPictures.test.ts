import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap, type Rgb } from '../forge/dyes.ts';
import { FramePainter } from './fpFrames.ts';
import {
  crossbowPath,
  crossbowPicture,
  flaskPicture,
  gunPicture,
  heldPath,
  lightPicture,
  shieldPicture,
} from './heldPictures.ts';

const band: Rgb[] = Array.from({ length: 16 }, (_unused, step) => [step * 16, step * 16, step * 16]);
const iron: Rgb[] = band.map(([red]) => [red, 0, 0]);
const daedric: Rgb[] = band.map(([red]) => [0, red, 0]);
const dyes: DyeTable = { palette: band, clothing: {}, armour: { Steel: band, Iron: iron, Daedric: daedric } };

/** A strip `width` by `height`, clear but where `drawn` answers a colour. */
function strip(width: number, height: number, drawn: (x: number, y: number) => Rgb | null): Strip {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const colour = drawn(x, y);
      if (colour) data.set([...colour, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}

function sourceOf(strips: Record<string, Strip>) {
  const asked: string[] = [];
  return {
    asked,
    frames: {},
    dyes,
    painter: new FramePainter(dyes, new PaletteSnap(dyes.palette)),
    strip: (path: string) => {
      asked.push(path);
      return Promise.resolve(strips[path] ?? null);
    },
  };
}

const pixelAt = (pixels: Uint8Array, width: number, x: number, y: number) =>
  Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));

test("a crossbow's rest frame sits flush in the screen's corner, every frame where that puts it", async () => {
  // The rest frame draws a box from (100, 60) to (199, 139) of its 218 by 156 frame; the stock runs on past it.
  const cells = strip(282 * 7, 204, (x, y) => {
    const inCell = x % 282;
    const resting = x < 282 && inCell >= 100 && inCell < 200 && y >= 60 && y < 140;
    return resting || (x < 282 && inCell >= 230 && y >= 170) ? [200, 100, 50] : null;
  });
  const source = sourceOf({ [crossbowPath('Iron', false)]: cells });
  const rest = await crossbowPicture(source, { kind: 'crossbow', metal: 'Iron', gilded: false }, 0, false);
  assert.deepEqual(rest?.at, [320 - 200, 200 - 140]);
  assert.deepEqual(rest && pixelAt(rest.pixels, rest.width, 100, 60), [200, 100, 50, 255]);
  const later = await crossbowPicture(source, { kind: 'crossbow', metal: 'Iron', gilded: false }, 3, false);
  assert.deepEqual([later?.at, later?.width], [rest?.at, 282]);
});

test('a crossbow in a metal it is not made in is drawn as steel, a hand of a pair from the pair strip', () => {
  assert.equal(crossbowPath('Ebony', false), '@art/crossbow/crossbow-steel.png');
  assert.equal(crossbowPath('Mithril', true), '@art/crossbow/crossbow-mithril-pair.png');
});

test('a gun lies flush in the bottom right, sunk its kick, its hands in the gauntlets dyed by their metal', async () => {
  const gun = strip(200, 150, (x) => (x === 0 ? [90, 60, 30] : null));
  const hands = strip(200, 150, (x) => (x === 1 ? [128, 128, 128] : null));
  const source = sourceOf({
    [heldPath('THUNDERLOCK', 0, 2, 'GunGilded')]: gun,
    [heldPath('THUNDERLOCK', 0, 2, 'HandsIron')]: hands,
  });
  const picture = await gunPicture(source, { kind: 'thunderlock', metal: null, gilded: true }, 'Iron', 0, 2);
  assert.deepEqual(picture?.at, [120, 55]);
  assert.deepEqual(picture && pixelAt(picture.pixels, 200, 0, 0), [90, 60, 30, 255]);
  assert.deepEqual(picture && pixelAt(picture.pixels, 200, 1, 0), [...(iron[8] ?? []), 255]);
  // A guild's set the gun was not drawn in falls back to the glove.
  const plain = sourceOf({ [heldPath('PISTOLET', 1, 0, 'Gun')]: gun, [heldPath('PISTOLET', 1, 0, 'Hands')]: hands });
  const carried = await gunPicture(plain, { kind: 'pistolet', metal: null, gilded: false }, 'Mages', 1, 0);
  assert.deepEqual(carried?.at, [120, 54]);
  assert.ok(plain.asked.includes(heldPath('PISTOLET', 1, 0, 'HandsMages')));
});

test("a shield is drawn in its metal's make, else the plain one, dyed by its metal, in the bottom left", async () => {
  const board = strip(134, 131, (x) => (x === 0 ? [128, 128, 128] : null));
  const hands = strip(134, 131, (x) => (x === 1 ? [128, 128, 128] : null));
  const source = sourceOf({
    [heldPath(112360, 0, 1, 'Shield')]: board,
    [heldPath(112360, 0, 1, 'HandsDaedric')]: hands,
  });
  const picture = await shieldPicture(source, 112360, 'Iron', 'Daedric', 1);
  const shields = source.asked.filter((path) => path.includes('_Shield'));
  assert.deepEqual(shields, [heldPath(112360, 0, 1, 'ShieldIron'), heldPath(112360, 0, 1, 'Shield')]);
  assert.deepEqual(picture?.at, [0, 69]);
  assert.deepEqual(picture && pixelAt(picture.pixels, 134, 0, 0), [...(iron[8] ?? []), 255]);
  assert.deepEqual(picture && pixelAt(picture.pixels, 134, 1, 0), [...(daedric[8] ?? []), 255]);
});

test("a faction's shield wears its faction's colour over its metal, and the hands keep the gauntlets'", async () => {
  const board = strip(134, 131, (x) => (x === 0 ? [128, 128, 128] : null));
  const hands = strip(134, 131, (x) => (x === 1 ? [128, 128, 128] : null));
  const plain = sourceOf({
    [heldPath(112360, 0, 1, 'Shield')]: board,
    [heldPath(112360, 0, 1, 'HandsDaedric')]: hands,
  });
  const picture = await shieldPicture({ ...plain, own: { left: daedric } }, 112360, 'Iron', 'Daedric', 1);
  assert.deepEqual(picture && pixelAt(picture.pixels, 134, 0, 0), [...(daedric[8] ?? []), 255]);
  assert.deepEqual(picture && pixelAt(picture.pixels, 134, 1, 0), [...(daedric[8] ?? []), 255]);
  const right = await shieldPicture({ ...plain, own: { right: daedric } }, 112360, 'Iron', 'Daedric', 1);
  assert.deepEqual(right && pixelAt(right.pixels, 134, 0, 0), [...(iron[8] ?? []), 255], 'the right hand is not its');
});

test("a faction's shield drawn in colours of its own is covered whole by its faction's colour", async () => {
  const board = strip(134, 131, (x) => (x === 0 ? [180, 140, 60] : null));
  const hands = strip(134, 131, (x) => (x === 1 ? [128, 128, 128] : null));
  const plain = sourceOf({ [heldPath(112360, 0, 1, 'ShieldElven')]: board, [heldPath(112360, 0, 1, 'Hands')]: hands });
  const own = await shieldPicture(
    { ...plain, own: { left: daedric } },
    112360,
    'Elven',
    null,
    1,
    'shield_buckler_elven',
  );
  const colour = own && pixelAt(own.pixels, 134, 0, 0);
  assert.ok(
    daedric.some((step) => [...step, 255].join() === colour?.join()),
    `a step of its colour: ${colour}`,
  );
});

test('a torch stands at the left, its hand still while its flame moves; a lantern hangs flush to the left edge', async () => {
  const flame = strip(90, 205, (x, y) => (x === 50 && y === 20 ? [250, 200, 40] : null));
  const lantern = strip(110, 138, (x) => (x === 60 ? [250, 200, 40] : null));
  const source = sourceOf({
    [heldPath(112359, 0, 3, 'Torch')]: flame,
    [heldPath(112359, 0, 0, 'Hands')]: strip(90, 205, () => null),
    [heldPath(112359, 1, 2, 'Lantern')]: lantern,
    [heldPath(112359, 1, 0, 'Hands')]: strip(110, 138, () => null),
  });
  const torch = await lightPicture(source, 'torch', null, 3);
  assert.deepEqual(torch?.at, [4, -5]);
  const hung = await lightPicture(source, 'lantern', null, 2);
  assert.deepEqual(hung?.at, [0, 62]);
});

test('the healing flask sits flush in the bottom right corner, the hand over it in the gauntlets worn', async () => {
  const flask = strip(240, 200, (x, y) => (x === 120 && y === 100 ? [200, 20, 10] : null));
  const hand = strip(240, 200, (x, y) => (x === 200 && y === 150 ? [128, 128, 128] : null));
  const source = sourceOf({ [heldPath('FLASK', 0, 2, 'Flask')]: flask, [heldPath('FLASK', 0, 2, 'Hands')]: hand });
  const drunk = await flaskPicture(source, null, 2);
  assert.deepEqual([drunk?.at, drunk?.width, drunk?.height], [[80, 0], 240, 200]);
  assert.deepEqual(drunk && pixelAt(drunk.pixels, 240, 120, 100), [200, 20, 10, 255], 'the draught as drawn');
  assert.equal(drunk && pixelAt(drunk.pixels, 240, 200, 150)[3], 255, 'the hand over it');
  assert.equal(await flaskPicture(source, null, 1), null, 'a frame not published: none');
});

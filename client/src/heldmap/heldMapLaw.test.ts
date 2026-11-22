import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampView,
  leastScale,
  nearestMark,
  raised,
  routeOf,
  SCALE_MOST,
  seasChoices,
  SHEET,
  stageOf,
  toInk,
  toWorld,
  viewOn,
  wheelFactor,
  zoomAt,
} from './heldMapLaw.ts';

const WORLD = { width: 4_915_200, height: 3_072_000 };

test('the parchment fits between the head and the foot on wide and tall screens, its map within it', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 800, height: 1000 },
  ]) {
    const { sprite, ink } = stageOf(viewport);
    const sheetTop = sprite.y + SHEET.y0 * sprite.height;
    const sheetFoot = sprite.y + SHEET.y1 * sprite.height;
    assert.ok(sheetTop >= Math.max(0.1 * viewport.height, 78) - 0.5, `${viewport.width}: under the head`);
    assert.ok(sheetFoot <= viewport.height - Math.max(0.06 * viewport.height, 52) + 0.5, 'over the foot');
    assert.ok((SHEET.x1 - SHEET.x0) * sprite.width <= 0.9 * viewport.width + 0.5, 'no wider than the screen allows');
    assert.ok(ink.x > sprite.x + SHEET.x0 * sprite.width && ink.y > sheetTop, 'the map inside the parchment');
    assert.ok(ink.x + ink.width < sprite.x + SHEET.x1 * sprite.width && ink.y + ink.height < sheetFoot);
    // The painting is centred; its parchment lies within a pixel of its middle.
    assert.ok(Math.abs(ink.x + ink.width / 2 - viewport.width / 2) < 2, 'centred across');
  }
});

test('on a wide screen the gauntlets run off its foot', () => {
  const { sprite } = stageOf({ width: 1280, height: 720 });
  assert.ok(sprite.y + sprite.height > 720);
});

test('the rise is eased at both ends, and held between down and up', () => {
  assert.equal(raised(0), 0);
  assert.equal(raised(1), 1);
  assert.equal(raised(0.5), 0.5);
  assert.ok(raised(0.1) < 0.1 && raised(0.9) > 0.9);
  assert.equal(raised(-1), 0);
  assert.equal(raised(2), 1);
});

test('the view keeps between the whole world and the closest, centred where the world is narrower than the map', () => {
  const ink = { width: 1000, height: 600 };
  const far = clampView({ left: 5e6, top: -5e6, scale: 1e-9 }, ink, WORLD);
  assert.equal(far.scale, leastScale(ink, WORLD));
  // The world (1.6 across to 1 down) is narrower than this map (1.67): it fills it down and is centred across.
  assert.equal(far.top, 0);
  assert.ok(far.left < 0 && Math.abs(far.left * 2 + ink.width / far.scale - WORLD.width) < 1e-3);
  const near = clampView({ left: -100, top: 1e9, scale: 1 }, ink, WORLD);
  assert.equal(near.scale, SCALE_MOST);
  assert.equal(near.left, 0);
  assert.equal(near.top, WORLD.height - ink.height / SCALE_MOST);
});

test('a world point and its place on the map turn into each other', () => {
  const view = { left: 1_000_000, top: 500_000, scale: 0.002 };
  const [inkX, inkY] = toInk(view, 1_200_000, 650_000);
  const [x, y] = toWorld(view, inkX, inkY);
  assert.ok(Math.abs(x - 1_200_000) < 1e-6 && Math.abs(y - 650_000) < 1e-6);
});

test('zooming keeps the world point under the cursor where the limits allow', () => {
  const ink = { width: 1000, height: 600 };
  const view = viewOn([2_500_000, 1_500_000], ink, WORLD);
  const under = toWorld(view, 300, 200);
  const zoomed = zoomAt(view, 300, 200, 1.5, ink, WORLD);
  assert.ok(zoomed.scale > view.scale);
  const after = toWorld(zoomed, 300, 200);
  assert.ok(Math.abs(after[0] - under[0]) < 1e-3 && Math.abs(after[1] - under[1]) < 1e-3);
});

test('the map opens centred on the ship', () => {
  const ink = { width: 1000, height: 600 };
  const view = viewOn([2_500_000, 1_500_000], ink, WORLD);
  const [inkX, inkY] = toInk(view, 2_500_000, 1_500_000);
  assert.ok(Math.abs(inkX - 500) < 1e-6 && Math.abs(inkY - 300) < 1e-6);
});

test('a wheel turned in zooms in, out zooms out, a line counting 16 pixels', () => {
  assert.ok(wheelFactor(-100, 0, 600) > 1);
  assert.ok(wheelFactor(100, 0, 600) < 1);
  assert.equal(wheelFactor(3, 1, 600), wheelFactor(48, 0, 600));
});

test('a click picks the nearest mark within reach, and nothing out of it', () => {
  const marks = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 110, y: 100 },
  ];
  assert.equal(nearestMark(marks, 108, 101)?.id, 'b');
  assert.equal(nearestMark(marks, 100, 130), null);
});

test('a long route is thinned to the most the map inks, keeping its end, each point with how far along it lies', () => {
  for (const length of [2, 128, 129, 1024, 1025]) {
    const points = Array.from({ length }, (unused, index) => [index * 10, 0] as const);
    const route = routeOf(points, 128);
    const count = route.length / 4;
    assert.ok(count <= 128, `${length}: ${count}`);
    assert.equal(route[(count - 1) * 4], (length - 1) * 10, `${length}: the destination kept`);
    assert.equal(route[(count - 1) * 4 + 2], (length - 1) * 10, `${length}: its distance along`);
  }
});

test('the voyage card shuts a difficulty the player’s level shuts, says why, and never keeps it picked', () => {
  const young = [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.'];
  assert.deepEqual(seasChoices('abyss', young), { picked: 'normal', why: 'Elite seas open at level 10.' });
  assert.deepEqual(seasChoices('abyss', [null, null, 'Abyss seas open at level 20.']), {
    picked: 'elite',
    why: 'Abyss seas open at level 20.',
  });
  assert.deepEqual(seasChoices('abyss', [null, null, null]), { picked: 'abyss', why: null });
  assert.deepEqual(seasChoices('elite', []), { picked: 'elite', why: null }, 'no word of the character: nothing shut');
});

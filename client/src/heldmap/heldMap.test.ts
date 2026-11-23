import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Stack } from '../ui/stack.ts';
import { fakeInterface, wordsIn } from '../ui/uiForTests.ts';
import { HeldMap, Kept, layoutKey } from './heldMap.ts';
import { GLYPH_HALF } from './landGlyphs.ts';
import { letterScale } from './mapLayout.ts';

const view = { left: 10, top: 20, scale: 0.5 };
const stage = { ink: { x: 1, y: 2, width: 1313, height: 844 }, sprite: { x: 0, y: 0, width: 1500, height: 1000 } };
const scene = {
  ship: [100, 200] as const,
  heading: 1,
  places: [{ id: 'overlook', name: 'Overlook', kind: 'port', at: [5, 6] as const, sail: [7, 8] as const }],
  knownIslands: 3,
  course: [],
};
const keyOf = (changed: Partial<Parameters<typeof layoutKey>[4]> = {}, others: Partial<{ fonts: string }> = {}) =>
  layoutKey(
    { ...view },
    structuredClone(stage),
    others.fonts ?? 'loaded',
    1,
    { ...structuredClone(scene), ...changed },
    null,
  );

test('the held map lays out again only when something its layout reads has changed', () => {
  assert.equal(keyOf(), keyOf(), 'a still frame, its objects made anew, reads the same');
  const changes = [
    layoutKey({ ...view, scale: 0.6 }, stage, 'loaded', 1, scene, null),
    layoutKey(view, { ...stage, ink: { ...stage.ink, width: 900 } }, 'loaded', 1, scene, null),
    keyOf({}, { fonts: 'loading' }),
    layoutKey(view, stage, 'loaded', 2, scene, null),
    keyOf({ ship: [101, 200] }),
    keyOf({ heading: 2 }),
    keyOf({ knownIslands: 4 }),
    keyOf({ places: [] }),
    layoutKey(view, stage, 'loaded', 1, scene, 'overlook'),
    keyOf({ quest: ['overlook'] }),
  ];
  for (const [index, changed] of changes.entries()) assert.notEqual(changed, keyOf(), `change ${index} lays out again`);
  assert.equal(keyOf({ course: [[1, 1]] }), keyOf(), 'the course sailed is drawn, not lettered');
});

test('a frame whose key is unchanged does no layout; a changed one lays out again', () => {
  const kept = new Kept<string>();
  let laidOut = 0;
  const layout = () => `layout ${++laidOut}`;
  assert.equal(kept.made(keyOf(), layout), 'layout 1');
  for (let frame = 0; frame < 60; frame++) assert.equal(kept.made(keyOf(), layout), 'layout 1');
  assert.equal(laidOut, 1, 'sixty still frames, one layout');
  assert.equal(kept.made(keyOf({ heading: 2 }), layout), 'layout 2');
});

/** A map up over the view with a place chosen, its GPU drawing left out: what its card shows and hears alone. */
function mapUp(shut: readonly (string | null)[] = []) {
  const map = Object.create(HeldMap.prototype) as HeldMap;
  const place = { id: 'salt', name: 'Saltmere Reach', kind: 'node', at: [100, 100], sail: [90, 90] } as const;
  Object.assign(map, {
    phase: { kind: 'open' },
    ink: { x: 200, y: 150, width: 800, height: 450 },
    mapView: { left: 0, top: 0, scale: 1 },
    shownAt: { lift: 1, drop: 0 },
    placed: [{ place, x: 400, y: 200 }],
    choice: { at: place.sail, name: place.name, course: { ok: true, points: [] }, place: place.id },
    difficulty: 'normal',
    picked: 'normal',
    shut,
    lowered: () => undefined,
    sailKey: () => 'Enter',
  });
  const stack = new Stack();
  stack.add((ui) => map.node(ui));
  const { ui, step } = fakeInterface();
  const frame = (events: Parameters<typeof step>[1] = []) => step(() => stack.node(ui), events);
  const press = (id: string) => {
    frame();
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const [x, y] = [box.x + 2, box.y + 2];
    frame([
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  };
  return { map, ui, frame, press };
}

test("the card's seas and Set sail take the pointer, and set sail at the seas chosen", () => {
  const { map, press } = mapUp();
  press('held-seas:abyss');
  press('held-sail');
  assert.equal(map.difficulty, 'abyss');
  assert.equal(map.shown, true, 'lowering');
});

test('a tier the player’s level shuts rests on the card, its reason under it, and the voyage sails at the hardest open', () => {
  const { map, ui, frame, press } = mapUp([null, null, 'Abyss seas open at level 20.']);
  press('held-seas:abyss');
  assert.equal(ui.boxOf('held-seas:abyss') !== null && map.difficulty, 'normal', 'a shut tier is not picked');
  frame();
  assert.ok(wordsIn(map.node(ui)).includes('Abyss seas open at level 20.'), 'its reason under the card');
  press('held-seas:elite');
  press('held-sail');
  assert.equal(map.difficulty, 'elite');
});

test("the card's ground lets a click through to the map", () => {
  const { ui, frame } = mapUp();
  frame();
  const card = ui.boxOf('held-card');
  assert.ok(card);
  assert.equal(ui.takes(card.x + 3, card.y + 3), false, "the card's edge");
});

test("on land, a lit keeper's coin is ringed where it is painted, as large; an unlit one and the sea's map ring none", () => {
  const map = Object.create(HeldMap.prototype) as HeldMap;
  const marks = [
    { glyph: 'mail', at: [30, 40], word: 'The Postmaster' },
    { glyph: 'mage', at: [50, 60], word: 'The Mage' },
  ];
  Object.assign(map, { land: { marks }, ink: { x: 0, y: 0, width: 800, height: 450 }, mapView: view });
  const coins = (lit: (glyph: string) => boolean, dpr = 2) => [
    ...(map as unknown as { litCoins: (...args: unknown[]) => Float32Array }).litCoins(
      { ...scene, lit },
      { x: 100, y: 50, width: 1600, height: 900 },
      dpr,
    ),
  ];
  const [x, y, radius] = coins((glyph) => glyph === 'mail');
  // Where landLetters paints it: the sheet's metres less the view's corner, its pixels a metre, a device pixel apart.
  assert.deepEqual([x, y], [100 + (30 - view.left) * view.scale * 2, 50 + (40 - view.top) * view.scale * 2]);
  assert.equal(radius, GLYPH_HALF * letterScale({ height: 450 }) * 2, "as wide as its coin's");
  assert.equal(coins(() => true).length, 6, 'each lit one');
  assert.deepEqual(
    coins(() => false),
    [],
    'none lit',
  );
  Object.assign(map, { land: null });
  assert.deepEqual(
    coins(() => true),
    [],
    'none at sea',
  );
});

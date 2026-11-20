import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kept, layoutKey } from './heldMap.ts';

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
  ];
  for (const [index, changed] of changes.entries()) assert.notEqual(changed, keyOf(), `change ${index} lays out again`);
  assert.equal(keyOf({ course: [[1, 1]] }), keyOf(), 'the course sailed is drawn, not lettered');
});

test('a frame whose key is unchanged does no layout; a changed one lays out again', () => {
  const kept = new Kept<string>();
  let laidOut = 0;
  const layout = () => `layout ${++laidOut}`;
  assert.equal(kept.of(keyOf(), layout), 'layout 1');
  for (let frame = 0; frame < 60; frame++) assert.equal(kept.of(keyOf(), layout), 'layout 1');
  assert.equal(laidOut, 1, 'sixty still frames, one layout');
  assert.equal(kept.of(keyOf({ heading: 2 }), layout), 'layout 2');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crosshairNode, hurtAt, hurtNode, parryNode } from './hudCues.ts';
import { allOf } from './nodes.test.ts';

test('the struck edge is red at the view’s edge, half of it 24 px in, and gone 150 px in', () => {
  assert.ok(Math.abs(hurtAt(0) - 0.7) < 0.01, `${hurtAt(0)}`);
  assert.ok(Math.abs(hurtAt(24) - 0.5) < 0.001);
  assert.ok(hurtAt(150) < 0.01);
  assert.equal(hurtNode(0), null, 'none while no blow is taken');
  assert.equal(hurtNode(0.5)?.opacity, 0.5);
});

test('the crosshair’s charge is drawn in two-degree steps, so a draw makes few pictures, and glows once full', () => {
  const key = (charge: number) => allOf(crosshairNode(charge)).find((node) => node.picture)?.picture?.key;
  assert.equal(key(0.5), 'charge 180');
  assert.equal(key(0.501), 'charge 180', 'a step held');
  assert.equal(key(1), 'charge 360 full');
  assert.equal(
    allOf(crosshairNode(null)).some((node) => node.picture),
    false,
    'no ring while nothing charges',
  );
});

test('a parry ring is as wide as its blow’s span, gold once it would parry, and an iron blow’s is its mark alone', () => {
  const spot = { x: 100, y: 50 };
  assert.deepEqual(
    [parryNode(spot, 40, 'ring').width, parryNode(spot, 40, 'ring').picture?.key],
    [48, 'parry ring 40'],
  );
  assert.match(String((parryNode(spot, 20, 'now').picture?.source as { svg: string }).svg), /#ffd95a/);
  assert.equal(parryNode(spot, 14, 'iron').picture?.key, 'parry iron 0');
  assert.deepEqual(parryNode(spot, 40, 'ring').float, { to: 'screen', anchor: [0.5, 0.5], x: 100, y: 50, z: 1 });
});

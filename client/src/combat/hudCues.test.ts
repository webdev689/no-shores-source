import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RING, hurtAt, hurtNode, parryNode } from './hudCues.ts';

test('the struck edge is red at the view’s edge, half of it 24 px in, and gone 150 px in', () => {
  assert.ok(Math.abs(hurtAt(0) - 0.7) < 0.01, `${hurtAt(0)}`);
  assert.ok(Math.abs(hurtAt(24) - 0.5) < 0.001);
  assert.ok(hurtAt(150) < 0.01);
  assert.equal(hurtNode(0), null, 'none while no blow is taken');
  assert.equal(hurtNode(0.5)?.opacity, 0.5);
});

test('a parry ring is as wide as its blow’s span, gold once it would parry, and an iron blow’s is its mark alone', () => {
  const spot = { x: 100, y: 50 };
  assert.deepEqual(
    [parryNode(spot, 40, 'ring').width, parryNode(spot, 40, 'ring').picture?.key],
    [52, 'parry ring 40 0'],
  );
  assert.match(String((parryNode(spot, 30, 'now').picture?.source as { svg: string }).svg), /#ffd95a/);
  assert.equal(parryNode(spot, 14, 'iron').picture?.key, 'parry iron 0');
  assert.deepEqual(parryNode(spot, 40, 'ring').float, { to: 'screen', anchor: [0.5, 0.5], x: 100, y: 50, z: 1 });
});

test('a parry ring is bold over a dark edge, and its window is a gold band the closing ring enters', () => {
  const spot = { x: 100, y: 50 };
  const svg = (node: ReturnType<typeof parryNode>) => String((node.picture?.source as { svg: string }).svg);
  const plain = parryNode(spot, 80, 'ring');
  assert.match(svg(plain), /stroke-width="4"/, 'bold');
  assert.match(svg(plain), /rgba\(0,0,0,0\.75\)/, 'a dark edge');
  assert.doesNotMatch(svg(plain), /rgba\(255,217,90/, 'no band where a press could open no window');
  const banded = parryNode(spot, 30, 'ring', 60);
  assert.match(svg(banded), /rgba\(255,217,90,0\.2\)/, 'the window’s band, faint over the foe');
  assert.match(svg(banded), /stroke="#ffd95a" stroke-width="2"/, 'edged by a hard gold line where the window opens');
  assert.equal(banded.width, 72, 'wide enough for the band past a ring nearly closed');
  assert.equal(banded.picture?.key, 'parry ring 30 60');
  assert.ok(RING.widest > 2 * RING.closed, 'its widest stands well clear of the fixed ring');
});

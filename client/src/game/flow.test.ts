import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arriving, type Flow, next } from './flow.ts';

test('the player arrives through a veil, on foot in their node', () => {
  const first = arriving('overlook-social', 'Overlook');
  assert.equal(first.mode, 'loading');
  assert.deepEqual(next(first, { kind: 'loaded' }), { mode: 'foot', node: 'overlook-social' });
});

test('from a node the player returns to their ship, views an island side and lands at a chosen node', () => {
  let flow: Flow = { mode: 'foot', node: 'overlook-social' };
  flow = next(next(flow, { kind: 'return-to-ship', continent: 'continent-1' }), { kind: 'loaded' });
  assert.deepEqual(flow, { mode: 'sea', continent: 'continent-1', menu: false });
  flow = next(flow, { kind: 'view-landings' });
  flow = next(flow, { kind: 'choose', node: 'saltgrass-downs' });
  assert.deepEqual(flow, { mode: 'landing', continent: 'continent-1', chosen: 'saltgrass-downs' });
  flow = next(flow, { kind: 'land', node: 'saltgrass-downs', name: 'The Saltgrass Downs' });
  assert.equal(flow.mode, 'loading');
  assert.deepEqual(next(flow, { kind: 'loaded' }), { mode: 'foot', node: 'saltgrass-downs' });
});

test('landing needs the node chosen first, and back leaves the landings for the sea', () => {
  const landing: Flow = { mode: 'landing', continent: 'continent-1', chosen: null };
  assert.equal(next(landing, { kind: 'land', node: 'tidewall', name: 'Tidewall' }), landing);
  assert.deepEqual(next(landing, { kind: 'back' }), { mode: 'sea', continent: 'continent-1', menu: false });
});

test('what does not fit the mode changes nothing', () => {
  const foot: Flow = { mode: 'foot', node: 'tidewall' };
  for (const happening of [{ kind: 'view-landings' }, { kind: 'loaded' }, { kind: 'menu' }] as const) {
    assert.equal(next(foot, happening), foot);
  }
});

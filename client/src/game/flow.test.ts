import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arriving, type Flow, next } from './flow.ts';

test('the player arrives through a veil, on foot in their node', () => {
  const first = arriving('overlook-social', 'Overlook');
  assert.deepEqual(first, {
    mode: 'loading',
    words: 'Arriving at Overlook',
    then: { mode: 'foot', node: 'overlook-social', menu: false },
  });
  assert.deepEqual(next(first, { kind: 'loaded' }), { mode: 'foot', node: 'overlook-social', menu: false });
});

test('from a node the player returns to their ship, views an island side and lands at a chosen node', () => {
  let flow: Flow = { mode: 'foot', node: 'overlook-social', menu: true };
  flow = next(flow, { kind: 'return-to-ship' });
  assert.equal(flow.mode, 'loading');
  flow = next(flow, { kind: 'loaded' });
  assert.deepEqual(flow, { mode: 'sea', menu: false });
  flow = next(flow, { kind: 'view-landings' });
  flow = next(flow, { kind: 'choose', node: 'saltgrass-downs' });
  assert.deepEqual(flow, { mode: 'landing', chosen: 'saltgrass-downs' });
  flow = next(flow, { kind: 'land', node: 'saltgrass-downs', name: 'The Saltgrass Downs' });
  assert.equal(flow.mode === 'loading' && flow.words, 'Landing at The Saltgrass Downs');
  assert.deepEqual(next(flow, { kind: 'loaded' }), { mode: 'foot', node: 'saltgrass-downs', menu: false });
});

test('landing needs the node chosen first, and back leaves the landings for the sea', () => {
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, { kind: 'land', node: 'tidewall', name: 'Tidewall' }), landing);
  const other: Flow = { mode: 'landing', chosen: 'pearl-tomb' };
  assert.equal(next(other, { kind: 'land', node: 'tidewall', name: 'Tidewall' }), other, 'only the chosen one lands');
  assert.deepEqual(next(landing, { kind: 'back' }), { mode: 'sea', menu: false });
});

test('the menu opens and closes on foot and at sea, and back closes it', () => {
  const foot: Flow = { mode: 'foot', node: 'tidewall', menu: false };
  const open = next(foot, { kind: 'menu' });
  assert.deepEqual(open, { mode: 'foot', node: 'tidewall', menu: true });
  assert.deepEqual(next(open, { kind: 'back' }), foot);
  assert.deepEqual(next({ mode: 'sea', menu: false }, { kind: 'menu' }), { mode: 'sea', menu: true });
});

test('what does not fit the mode changes nothing', () => {
  const foot: Flow = { mode: 'foot', node: 'tidewall', menu: false };
  for (const happening of [{ kind: 'view-landings' }, { kind: 'loaded' }, { kind: 'back' }] as const) {
    assert.equal(next(foot, happening), foot);
  }
  const sea: Flow = { mode: 'sea', menu: false };
  assert.equal(next(sea, { kind: 'return-to-ship' }), sea);
  const loading = arriving('overlook-social', 'Overlook');
  assert.equal(next(loading, { kind: 'menu' }), loading, 'no menu while the veil is down');
});

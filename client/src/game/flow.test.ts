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

test('on foot the player goes through a gate into an instance and back out, never from a menu', () => {
  const foot: Flow = { mode: 'foot', node: 'saltgrass-downs', menu: false };
  const into = next(foot, { kind: 'pass', node: 'burned-mill', name: 'The Burned Mill', into: true });
  assert.equal(into.mode === 'loading' && into.words, 'Entering The Burned Mill');
  assert.deepEqual(next(into, { kind: 'loaded' }), { mode: 'foot', node: 'burned-mill', menu: false });
  const back = next(
    { mode: 'foot', node: 'burned-mill', menu: false },
    {
      kind: 'pass',
      node: 'saltgrass-downs',
      name: 'The Saltgrass Downs',
      into: false,
    },
  );
  assert.equal(back.mode === 'loading' && back.words, 'Returning to The Saltgrass Downs');
  const menu: Flow = { ...foot, menu: true };
  assert.equal(next(menu, { kind: 'pass', node: 'burned-mill', name: 'The Burned Mill', into: true }), menu);
});

test('a company member is joined from on foot or at sea, never while landing or loading', () => {
  const join = { kind: 'join', node: 'saltgrass-downs', name: 'The Saltgrass Downs' } as const;
  const joined = next({ mode: 'sea', menu: true }, join);
  assert.deepEqual(joined, {
    mode: 'loading',
    words: 'Joining your company at The Saltgrass Downs',
    then: { mode: 'foot', node: 'saltgrass-downs', menu: false },
  });
  assert.equal(next(joined, join), joined, 'not while loading');
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, join), landing);
});

test('washed up from the sea, the veil says why and the player stands in the port city’s social space', () => {
  const words = 'Washed up at Sunspire. Your ship lies at its moorings.';
  const washUp = { kind: 'wash-up', node: 'sunspire-social', words } as const;
  assert.deepEqual(next({ mode: 'sea', menu: false }, washUp), {
    mode: 'loading',
    words,
    then: { mode: 'foot', node: 'sunspire-social', menu: false },
  });
  assert.deepEqual(next({ mode: 'foot', node: 'glade', menu: false }, washUp), {
    mode: 'foot',
    node: 'glade',
    menu: false,
  });
});

test('anchored off an island, the player walks ashore on its beach behind the veil, from the sea alone', () => {
  const ashore = { kind: 'isle', node: '7', words: 'Going ashore on a cove' } as const;
  assert.deepEqual(next({ mode: 'sea', menu: false }, ashore), {
    mode: 'loading',
    words: 'Going ashore on a cove',
    then: { mode: 'foot', node: '7', menu: false },
  });
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, ashore), landing);
});

test('the story opens the game and, ended, brings the player through the veil to the social space', () => {
  const story: Flow = { mode: 'story' };
  assert.equal(next(story, { kind: 'menu' }), story, 'no menu over the story');
  assert.equal(next(story, { kind: 'return-to-ship' }), story);
  const ended = next(story, { kind: 'story-ended', node: 'overlook-social', name: 'Overlook' });
  assert.deepEqual(ended, arriving('overlook-social', 'Overlook'));
  const foot: Flow = { mode: 'foot', node: 'overlook-social', menu: false };
  assert.equal(next(foot, { kind: 'story-ended', node: 'x', name: 'X' }), foot, 'only the story ends the story');
});

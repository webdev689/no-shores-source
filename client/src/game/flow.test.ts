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

test("on foot the player goes into a patrol's dungeon and out again, each behind the veil", () => {
  const patrol: Flow = { mode: 'foot', node: 'saltgrass-downs', menu: false };
  const into = { kind: 'enter', node: 'saltgrass-downs--dungeon-0', name: 'The Cells of the Saltgrass Downs' } as const;
  const entering = next(patrol, into);
  assert.equal(entering.mode === 'loading' && entering.words, 'Entering The Cells of the Saltgrass Downs');
  const inside = next(entering, { kind: 'loaded' });
  assert.deepEqual(inside, { mode: 'foot', node: 'saltgrass-downs--dungeon-0', menu: false });
  const out = { kind: 'leave', node: 'saltgrass-downs', name: 'The Cells of the Saltgrass Downs' } as const;
  const leaving = next(inside, out);
  assert.equal(leaving.mode === 'loading' && leaving.words, 'Leaving The Cells of the Saltgrass Downs');
  assert.deepEqual(next(leaving, { kind: 'loaded' }), patrol);
  assert.equal(next({ ...patrol, menu: true }, into).mode, 'foot', 'not with a menu open');
  assert.equal(next({ mode: 'sea', menu: false }, out).mode, 'sea', 'only on foot');
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

test('a room whose gate shuts sends the player back to their ship, the veil saying why', () => {
  const landing = next({ mode: 'landing', chosen: 'tidewall' }, { kind: 'land', node: 'tidewall', name: 'Tidewall' });
  const why = 'Abyss seas open at level 20.';
  const back = { mode: 'loading', words: `${why} Returning to your ship`, then: { mode: 'sea', menu: false } };
  assert.deepEqual(next(landing, { kind: 'shut', why }), back, 'while the veil is up');
  assert.deepEqual(next({ mode: 'foot', node: 'tidewall', menu: false }, { kind: 'shut', why }), back);
  assert.deepEqual(next({ mode: 'sea', menu: false }, { kind: 'shut', why }), { mode: 'sea', menu: false });
});

test('a sea island’s dungeon is entered from the sea and left back to it, the veil saying why', () => {
  const enter = {
    kind: 'enter',
    node: 'sea-dungeon-continent-4-caverns-0a1b2c3d--dungeon',
    name: 'The Caverns of the Sea',
  } as const;
  const inside = { mode: 'foot', node: enter.node, menu: false } as const;
  assert.deepEqual(next({ mode: 'sea', menu: false }, enter), {
    mode: 'loading',
    words: 'Entering The Caverns of the Sea',
    then: inside,
  });
  assert.deepEqual(next({ mode: 'sea', menu: true }, enter), { mode: 'sea', menu: true }, 'not with the menu open');
  const surface = { kind: 'surface', name: 'The Caverns of the Sea', fell: false } as const;
  const atSea = { mode: 'sea', menu: false } as const;
  assert.deepEqual(
    next({ ...inside, menu: true }, surface),
    { mode: 'loading', words: 'Leaving The Caverns of the Sea', then: atSea },
    'even with the menu open',
  );
  assert.deepEqual(next(inside, { ...surface, fell: true }), {
    mode: 'loading',
    words: 'Your company fell. Leaving The Caverns of the Sea',
    then: atSea,
  });
  assert.deepEqual(next(atSea, surface), atSea);
});

test('a company that falls in an Abyss run is taken out to its entrance, the veil saying so', () => {
  const words = 'Your company fell. Leaving The Halls of the Saltgrass Downs';
  const out = { mode: 'loading', words, then: { mode: 'foot', node: 'saltgrass-downs', menu: false } };
  const happening = { kind: 'wiped', node: 'saltgrass-downs', name: 'The Halls of the Saltgrass Downs' } as const;
  assert.deepEqual(
    next({ mode: 'foot', node: 'saltgrass-downs--dungeon-1', menu: true }, happening),
    out,
    'even with the menu open',
  );
  assert.deepEqual(next({ mode: 'sea', menu: false }, happening), { mode: 'sea', menu: false });
});

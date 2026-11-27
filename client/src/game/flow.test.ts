import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arriving, type Flow, next, onTheSea } from './flow.ts';

test('the player arrives through a veil, on foot in their node', () => {
  const first = arriving('overlook-social', 'Overlook');
  assert.deepEqual(first, {
    mode: 'loading',
    words: 'Arriving at Overlook',
    then: { mode: 'foot', node: 'overlook-social' },
  });
  assert.deepEqual(next(first, { kind: 'loaded' }), { mode: 'foot', node: 'overlook-social' });
});

test('from a node the player returns to their ship, views an island side and lands at a chosen node', () => {
  let flow: Flow = { mode: 'foot', node: 'overlook-social' };
  flow = next(flow, { kind: 'return-to-ship' });
  assert.equal(flow.mode, 'loading');
  flow = next(flow, { kind: 'loaded' });
  assert.deepEqual(flow, { mode: 'sea' });
  flow = next(flow, { kind: 'view-landings' });
  flow = next(flow, { kind: 'choose', node: 'saltgrass-downs' });
  assert.deepEqual(flow, { mode: 'landing', chosen: 'saltgrass-downs' });
  flow = next(flow, { kind: 'land', node: 'saltgrass-downs', name: 'The Saltgrass Downs' });
  assert.equal(flow.mode === 'loading' && flow.words, 'Landing at The Saltgrass Downs');
  assert.deepEqual(next(flow, { kind: 'loaded' }), { mode: 'foot', node: 'saltgrass-downs' });
});

test('landing needs the node chosen first, and back leaves the landings for the sea', () => {
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, { kind: 'land', node: 'tidewall', name: 'Tidewall' }), landing);
  const other: Flow = { mode: 'landing', chosen: 'pearl-tomb' };
  assert.equal(next(other, { kind: 'land', node: 'tidewall', name: 'Tidewall' }), other, 'only the chosen one lands');
  assert.deepEqual(next(landing, { kind: 'back' }), { mode: 'sea' });
});

test('what does not fit the mode changes nothing', () => {
  const foot: Flow = { mode: 'foot', node: 'tidewall' };
  for (const happening of [{ kind: 'view-landings' }, { kind: 'loaded' }, { kind: 'back' }] as const) {
    assert.equal(next(foot, happening), foot);
  }
  const sea: Flow = { mode: 'sea' };
  assert.equal(next(sea, { kind: 'return-to-ship' }), sea);
  const loading = arriving('overlook-social', 'Overlook');
  assert.equal(next(loading, { kind: 'back' }), loading, 'nothing to step back from while the veil is down');
});

test('on foot the player goes through a gate into an instance and back out', () => {
  const foot: Flow = { mode: 'foot', node: 'saltgrass-downs' };
  const into = next(foot, { kind: 'pass', node: 'burned-mill', name: 'The Burned Mill', into: true });
  assert.equal(into.mode === 'loading' && into.words, 'Entering The Burned Mill');
  assert.deepEqual(next(into, { kind: 'loaded' }), { mode: 'foot', node: 'burned-mill' });
  const back = next(
    { mode: 'foot', node: 'burned-mill' },
    {
      kind: 'pass',
      node: 'saltgrass-downs',
      name: 'The Saltgrass Downs',
      into: false,
    },
  );
  assert.equal(back.mode === 'loading' && back.words, 'Returning to The Saltgrass Downs');
  const sea: Flow = { mode: 'sea' };
  assert.equal(next(sea, { kind: 'pass', node: 'burned-mill', name: 'The Burned Mill', into: true }), sea, 'on foot');
});

test('a company member is joined from on foot or at sea, never while landing or loading', () => {
  const join = { kind: 'join', node: 'saltgrass-downs', name: 'The Saltgrass Downs' } as const;
  const joined = next({ mode: 'sea' }, join);
  assert.deepEqual(joined, {
    mode: 'loading',
    words: 'Joining your company at The Saltgrass Downs',
    then: { mode: 'foot', node: 'saltgrass-downs' },
  });
  assert.equal(next(joined, join), joined, 'not while loading');
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, join), landing);
});

test("on foot the player goes into a patrol's dungeon and out again, each behind the veil", () => {
  const patrol: Flow = { mode: 'foot', node: 'saltgrass-downs' };
  const into = { kind: 'enter', node: 'saltgrass-downs--dungeon-0', name: 'The Cells of the Saltgrass Downs' } as const;
  const entering = next(patrol, into);
  assert.equal(entering.mode === 'loading' && entering.words, 'Entering The Cells of the Saltgrass Downs');
  const inside = next(entering, { kind: 'loaded' });
  assert.deepEqual(inside, { mode: 'foot', node: 'saltgrass-downs--dungeon-0' });
  const out = { kind: 'leave', node: 'saltgrass-downs', name: 'The Cells of the Saltgrass Downs' } as const;
  const leaving = next(inside, out);
  assert.equal(leaving.mode === 'loading' && leaving.words, 'Leaving The Cells of the Saltgrass Downs');
  assert.deepEqual(next(leaving, { kind: 'loaded' }), patrol);
  assert.equal(next({ mode: 'sea' }, out).mode, 'sea', 'only on foot');
});

test('washed up from the sea, the veil says why and the player stands in the port city’s social space', () => {
  const words = 'Washed up at Sunspire. Your ship lies at its moorings.';
  const washUp = { kind: 'wash-up', node: 'sunspire-social', words } as const;
  assert.deepEqual(next({ mode: 'sea' }, washUp), {
    mode: 'loading',
    words,
    then: { mode: 'foot', node: 'sunspire-social' },
  });
  assert.deepEqual(next({ mode: 'foot', node: 'glade' }, washUp), { mode: 'foot', node: 'glade' });
});

test('anchored off an island, the player walks ashore on its beach behind the veil, from the sea alone', () => {
  const ashore = { kind: 'isle', node: '7', words: 'Going ashore on a cove' } as const;
  assert.deepEqual(next({ mode: 'sea' }, ashore), {
    mode: 'loading',
    words: 'Going ashore on a cove',
    then: { mode: 'foot', node: '7' },
  });
  const landing: Flow = { mode: 'landing', chosen: null };
  assert.equal(next(landing, ashore), landing);
});

test('the story opens the game and, ended, brings the player through the veil to the social space', () => {
  const story: Flow = { mode: 'story' };
  assert.equal(next(story, { kind: 'back' }), story);
  assert.equal(next(story, { kind: 'return-to-ship' }), story);
  const ended = next(story, { kind: 'story-ended', node: 'overlook-social', name: 'Overlook' });
  assert.deepEqual(ended, arriving('overlook-social', 'Overlook'));
  const foot: Flow = { mode: 'foot', node: 'overlook-social' };
  assert.equal(next(foot, { kind: 'story-ended', node: 'x', name: 'X' }), foot, 'only the story ends the story');
});

test('a room whose gate shuts sends the player back to their ship, the veil saying why', () => {
  const landing = next({ mode: 'landing', chosen: 'tidewall' }, { kind: 'land', node: 'tidewall', name: 'Tidewall' });
  const why = 'Abyss seas open at level 20.';
  const back = { mode: 'loading', words: `${why} Returning to your ship`, then: { mode: 'sea' } };
  assert.deepEqual(next(landing, { kind: 'shut', why }), back, 'while the veil is up');
  assert.deepEqual(next({ mode: 'foot', node: 'tidewall' }, { kind: 'shut', why }), back);
  assert.deepEqual(next({ mode: 'sea' }, { kind: 'shut', why }), { mode: 'sea' });
  const ashore = { node: 'overlook-social', name: 'Overlook' };
  assert.deepEqual(
    next({ mode: 'foot', node: 'tidewall' }, { kind: 'shut', why, ashore }),
    { mode: 'loading', words: `${why} Returning to Overlook`, then: { mode: 'foot', node: 'overlook-social' } },
    'one who keeps no ship yet goes back to Overlook, where the Harbourmaster has one',
  );
});

test('a sea island’s dungeon is entered from the sea and left back to it, the veil saying why', () => {
  const enter = {
    kind: 'enter',
    node: 'sea-dungeon-continent-4-caverns-0a1b2c3d--dungeon',
    name: 'The Caverns of the Sea',
  } as const;
  const inside = { mode: 'foot', node: enter.node } as const;
  assert.deepEqual(next({ mode: 'sea' }, enter), {
    mode: 'loading',
    words: 'Entering The Caverns of the Sea',
    then: inside,
  });
  const overTheSide = next({ mode: 'landing', chosen: null }, enter);
  assert.deepEqual(
    overTheSide,
    { mode: 'loading', words: 'Entering The Caverns of the Sea', then: inside },
    'the Playlist',
  );
  const surface = { kind: 'surface', name: 'The Caverns of the Sea', fell: false } as const;
  const atSea = { mode: 'sea' } as const;
  assert.deepEqual(next(inside, surface), { mode: 'loading', words: 'Leaving The Caverns of the Sea', then: atSea });
  assert.deepEqual(next(inside, { ...surface, fell: true }), {
    mode: 'loading',
    words: 'Your company fell. Leaving The Caverns of the Sea',
    then: atSea,
  });
  assert.deepEqual(next(atSea, surface), atSea);
});

test('a company that falls in an Abyss run is taken out to its entrance, the veil saying so', () => {
  const words = 'Your company fell. Leaving The Halls of the Saltgrass Downs';
  const out = { mode: 'loading', words, then: { mode: 'foot', node: 'saltgrass-downs' } };
  const happening = { kind: 'wiped', node: 'saltgrass-downs', name: 'The Halls of the Saltgrass Downs' } as const;
  assert.deepEqual(next({ mode: 'foot', node: 'saltgrass-downs--dungeon-1' }, happening), out);
  assert.deepEqual(next({ mode: 'sea' }, happening), { mode: 'sea' });
});

test('the player is on the sea while sailing or choosing where to land, never on foot or between places', () => {
  const sea: Flow = { mode: 'sea' };
  assert.equal(onTheSea(sea), true);
  assert.equal(onTheSea({ mode: 'landing', chosen: null }), true);
  assert.equal(onTheSea({ mode: 'foot', node: 'overlook-social' }), false);
  assert.equal(onTheSea(arriving('saltgrass-downs', 'The Saltgrass Downs')), false, 'a trip from land to land');
  assert.equal(onTheSea(next({ mode: 'foot', node: 'overlook-social' }, { kind: 'return-to-ship' })), false);
  assert.equal(onTheSea({ mode: 'story' }), false);
});

test('through a passage’s mouth, or by a lamp’s Home, the way between zones plays in place of the veil', () => {
  const zone: Flow = { mode: 'foot', node: 'passage-zone-3' };
  const passing = next(zone, { kind: 'onward', node: 'passage-zone-7' });
  assert.deepEqual(passing, { mode: 'passing', then: { mode: 'foot', node: 'passage-zone-7' } });
  assert.deepEqual(next(passing, { kind: 'loaded' }), { mode: 'foot', node: 'passage-zone-7' });
  const home = next(zone, { kind: 'home', node: 'saltgrass-downs' });
  assert.deepEqual(next(home, { kind: 'loaded' }), { mode: 'foot', node: 'saltgrass-downs' });
  assert.deepEqual(next({ mode: 'sea' }, { kind: 'onward', node: 'passage-zone-7' }), { mode: 'sea' }, 'only on foot');
  assert.equal(next(passing, { kind: 'shut', why: 'Shut.' }).mode, 'loading', 'a room shut on the way sends them back');
  assert.equal(onTheSea(passing), false);
});

test("across from one of an island's patrol zones to another, the way between them passing as a passage's does", () => {
  // Two patrol zones of one island, the glade and the grove, as the bake writes a crossing between them.
  const crossing = next({ mode: 'foot', node: 'glade' }, { kind: 'cross', node: 'grove', name: 'The Grove' });
  assert.deepEqual(crossing, { mode: 'passing', then: { mode: 'foot', node: 'grove' } });
  assert.deepEqual(next(crossing, { kind: 'loaded' }), { mode: 'foot', node: 'grove' });
  assert.deepEqual(next({ mode: 'sea' }, { kind: 'cross', node: 'grove', name: 'The Grove' }), {
    mode: 'sea',
  });
});

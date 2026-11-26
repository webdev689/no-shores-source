import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Flow } from './flow.ts';
import { type FootContext, joinAsk, nodeAddress } from './footPlace.ts';
import {
  keepPlace,
  PLACE_KEY,
  placeHeard,
  placeNow,
  placeOf,
  resume,
  socialArrival,
  type Resumed,
  type Resuming,
} from './relog.ts';
import type { NodeInfo } from './worldData.ts';

const node = (id: string, kind: NodeInfo['kind'], locked = false): NodeInfo => ({
  id,
  kind,
  name: id === 'overlook-social' ? 'Overlook' : id,
  continent: 'continent-1',
  ring: [],
  spawns: [[10, 20]],
  centre: [0, 0],
  ...(locked ? { locked } : {}),
});
const NODES = [
  node('overlook-social', 'social'),
  node('saltgrass-downs', 'patrol'),
  node('sunspire-social', 'social', true),
];

test('a kept place reads back as it was written, and anything else as none', () => {
  const aboard = { kind: 'sea', at: [60_000, 50_000], heading: 1.25 } as const;
  assert.deepEqual(placeOf(JSON.stringify(aboard)), aboard);
  const social = { kind: 'social', node: 'overlook-social', at: [3, 4], facing: 2 } as const;
  assert.deepEqual(placeOf(JSON.stringify(social)), social);
  assert.deepEqual(placeOf('{"kind":"sea","at":[1]}'), { kind: 'sea' }, 'a spot that is no spot is left out');
  for (const text of [null, 'not JSON', '{"kind":"patrol"}', '{"kind":"social"}', '5'])
    assert.equal(placeOf(text), null, String(text));
  assert.equal(PLACE_KEY, 'noshores.place');
});

test('the accounts’ word names where to go, never a spot: the rooms stand the player there themselves', () => {
  assert.deepEqual(placeHeard({ kind: 'sea' }), { kind: 'sea' });
  const heard = placeHeard({ kind: 'social', node: 'overlook-social', at: [1, 2, 3], facing: 0.5 });
  assert.deepEqual(heard, { kind: 'social', node: 'overlook-social', facing: 0.5 });
  assert.equal(placeHeard(null), null);
  assert.equal(placeHeard(undefined), null);
});

test('a social place arrives in its node, at its spot where the page kept one, and none locked or elsewhere', () => {
  const kept = socialArrival({ kind: 'social', node: 'overlook-social', at: [3, 4], facing: 2 }, NODES);
  assert.deepEqual([kept?.node.id, kept?.node.spawns, kept?.facing], ['overlook-social', [[3, 4]], 2]);
  const heard = socialArrival({ kind: 'social', node: 'overlook-social' }, NODES);
  assert.deepEqual(
    [heard?.node.spawns, heard?.facing],
    [[[10, 20]], null],
    'online: its own spawns, the room stands them',
  );
  assert.equal(socialArrival({ kind: 'social', node: 'sunspire-social' }, NODES), null, 'locked');
  assert.equal(socialArrival({ kind: 'social', node: 'saltgrass-downs' }, NODES), null, 'no social space');
  assert.equal(socialArrival({ kind: 'social', node: 'rimeholt-social' }, NODES), null, 'not on this landmass');
});

/** A game to resume in that records where it went. */
function game(online: boolean, heard: Awaited<ReturnType<Resuming['heard']>>, kept: Resumed | null = null) {
  const went: string[] = [];
  const flows: Flow[] = [];
  const resuming: Resuming = {
    online,
    heard: () => Promise.resolve(heard),
    kept: () => kept,
    nodes: NODES,
    aboard: (spot) => Promise.resolve(void went.push(`aboard ${JSON.stringify(spot ?? null)}`)),
    ashore: (into, facing) =>
      Promise.resolve(void went.push(`ashore ${into.id} ${JSON.stringify(into.spawns)} ${facing}`)),
    overlook: () => Promise.resolve(void went.push('overlook')),
    passage: (room) => Promise.resolve(room.endsWith('z12') && Boolean(went.push(`into ${room}`))),
    flow: (flow) => void flows.push(flow),
  };
  return { resuming, went, flows };
}

test('back from the title online, the player goes aboard or into their social space as the accounts say', async () => {
  const sea = game(true, { kind: 'sea' });
  await resume(sea.resuming);
  assert.deepEqual(sea.went, ['aboard null'], 'the sea room puts the ship where it kept it');
  assert.deepEqual(sea.flows, [{ mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea' } }]);
  const social = game(true, { kind: 'social', node: 'overlook-social', at: [1, 2, 3], facing: 0.5 });
  await resume(social.resuming);
  assert.deepEqual(social.went, ['ashore overlook-social [[10,20]] 0.5']);
  assert.deepEqual(social.flows, [
    { mode: 'loading', words: 'Arriving at Overlook', then: { mode: 'foot', node: 'overlook-social' } },
  ]);
  const none = game(true, null);
  await resume(none.resuming);
  assert.deepEqual([none.went, none.flows], [['overlook'], []], 'none kept: Overlook');
});

test('back from the title offline, the player goes where the page kept: the ship where it lay, their own spot', async () => {
  const sea = game(
    false,
    { kind: 'social', node: 'overlook-social', at: [0, 0, 0], facing: 0 },
    {
      kind: 'sea',
      at: [60_000, 50_000],
      heading: 1.25,
    },
  );
  await resume(sea.resuming);
  assert.deepEqual(sea.went, ['aboard {"anchorage":[60000,50000],"heading":1.25}'], 'the browser’s, not the accounts’');
  const social = game(false, null, { kind: 'social', node: 'overlook-social', at: [3, 4], facing: 2 });
  await resume(social.resuming);
  assert.deepEqual(social.went, ['ashore overlook-social [[3,4]] 2']);
  const locked = game(false, null, { kind: 'social', node: 'sunspire-social', at: [3, 4] });
  await resume(locked.resuming);
  assert.deepEqual(locked.went, ['overlook'], 'a social space not open: Overlook');
});

test('where the player is now is kept aboard and on their feet in a social space, and nowhere else', () => {
  const body = { x: 5, y: 6, facing: 1 };
  const sea = { position: [100, 200] as const, heading: 0.5 };
  const overlook = { node: NODES[0] as NodeInfo, fallen: false, dungeon: null };
  assert.deepEqual(placeNow({ flow: { mode: 'sea' }, sea, foot: null }, body), {
    kind: 'sea',
    at: [100, 200],
    heading: 0.5,
  });
  assert.deepEqual(placeNow({ flow: { mode: 'foot', node: 'overlook-social' }, sea: null, foot: overlook }, body), {
    kind: 'social',
    node: 'overlook-social',
    at: [5, 6],
    facing: 1,
  });
  const foot = { mode: 'foot', node: 'x' } as const;
  assert.equal(placeNow({ flow: foot, sea: null, foot: { ...overlook, fallen: true } }, body), null, 'fallen');
  assert.equal(placeNow({ flow: foot, sea: null, foot: { ...overlook, node: NODES[1] as NodeInfo } }, body), null);
  assert.equal(placeNow({ flow: foot, sea: null, foot: { ...overlook, dungeon: {} } }, body), null, 'in a dungeon');
  assert.equal(placeNow({ flow: { mode: 'story' }, sea, foot: null }, body), null, 'in the story');
});

test('a join asks its room to stand the player before an entrance, or where they left a social space, or nothing', () => {
  assert.equal(joinAsk('relog'), '?relog=1');
  assert.equal(joinAsk({ number: 2, x: 0, y: 0, facing: 0 }), '?entrance=2');
  assert.equal(joinAsk(), '');
  assert.equal(joinAsk(undefined, 'gullwing-vale'), '?from=gullwing-vale', 'across from a patrol zone, at its gate');
  // Through a crossing gate the node gone to says where it came from (`gates.ts`), and its room is asked so.
  const context = { rooms: (name: string) => `wss://rooms/room/${name}` } as unknown as FootContext;
  const vale = { id: 'gullwing-vale', kind: 'patrol', across: 'saltgrass-downs' } as unknown as NodeInfo;
  assert.equal(
    nodeAddress(context, vale, 'elite', undefined, null),
    'wss://rooms/room/node-gullwing-vale--elite?from=saltgrass-downs',
  );
  assert.equal(
    nodeAddress({ ...context, rooms: null } as unknown as FootContext, vale, 'normal', undefined, null),
    null,
  );
});

test('back from the title online, a player whose dive’s zone held them last goes back into it', async () => {
  const diving = game(true, { kind: 'passage', room: 'passage-continent-1-w2900-z12' });
  await resume(diving.resuming);
  assert.deepEqual(diving.went, ['into passage-continent-1-w2900-z12']);
  const gone = game(true, { kind: 'passage', room: 'passage-continent-1-w2900-z11' });
  await resume(gone.resuming);
  assert.deepEqual(gone.went, ['overlook'], 'a zone the page cannot lay or join: Overlook');
});

test('the place is kept within a second of changing, and not again while it holds, as a closing page may not keep it', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const scope = { addEventListener: globalThis.addEventListener, document: globalThis.document };
  Object.assign(globalThis, { addEventListener: () => undefined, document: { addEventListener: () => undefined } });
  try {
    const written: string[] = [];
    let place = { node: 'overlook-social', at: [10, 20] as const };
    keepPlace(() => place, { setItem: (unused, value) => void written.push(value) });
    mock.timers.tick(1_000);
    assert.equal(written.length, 1, 'kept within a second');
    mock.timers.tick(5_000);
    assert.equal(written.length, 1, 'not again while it holds');
    place = { node: 'overlook-social', at: [11, 20] as const };
    mock.timers.tick(1_000);
    assert.deepEqual(JSON.parse(written.at(-1) ?? 'null'), place, 'kept again a second after it moved');
  } finally {
    Object.assign(globalThis, scope);
    mock.timers.reset();
  }
});

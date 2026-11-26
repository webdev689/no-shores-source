import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Flow } from './flow.ts';
import { type Fallback, onOtherLand, placeOf, sentOut, tripOrBack, wayFailed } from './tripBack.ts';

const FULL = new Error('the room is full');
const stood: Flow = { mode: 'foot', node: 'saltgrass-downs' };
const atHub: Flow = { mode: 'foot', node: 'overlook-social' };

/** A fallback whose ways succeed or fail as asked, keeping which were taken. */
function fallbackOf(back: Error | null | 'none', hub: Error | null) {
  const went: string[] = [];
  const way = (name: string, error: Error | null) => async () => {
    went.push(name);
    if (error) throw error;
  };
  const fallback: Fallback = {
    place: 'Tidewall',
    back: back === 'none' ? null : { flow: stood, go: way('back', back) },
    hub: { flow: atHub, go: way('hub', hub), name: 'Overlook' },
  };
  return { fallback, went };
}

test('a trip that goes takes no other way and tells nothing', async () => {
  const { fallback, went } = fallbackOf(null, null);
  const said: string[] = [];
  assert.equal(
    await tripOrBack(
      async () => undefined,
      fallback,
      (words) => said.push(words),
    ),
    null,
  );
  assert.deepEqual([went, said], [[], []]);
});

test('a trip to a full room puts the player back where they stood, told why', async () => {
  const { fallback, went } = fallbackOf(null, null);
  const said: string[] = [];
  const instead = await tripOrBack(
    () => Promise.reject(FULL),
    fallback,
    (words) => said.push(words),
  );
  const told = 'You could not reach Tidewall: the room is full.';
  assert.deepEqual(instead, { flow: stood, told });
  assert.deepEqual(went, ['back'], 'never the hub');
  assert.deepEqual(said, [told], 'the veil says why while they go back');
});

test('should going back fail too, the player is taken to the hub, told both', async () => {
  const { fallback, went } = fallbackOf(new Error('the room could not be reached'), null);
  const instead = await tripOrBack(
    () => Promise.reject(FULL),
    fallback,
    () => undefined,
  );
  assert.deepEqual(went, ['back', 'hub']);
  assert.deepEqual(instead, {
    flow: atHub,
    told:
      'You could not reach Tidewall: the room is full. You could not go back either: the room could not be reached. ' +
      'You are taken to Overlook.',
  });
});

test('a reason that ends its own sentence is told with one full stop', async () => {
  const { fallback } = fallbackOf(null, null);
  const refused = new Error('You cannot reach this place from where you were.');
  const instead = await tripOrBack(
    () => Promise.reject(refused),
    fallback,
    () => undefined,
  );
  assert.equal(instead?.told, 'You could not reach Tidewall: You cannot reach this place from where you were.');
});

test('with no way back, a failed trip goes straight to the hub', async () => {
  const { fallback, went } = fallbackOf('none', null);
  const instead = await tripOrBack(
    () => Promise.reject(FULL),
    fallback,
    () => undefined,
  );
  assert.deepEqual(went, ['hub']);
  assert.equal(instead?.told, 'You could not reach Tidewall: the room is full. You are taken to Overlook.');
});

test('only when the hub fails too does the trip fail, with its own error, for the veil to try again', async () => {
  const { fallback, went } = fallbackOf(new Error('gone'), new Error('the hub is gone too'));
  await assert.rejects(
    tripOrBack(
      () => Promise.reject(FULL),
      fallback,
      () => undefined,
    ),
    FULL,
  );
  assert.deepEqual(went, ['back', 'hub']);
});

test('a gate shut on the player, or their company fallen, leaves no way back', () => {
  assert.equal(sentOut({ kind: 'shut', why: 'Abyss seas open at level 20.' }), true);
  assert.equal(sentOut({ kind: 'wiped', node: 'saltgrass-downs', name: 'The Halls' }), true);
  assert.equal(sentOut({ kind: 'surface', name: 'The Caverns of the Sea', fell: true }), true);
  assert.equal(sentOut({ kind: 'surface', name: 'The Caverns of the Sea', fell: false }), false);
  assert.equal(sentOut({ kind: 'return-to-ship' }), false);
  assert.equal(sentOut({ kind: 'land', node: 'tidewall', name: 'Tidewall' }), false);
});

test('the place a trip is for: the ship, the node by its name, else the name the trip gave', () => {
  const names: Record<string, string> = { 'saltgrass-downs': 'The Saltgrass Downs' };
  const nameOf = (node: string) => names[node];
  const sea: Flow = { mode: 'sea' };
  assert.equal(placeOf(sea, { kind: 'return-to-ship' }, nameOf), 'your ship');
  const out = { kind: 'leave', node: 'saltgrass-downs', name: 'The Cells of the Saltgrass Downs' } as const;
  assert.equal(placeOf(stood, out, nameOf), 'The Saltgrass Downs', 'out of a dungeon, its patrol');
  const inside: Flow = { mode: 'foot', node: 'saltgrass-downs--dungeon-0' };
  const into = { kind: 'enter', node: 'saltgrass-downs--dungeon-0', name: 'The Cells' } as const;
  assert.equal(placeOf(inside, into, nameOf), 'The Cells');
});

test('a hub on another land that cannot be reached puts back the land the player left, so a retry starts there', async () => {
  let land = 'continent-5';
  const put: string[] = [];
  const lands = {
    now: () => land,
    open: () => Promise.resolve(void (land = 'continent-1')),
    put: (back: string) => void (put.push(back), (land = back)),
  };
  await assert.rejects(
    onOtherLand(lands, () => Promise.reject(new Error('the room is full'))),
    /the room is full/,
  );
  assert.deepEqual([land, put], ['continent-5', ['continent-5']]);
  await onOtherLand(lands, () => Promise.resolve());
  assert.equal(land, 'continent-1', "reached, the hub's land stays");
});

test('a way between places that fails comes down to the veil and goes back where it set out, else to the hub', async () => {
  const { fallback, went } = fallbackOf(null, null);
  const failed = wayFailed('a chalk hollow', fallback.back, fallback.hub);
  assert.equal(failed.words, 'Returning from the way to a chalk hollow');
  assert.deepEqual(failed.flow, { mode: 'loading', words: failed.words, then: stood }, 'behind the veil, bound back');
  const instead = await tripOrBack(
    () => Promise.reject(FULL),
    failed.fallback,
    () => undefined,
  );
  assert.deepEqual([went, instead?.flow], [['back'], stood]);
  const nowhere = fallbackOf('none', null);
  const toHub = wayFailed('a chalk hollow', null, nowhere.fallback.hub);
  assert.deepEqual(toHub.flow, { mode: 'loading', words: toHub.words, then: atHub }, 'with no way back, the hub');
  const hubbed = await tripOrBack(
    () => Promise.reject(FULL),
    toHub.fallback,
    () => undefined,
  );
  assert.deepEqual([nowhere.went, hubbed?.flow], [['hub'], atHub]);
});

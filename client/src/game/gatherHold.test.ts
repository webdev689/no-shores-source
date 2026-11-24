import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { GATHER_S, type HeldUse } from './footGear.ts';
import { GatherHold, type Holder } from './gatherHold.ts';

/** A player's gear standing node 3 for them, or none; the room's answers so far and its last. */
const standing = (stands: boolean, answered = 0, answer = 0) =>
  ({ nodes: stands ? [{ index: 3, x: 0, y: 0, resource: 0 }] : [], answered, answer }) as unknown as GearState;

/** Node 3 gathered, held two seconds. */
const NODE: HeldUse = { kind: 'node', index: 3, seconds: GATHER_S };

const holding = () => {
  const said = { letGo: 0 };
  let body: Holder = { at: [0, 0], health: 100 };
  const hold = new GatherHold(
    () => said.letGo++,
    () => body,
  );
  return { hold, said, move: (next: Holder) => (body = next) };
};

test('a gather fills as E is held, and is done once the room no longer stands its node', () => {
  const { hold, said } = holding();
  assert.equal(hold.share(10, true, standing(true)), null, 'none until E');
  hold.begin(NODE, standing(true));
  assert.equal(hold.share(10 + GATHER_S / 2, true, standing(true)), 0.5);
  assert.equal(hold.share(10 + GATHER_S, true, standing(true)), 1, 'full, waiting on the room');
  assert.equal(hold.share(10 + GATHER_S + 0.1, true, standing(false)), null, 'gathered');
  assert.equal(said.letGo, 0, 'never let go of');
});

test('letting go of E, stirring or being hurt lets a gather go, and the room is told', () => {
  const { hold, said, move } = holding();
  hold.share(0, true, standing(true));
  hold.begin(NODE, standing(true));
  hold.release();
  assert.equal(said.letGo, 1);
  hold.begin(NODE, standing(true));
  move({ at: [0.5, 0], health: 100 });
  assert.equal(hold.share(0.5, true, standing(true)), null, 'a step');
  move({ at: [0, 0], health: 100 });
  hold.begin(NODE, standing(true));
  move({ at: [0, 0], health: 90 });
  assert.equal(hold.share(0.5, true, standing(true)), null, 'a blow');
  hold.begin(NODE, standing(true));
  assert.equal(hold.share(0.5, false, standing(true)), null, 'a menu up');
  assert.equal(said.letGo, 4);
});

test('a blow after a heal lets a gather go', () => {
  const { hold, move } = holding();
  move({ at: [0, 0], health: 50 });
  hold.share(0, true, standing(true));
  hold.begin(NODE, standing(true));
  move({ at: [0, 0], health: 80 });
  assert.equal(hold.share(0.2, true, standing(true)), 0.1, 'healed');
  move({ at: [0, 0], health: 70 });
  assert.equal(hold.share(0.4, true, standing(true)), null, 'struck, though above where it began');
});

test('let go of once its time is full, the room is not told to stop: it may still be counting to it', () => {
  const { hold, said } = holding();
  hold.share(0, true, standing(true));
  hold.begin(NODE, standing(true));
  hold.share(GATHER_S, true, standing(true));
  hold.release();
  assert.equal(said.letGo, 0);
});

test('a gather the room refuses ends at once, quietly', () => {
  const { hold, said } = holding();
  hold.share(0, true, standing(true, 4));
  hold.begin(NODE, standing(true, 4));
  assert.equal(hold.share(0.2, true, standing(true, 4)), 0.1, 'not answered yet');
  assert.equal(hold.share(0.4, true, standing(true, 5, 102)), null, 'full');
  assert.equal(said.letGo, 0, 'nothing to let go of');
});

test('E where nothing is gathered begins nothing', () => {
  const { hold } = holding();
  hold.begin(undefined, standing(true));
  assert.equal(hold.share(1, true, standing(true)), null);
});

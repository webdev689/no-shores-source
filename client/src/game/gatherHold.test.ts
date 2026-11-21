import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { GATHER_S } from './footGear.ts';
import { GatherHold, type Holder } from './gatherHold.ts';

/** A player's gear standing node 3 for them, or none. */
const standing = (stands: boolean) =>
  ({ nodes: stands ? [{ index: 3, x: 0, y: 0, resource: 0 }] : [] }) as unknown as GearState;

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
  hold.begin(3);
  assert.equal(hold.share(10 + GATHER_S / 2, true, standing(true)), 0.5);
  assert.equal(hold.share(10 + GATHER_S, true, standing(true)), 1, 'full, waiting on the room');
  assert.equal(hold.share(10 + GATHER_S + 0.1, true, standing(false)), null, 'gathered');
  assert.equal(said.letGo, 0, 'never let go of');
});

test('letting go of E, stirring or being hurt lets a gather go, and the room is told', () => {
  const { hold, said, move } = holding();
  hold.share(0, true, standing(true));
  hold.begin(3);
  hold.release();
  assert.equal(said.letGo, 1);
  hold.begin(3);
  move({ at: [0.5, 0], health: 100 });
  assert.equal(hold.share(0.5, true, standing(true)), null, 'a step');
  move({ at: [0, 0], health: 100 });
  hold.begin(3);
  move({ at: [0, 0], health: 90 });
  assert.equal(hold.share(0.5, true, standing(true)), null, 'a blow');
  hold.begin(3);
  assert.equal(hold.share(0.5, false, standing(true)), null, 'a menu up');
  assert.equal(said.letGo, 4);
});

test('E where nothing is gathered begins nothing', () => {
  const { hold } = holding();
  hold.begin(undefined);
  assert.equal(hold.share(1, true, standing(true)), null);
});

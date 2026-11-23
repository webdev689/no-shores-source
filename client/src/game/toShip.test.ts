import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state } from '../network/gearForTests.ts';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { FIGHTING, TO_SHIP, askToShip } from './toShip.ts';

const never = () => false;

/** A room that answers each ask with `answer` after `after` waits. */
function room(answer: number, after = 2) {
  let gear: GearState = state({ answered: 7 });
  const asked: GearAsk[] = [];
  let waits = 0;
  const asker = () => ({ gear, ask: (ask: GearAsk) => asked.push(ask) });
  const wait = () => {
    waits += 1;
    if (waits === after) gear = { ...gear, answer, answered: gear.answered + 1 };
    return Promise.resolve();
  };
  return { asker, wait, asked };
}

test('a return to the ship goes on the room yes, and is refused in words while struck or fallen', async () => {
  const yes = room(TO_SHIP);
  assert.equal(await askToShip(yes.asker, false, never, yes.wait), null);
  assert.deepEqual(yes.asked, [{ kind: 73 }]);
  const struck = room(FIGHTING);
  assert.equal(
    await askToShip(struck.asker, false, never, struck.wait),
    'You cannot return to your ship within ten seconds of being struck.',
  );
  const fallen = room(0);
  assert.equal(await askToShip(fallen.asker, true, never, fallen.wait), 'You cannot return to your ship while fallen.');
  assert.deepEqual(fallen.asked, [], 'refused at once, as the room would');
  assert.equal(await askToShip(() => null, false, never), null, 'no room to ask: offline, or lost and played alone');
  const unheard = 'Your room did not answer. Try again.';
  assert.equal(
    await askToShip(
      () => null,
      false,
      () => true,
    ),
    unheard,
    'its room joining again: no yes',
  );
  const ungeared = { gear: null, ask: () => assert.fail('nothing to ask before its gear has come') };
  assert.equal(await askToShip(() => ungeared, false, never), unheard, 'nor before its gear has come');
  const lost = room(TO_SHIP, Number.POSITIVE_INFINITY);
  let open = true;
  const losing = () => (open ? lost.asker() : null);
  const waitLosing = () => ((open = false), Promise.resolve());
  assert.equal(await askToShip(losing, false, never, waitLosing), unheard, 'nor once its room is lost mid-ask');
  const silent = room(0, Number.POSITIVE_INFINITY);
  assert.equal(await askToShip(silent.asker, false, never, silent.wait), 'Your room did not answer. Try again.');
});

test("another ask's answer coming first is waited past, for the room's word on the return itself", async () => {
  let gear = state({ answered: 3 });
  let waits = 0;
  const asker = () => ({ gear, ask: () => undefined });
  const wait = () => {
    waits += 1;
    // The answer to an ask sent before, done (0), then the room's word on the return.
    if (waits === 1) gear = { ...gear, answer: 0, answered: 4 };
    if (waits === 3) gear = { ...gear, answer: FIGHTING, answered: 5 };
    return Promise.resolve();
  };
  assert.equal(
    await askToShip(asker, false, never, wait),
    'You cannot return to your ship within ten seconds of being struck.',
  );
});

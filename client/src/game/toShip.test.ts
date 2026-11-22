import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state } from '../network/gearForTests.ts';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { FIGHTING, askToShip } from './toShip.ts';

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
  const yes = room(0);
  assert.equal(await askToShip(yes.asker, false, yes.wait), null);
  assert.deepEqual(yes.asked, [{ kind: 73 }]);
  const struck = room(FIGHTING);
  assert.equal(
    await askToShip(struck.asker, false, struck.wait),
    'You cannot return to your ship within ten seconds of being struck.',
  );
  const fallen = room(0);
  assert.equal(await askToShip(fallen.asker, true, fallen.wait), 'You cannot return to your ship while fallen.');
  assert.deepEqual(fallen.asked, [], 'refused at once, as the room would');
  assert.equal(await askToShip(() => null, false), null, 'offline, nothing to ask');
  const silent = room(0, Number.POSITIVE_INFINITY);
  assert.equal(await askToShip(silent.asker, false, silent.wait), 'Your room did not answer. Try again.');
});

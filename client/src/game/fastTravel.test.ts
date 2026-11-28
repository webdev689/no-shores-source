import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state } from '../network/gearForTests.ts';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { FIGHTING } from './toShip.ts';
import { TRAVELLED, fastTravel } from './fastTravel.ts';

/** A room that answers each ask with `answer` on its second wait. */
function room(answer: number) {
  let gear: GearState = state({ answered: 7 });
  const asked: GearAsk[] = [];
  let waits = 0;
  const node = { landings: [{ name: 'Shingle Landing' }, { name: 'The Sunken Gate' }, { name: 'Hollow Coven' }] };
  const foot = { fallen: false, node, gear: { gear, ask: (ask: GearAsk) => asked.push(ask) } };
  const wait = () => {
    waits += 1;
    if (waits === 2) {
      gear = { ...gear, answer, answered: gear.answered + 1 };
      foot.gear = { ...foot.gear, gear };
    }
    return Promise.resolve();
  };
  return { foot, wait, asked };
}

test('a fast travel veils the picture while the room moves the player, and says why where it refuses', async () => {
  const yes = room(TRAVELLED);
  const veils: (string | null)[] = [];
  const notes: string[] = [];
  await fastTravel(
    yes.foot,
    2,
    (words) => veils.push(words),
    (words) => notes.push(words),
    yes.wait,
  );
  assert.deepEqual(yes.asked, [{ kind: 97, node: 2 }], 'the zone by its number');
  assert.deepEqual(veils, ['Travelling to Hollow Coven', null]);
  assert.equal(notes.length, 0, 'nothing to say');
  const struck = room(FIGHTING);
  veils.length = 0;
  await fastTravel(
    struck.foot,
    1,
    (words) => veils.push(words),
    (words) => notes.push(words),
    struck.wait,
  );
  assert.deepEqual(veils, ['Travelling to The Sunken Gate', null], 'lifted at once on a refusal');
  assert.deepEqual(notes, ['You cannot fast travel while fighting.']);
  const fallen = { ...room(TRAVELLED).foot, fallen: true };
  await fastTravel(
    fallen,
    1,
    () => assert.fail('no veil'),
    (words) => notes.push(words),
  );
  assert.equal(notes.at(-1), 'You cannot fast travel while fallen.', 'refused at once, as the room would');
  const before = notes.length;
  await fastTravel(
    room(TRAVELLED).foot,
    3,
    () => assert.fail('no veil'),
    (words) => notes.push(words),
  );
  assert.equal(notes.length, before, 'a zone the node has not goes nowhere');
});

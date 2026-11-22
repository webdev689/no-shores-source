import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAIL_AWAY } from '../cinema/sailAway.ts';
import type { Passage } from './passage.ts';
import type { SeaRoom } from './seaRoom.ts';
import { SeaTravel } from './seaTravel.ts';

/** A travel for a point east, its passage and room standing in: what the passage was asked, and the room's answer
 *  and its word on the ship. */
function travelling() {
  const asked: string[] = [];
  let answer: number | null = null;
  const room = {
    takeTravelled: () => [answer, (answer = null)][0],
    ownShip: { x: 549_600, y: 150_000, heading: Math.PI / 2 },
    forgetTravel: () => asked.push('forget'),
  } as unknown as SeaRoom;
  const passage = {
    travel: () => asked.push('travel'),
    placeAt: (lie: { x: number; y: number }) => asked.push(`placed ${lie.x},${lie.y}`),
    sailAlong: (points: readonly (readonly number[])[]) => asked.push(`along ${points.join(' ')}`),
    stop: () => asked.push('stop'),
    say: (words: string) => asked.push(`say ${words}`),
    room,
  } as unknown as Passage;
  const travel = new SeaTravel('The Elmwater', [550_000, 150_000], passage, () => true);
  const toFade = () => travel.step(SAIL_AWAY.outS + 0.01, room);
  return { travel, asked, room, toFade, answer: (number: number) => (answer = number) };
}

test('the travel is asked as the fade begins; taken, the ship is laid where the room put it and sails on', () => {
  const { travel, asked, room, toFade, answer } = travelling();
  travel.step(1, room);
  assert.deepEqual(asked, [], 'nothing asked on the rail out');
  toFade();
  assert.deepEqual(asked, ['travel']);
  answer(0);
  travel.step(0.1, room);
  assert.deepEqual(asked, ['travel', 'placed 549600,150000', 'along 550000,150000']);
  assert.equal(travel.away.refused, null);
});

test('refused, the ship heaves to and its line says why; too soon, the travel is asked again', () => {
  const { travel, asked, room, toFade, answer } = travelling();
  toFade();
  answer(6);
  travel.step(0.1, room);
  assert.deepEqual(asked, ['travel', 'travel'], 'asked again');
  answer(3);
  travel.step(0.1, room);
  assert.deepEqual(asked.slice(2), ['forget', 'stop', 'say No travel with a hostile ship giving chase.']);
  assert.equal(travel.away.refused, 'No travel with a hostile ship giving chase.');
});

test('a travel the room never answers is given up', () => {
  const { travel, asked, room, toFade } = travelling();
  toFade();
  for (let second = 0; second < 12; second++) travel.step(1, room);
  assert.deepEqual(asked.slice(1), ['forget', 'stop', 'say The sea did not answer.']);
});

test('a travel asked while the ship changed sea rooms is asked again of the room it joined', () => {
  const { travel, asked, room, toFade } = travelling();
  toFade();
  travel.step(0.1, { ...room, takeTravelled: () => null } as unknown as SeaRoom);
  assert.deepEqual(asked, ['travel', 'travel']);
});

test('no answer is taken before the travel is asked', () => {
  const { travel, asked, room, answer } = travelling();
  answer(0);
  travel.step(1, room);
  assert.deepEqual(asked, [], 'the stale answer is left alone');
  assert.equal(travel.away.answered, false);
});

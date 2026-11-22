import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAIL_AWAY } from '../cinema/sailAway.ts';
import type { Passage } from './passage.ts';
import type { SeaRoom } from './seaRoom.ts';
import type { Sea } from './sea.ts';
import { sailOrTravel, SeaTravel } from './seaTravel.ts';

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
    sailing: true,
    room,
  } as unknown as Passage;
  const travel = new SeaTravel('The Elmwater', [550_000, 150_000], passage, () => true);
  const toFade = () => travel.step(SAIL_AWAY.outS + 0.01, room);
  return { travel, asked, room, passage, toFade, answer: (number: number) => (answer = number) };
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

test('yes travels to the prompt’s own water, named as it named it, though no water lies at the place sailed for', () => {
  const done: string[] = [];
  const sea = {
    waterAt: () => null,
    travelTo: (to: readonly number[], water: string) => done.push(`travel ${to.join(',')} ${water}`) > 0,
    sailTo: (to: readonly number[]) => done.push(`sail ${to.join(',')}`),
  } as unknown as Sea;
  const water = {
    continent: 2,
    id: 'continent-3',
    name: 'The Elmwater',
    holder: 'grey-tithe',
    levels: [8, 14],
  } as const;
  sailOrTravel(sea, [600_000, 150_000], water, () => true);
  sailOrTravel(sea, [600_000, 150_000], null, () => true);
  assert.deepEqual(done, ['travel 600000,150000 The Elmwater', 'sail 600000,150000']);
});

test('a voyage stopped before the fade asks no travel and is answered at once, never waiting out the black', () => {
  const { travel, asked, room, passage } = travelling();
  (passage as { sailing: boolean }).sailing = false;
  travel.step(SAIL_AWAY.outS + 0.01, room);
  assert.deepEqual(
    asked.filter((each) => each === 'travel'),
    [],
    'nothing sent',
  );
  assert.equal(travel.away.refused, 'The voyage was stopped.');
});

test('a fight met ends the travel at any time: the room forgets it, and the picture is open with control back', () => {
  for (const when of ['before the ask', 'after the ask', 'after it was taken'] as const) {
    const { travel, asked, room, toFade, answer } = travelling();
    if (when !== 'before the ask') toFade();
    if (when === 'after it was taken') {
      answer(0);
      travel.step(SAIL_AWAY.fadeS + SAIL_AWAY.blackLeastS + 0.5, room);
    }
    travel.cut(room);
    assert.equal(asked.includes('forget'), true, `${when}: the room forgets it`);
    assert.deepEqual([travel.away.dark, travel.away.control], [0, true], `${when}: open, control back`);
    const sent = asked.length;
    travel.step(5, room);
    assert.equal(asked.length, sent, `${when}: nothing more is asked`);
  }
});

test('while a travel is under way Stop and the pace dial do nothing, whoever presses them', async () => {
  const { Sea } = await import('./sea.ts');
  const done: string[] = [];
  const sea = Object.create(Sea.prototype) as InstanceType<typeof Sea>;
  Object.assign(sea, {
    passage: { stop: () => done.push('stop'), stepPace: () => done.push('pace') },
    chase: { stop: () => undefined },
    aboard: { walking: false },
    travelling: {},
  });
  sea.stop();
  sea.stepPace(1);
  assert.deepEqual(done, []);
  sea.travelling = null;
  sea.stop();
  sea.stepPace(1);
  assert.deepEqual(done, ['stop', 'pace'], 'and they act once it is over');
});

test('a travel under way holds the player at sea, and coming back aboard ends any travel left from before', async () => {
  const { Sea } = await import('./sea.ts');
  const done: string[] = [];
  const sea = Object.create(Sea.prototype) as InstanceType<typeof Sea>;
  Object.assign(sea, {
    aboard: { active: false },
    view: { kind: 'travel', sail: () => done.push('view sails'), chosen: null },
    room: null,
    travelling: { cut: () => done.push('cut') },
  });
  assert.equal(sea.busy, true, 'held while it sails away');
  sea.cameAboard();
  assert.deepEqual([sea.travelling, sea.busy], [null, false]);
  assert.ok(done.includes('cut'), 'the travel is cut, its room told to forget it');
});

test('a travel waits to be asked until the room has the ship at sea, as a tier’s new room puts it there', () => {
  const { travel, asked, room, toFade } = travelling();
  const ship = room.ownShip;
  Object.assign(room, { ownShip: null });
  toFade();
  travel.step(0.5, room);
  assert.deepEqual(asked, [], 'not asked of a room that has no ship of the player’s');
  Object.assign(room, { ownShip: ship });
  travel.step(0.1, room);
  assert.deepEqual(asked, ['travel'], 'asked once it has');
});

test('a travel asked of a link that joined its sea again since is asked again', () => {
  const { travel, asked, room, toFade } = travelling();
  Object.assign(room, { joins: 1 });
  toFade();
  travel.step(0.1, room);
  assert.deepEqual(asked, ['travel']);
  Object.assign(room, { joins: 2 });
  travel.step(0.1, room);
  assert.deepEqual(asked, ['travel', 'travel']);
});

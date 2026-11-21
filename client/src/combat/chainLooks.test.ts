import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { chainMarks, chainVerdict } from './chainLooks.ts';
import { kicksOf } from './cameraKick.ts';
import { EVENT, HOW, blowLook, landsAsSpell } from './cues.ts';
import type { Frame } from './spellPlaces.ts';

const event = (fields: Partial<FightEvent>): FightEvent => ({
  tick: 1n,
  kind: EVENT.hit,
  how: HOW.leap,
  striker: 1,
  defender: 3,
  amount: 5,
  stroke: 0,
  element: 2,
  from: 2,
  ...fields,
});

const frame = {
  clock: 0,
  players: [{ id: 1, feet: [0, 0, 0], aim: 0, statuses: undefined }],
  foes: [
    { id: 2, feet: [0, -2, 0] },
    { id: 3, feet: [6, -2, 0] },
    { id: 4, feet: [3, -5, 0] },
  ],
} as unknown as Frame;

/** The marks `chainMarks` leaves, as (kind, at, to, element). */
function marked(events: readonly FightEvent[]): unknown[] {
  const left: unknown[] = [];
  const lands = {
    add: (kind: string, place: unknown, look: number, clock: number, more: { to?: unknown } = {}) =>
      left.push([kind, place, more.to ?? null, look]),
  };
  chainMarks(frame, events, lands as never);
  return left;
}

test('a leap is a bolt from the foe before to the foe it strikes, chest to chest, in the element it carried', () => {
  assert.deepEqual(marked([event({})]), [
    ['zap', [0, -2, 1.1], [6, -2, 1.1], 2],
    ['impact', [6, -2, 1.1], null, 2],
  ]);
  assert.deepEqual(
    marked([event({ kind: EVENT.dodged })]),
    [['zap', [0, -2, 1.1], [6, -2, 1.1], 2]],
    'dodged: no impact',
  );
});

test('a burst is one ring round the foe it came from, and an impact on each foe it strikes', () => {
  const burst = (defender: number) => event({ how: HOW.burst, defender, element: 1 });
  assert.deepEqual(marked([burst(3), burst(4)]), [
    ['ring', [0, -2, 0], null, 1],
    ['impact', [6, -2, 1.1], null, 1],
    ['impact', [3, -5, 1.1], null, 1],
  ]);
});

test('only a leap or a burst’s verdict is drawn, once, and burns in its own element, not the weapon’s glow', () => {
  assert.equal(chainVerdict(event({})), true);
  assert.equal(chainVerdict(event({ kind: EVENT.killed })), false, 'its kill is told beside it');
  assert.equal(chainVerdict(event({ kind: EVENT.shielded })), false);
  assert.equal(chainVerdict(event({ how: HOW.bite })), false, 'a bite is a blow’s flash');
  assert.equal(blowLook(event({ element: 3 }), { player: 1, own: 1 }), 3);
  assert.equal(blowLook(event({ how: HOW.bite, element: 0 }), { player: 1, own: 1 }), 1, 'a bite: the weapon’s');
});

test('a leap or a burst lands as a spell does, kicking no camera; a bite is a blow of the guard', () => {
  assert.equal(landsAsSpell(event({})), true);
  assert.equal(landsAsSpell(event({ how: HOW.burst })), true);
  assert.equal(landsAsSpell(event({ how: HOW.bite })), false);
  assert.deepEqual(kicksOf([event({})], 1), kicksOf([], 1), 'the player’s leap is no swing of theirs');
});

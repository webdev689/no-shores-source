import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { Arrivals, blinkDark } from './arrivals.ts';
import { EVENT } from './cues.ts';

test('an arriving player’s view is held dark, opens, shuts once more and opens', () => {
  assert.equal(blinkDark(0), 1);
  assert.equal(blinkDark(0.3), 1);
  assert.ok(Math.abs(blinkDark(0.5) - 0.15) < 1e-9);
  assert.ok(blinkDark(0.55) > blinkDark(0.5), 'it shuts again');
  assert.ok(Math.abs(blinkDark(0.6) - 0.9) < 1e-9);
  assert.equal(blinkDark(1), 0);
  assert.equal(blinkDark(5), 0);
  assert.equal(blinkDark(-1), 1, 'before it begins, dark');
});

test('a figure arrives whole over 0.6 s in held steps, and only the one told', () => {
  const arrivals = new Arrivals();
  arrivals.arrive(7, 10);
  assert.equal(arrivals.shareOf(7, 10), 1, 'nothing of it yet');
  const half = arrivals.shareOf(7, 10.3) ?? 0;
  assert.ok(half > 0 && half < 1, String(half));
  assert.equal(arrivals.shareOf(7, 10.6), undefined, 'whole');
  assert.equal(arrivals.shareOf(8, 10.3), undefined);
  assert.equal(arrivals.darkOf(8, 10), 0, 'another’s view is never darkened');
  assert.equal(arrivals.darkOf(7, 10.8) > 0, true, 'the blink outlasts the build');
  arrivals.arrive(7, 20);
  assert.equal(arrivals.shareOf(7, 20), 1, 'a respawn arrives again');
  arrivals.clear();
  assert.equal(arrivals.shareOf(7, 20), undefined);
});

test('players already there when the player arrives stand whole; one met after arrives, and every respawn told', () => {
  const arrivals = new Arrivals();
  arrivals.meet(101, 0);
  arrivals.arriveHere(1, 1);
  assert.equal(arrivals.shareOf(101, 1), undefined, 'already there');
  assert.equal(arrivals.shareOf(1, 1), 1);
  arrivals.meet(102, 2);
  arrivals.meet(102, 2.1);
  assert.equal(arrivals.shareOf(102, 2), 1, 'joined after');
  arrivals.told(
    [{ kind: EVENT.respawned, defender: 101 } as FightEvent, { kind: EVENT.killed, defender: 102 } as FightEvent],
    3,
  );
  assert.equal(arrivals.shareOf(101, 3), 1, 'respawned');
});

test('the player’s own figure begins building once their view is first open, and stands whole as it opens', () => {
  const arrivals = new Arrivals();
  arrivals.arrive(1, 0);
  assert.equal(arrivals.ownShareOf(1, 0.45), 1, 'nothing built while the view is dark');
  assert.ok(blinkDark(0.5) < 0.2, 'the view is first open as it begins');
  const half = arrivals.ownShareOf(1, 0.8) ?? 0;
  assert.ok(half > 0 && half < 1, String(half));
  assert.equal(arrivals.ownShareOf(1, 1.1), undefined, 'whole, the view open');
  assert.equal(blinkDark(1.1), 0);
});

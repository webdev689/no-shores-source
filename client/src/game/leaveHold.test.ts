import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEAVE_S, LeaveHold, leaveOffered } from './leaveHold.ts';

const STEP = 0.1;
/** Holds `hold` for `seconds` in steps, as frames do; answers how many frames it acted on. */
function heldFor(hold: LeaveHold, seconds: number, held = true, offered = true, refused: string | null = null): number {
  let acted = 0;
  for (let spent = 0; spent < seconds - 1e-9; spent += STEP) if (hold.frame(held, offered, refused, STEP)) acted += 1;
  return acted;
}

test('held through, the leave acts once, and only once more after it is let go and held through again', () => {
  const hold = new LeaveHold();
  assert.equal(heldFor(hold, LEAVE_S - STEP), 0, 'not before its time');
  assert.ok(hold.held > 0.8 && hold.held < 1);
  assert.equal(heldFor(hold, STEP), 1, 'at its time');
  assert.equal(heldFor(hold, 2), 0, 'held on, it waits on the room and acts no more');
  assert.equal(hold.held, 1, 'standing full meanwhile');
  heldFor(hold, 0.5, false);
  assert.equal(hold.held, 0, 'let go, it drains');
  assert.equal(heldFor(hold, LEAVE_S), 1, 'held through again');
});

test('let go early it drains away and never acts; a hold begun again picks up where the drain stands', () => {
  const hold = new LeaveHold();
  heldFor(hold, 1);
  const filled = hold.held;
  heldFor(hold, STEP, false);
  const drained = hold.held;
  assert.ok(drained < filled && drained > 0, 'draining over a moment, not at once');
  assert.ok(hold.shown);
  heldFor(hold, STEP);
  assert.ok(Math.abs(hold.held - (drained + STEP / LEAVE_S)) < 1e-9, 'picked up from where it stood');
  heldFor(hold, STEP, false);
  heldFor(hold, 1, false);
  assert.equal([hold.held, hold.shown].join(), '0,false');
});

test('where leaving is not offered (a window up, at sea) the hold goes at once and fills nothing', () => {
  const hold = new LeaveHold();
  heldFor(hold, 1);
  assert.equal(heldFor(hold, 3, true, false), 0);
  assert.equal([hold.held, hold.shown].join(), '0,false');
});

test('refused (fallen), it says why while held and fills nothing', () => {
  const hold = new LeaveHold();
  assert.equal(heldFor(hold, 3, true, true, 'fallen'), 0);
  assert.equal(hold.held, 0);
  assert.ok(hold.shown, 'the refusal is said');
  heldFor(hold, STEP, false, true, 'fallen');
  assert.ok(!hold.shown, 'let go, it says nothing');
});

test('the leave is offered on foot only with nothing over the play', () => {
  const clear = { paused: false, sheet: false, map: false, chat: false, speaking: false };
  assert.equal(leaveOffered(clear), true);
  for (const over of ['paused', 'sheet', 'map', 'chat', 'speaking'] as const)
    assert.equal(leaveOffered({ ...clear, [over]: true }), false, over);
});

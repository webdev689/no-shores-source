import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_S } from './binds.ts';
import { CHORD_S, DEADZONE, PadCapture, PadReader, type PadState, type Waits, padInputs, padOf } from './pad.ts';

/** A standard pad with `down` pressed (a trigger by its pull), its sticks at `axes`. */
function pad(down: Readonly<Record<number, number>> = {}, axes: readonly number[] = [0, 0, 0, 0]): PadState {
  const buttons = Array.from({ length: 17 }, (unused, place) => {
    const value = down[place] ?? 0;
    return { pressed: value > 0.5, value };
  });
  return { mapping: 'standard', buttons, axes };
}
const [BUTTON_A, BUTTON_B, BUMPER_L, BUMPER_R, TRIGGER_L, TRIGGER_R] = [0, 1, 4, 5, 6, 7];
const NONE: Waits = { holds: new Set(), chords: [] };
const DESTINY: Waits = { holds: new Set(['B']), chords: [['LB', 'RB']] };

/** A reader stepped through `frames`, each a pad and the seconds it lasts; what each step heard. */
function stepped(frames: readonly (readonly [PadState, number])[], waits = DESTINY, reader = new PadReader()) {
  return frames.map(([state, seconds]) => reader.step(padInputs(state), seconds, waits));
}
const names = (set: ReadonlySet<string>) => [...set].sort();

test('a stick at rest inside its dead zone leans nowhere, and leant whole reaches 1; a trigger is how far it is pulled', () => {
  assert.equal(padInputs(pad({}, [DEADZONE * 0.9, 0, 0, 0])).size, 0);
  const leant = padInputs(pad({ [TRIGGER_R]: 0.4 }, [0, -1, 0.6, 0]));
  assert.equal(leant.get('LS up'), 1);
  assert.ok(Math.abs((leant.get('RS right') ?? 0) - (0.6 - DEADZONE) / (1 - DEADZONE)) < 1e-9);
  assert.equal(leant.get('RT'), 0.4);
  const odd = { ...pad({ [BUTTON_A]: 1 }), mapping: '' };
  assert.equal(padOf([null, odd, pad()])?.mapping, 'standard', 'the standard pad first');
  assert.equal(padOf([null, odd]), odd);
});

test('a button with no hold or partner bound acts as it goes down, and lets go as it comes up', () => {
  const [down, held, up] = stepped([
    [pad({ [BUTTON_A]: 1 }), 0.016],
    [pad({ [BUTTON_A]: 1 }), 0.016],
    [pad(), 0.016],
  ]);
  assert.deepEqual([names(down?.pressed ?? new Set()), names(down?.down ?? new Set())], [['A'], ['A']]);
  assert.deepEqual([names(held?.pressed ?? new Set()), names(held?.down ?? new Set())], [[], ['A']]);
  assert.deepEqual(names(up?.released ?? new Set()), ['A']);
});

test("B tapped is B, pressed and let go together as it comes up; B held past its hold is B's hold", () => {
  const tap = stepped([
    [pad({ [BUTTON_B]: 1 }), 0.016],
    [pad({ [BUTTON_B]: 1 }), 0.1],
    [pad(), 0.016],
  ]);
  assert.deepEqual(names(tap[0]?.pressed ?? new Set()), [], 'waits to be told');
  assert.deepEqual([names(tap[2]?.pressed ?? new Set()), names(tap[2]?.released ?? new Set())], [['B'], ['B']]);
  const hold = stepped([
    [pad({ [BUTTON_B]: 1 }), 0.016],
    [pad({ [BUTTON_B]: 1 }), HOLD_S],
    [pad({ [BUTTON_B]: 1 }), 0.016],
    [pad(), 0.016],
  ]);
  assert.deepEqual(names(hold[1]?.pressed ?? new Set()), ['B hold']);
  assert.deepEqual(names(hold[2]?.down ?? new Set()), ['B hold']);
  assert.deepEqual([names(hold[3]?.released ?? new Set()), names(hold[3]?.pressed ?? new Set())], [['B hold'], []]);
});

test('LB and RB pressed together are the two together, and neither alone; LB alone acts once its moment passes', () => {
  const both = stepped([
    [pad({ [BUMPER_L]: 1 }), 0.016],
    [pad({ [BUMPER_L]: 1, [BUMPER_R]: 1 }), CHORD_S / 2],
    [pad({ [BUMPER_L]: 1, [BUMPER_R]: 1 }), 0.5],
    [pad({ [BUMPER_R]: 1 }), 0.016],
    [pad(), 0.016],
  ]);
  assert.deepEqual(
    both.map((frame) => names(frame.pressed)),
    [[], ['LB+RB'], [], [], []],
  );
  assert.deepEqual(names(both[3]?.released ?? new Set()), ['LB+RB']);
  assert.deepEqual(names(both[4]?.released ?? new Set()), [], 'its other button acts as nothing');
  const alone = stepped([
    [pad({ [BUMPER_L]: 1 }), 0.016],
    [pad({ [BUMPER_L]: 1 }), CHORD_S],
    [pad({ [BUMPER_L]: 1, [BUMPER_R]: 1 }), 0.016],
  ]);
  assert.deepEqual(names(alone[1]?.pressed ?? new Set()), ['LB']);
  assert.deepEqual(names(alone[2]?.down ?? new Set()), ['LB'], 'RB still waits for its own moment');
});

test('triggers press past their threshold, and the sticks press their ways past half a lean', () => {
  const [light, pulled] = stepped(
    [
      [pad({ [TRIGGER_L]: 0.1 }, [0, 0.3, 0, 0]), 0.016],
      [pad({ [TRIGGER_L]: 0.8 }, [0, 0.9, 0, 0]), 0.016],
    ],
    NONE,
  );
  assert.deepEqual(names(light?.down ?? new Set()), []);
  assert.ok((light?.amount('LS down') ?? 0) > 0, 'a stick leant a little still moves a little');
  assert.deepEqual(names(pulled?.pressed ?? new Set()), ['LS down', 'LT']);
  assert.equal(pulled?.amount('LT'), 0.8);
});

test('a button held as a window opens or closes is stale until let go, and what it acted as is let go now', () => {
  const reader = new PadReader();
  stepped([[pad({ [BUTTON_A]: 1 }), 0.016]], NONE, reader);
  assert.deepEqual(names(reader.staleNow()), ['A']);
  const [still, up, again] = stepped(
    [
      [pad({ [BUTTON_A]: 1 }), 0.016],
      [pad(), 0.016],
      [pad({ [BUTTON_A]: 1 }), 0.016],
    ],
    NONE,
    reader,
  );
  assert.deepEqual([names(still?.down ?? new Set()), names(up?.released ?? new Set())], [[], []]);
  assert.deepEqual(names(again?.pressed ?? new Set()), ['A']);
});

test('a key being bound takes a button tapped, held, or pressed with another, never one down as it began', () => {
  const tapped = new PadCapture(new Set(['A']));
  assert.equal(tapped.step(new Set(['A']), 0.016), null, 'A was down as it began');
  assert.equal(tapped.step(new Set(), 0.016), null);
  assert.equal(tapped.step(new Set(['B']), 0.016), null);
  assert.equal(tapped.step(new Set(), 0.016), 'B');
  const held = new PadCapture(new Set());
  held.step(new Set(['Y']), 0.016);
  assert.equal(held.step(new Set(['Y']), HOLD_S), 'Y hold');
  const both = new PadCapture(new Set());
  both.step(new Set(['RB']), 0.016);
  assert.equal(both.step(new Set(['RB', 'LB']), 0.016), 'LB+RB');
  const late = new PadCapture(new Set());
  late.step(new Set(['RB']), 0.016);
  late.step(new Set(['RB']), CHORD_S);
  assert.equal(late.step(new Set(['RB', 'LB']), 0.016), null, 'a second button past the moment play joins two');
  assert.equal(late.step(new Set(['LB']), 0.016), 'RB');
});

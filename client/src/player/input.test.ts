import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_S } from './binds.ts';
import { BINDS, Input, type InputFrame, axis } from './input.ts';
import type { PadState } from './pad.ts';

/** A page with one standard pad whose buttons `held` are down (a trigger by its pull) and sticks at `axes`, read
 *  through a stubbed Gamepad API, and a clock the test moves; its key listeners kept to press keys with. */
function padPage() {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, (event: unknown) => void>();
  const pad = { held: {} as Record<number, number>, axes: [0, 0, 0, 0] };
  let clock = 0;
  const state = (): PadState => ({
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (unused, place) => {
      const value = pad.held[place] ?? 0;
      return { pressed: value > 0.5, value };
    }),
    axes: pad.axes,
  });
  Object.assign(page, {
    addEventListener: (kind: string, run: (event: unknown) => void) => listeners.set(kind, run),
    document: { pointerLockElement: null },
  });
  Object.defineProperty(navigator, 'getGamepads', { value: () => [null, state()], configurable: true });
  const now = performance.now;
  performance.now = () => clock;
  const canvas = { addEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const input = new Input(canvas);
  /** A frame `seconds` after the last, with the pad as it is set. */
  const frame = (seconds = 1 / 60): InputFrame => {
    clock += seconds * 1000;
    return input.frame();
  };
  const key = (name: string) => listeners.get('keydown')?.({ key: name, code: '', preventDefault: () => undefined });
  const done = () => {
    input.context = 'foot';
    performance.now = now;
    delete page['addEventListener'];
    delete page['document'];
    BINDS.device = 'keys';
  };
  return { input, pad, frame, key, done };
}
const [BUTTON_A, BUTTON_B, BUMPER_L, BUMPER_R, TRIGGER_L, TRIGGER_R, START, STICK_CLICK] = [0, 1, 4, 5, 6, 7, 9, 10];

test('RT swings and LT guards a melee weapon; a ranged one turns them round, RT firing and LT aiming', () => {
  const { pad, frame, done } = padPage();
  pad.held = { [TRIGGER_R]: 1 };
  assert.ok(frame().held('swing'));
  BINDS.ranged = true;
  const ranged = frame();
  assert.ok(ranged.held('guard') && !ranged.held('swing'), 'RT fires, as the left button does');
  pad.held = { [TRIGGER_L]: 0.6 };
  assert.ok(frame().held('swing'), 'LT aims, as the right button does');
  BINDS.ranged = false;
  done();
});

test('the left stick walks as far as it leans, and its click runs until the stick comes to rest', () => {
  const { pad, frame, done } = padPage();
  pad.axes = [0, -0.6, 0, 0];
  const half = frame();
  assert.ok(axis(half, 'back', 'forward') > 0.4 && axis(half, 'back', 'forward') < 0.6, 'part of the pace');
  pad.axes = [1, 0, 0, 0];
  assert.ok(axis(frame(), 'left', 'right') > 0.99);
  pad.held = { [STICK_CLICK]: 1 };
  assert.ok(frame().held('run'));
  pad.held = {};
  assert.ok(frame().held('run'), 'still running with the stick leant');
  pad.axes = [0, 0, 0, 0];
  assert.ok(!frame().held('run'));
  done();
});

test('the right stick turns and looks as far as it leans', () => {
  const { pad, frame, done } = padPage();
  pad.axes = [0, 0, -1, 0.5];
  const looked = frame();
  assert.ok(axis(looked, 'turnLeft', 'turnRight') < -0.99);
  assert.ok(axis(looked, 'lookUp', 'lookDown') > 0.3);
  done();
});

test('B tapped dodges as it comes up, B held crouches, and LB with RB casts the Anima, neither Tenet', () => {
  const { pad, frame, done } = padPage();
  pad.held = { [BUTTON_B]: 1 };
  assert.ok(!frame().pressed('dodge'));
  pad.held = {};
  const tapped = frame();
  assert.ok(tapped.pressed('dodge') && !tapped.pressed('crouch'));
  pad.held = { [BUTTON_B]: 1 };
  frame();
  frame(HOLD_S / 2);
  const held = frame(HOLD_S / 2);
  assert.ok(held.pressed('crouch') && !held.pressed('dodge'));
  pad.held = {};
  assert.ok(!frame().pressed('dodge'), 'let go after its hold, no dodge');
  pad.held = { [BUMPER_L]: 1, [BUMPER_R]: 1 };
  const both = frame();
  assert.ok(both.pressed('anima') && !both.pressed('tenetOne') && !both.pressed('tenetTwo'));
  done();
});

test('a button held as a window opens or closes acts on nothing until let go; Start is heard in a window', () => {
  const { input, pad, frame, done } = padPage();
  const heard: string[][] = [];
  input.onPad((pressed) => heard.push([...pressed]));
  pad.held = { [BUTTON_A]: 1 };
  assert.ok(frame().pressed('jump'));
  input.window('menu');
  assert.ok(!frame().held('jump'), 'the window has the pad');
  input.window(null);
  assert.ok(!frame().held('jump'), 'the A that closed it is stale');
  pad.held = {};
  frame();
  pad.held = { [BUTTON_A]: 1 };
  assert.ok(frame().pressed('jump'));
  input.window('menu');
  pad.held = {};
  frame();
  pad.held = { [START]: 1 };
  frame();
  assert.deepEqual(heard.at(-1), ['character']);
  const before = heard.length;
  pad.held = { [BUTTON_B]: 1 };
  frame();
  input.window('sheet');
  input.window('menu');
  pad.held = {};
  frame();
  assert.equal(heard.length, before, 'the B that closed the sheet over the menu does not step out of the menu too');
  done();
});

test('the pad pressed makes it the one shown, and a key the keyboard', () => {
  const { pad, frame, key, done } = padPage();
  BINDS.device = 'keys';
  pad.held = { [BUTTON_A]: 1 };
  frame();
  assert.equal(BINDS.device, 'pad');
  key('w');
  assert.equal(BINDS.device, 'keys');
  done();
});

test('B waits for its hold only where a hold of it is bound: in a sea fight it braces as it goes down, held', () => {
  const { input, pad, frame, done } = padPage();
  input.context = 'fight';
  pad.held = { [BUTTON_B]: 1 };
  assert.ok(frame().pressed('brace'), 'no crouch at sea to wait for');
  frame(HOLD_S);
  assert.ok(input.padAlone.held('brace'), 'held past the hold, still the brace');
  pad.held = {};
  assert.ok(frame().released('brace'));
  input.context = 'foot';
  pad.held = { [BUTTON_B]: 1 };
  assert.ok(!frame().pressed('dodge'), 'on foot B waits, to be told from its hold');
  done();
});

test('what the pad held is let go as a window takes it, a stick come to rest under the window too', () => {
  const { input, pad, frame, done } = padPage();
  input.context = 'fight';
  pad.axes = [-1, 0, 0, 0];
  pad.held = { [BUTTON_B]: 1 };
  const steering = frame();
  assert.ok(steering.held('fightLeft') && steering.held('brace'));
  input.window('sheet');
  const opened = frame();
  assert.ok(opened.released('brace') && input.padAlone.released('brace'), 'the brace the sheet took is let go');
  assert.ok(!opened.held('fightLeft'), 'the window has the pad');
  pad.axes = [0, 0, 0, 0];
  assert.ok(frame().released('fightLeft'), 'the stick let go under the sheet');
  assert.ok(input.padAlone.released('fightLeft'));
  done();
});

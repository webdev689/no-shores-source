import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import type { Landmass } from '../landmass.ts';
import type { Tick } from './beat.ts';
import { beginPrompt, Intro, type TitleGate } from './intro.ts';
import { takeHandPrompt } from './shore.ts';
import type { Sailing } from './sailing.ts';
import { Stage, type StageParts } from './stage.ts';

/** Saltmere as far as the intro's shots look at it: open sea round a square of outline. */
const SALTMERE = {
  id: 'continent-1',
  view: 'continent-1',
  heightAt: () => -40,
  outline: [
    [0, 0],
    [2000, 0],
    [2000, 2000],
    [0, 2000],
  ],
  plan: null,
  nodes: [],
} as unknown as Landmass;

const tick = (seconds: number): Tick => ({
  seconds,
  clock: 0,
  controls: {} as InputFrame,
  size: { width: 960, height: 540 },
  viewport: { width: 960, height: 540 },
});

const PROMPT = 'Press any key to begin';

/** The intro over a stage of the test's own, writing down what it lays over the view and where its camera stands. */
function intro(gate: TitleGate | null = null) {
  Object.assign(globalThis, { window: globalThis });
  const shown: string[] = [];
  const quiet = () => undefined;
  const stage = new Stage({
    screen: {
      fade: (opacity: number, _seconds: number, colour = 'black') => shown.push(`${colour} ${opacity}`),
      showTitle: (shownNow: boolean) => shown.push(shownNow ? 'title' : 'no title'),
      showPrompt: (text: string | null) => shown.push(text ?? 'no prompt'),
    },
    ambience: { set: quiet, whoosh: quiet },
    birds: { clear: quiet, flock: quiet },
    keepClose: quiet,
    landmass: () => SALTMERE,
    scene: { groundAt: () => 0, land: null, sky: { told: null } },
    roster: [],
  } as unknown as StageParts);
  const sailing = { frame: () => [] } as unknown as Sailing;
  const beat = new Intro(stage, sailing, gate);
  const heights: number[] = [];
  /** Plays `seconds` of the intro a quarter second a frame. */
  const play = (seconds: number) => {
    for (let played = 0; played < seconds; played += 0.25) heights.push(beat.frame(tick(0.25)).shot.eye[2]);
  };
  return { beat, shown, heights, play };
}

test('the intro goes from first light over the cloud, down through it, to Saltmere and its title in about 25 s', () => {
  const { beat, shown, heights, play } = intro();
  play(1);
  assert.ok(beat.skippable);
  assert.ok((heights[0] ?? 0) > 1100, 'it opens over the cloud');
  play(7);
  assert.ok(shown.includes('white 0.92'), 'it goes down through the cloud');
  assert.ok(!shown.includes('title'));
  play(18);
  assert.equal(shown.at(-1), PROMPT, 'the title rises, and the prompt breathes under it');
  assert.ok(shown.includes('title'));
  assert.ok((heights.at(-1) ?? 0) < 400, 'the title stands low over Saltmere');
  assert.equal(beat.skippable, false, 'at the title the skip would do nothing, so none is offered');
});

test('a skip goes straight to the title, the black coming down first', () => {
  const { beat, shown, play } = intro();
  play(2);
  beat.skip?.();
  assert.equal(beat.skippable, false, 'a skip under way is not offered again');
  play(0.25);
  assert.ok(!shown.includes('title'), 'the title waits for the black');
  play(0.5);
  assert.deepEqual(shown.slice(-3), ['white 0', 'black 0', 'title'], 'the black lifts on the title');
});

test('at the title any key begins, Space with the rest', () => {
  const { beat, play } = intro();
  play(1);
  beat.skip?.();
  play(3);
  assert.equal(beat.done, false);
  beat.key?.(' ', true);
  assert.ok(beat.done);
});

test('once the story begins its prompt goes, and the title drawn after does not bring it back', () => {
  for (const begin of [(beat: Intro) => beat.key?.('a', true), (beat: Intro) => beat.press()]) {
    const { beat, shown, play } = intro();
    play(1);
    beat.skip?.();
    play(3);
    assert.equal(shown.at(-1), PROMPT);
    begin(beat);
    // The prologue draws the beat once more before it moves on to the next.
    play(0.25);
    const prompts = shown.filter((text) => text === PROMPT || text === 'no prompt');
    assert.equal(prompts.at(-1), 'no prompt');
  }
});

test('played by touch, the title asks for a tap', () => {
  Object.assign(globalThis, { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }) });
  try {
    const { beat, shown, play } = intro();
    play(1);
    beat.skip?.();
    play(3);
    assert.ok(shown.includes('Tap to begin'));
    assert.ok(!shown.includes(PROMPT));
  } finally {
    Object.assign(globalThis, { matchMedia: undefined });
  }
});

test('the story asks for a press by what the player plays with: on the pad, its jump’s button', () => {
  assert.deepEqual(
    [beginPrompt(true), beginPrompt(false, false), beginPrompt(false, true)],
    ['Tap to begin', 'Press any key to begin', 'Press A to begin'],
  );
  assert.equal(takeHandPrompt(false, true), 'Press A to take her hand');
  assert.equal(takeHandPrompt(false, false), 'Click or press any key to take her hand');
});

test('with accounts, beginning opens the character screen; the intro ends once it answers, or the title comes back', async () => {
  const answers: ((answer: 'story' | 'onward' | 'title') => void)[] = [];
  const gate: TitleGate = { straight: false, open: () => new Promise((answer) => answers.push(answer)) };
  const { beat, shown, play } = intro(gate);
  play(1);
  beat.skip?.();
  play(3);
  beat.key?.('enter', true);
  assert.equal(answers.length, 1, 'the screen opened');
  assert.equal(beat.done, false, 'the intro waits on it, its scene behind');
  answers[0]?.('title');
  await Promise.resolve();
  assert.equal(shown.at(-1), 'title', 'the title rises again');
  play(3);
  assert.equal(shown.at(-1), PROMPT, 'and its prompt after it');
  beat.press();
  answers[1]?.('onward');
  await Promise.resolve();
  assert.ok(beat.done);
  assert.equal(beat.onward, true, 'past the story');
});

test('marked by the tab, the screen opens at once, and the title never rises behind it', () => {
  let opened = 0;
  const gate: TitleGate = { straight: true, open: () => (opened++, new Promise(() => undefined)) };
  const { beat, shown, play } = intro(gate);
  assert.equal(opened, 1);
  play(30);
  assert.ok(!shown.includes('title'), 'the scene alone behind the screen');
  assert.ok(!shown.includes(PROMPT));
  assert.equal(beat.done, false);
});

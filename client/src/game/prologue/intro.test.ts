import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import type { Landmass } from '../landmass.ts';
import type { Tick } from './beat.ts';
import { Intro } from './intro.ts';
import { Islands, type IslandParts } from './islands.ts';
import type { Sailing } from './sailing.ts';
import { Stage, type StageParts } from './stage.ts';

/** A landmass of open sea round a square of outline, as far as the intro's shots look at it. */
const land = (id: string) =>
  ({
    id,
    view: id,
    heightAt: () => -40,
    outline: [
      [0, 0],
      [2000, 0],
      [2000, 2000],
      [0, 2000],
    ],
    plan: null,
    nodes: [],
  }) as unknown as Landmass;

const tick = (seconds: number): Tick => ({
  seconds,
  clock: 0,
  controls: {} as InputFrame,
  size: { width: 960, height: 540 },
  viewport: { width: 960, height: 540 },
});

/** The intro over a stage and a worker of the test's own: each continent opens (or fails) when the test says. */
function intro() {
  Object.assign(globalThis, { window: globalThis });
  const opened: string[] = [];
  const answers = new Map<string, { answer: () => void; fail: () => void }>();
  const shown: string[] = [];
  const islands = new Islands({
    open: (id: string) => {
      opened.push(id);
      return new Promise<Landmass>((resolve, reject) =>
        answers.set(id, { answer: () => resolve(land(id)), fail: () => reject(new Error(`${id} would not open`)) }),
      );
    },
    scene: { setLand: () => undefined },
    drawersOn: () => ({ release: () => undefined }),
    terrainFor: () => undefined,
    home: { landmass: land('continent-1'), drawers: { release: () => undefined } },
  } as unknown as IslandParts);
  const quiet = () => undefined;
  const stage = new Stage({
    screen: {
      fade: (opacity: number, _seconds: number, colour = 'black') => shown.push(`${colour} ${opacity}`),
      showTitle: (shownNow: boolean) => shown.push(shownNow ? 'title' : 'no title'),
      showPrompt: (text: string | null) => text && shown.push(text),
    },
    ambience: { set: quiet, whoosh: quiet },
    birds: { clear: quiet, flock: quiet },
    keepClose: quiet,
    scene: { groundAt: () => 0, land: null },
    roster: [],
  } as unknown as StageParts);
  const sailing = { frame: () => [] } as unknown as Sailing;
  const beat = new Intro(stage, islands, sailing);
  const settle = async () => {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  };
  /** Plays `seconds` of the intro, its timers with it. */
  const play = async (seconds: number) => {
    for (let played = 0; played < seconds; played += 0.25) {
      beat.frame(tick(0.25));
      mock.timers.tick(250);
      await settle();
    }
  };
  const answer = async (id: string, fails = false) => {
    await settle();
    const told = answers.get(id);
    assert.ok(told, `${id} was asked for`);
    if (fails) told.fail();
    else told.answer();
    await settle();
  };
  return { beat, islands, opened, shown, play, answer, settle };
}

test('a skip is final: no island opens after it, the worker ends on Saltmere and the title shows over it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { beat, islands, opened, shown, play, answer } = intro();
    await answer('continent-2');
    await play(7);
    assert.ok(beat.skippable);
    beat.skip?.();
    assert.equal(beat.skippable, false, 'a skip under way is not offered again');
    await play(20);
    assert.deepEqual(opened, ['continent-2', 'continent-1'], 'nothing opens after the skip but Saltmere');
    await answer('continent-1');
    await play(1);
    assert.equal(islands.landmass.id, 'continent-1');
    assert.equal(shown.at(-1), 'title');
    assert.equal(beat.skippable, false, 'at the title the skip would do nothing, so none is offered');
  } finally {
    mock.timers.reset();
  }
});

test('an island that will not open is passed over to the next, and the white lifts on it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { opened, shown, play, answer } = intro();
    const logged = console.error;
    console.error = () => undefined;
    try {
      await answer('continent-2');
      await play(6 + 13.5);
      await answer('continent-6', true);
    } finally {
      console.error = logged;
    }
    assert.deepEqual(opened, ['continent-2', 'continent-6', 'continent-4']);
    shown.length = 0;
    await answer('continent-4');
    await play(3);
    assert.ok(shown.includes('white 0'), 'the white lifts on the next island');
  } finally {
    mock.timers.reset();
  }
});

test('a first island that will not open still fades in, and the flight goes on to the next', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { opened, shown, play, answer } = intro();
    const logged = console.error;
    console.error = () => undefined;
    try {
      await answer('continent-2', true);
    } finally {
      console.error = logged;
    }
    assert.ok(shown.includes('black 0'), 'the dawn fades in');
    await play(6.5);
    assert.deepEqual(opened, ['continent-2', 'continent-6']);
  } finally {
    mock.timers.reset();
  }
});

test('a Saltmere that will not open after a skip is thrown from the frame, so the story goes on', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { beat, play, answer } = intro();
    await answer('continent-2');
    await play(7);
    beat.skip?.();
    await answer('continent-1', true);
    assert.throws(() => beat.frame(tick(0.1)), /continent-1 would not open/);
  } finally {
    mock.timers.reset();
  }
});

test('at the title any key begins, Space with the rest', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { beat, play, answer } = intro();
    await answer('continent-2');
    await play(1);
    beat.skip?.();
    await answer('continent-1');
    await play(3);
    assert.equal(beat.done, false);
    beat.key?.(' ', true);
    assert.ok(beat.done);
  } finally {
    mock.timers.reset();
  }
});

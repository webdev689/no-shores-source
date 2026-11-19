import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import type { Beat, BeatName } from './beat.ts';
import type { Islands } from './islands.ts';
import type { Nameplate } from './nameplate.ts';
import { Prologue } from './prologue.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import type { WreckContext } from './wreckRun.ts';

const SHOT = { eye: [0, 0, 10], yaw: 0, pitch: 0, fov: 0.9, near: 0.3, far: 1000 } as const;
const SIZE = { width: 960, height: 540 };

/** A beat of the test's own: it shows a shot, and may fail or end when told. */
class Played implements Beat {
  readonly name: BeatName;
  readonly skippable: boolean;
  done = false;
  failing: Error | null = null;
  skipped = false;
  left = false;

  constructor(name: BeatName, skippable = false) {
    this.name = name;
    this.skippable = skippable;
  }

  frame(): StoryFrame {
    if (this.failing) throw this.failing;
    return { shot: SHOT };
  }

  skip(): void {
    this.skipped = true;
    this.done = true;
  }

  leave(): void {
    this.left = true;
  }
}

/** The director over a stage that writes down what it is asked, its beats the test's own. */
function directed(made: Map<BeatName, Played>, from: BeatName) {
  const asked: string[] = [];
  const stage = {
    step: () => asked.push('step'),
    hush: () => asked.push('hush'),
    draw: () => asked.push('draw'),
    parts: { screen: { showSkip: () => undefined, clear: () => asked.push('clear') } },
  };
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined } });
  class Directed extends Prologue {
    protected override make(name: BeatName): Beat {
      const beat = made.get(name) ?? new Played(name);
      made.set(name, beat);
      return beat;
    }
  }
  const story = { stage } as unknown as Story;
  const director = new Directed(story, {} as Islands, {} as Nameplate, {} as WreckContext, from);
  return { director, asked };
}

const controls = (holding: boolean) => ({ held: (action: string) => holding && action === 'jump' }) as InputFrame;

test('a beat that fails is left behind: what was said is hushed, the view cleared, and the next beat begins', () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'battle');
  const battle = made.get('battle');
  assert.ok(battle);
  battle.failing = new Error('the fight could not begin');
  const logged = console.error;
  console.error = () => undefined;
  try {
    director.frame(controls(false), 0.1, SIZE, SIZE);
  } finally {
    console.error = logged;
  }
  assert.ok(battle.left, 'the failed beat lets go of what it holds');
  assert.ok(asked.includes('hush') && asked.includes('clear'));
  assert.equal(director.now.name, 'calm');
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.ok(asked.includes('draw'), 'the next beat is drawn');
});

test('every frame steps the stage, drawn or not, so the sea and the storm keep sounding', () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'calm');
  for (let frame = 0; frame < 3; frame++) director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.equal(asked.filter((what) => what === 'step').length, 3);
});

test('a cutscene held through a second of Space is skipped, and nothing more of it is said', () => {
  const made = new Map<BeatName, Played>([['ram', new Played('ram', true)]]);
  const { director, asked } = directed(made, 'ram');
  for (let frame = 0; frame < 11; frame++) director.frame(controls(true), 0.1, SIZE, SIZE);
  assert.ok(made.get('ram')?.skipped);
  assert.ok(asked.includes('hush'));
  assert.equal(director.now.name, 'wake');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import type { Beat, BeatName } from './beat.ts';
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
  still = false;
  /** The seconds each frame handed the beat. */
  readonly heard: number[] = [];

  constructor(name: BeatName, skippable = false) {
    this.name = name;
    this.skippable = skippable;
  }

  frame(tick: { readonly seconds: number }): StoryFrame {
    this.heard.push(tick.seconds);
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

/** A beat of the test's own that asks the music for the storm. */
class Sounded extends Played {
  music(): Hearing {
    return { ...STILL, story: { kind: 'song', song: 'storm', mood: 'tension' } };
  }
}
const STILL: Hearing = {
  place: { kind: 'sea' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: null,
  sky: null,
};

/** The director over a stage that writes down what it is asked, its beats the test's own. */
function directed(made: Map<BeatName, Played>, from: BeatName) {
  const asked: string[] = [];
  const heard: Hearing[] = [];
  const stage = {
    step: (seconds: number) => asked.push(`step ${seconds}`),
    hush: () => asked.push('hush'),
    draw: (shown: unknown, size: unknown, clock: number, seconds: number) => asked.push(`draw ${seconds}`),
    parts: {
      screen: { showSkip: (share: number | null) => asked.push(`skip ${share}`), clear: () => asked.push('clear') },
      music: { frame: (hearing: Hearing) => heard.push(hearing) },
    },
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
  const director = new Directed(story, {} as Nameplate, {} as WreckContext, from);
  return { director, asked, heard };
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
  assert.ok(asked.includes('draw 0.1'), 'the next beat is drawn');
});

test('every frame steps the stage, drawn or not, so the sea and the storm keep sounding', () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'calm');
  for (let frame = 0; frame < 3; frame++) director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.equal(asked.filter((what) => what === 'step 0.1').length, 3);
});

test("a beat holding its world still holds the story's time, though its own frame still hears the seconds", () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'wreck');
  const wreck = made.get('wreck');
  assert.ok(wreck);
  wreck.still = true;
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.deepEqual(
    asked.filter((what) => what.startsWith('step') || what.startsWith('draw')),
    ['step 0', 'draw 0'],
  );
  assert.deepEqual(wreck.heard, [0.1]);
});

test('a cutscene held through a second of Space is skipped, and nothing more of it is said', () => {
  const made = new Map<BeatName, Played>([['ram', new Played('ram', true)]]);
  const { director, asked } = directed(made, 'ram');
  for (let frame = 0; frame < 11; frame++) director.frame(controls(true), 0.1, SIZE, SIZE);
  assert.ok(made.get('ram')?.skipped);
  assert.ok(asked.includes('hush'));
  assert.equal(director.now.name, 'wake');
});

test('the skip hint shows, faint, wherever a cutscene can be skipped, and nowhere else', () => {
  const made = new Map<BeatName, Played>([['ram', new Played('ram', true)]]);
  const { director, asked } = directed(made, 'ram');
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.ok(asked.includes('skip 0'), 'faint before it is held');
  made.set('wake', new Played('wake'));
  for (let frame = 0; frame < 11; frame++) director.frame(controls(true), 0.1, SIZE, SIZE);
  asked.length = 0;
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.deepEqual(
    asked.filter((what) => what.startsWith('skip')),
    ['skip null'],
  );
});

test('a touch held on the screen for a second skips a cutscene, as Space does', () => {
  const made = new Map<BeatName, Played>([['ram', new Played('ram', true)]]);
  const { director } = directed(made, 'ram');
  director.touch(true);
  for (let frame = 0; frame < 11; frame++) director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.ok(made.get('ram')?.skipped);
});

test('a throw anywhere in a frame, not only in the beat, moves the story on, and the page keeps going', () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'calm');
  const story = (director as unknown as { story: { stage: { draw: () => void } } }).story;
  story.stage.draw = () => {
    throw new Error('the GPU refused the frame');
  };
  const logged = console.error;
  console.error = () => undefined;
  try {
    director.frame(controls(false), 0.1, SIZE, SIZE);
  } finally {
    console.error = logged;
  }
  assert.equal(director.now.name, 'ram');
  assert.ok(asked.includes('hush'));
});

test('a beat that cannot even be made is passed over for the one after it', () => {
  const made = new Map<BeatName, Played>();
  const asked: string[] = [];
  const stage = {
    step: () => undefined,
    hush: () => asked.push('hush'),
    draw: () => undefined,
    parts: { screen: { showSkip: () => undefined, clear: () => undefined }, music: { frame: () => undefined } },
  };
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined } });
  class Unmade extends Prologue {
    protected override make(name: BeatName): Beat {
      if (name === 'wake') throw new Error('no wreck to wake in');
      const beat = made.get(name) ?? new Played(name);
      made.set(name, beat);
      return beat;
    }
  }
  const director = new Unmade({ stage } as unknown as Story, {} as Nameplate, {} as WreckContext, 'ram');
  const ram = made.get('ram');
  assert.ok(ram);
  ram.done = true;
  const logged = console.error;
  console.error = () => undefined;
  try {
    director.frame(controls(false), 0.1, SIZE, SIZE);
  } finally {
    console.error = logged;
  }
  assert.equal(director.now.name, 'wreck');
});

test('a hold on Space begun on a cutscene that ends by itself does not carry over to skip the next', () => {
  const made = new Map<BeatName, Played>([
    ['ram', new Played('ram', true)],
    ['wake', new Played('wake', true)],
  ]);
  const { director } = directed(made, 'ram');
  for (let frame = 0; frame < 8; frame++) director.frame(controls(true), 0.1, SIZE, SIZE);
  const ram = made.get('ram');
  assert.ok(ram && !ram.skipped, 'eight tenths held is not yet a skip');
  ram.done = true;
  director.frame(controls(true), 0.1, SIZE, SIZE);
  assert.equal(director.now.name, 'wake');
  for (let frame = 0; frame < 3; frame++) director.frame(controls(true), 0.1, SIZE, SIZE);
  assert.equal(made.get('wake')?.skipped, false, 'three tenths more is not a skip of the next cutscene');
});

test("a last beat that fails keeps the story's screen, so its black lifts only once the game's veil is up", () => {
  const made = new Map<BeatName, Played>();
  const { director, asked } = directed(made, 'shore');
  const shore = made.get('shore');
  assert.ok(shore);
  shore.failing = new Error('the shore could not go on');
  const logged = console.error;
  console.error = () => undefined;
  try {
    director.frame(controls(false), 0.1, SIZE, SIZE);
  } finally {
    console.error = logged;
  }
  assert.ok(director.end, 'the story ends');
  assert.ok(asked.includes('hush'));
  assert.ok(!asked.includes('clear'), 'the screen is left for the end of the story to lift');
});

test("each frame hands the game's music what the beat asks, and a beat that asks nothing lets it ring out", () => {
  const made = new Map<BeatName, Played>([['creation', new Sounded('creation')]]);
  const { director, heard } = directed(made, 'creation');
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.deepEqual(heard.at(-1)?.story, { kind: 'song', song: 'storm', mood: 'tension' });
  const creation = made.get('creation');
  assert.ok(creation);
  creation.done = true;
  director.frame(controls(false), 0.1, SIZE, SIZE);
  director.frame(controls(false), 0.1, SIZE, SIZE);
  assert.equal(director.now.name, 'sighted');
  assert.deepEqual(heard.at(-1)?.story, { kind: 'silence', cut: false });
});

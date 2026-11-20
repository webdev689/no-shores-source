import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/welcome.json' with { type: 'json' };
import type { Cards } from '../../player/cards.ts';
import { type Line, castOf, scenesOf } from '../../speech/cast.ts';
import type { Shot } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { awayFromCounters } from '../townsfolk.ts';
import type { NodeInfo } from '../worldData.ts';
import { AfterStory } from './afterStory.ts';
import { SOCIAL } from './plazaForTests.ts';
import { MET_SCENE, STOPS } from './walk.ts';
import { WELCOME_KEY, type WelcomeVoice } from './welcome.ts';

const CAST = castOf(cast);
const SCENES = scenesOf(scenes, CAST);
const VIEW = { width: 800, height: 600 };
const FORGE = { frames: () => 1, card: () => ({}) } as unknown as Cards;

/** A page's worth of the welcome's parts, every word and mark it shows written down. */
function page(played = false) {
  const kept = new Map<string, string>(played ? [[WELCOME_KEY, 'played']] : []);
  const said: Line[][] = [];
  const marks: string[] = [];
  const prompts: string[] = [];
  let removed = 0;
  const voice = (): WelcomeVoice => ({
    dialogue: {
      play: (lines) => (said.push([...lines]), Promise.resolve()),
      skip: () => undefined,
      frame: () => undefined,
      remove: () => void (removed += 1),
    },
    overheads: { emote: (head, kind) => void marks.push(`${head} ${kind}`), frame: () => undefined, remove: () => {} },
    objective: {
      show: (word, line) => void prompts.push(`${word} ${line}`),
      clear: () => void prompts.push('cleared'),
      remove: () => undefined,
    },
  });
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
  };
  const parts = { forge: FORGE, groundAt: () => 30, cast: CAST, scenes: SCENES, kept: storage };
  return {
    kept,
    said,
    marks,
    prompts,
    removed: () => removed,
    after: (asked = false) => new AfterStory(parts, voice, asked),
  };
}

/** A stranger's last moment that ends once `going` frames have passed, or on leaving once she stood anywhere. */
function stranger(going: number) {
  let frames = 0;
  const epilogue = {
    done: false,
    frame: () => ((frames += 1), (epilogue.done ||= frames >= going), []),
    leave: () => void (epilogue.done ||= frames > 0),
  };
  return epilogue as unknown as Epilogue;
}

const you = (x: number, y: number) => ({ x, y, z: 30, facing: Math.PI });
const shotAt = (x: number, y: number): Shot => ({
  eye: [x, y + 4, 32],
  yaw: 0,
  pitch: 0.2,
  fov: 1,
  near: 0.1,
  far: 900,
});

/** Frames the player standing at `at`, the scenes' promises let through after each. */
async function frames(
  after: AfterStory,
  count: number,
  standing: () => readonly [number, number],
  node: NodeInfo = SOCIAL,
) {
  let cards = 0;
  for (let frame = 0; frame < count; frame++) {
    const [x, y] = standing();
    cards = after.frame(shotAt(x, y), VIEW, 0.25, frame, you(x, y), false, node).length;
    await Promise.resolve();
  }
  return cards;
}

test('the welcome holds a scene for each stop, the last hers, every line by a speaker of the cast', () => {
  for (const scene of [MET_SCENE, ...STOPS.map((stop) => stop.scene)])
    assert.ok((SCENES[scene]?.length ?? 0) > 0, scene);
  assert.equal(SCENES.welcomeLamplighters?.at(-1)?.who, 'maren');
});

test('once the stranger has gone she comes, marked played, her counter empty; the player following hears every stop', async () => {
  const { kept, said, marks, prompts, removed, after } = page();
  const welcome = after();
  welcome.epilogue = stranger(3);
  assert.equal(await frames(welcome, 2, () => [1000, 2040]), 0, 'the stranger first');
  assert.equal(kept.get(WELCOME_KEY), undefined);
  assert.equal(await frames(welcome, 2, () => [1000, 2040]), 1, 'Elder Maren Hale comes');
  assert.equal(kept.get(WELCOME_KEY), 'played', 'kept once begun');
  assert.ok(awayFromCounters.has('lamplighters'), 'never two of her');
  // The player walks off and lags, then keeps by her.
  await frames(welcome, 4000, () => [1000, 2040]);
  assert.ok(prompts.includes('Follow Elder Maren Hale'), 'told to follow her');
  let drawn = 1;
  for (let frame = 0; frame < 40_000 && drawn > 0; frame += 100) {
    const near = welcome as unknown as { welcome: { walk: { maren: { x: number; y: number } } } | null };
    const maren = near.welcome?.walk.maren ?? { x: 0, y: 0 };
    drawn = await frames(welcome, 100, () => [maren.x, maren.y + 1.5]);
  }
  assert.deepEqual(
    said.map((lines) => lines[0]?.say),
    [MET_SCENE, ...STOPS.map((stop) => stop.scene)].map((scene) => SCENES[scene]?.[0]?.say),
  );
  assert.ok(marks.includes('mage alert') && marks.includes('veiled alert'), 'the keepers she names are marked');
  assert.equal(prompts.at(-1), 'cleared');
  assert.ok(!awayFromCounters.has('lamplighters'), 'her own figure is back behind her counter');
  assert.equal(removed(), 1);
});

test('it plays never twice, and not without the story; the development switch plays it at once', async () => {
  const played = page(true);
  const again = played.after();
  again.epilogue = stranger(1);
  assert.equal(await frames(again, 5, () => [1000, 2040]), 0, 'played before');
  assert.equal(await frames(page().after(), 5, () => [1000, 2040]), 0, 'no story played, or ?at=');
  const asked = played.after(true);
  assert.equal(await frames(asked, 1, () => [1000, 2040]), 1, '?welcome=1');
  asked.leave();
});

test('leaving before the stranger has gone forgoes it; leaving during it ends it where she is', async () => {
  const { after } = page();
  const forgone = after();
  forgone.epilogue = stranger(9);
  await frames(forgone, 2, () => [1000, 2040]);
  forgone.leave();
  assert.equal(await frames(forgone, 20, () => [1000, 2040]), 0);
  const left = page();
  const ended = left.after();
  ended.epilogue = stranger(1);
  ended.leave();
  assert.ok(ended.epilogue, 'before the player stood anywhere, the stranger waits for them');
  assert.equal(await frames(ended, 30, () => [1000, 2040]), 1);
  ended.leave();
  assert.ok(!awayFromCounters.has('lamplighters'));
  assert.equal(left.removed(), 1);
  assert.equal(await frames(ended, 5, () => [1000, 2040]), 0, 'and does not come back');
});

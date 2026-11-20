import assert from 'node:assert/strict';
import { test } from 'node:test';
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/welcome.json' with { type: 'json' };
import type { CardAt, Cards } from '../../player/cards.ts';
import { type Line, castOf, scenesOf } from '../../speech/cast.ts';
import type { Shot } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { awayFromCounters } from '../townsfolk.ts';
import { AfterStory } from './afterStory.ts';
import { SOCIAL } from './plazaForTests.ts';
import { MET_SCENE, STOPS } from './walk.ts';
import { WELCOME_KEY, WELCOME_SAID_KEY, type WelcomeVoice } from './welcome.ts';

const CAST = castOf(cast);
const SCENES = scenesOf(scenes, CAST);
const VIEW = { width: 800, height: 600 };
/** A forge whose card says how it was drawn. */
const FORGE = { frames: () => 1, card: (id: number, dress: unknown, anim: string) => ({ anim }) } as unknown as Cards;
const animOf = (cards: CardAt[]) => (cards[0]?.card as unknown as { anim: string } | undefined)?.anim;

/** A page's worth of the welcome's parts, every word and mark it shows written down. */
function page(played = false, kept = new Map<string, string>(played ? [[WELCOME_KEY, 'played']] : []), keeps = true) {
  const said: Line[][] = [];
  const marks: string[] = [];
  const prompts: string[] = [];
  const shownFor: number[] = [];
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
      show: (word, line, seconds) => void (prompts.push(`${word} ${line}`), shownFor.push(seconds ?? 6)),
      clear: () => void prompts.push('cleared'),
      remove: () => undefined,
    },
  });
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!keeps) throw new Error('this browser keeps nothing');
      kept.set(key, value);
    },
  };
  const parts = { forge: FORGE, groundAt: () => 30, cast: CAST, scenes: SCENES, kept: storage };
  return {
    kept,
    said,
    marks,
    prompts,
    shownFor,
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

/** Frames the player standing at `at` (`held` while a screen is open), the scenes' promises let through after each;
 *  the cards drawn at the last. */
async function framesDrawn(
  after: AfterStory,
  count: number,
  standing: () => readonly [number, number],
  held = false,
): Promise<CardAt[]> {
  let cards: CardAt[] = [];
  for (let frame = 0; frame < count; frame++) {
    const [x, y] = standing();
    cards = after.frame(shotAt(x, y), VIEW, 0.25, frame, you(x, y), false, SOCIAL, held);
    await Promise.resolve();
  }
  return cards;
}

/** How many cards are drawn at the last of `count` frames. */
const frames = async (after: AfterStory, count: number, standing: () => readonly [number, number], held = false) =>
  (await framesDrawn(after, count, standing, held)).length;

/** Follows her figure, as drawn, a step behind it, until she is drawn no more or `most` frames have gone. */
async function followHer(after: AfterStory, most: number) {
  let her = (await framesDrawn(after, 1, () => [1000, 2040]))[0];
  for (let frame = 0; frame < most && her; frame += 10) {
    const [x, y] = [her.x, her.y + 1.5];
    her = (await framesDrawn(after, 10, () => [x, y]))[0];
  }
}

test('the welcome holds a scene for each stop, the last hers, every line by a speaker of the cast', () => {
  for (const scene of [MET_SCENE, ...STOPS.map((stop) => stop.scene)])
    assert.ok((SCENES[scene]?.length ?? 0) > 0, scene);
  assert.equal(SCENES.welcomeLamplighters?.at(-1)?.who, 'maren');
});

test('once the stranger has gone she comes, her counter empty; the player following hears every stop, then it is played', async () => {
  const { kept, said, marks, prompts, removed, after } = page();
  const welcome = after();
  welcome.storyEnded(stranger(3));
  assert.equal(await frames(welcome, 2, () => [1000, 2040]), 0, 'the stranger first');
  assert.equal(kept.get(WELCOME_KEY), 'due', 'due from the story’s end');
  assert.equal(await frames(welcome, 2, () => [1000, 2040]), 1, 'Elder Maren Hale comes');
  assert.ok(awayFromCounters.has('lamplighters'), 'never two of her');
  // Met, the player stands where they are and lags behind her lead, then keeps by her.
  await frames(welcome, 100, () => [1000, 2040]);
  assert.equal(said.length, 1, 'met');
  assert.equal(kept.get(WELCOME_KEY), 'due', 'still due once begun');
  assert.equal(kept.get(WELCOME_SAID_KEY), MET_SCENE, 'with the scene said');
  await frames(welcome, 120, () => [1000, 2040]);
  assert.ok(prompts.includes('Follow Elder Maren Hale'), 'told to follow her');
  await followHer(welcome, 40_000);
  assert.deepEqual(
    said.map((lines) => lines[0]?.say).sort(),
    [MET_SCENE, ...STOPS.map((stop) => stop.scene)].map((scene) => SCENES[scene]?.[0]?.say).sort(),
  );
  assert.equal(kept.get(WELCOME_KEY), 'played', 'played once every stop is said');
  assert.ok(marks.includes('mage alert') && marks.includes('veiled alert'), 'the keepers she names are marked');
  assert.ok(!marks.includes('lamplighters alert'), 'at her own counter she speaks, unmarked over its place');
  assert.equal(prompts.at(-1), 'cleared');
  assert.ok(!awayFromCounters.has('lamplighters'), 'her own figure is back behind her counter');
  assert.equal(removed(), 1);
});

test('it plays never twice, and not without the story; the development switch plays it at once', async () => {
  const played = page(true);
  const again = played.after();
  again.storyEnded(stranger(1));
  assert.equal(await frames(again, 5, () => [1000, 2040]), 0, 'played before');
  assert.equal(await frames(page().after(), 5, () => [1000, 2040]), 0, 'no story played, or ?at=');
  const asked = played.after(true);
  assert.equal(await frames(asked, 1, () => [1000, 2040]), 1, '?welcome=1');
  asked.leave();
});

test('leaving before the stranger has gone forgoes it; leaving during it ends it where she is, still due', async () => {
  const { after } = page();
  const forgone = after();
  forgone.storyEnded(stranger(9));
  await frames(forgone, 2, () => [1000, 2040]);
  forgone.leave();
  assert.equal(await frames(forgone, 20, () => [1000, 2040]), 0);
  const left = page();
  const ended = left.after();
  ended.storyEnded(stranger(1));
  ended.leave();
  assert.equal(await frames(ended, 30, () => [1000, 2040]), 1, 'before the player stood anywhere, the stranger waits');
  ended.leave();
  assert.ok(!awayFromCounters.has('lamplighters'));
  assert.equal(left.removed(), 1);
  assert.equal(await frames(ended, 5, () => [1000, 2040]), 1, 'and comes back on the next arrival');
  ended.leave();
});

test('a reload before the welcome began, or during it, brings it on the next arrival from the stop it reached', async () => {
  const first = page();
  first.after().storyEnded(stranger(5));
  // The page is loaded again: the stranger's moment is gone, the browser's mark is not.
  const reloaded = page(false, first.kept);
  const welcome = reloaded.after();
  assert.equal(await frames(welcome, 2, () => [1000, 2040]), 1, 'she comes all the same');
  await frames(welcome, 100, () => [1000, 2040]);
  assert.equal(reloaded.said.length, 1, 'met');
  // Loaded again during the walk: she comes, greets no more, and leads on from where it was.
  const again = page(false, first.kept);
  const resumed = again.after();
  assert.equal(await frames(resumed, 2, () => [1000, 2040]), 1, 'she comes again');
  await followHer(resumed, 40_000);
  assert.ok(again.said.length > 0, 'the rest is said');
  assert.ok(!again.said.some((lines) => lines === SCENES[MET_SCENE] || lines[0]?.say === SCENES[MET_SCENE]?.[0]?.say));
  assert.equal(first.kept.get(WELCOME_KEY), 'played', 'and is due no more');
  assert.equal(await frames(page(false, first.kept).after(), 2, () => [1000, 2040]), 0, 'once only');
});

test('opening her counter while she walks ends the walk there, the welcome played', async () => {
  const { kept, removed, after } = page();
  const welcome = after();
  welcome.storyEnded(stranger(1));
  assert.equal(await frames(welcome, 3, () => [1000, 2040]), 1);
  welcome.counterOpened('mage');
  assert.equal(await frames(welcome, 1, () => [1000, 2040]), 1, 'another counter is no matter');
  welcome.counterOpened('lamplighters');
  assert.equal(await frames(welcome, 1, () => [1000, 2040]), 0, 'she is back behind her counter');
  assert.ok(!awayFromCounters.has('lamplighters'));
  assert.equal(kept.get(WELCOME_KEY), 'played');
  assert.equal(removed(), 1);
});

test('while a screen is open she holds still and starts no scene; the follow prompt comes back each time they lag', async () => {
  const { said, prompts, shownFor, after } = page();
  const welcome = after(true);
  const held = await framesDrawn(welcome, 40, () => [1000, 2040], true);
  assert.equal(held.length, 1, 'still drawn');
  assert.equal(said.length, 0, 'no scene begins behind the screen');
  const still = await framesDrawn(welcome, 40, () => [1000, 2040], true);
  const [her] = still;
  assert.deepEqual([her?.x, her?.y], [held[0]?.x, held[0]?.y], 'she stands where she was');
  assert.equal(animOf(still), 'idle', 'standing, not walking on the spot');
  // Met where she stands, the player lags behind her lead, catches up, and lags again.
  const met = her ? ([her.x, her.y + 1.5] as const) : ([0, 0] as const);
  await frames(welcome, 100, () => met);
  assert.equal(said.length, 1, 'met once the screen is gone');
  const lagged = prompts.filter((each) => each.startsWith('Follow')).length;
  await followHer(welcome, 200);
  await frames(welcome, 100, () => [1000, 2040]);
  assert.ok(prompts.filter((each) => each.startsWith('Follow')).length > lagged, 'told again');
  assert.ok(
    shownFor.every((seconds) => seconds === Infinity),
    'shown until they catch up, however long',
  );
  welcome.leave();
});

test('a browser that keeps nothing still plays the welcome once the stranger has gone', async () => {
  const welcome = page(false, new Map(), false).after();
  welcome.storyEnded(stranger(2));
  assert.equal(await frames(welcome, 4, () => [1000, 2040]), 1, 'Elder Maren Hale comes');
  welcome.leave();
});

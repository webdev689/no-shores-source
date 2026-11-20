import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import { type EmoteSink, FoeMoods, MOOD, type MoodEmote, moodEmote } from './foeMoods.ts';

/** How long the kept sink's emotes show, in seconds. */
const LIFE_S = 1.2;

const standing: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 70,
  healthMax: 70,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};

/** A sink that keeps what it was asked to show. */
function kept(): EmoteSink & {
  emotes: [string, MoodEmote][];
  frames: Map<string, readonly [number, number] | null>[];
} {
  const emotes: [string, MoodEmote][] = [];
  const frames: Map<string, readonly [number, number] | null>[] = [];
  return {
    emotes,
    frames,
    emote: (head, kind) => {
      emotes.push([head, kind]);
      return LIFE_S;
    },
    frame: (_seconds, heads) => frames.push(new Map(heads)),
  };
}

test('fear pops as a foe breaks and anger as it starts to rage, once each change', () => {
  assert.equal(moodEmote(undefined, MOOD.steady), null);
  assert.equal(moodEmote(MOOD.steady, MOOD.broken), 'fear');
  assert.equal(moodEmote(MOOD.broken, MOOD.broken), null, 'nothing while it stays broken');
  assert.equal(moodEmote(MOOD.broken, MOOD.steady), null, 'nothing as the break ends');
  assert.equal(moodEmote(MOOD.steady, MOOD.raging), 'anger');
  assert.equal(moodEmote(undefined, MOOD.raging), 'anger', 'a foe first seen raging');
});

test('an emote stands over its foe while it shows, hidden out of sight, and none pops over the dead', () => {
  const sink = kept();
  let made = 0;
  const moods = new FoeMoods(() => {
    made += 1;
    return sink;
  });
  let seen: readonly [number, number] | null = [100, 50];
  const head = () => seen;
  moods.update([{ id: 3, view: standing }], head, 0.016);
  assert.deepEqual(sink.emotes, [], 'a steady foe pops nothing');
  assert.equal(made, 0, 'and nothing is laid on the page');
  moods.update([{ id: 3, view: standing, mood: MOOD.broken }], head, 0.016);
  assert.deepEqual(sink.emotes, [['foe-3', 'fear']]);
  assert.equal(made, 1);
  assert.deepEqual(sink.frames.at(-1)?.get('foe-3'), [100, 50], 'at its head');
  seen = null;
  moods.update([{ id: 3, view: standing, mood: MOOD.broken }], head, 0.016);
  assert.equal(sink.frames.at(-1)?.get('foe-3'), null, 'out of sight, hidden');
  moods.update([{ id: 3, view: standing, mood: MOOD.broken }], head, LIFE_S);
  moods.update([{ id: 3, view: standing, mood: MOOD.broken }], head, 0.016);
  assert.equal(sink.frames.at(-1)?.has('foe-3'), false, 'shown its time, it is gone');
  const dead: FighterView = { ...standing, action: { kind: 'dead', elapsed: 0 } };
  moods.update([{ id: 4, view: dead, mood: MOOD.raging }], head, 0.016);
  assert.equal(sink.emotes.length, 1, 'the dead pop nothing');
});

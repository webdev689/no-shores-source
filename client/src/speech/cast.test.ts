import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { castOf, scenesOf } from './cast.ts';

const story = new URL('../../../content/story/', import.meta.url);
const castJson = JSON.parse(readFileSync(new URL('cast.json', story), 'utf8'));
const prologueJson = JSON.parse(readFileSync(new URL('prologue.json', story), 'utf8'));

const VOICE = { pitchHz: 120, spreadHz: 10, muffleHz: 1400, volume: 0.3, syllableS: 0.1 };
const small = () => ({ speakers: { mate: { name: 'First Mate', voice: 'mate' } }, voices: { mate: { ...VOICE } } });

test('the mission cast and its prologue read whole', () => {
  const cast = castOf(castJson);
  assert.equal(cast.speakers.thule.name, 'Captain Brannoc Thule');
  assert.equal(cast.voices.deep.pitchHz, 64);
  const scenes = scenesOf(prologueJson, cast);
  assert.equal(scenes.sighted.length, 4);
  assert.deepEqual(scenes.sighted[0], { who: 'lookout', say: 'Sails off the bow!', kind: 'bark', emote: 'alert' });
});

test('a speaker without a voice is refused', () => {
  const json = small();
  json.speakers.mate.voice = 'nobody';
  assert.throws(() => castOf(json), /mate.*nobody/);
});

test('a voice with a missing or empty number is refused', () => {
  const json = small();
  (json.voices.mate as Record<string, unknown>).muffleHz = undefined;
  assert.throws(() => castOf(json), /muffleHz/);
  const silent = small();
  silent.voices.mate.syllableS = 0;
  assert.throws(() => castOf(silent), /syllableS/);
});

test('a cast that is not an object of speakers and voices is refused', () => {
  assert.throws(() => castOf(null), /cast/);
  assert.throws(() => castOf({ speakers: [] }), /speakers/);
});

test('a line by someone not in the cast is refused', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: [{ who: 'ghost', say: 'Boo.' }] } }, cast), /one.*ghost/);
});

test('a line with no words, an unknown kind or an unknown emote is refused', () => {
  const cast = castOf(small());
  const scene = (line: object) => ({ scenes: { one: [{ who: 'mate', say: 'Brace!', ...line }] } });
  assert.throws(() => scenesOf(scene({ say: '' }), cast), /words/);
  assert.throws(() => scenesOf(scene({ kind: 'song' }), cast), /kind/);
  assert.throws(() => scenesOf(scene({ emote: 'glee' }), cast), /emote/);
  assert.equal(scenesOf(scene({ emote: 'silence' }), cast).one[0].emote, 'silence');
});

test('scenes that are not lists of lines are refused', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: 'Brace!' } }, cast), /one/);
  assert.throws(() => scenesOf({}, cast), /scenes/);
});

test('a name every object carries is not a speaker or a voice', () => {
  const cast = castOf(small());
  assert.throws(() => scenesOf({ scenes: { one: [{ who: 'toString', say: 'Hi.' }] } }, cast), /toString/);
  const json = small();
  json.speakers.mate.voice = 'constructor';
  assert.throws(() => castOf(json), /constructor/);
});

test('a syllable too short to swell and fall is refused', () => {
  const json = small();
  json.voices.mate.syllableS = 0.01;
  assert.throws(() => castOf(json), /syllableS/);
});

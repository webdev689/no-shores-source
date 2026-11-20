import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY_S } from '../../sky/worldClock.ts';
import { DEEP, MORNING, OVER_CLOUD, STORM, WRECK } from './skies.ts';
import { STORY_DAY_S, overTheSky, toldSky } from './storySky.ts';

const STRIKE = { x: 10, y: 20, atS: 5, toGround: true, power: 1 };

test('the story tells the sky its own day and hour: first light, the storm at evening, the wreck by night, the shore at dawn', () => {
  const hourOf = (hourS: number) => (((hourS - STORY_DAY_S) / DAY_S) * 24).toFixed(2);
  assert.equal(hourOf(toldSky(OVER_CLOUD, 0, [])?.hourS ?? NaN), '5.25');
  assert.equal(hourOf(toldSky(STORM, 0, [])?.hourS ?? NaN), '18.00');
  assert.equal(hourOf(toldSky(WRECK, 0, [])?.hourS ?? NaN), '21.00');
  assert.equal(hourOf(toldSky(MORNING, 0, [])?.hourS ?? NaN), '29.60', "the next day's dawn");
  assert.equal(toldSky({ ...STORM, hour: undefined }, 0, []), null, 'no hour leaves the world its own sky');
});

test("the storm is told as a storm: full cloud, rain falling, the story's mist as thick as its own, the wind, its strikes", () => {
  const sky = toldSky(STORM, 42, [STRIKE]);
  assert.ok(sky);
  assert.deepEqual([sky.weather.cloud, sky.weather.storm, sky.weather.falling], [1, 1, 1]);
  // The atmosphere thickened its air by 0.0063 a metre for its mist and 0.0005 for its overcast; the sky's fog bank
  // is 0.004 a metre: a mist of 0.55 under a full overcast is all but the whole bank.
  assert.equal(sky.weather.fog.toFixed(3), '0.991');
  assert.deepEqual(sky.weather.wind, STORM.wind);
  assert.deepEqual([sky.worldS, sky.strikes], [42, [STRIKE]]);
  const morning = toldSky(MORNING, 0, []);
  assert.ok(morning && morning.weather.storm === 0 && morning.weather.fog < 0.5, 'a grey morning is no storm');
});

test("over a told sky the story's atmosphere keeps only what the sky cannot draw", () => {
  const over = overTheSky(WRECK);
  assert.deepEqual([over.overcast, over.rain, over.mist, over.flash, over.bolt], [0, 0, 0, 0, null]);
  assert.deepEqual([over.glow, over.seaGain, over.clouds], [WRECK.glow, WRECK.seaGain, WRECK.clouds]);
  assert.equal(overTheSky(DEEP).deep, 1);
  const own = { ...STORM, hour: undefined };
  assert.equal(overTheSky(own), own, 'a weather with no hour is all its own');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seeded } from './dsp.ts';
import {
  AMBIENCES,
  BREAKER_S,
  CROSSFADE_S,
  CURL_S,
  PHASES,
  STRIDE_MOST_M,
  ambienceOf,
  boutTimes,
  breakerAt,
  breathOf,
  byPhase,
  fadeGain,
  gapAfter,
  gustOf,
  moodOf,
  nearness,
  phasesAt,
  stepLevel,
  swellAt,
  walkedOn,
  wander,
  wayOf,
} from './law.ts';
import { CLIMATES } from '../place.ts';

test('the sea, the social space and each climate are each an ambience of their own, eleven in all', () => {
  assert.equal(ambienceOf({ kind: 'sea' }), 'sea');
  assert.equal(ambienceOf({ kind: 'social', climate: 'temperate-coast' }), 'social');
  for (const climate of CLIMATES) assert.equal(ambienceOf({ kind: 'island', climate, node: 'patrol' }), climate);
  assert.equal(new Set(AMBIENCES).size, 11);
});

test('every hour is all in its phases, whole by day at noon, by night at midnight, at dawn and dusk', () => {
  for (let hour = 0; hour < 24; hour += 0.25) {
    const phases = phasesAt(hour);
    const sum = PHASES.reduce((total, phase) => total + phases[phase], 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${hour}: ${sum}`);
    for (const phase of PHASES) assert.ok(phases[phase] >= 0 && phases[phase] <= 1);
  }
  assert.equal(phasesAt(13).day, 1);
  assert.equal(phasesAt(1).night, 1);
  assert.equal(phasesAt(5.5).dawn, 1);
  assert.equal(phasesAt(19.5).dusk, 1);
  assert.equal(phasesAt(25).night, 1);
  assert.equal(byPhase({ day: 3, night: 1 }, phasesAt(13)), 3);
});

test('a bed breathes between its depth and its whole, and a mood wanders round its mean, never on a loop', () => {
  const breaths: number[] = [];
  for (let time = 0; time < 3600; time += 0.5) {
    const breath = breathOf(time, 2.3, 0.4);
    assert.ok(breath >= 0.6 - 1e-9 && breath <= 1 + 1e-9);
    breaths.push(breath);
    const mood = moodOf(time, 1.1);
    assert.ok(mood >= 0.4 - 1e-9 && mood <= 1.6 + 1e-9);
  }
  // No stretch of a minute comes back within the hour.
  const minute = breaths.slice(0, 120);
  for (let shift = 120; shift + 120 <= breaths.length; shift += 2) {
    const apart = minute.reduce((sum, value, nth) => sum + Math.abs(value - (breaths[shift + nth] ?? 0)), 0) / 120;
    assert.ok(apart > 0.002, `the breathing repeats ${shift / 2} s on`);
  }
});

test('a voice calls at its rate on average, unevenly, never sooner than a quarter of its mean, and not at all at none', () => {
  const random = seeded(7);
  const gaps = Array.from({ length: 20000 }, () => gapAfter(6, random));
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  assert.ok(Math.abs(mean - 10) / 10 < 0.05, `mean ${mean}`);
  assert.ok(Math.min(...gaps) >= 2.5);
  const spread = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length) / mean;
  assert.ok(spread > 0.5, `the gaps are too even: ${spread}`);
  assert.equal(gapAfter(0, random), Infinity);
});

test("a bout's calls come in order, as many as it asks, each gap within its spacing", () => {
  const random = seeded(3);
  for (let nth = 0; nth < 200; nth++) {
    const times = boutTimes([3, 7], [0.4, 0.9], random);
    assert.ok(times.length >= 3 && times.length <= 7);
    assert.equal(times[0], 0);
    for (let step = 1; step < times.length; step++) {
      const gap = (times[step] ?? 0) - (times[step - 1] ?? 0);
      assert.ok(gap >= 0.4 && gap <= 0.9);
    }
  }
});

test('a crossfade takes its seconds, never overshoots, and two crossing hold their power', () => {
  let [rising, falling] = [0, 1];
  let seconds = 0;
  while (rising < 1) {
    rising = stepLevel(rising, 1, 1 / 60);
    falling = stepLevel(falling, 0, 1 / 60);
    seconds += 1 / 60;
    assert.ok(Math.abs(fadeGain(rising) ** 2 + fadeGain(falling) ** 2 - 1) < 1e-9);
  }
  assert.ok(Math.abs(seconds - CROSSFADE_S) < 0.05);
  assert.equal(falling, 0);
  assert.equal(stepLevel(0.5, 0.5, 1), 0.5);
  // Turned back halfway, a fade goes back from where it stood.
  assert.equal(stepLevel(0.5, 0, 1), 0.5 - 1 / CROSSFADE_S);
});

test("a ship's way is none hove to and grows with its pace, and the coast's nearness falls with its distance", () => {
  assert.equal(wayOf(false, 100), 0);
  assert.ok(wayOf(true, 5) > 0 && wayOf(true, 5) < wayOf(true, 60) && wayOf(true, 60) < wayOf(true, 100));
  assert.equal(wayOf(true, 100), 1);
  assert.equal(nearness(100, 600, 3000), 1);
  assert.equal(nearness(3000, 600, 3000), 0);
  assert.equal(nearness(Infinity, 600, 3000), 0);
  assert.ok(nearness(1000, 600, 3000) > nearness(2000, 600, 3000));
});

test('a breaker curls up to its crash and runs back to the surf floor; the swell stays within 0 and 1', () => {
  assert.ok(breakerAt(0, 9) < 0.3);
  assert.equal(breakerAt(CURL_S, 9), 1);
  assert.ok(breakerAt(CURL_S + 4, 9) < 0.35);
  for (let time = 0; time < BREAKER_S[1]; time += 0.1) {
    const swell = breakerAt(time, BREAKER_S[0]);
    assert.ok(swell > 0 && swell <= 1);
  }
  for (let time = 0; time < 200; time += 0.3) assert.ok(swellAt(time) >= 0 && swellAt(time) <= 1);
});

test('the wind gusts smoothly, between calm and its whole, and its gusts never come round on a beat', () => {
  let last = gustOf(0, 3);
  const gusts: number[] = [];
  for (let time = 0; time < 600; time += 0.05) {
    const gust = gustOf(time, 3);
    assert.ok(gust >= 0 && gust <= 1);
    assert.ok(Math.abs(gust - last) < 0.05, `a gust jumps at ${time}`);
    last = gust;
    gusts.push(gust);
    assert.equal(wander(time, 3, 4.3), wander(time, 3, 4.3));
  }
  // No ten seconds of gusts come back within ten minutes.
  const span = 200;
  const first = gusts.slice(0, span);
  for (let shift = 20; shift + span <= gusts.length; shift += 5) {
    const apart = first.reduce((sum, gust, nth) => sum + Math.abs(gust - (gusts[shift + nth] ?? 0)), 0) / span;
    assert.ok(apart > 0.01, `the gusts repeat ${shift * 0.05} s on`);
  }
  assert.notEqual(gustOf(10, 1), gustOf(10, 2));
});

test('feet set down far off by a moved clock or a hidden page walk no steps, and a walk counts every metre', () => {
  assert.equal(walkedOn(0.5, 0.2), 0.7);
  assert.equal(walkedOn(0.5, 40), 0.5, 'thirty seconds of the world clock at once');
  assert.equal(walkedOn(0, STRIDE_MOST_M), STRIDE_MOST_M);
});

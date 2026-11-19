import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import { BEDS } from './beds.ts';
import { AMBIENCES, PHASES, byPhase, phasesAt } from './law.ts';
import { jobsOf } from './player.ts';
import { SCAPES } from './scapes.ts';
import { SOUNDS, jobName } from './sounds.ts';

const searched = new Set(listed.cues.map((cue) => cue.id));
const ordered = ([low, high]: readonly [number, number]) => low <= high;

test('every ambience is detailed: several beds, many voices, each made of sounds there are', () => {
  for (const key of AMBIENCES) {
    const scape = SCAPES[key];
    assert.ok(scape.beds.length >= 4, `${key} has its beds`);
    assert.ok(scape.voices.length >= 7, `${key} has its voices`);
    for (const layer of scape.beds) {
      assert.ok(Object.hasOwn(BEDS, layer.bed), `${key}: ${layer.bed}`);
      assert.ok(layer.gain > 0 && layer.breath >= 0 && layer.breath < 1);
      if (layer.recorded) assert.ok(searched.has(layer.recorded), `${layer.recorded} is searched for`);
    }
    for (const voice of scape.voices) {
      const named = voice.sounds.join('+') || voice.recorded;
      assert.ok(voice.sounds.length > 0 || voice.recorded, `${key}: a voice with nothing to sound`);
      for (const sound of voice.sounds) assert.ok(Object.hasOwn(SOUNDS, sound), `${key}: ${sound}`);
      if (voice.recorded)
        assert.ok(voice.recorded.startsWith('amb.') && searched.has(voice.recorded), `${voice.recorded}`);
      for (const range of [voice.bout, voice.spacing, voice.distance, voice.lift, voice.gain, voice.pitch])
        assert.ok(ordered(range), `${key}: ${named}`);
      assert.ok(voice.near > 0 && voice.gain[1] <= 1 && voice.bout[0] >= 1);
    }
  }
});

test('every ambience sounds by day and by night, and changes between them where its life does', () => {
  for (const key of AMBIENCES) {
    const busy = (hour: number) =>
      SCAPES[key].voices.map((voice) => byPhase(voice.perMinute, phasesAt(hour))).reduce((sum, rate) => sum + rate, 0);
    assert.ok(busy(13) > 0 && busy(1) > 0, `${key} is heard by day and by night`);
    for (const phase of PHASES)
      assert.ok(
        SCAPES[key].beds.some((layer) => (layer.when[phase] ?? 0) > 0),
        `${key} has a bed at ${phase}`,
      );
  }
  for (const key of AMBIENCES.filter((each) => each !== 'sea')) {
    const callsAt = (hour: number) =>
      SCAPES[key].voices
        .filter((voice) => byPhase(voice.perMinute, phasesAt(hour)) > 0)
        .map((voice) => voice.sounds.join('+') || voice.recorded)
        .join(',');
    assert.notEqual(callsAt(13), callsAt(1), `${key}'s night is its own`);
  }
});

test('no two ambiences are the same: each has beds or voices no other has in the same mix', () => {
  const mixOf = (key: (typeof AMBIENCES)[number]) =>
    [
      ...SCAPES[key].beds.map((layer) => `${layer.bed}@${layer.at}`),
      ...SCAPES[key].voices.map((voice) => voice.sounds.join('+') || voice.recorded),
    ]
      .sort()
      .join(',');
  assert.equal(new Set(AMBIENCES.map(mixOf)).size, AMBIENCES.length);
});

test("a place's jobs are its beds first, then every take of every sound its voices sing, each named once", () => {
  for (const key of AMBIENCES) {
    const jobs = jobsOf(SCAPES[key]);
    const names = jobs.map(jobName);
    assert.equal(new Set(names).size, names.length);
    const firstSound = jobs.findIndex((job) => job.kind === 'sound');
    assert.ok(jobs.slice(firstSound).every((job) => job.kind === 'sound'));
    for (const layer of SCAPES[key].beds) assert.ok(names.includes(`bed:${layer.bed}`));
    for (const voice of SCAPES[key].voices)
      for (const sound of voice.sounds) assert.ok(names.includes(`sound:${sound}:0`));
  }
});

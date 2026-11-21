import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import { AMBIENCES, PHASES, byPhase, phasesAt } from './law.ts';
import { SCAPES } from './scapes.ts';

const picked = new Set(listed.cues.filter((cue) => 'picked' in cue).map((cue) => cue.id));
const ordered = ([low, high]: readonly [number, number]) => low <= high;

test('every ambience is detailed: several beds, many voices, each a recording the owner picked', () => {
  for (const key of AMBIENCES) {
    const scape = SCAPES[key];
    assert.ok(scape.beds.length >= 4, `${key} has its beds`);
    assert.ok(scape.voices.length >= 7, `${key} has its voices`);
    for (const layer of scape.beds) {
      assert.ok(layer.gain > 0 && layer.breath >= 0 && layer.breath < 1);
      assert.ok(picked.has(layer.recorded), `${key}: ${layer.bed}'s ${layer.recorded} is picked`);
    }
    for (const voice of scape.voices) {
      const named = voice.sounds.join('+') || voice.recorded;
      assert.ok(voice.recorded.startsWith('amb.') && picked.has(voice.recorded), `${key}: ${voice.recorded} is picked`);
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

test('a bird named by its cue alone shelters from the rain as the other birds do; a lion does not', () => {
  const recordedOnly = Object.values(SCAPES).flatMap((scape) => scape.voices.filter((voice) => !voice.sounds.length));
  const shelters = (cue: string) => recordedOnly.find((voice) => voice.recorded === cue)?.shelters ?? false;
  assert.ok(shelters('amb.rainforest.parrot') && shelters('amb.swamp.heron'));
  assert.equal(shelters('amb.savanna.lion'), false);
});

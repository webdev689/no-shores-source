import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import { panOf, syllableOf, type VoiceProfile } from './voice.ts';

const BOSUN: VoiceProfile = { pitchHz: 92, spreadHz: 14, muffleHz: 1300, volume: 0.38, syllableS: 0.12 };

test('a syllable keeps to its voice: pitch within the spread, muffle above its floor, its own length', () => {
  for (const roll of [0, 0.5, 0.999]) {
    const syllable = syllableOf(BOSUN, false, () => roll);
    assert.ok(syllable.pitchHz >= 92 && syllable.pitchHz < 106);
    assert.ok(syllable.muffleHz >= 1300 && syllable.muffleHz < 1700);
    assert.equal(syllable.volume, 0.38);
    assert.equal(syllable.lengthS, 0.12);
  }
});

test('each syllable is a vowel of its own: two formants in a speaking range', () => {
  const low = syllableOf(BOSUN, false, () => 0);
  const high = syllableOf(BOSUN, false, () => 0.999);
  assert.ok(low.firstFormantHz >= 300 && high.firstFormantHz <= 700);
  assert.ok(low.secondFormantHz >= 800 && high.secondFormantHz <= 2000);
  assert.notEqual(low.firstFormantHz, high.firstFormantHz);
});

test('an emphasised syllable is higher and louder', () => {
  const plain = syllableOf(BOSUN, false, () => 0.5);
  const leant = syllableOf(BOSUN, true, () => 0.5);
  assert.ok(leant.pitchHz > plain.pitchHz);
  assert.ok(leant.volume > plain.volume);
});

test('a voice pans by where its speaker stands across the screen', () => {
  assert.equal(panOf(0, 1000), -1);
  assert.equal(panOf(500, 1000), 0);
  assert.equal(panOf(1000, 1000), 1);
  assert.equal(panOf(-200, 1000), -1, 'off the screen still pans no further than the edge');
  assert.equal(panOf(250, 0), 0, 'no screen, no pan');
});

test("the voice is heard as the owner's Freesound pick of talk once picked: its cue is on the sound sheet", () => {
  assert.ok(listed.cues.some((cue) => cue.id === 'speech.voice'));
});

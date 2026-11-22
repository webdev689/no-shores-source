import assert from 'node:assert/strict';
import { test } from 'node:test';
import bank from '../../content/audio/sounds.json' with { type: 'json' };
import { levelOf, matchedLevel, measureOf, rushOf } from './soundMeasure.ts';
import { keysOf, soundCredits, variantOf } from './soundSamples.ts';

test("every recorded sound is kept under its hash; Freesound's carry their whole credit, DFO's say where they came from", () => {
  const sounds = Object.entries(bank.sounds);
  assert.ok(sounds.length > 0);
  for (const [id, sound] of sounds) {
    const keys = keysOf(sound);
    assert.ok(keys.length > 0, `${id} has a file`);
    for (const key of keys) assert.match(key, /^sounds\/[0-9a-f]{64}\.(mp3|wav)$/, `${id}'s file is named by its hash`);
    if (!('freesound' in sound)) {
      const own = sound as { readonly licence: string; readonly from?: string; readonly name: string };
      assert.ok(['Ours', 'CC0'].includes(own.licence) && own.from && own.name, `${id} says what it is and whence`);
      continue;
    }
    assert.ok(['CC0', 'CC-BY'].includes(sound.licence), `${id} is under a licence the owner allows`);
    assert.match(sound.licenceUrl, /^https:\/\/creativecommons\.org\/(publicdomain\/zero|licenses\/by)\/\d\.\d\/$/);
    assert.match(sound.page, /^https:\/\/freesound\.org\/people\/[^/]+\/sounds\/\d+\/$/, `${id} links its source`);
    assert.ok(sound.name && sound.author && sound.changes, `${id} names itself, its author and what was changed`);
  }
  const recorded = sounds.filter(([, sound]) => 'freesound' in sound);
  assert.equal(soundCredits().length, recorded.length, 'Settings credits every Freesound recording');
});

test('a cue with several files never plays the same one twice running, and reaches every one', () => {
  for (let last = 0; last < 6; last++) {
    const next = new Set(Array.from({ length: 50 }, (unused, step) => variantOf(6, last, step / 50)));
    assert.ok(!next.has(last), `never ${last} after ${last}`);
    assert.equal(next.size, 5, 'every other one');
  }
  assert.equal(variantOf(1, 0, 0.9), 0, 'a single file plays itself');
});

test('a held tone is levelled by its loudness, a click by its peak', () => {
  const rate = 44100;
  const tone = Float32Array.from({ length: rate / 2 }, (unused, index) =>
    Math.sin((index / rate) * 2 * Math.PI * 1000),
  );
  const click = new Float32Array(rate / 2);
  click[100] = 1;
  // The tone's loudest 20 ms is its whole: turned down to -24 dBFS, well under the click's peak level.
  assert.ok(Math.abs(levelOf([tone], rate) - 0.063 / Math.SQRT1_2) < 0.002);
  assert.equal(levelOf([click], rate), 0.3);
});

test("a sound's loudness is its loudest stretch, or the whole of it; a recording standing in takes it, under its peak", () => {
  const rate = 1000;
  const burst = Float32Array.from({ length: 4000 }, (unused, index) => (index >= 1000 && index < 1400 ? 0.5 : 0.05));
  const loudest = measureOf([burst], rate, 0.4);
  assert.ok(Math.abs(loudest.loud - 0.5) < 1e-9, 'its loudest 0.4 s is the burst');
  assert.equal(loudest.peak, 0.5);
  const whole = measureOf([burst], rate, Infinity);
  assert.ok(Math.abs(whole.loud - Math.sqrt((400 * 0.25 + 3600 * 0.0025) / 4000)) < 1e-9, 'over all of it');
  // As loud as the synthesiser's sound, unless the recording's peaks would then pass the most it may reach: that
  // sound's own peak where nothing else is said, the mix's ceiling where it is, or nothing at all.
  assert.ok(Math.abs(matchedLevel({ peak: 0.2, loud: 0.05 }, { peak: 1, loud: 0.1 }) - 2) < 1e-9);
  assert.ok(Math.abs(matchedLevel({ peak: 0.5, loud: 0.05 }, { peak: 1, loud: 0.1 }) - 2) < 1e-9);
  assert.ok(Math.abs(matchedLevel({ peak: 0.8, loud: 0.05 }, { peak: 1, loud: 0.1 }) - 1.25) < 1e-9);
  assert.ok(Math.abs(matchedLevel({ peak: 0.8, loud: 0.05 }, { peak: 1, loud: 0.1 }, 2) - 2) < 1e-9);
  assert.ok(Math.abs(matchedLevel({ peak: 0.9, loud: 0.01 }, { peak: 1, loud: 0.1 }, Infinity) - 10) < 1e-9);
  assert.equal(matchedLevel({ peak: 0, loud: 0 }, { peak: 0, loud: 0 }), 0, 'silence stands in for silence');
});

test("a whoosh's rush is where its loudest 20 ms come", () => {
  const rate = 44100;
  // Quiet hiss, then a burst 90 ms in, as a heavy swing's recording rises to its rush.
  const whoosh = Float32Array.from({ length: rate / 3 }, (unused, index) => {
    const seconds = index / rate;
    return (Math.abs(seconds - 0.09) < 0.01 ? 0.8 : 0.02) * Math.sin(index);
  });
  assert.ok(Math.abs(rushOf([whoosh], rate) - 0.09) < 0.002, `rush at ${rushOf([whoosh], rate)}`);
});

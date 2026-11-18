import assert from 'node:assert/strict';
import { test } from 'node:test';
import bank from '../../../content/audio/sounds.json' with { type: 'json' };
import { soundCredits } from './soundSamples.ts';

test('every recorded sound is kept under its hash and carries its whole credit', () => {
  const sounds = Object.entries(bank.sounds);
  assert.ok(sounds.length > 0);
  for (const [id, sound] of sounds) {
    assert.match(sound.key, /^sounds\/[0-9a-f]{64}\.mp3$/, `${id}'s file is named by its hash`);
    assert.ok(['CC0', 'CC-BY'].includes(sound.licence), `${id} is under a licence the owner allows`);
    assert.match(sound.licenceUrl, /^https:\/\/creativecommons\.org\/(publicdomain\/zero|licenses\/by)\/\d\.\d\/$/);
    assert.match(sound.page, /^https:\/\/freesound\.org\/people\/[^/]+\/sounds\/\d+\/$/, `${id} links its source`);
    assert.ok(sound.name && sound.author && sound.changes, `${id} names itself, its author and what was changed`);
  }
  assert.equal(soundCredits().length, sounds.length, 'Settings credits every one');
});

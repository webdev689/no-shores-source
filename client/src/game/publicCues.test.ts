import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HEARD_MOST_S } from '../combat/worldSounds.ts';

/** Each recorded cue a public event plays, and its length in seconds, read once from its MP3's frame count on R2. A
 *  cue added to the event's code without a length here fails, so it is measured before it is heard. */
const LENGTH_S: Record<string, number> = {
  'amb.ice.crack': 4.5,
  'cast.charge': 2.6,
  'drop.land': 0.4,
  'element.cosmic': 0.9,
  'finish.cosmic': 0.6,
  'foe.alert': 0.3,
  kill: 0.4,
  'sea.ship.break': 3.3,
  'shield.break': 1.6,
  'ship.ready': 0.7,
  'story.crash': 4.2,
  'story.flash': 4.4,
};

const sounds = Object.keys(
  (
    JSON.parse(readFileSync(new URL('../../../content/audio/sounds.json', import.meta.url), 'utf8')) as {
      sounds: Record<string, unknown>;
    }
  ).sounds,
);
const cuesIn = (file: string) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  return [...source.matchAll(/'([a-z][\w.-]*)'/g)].map((match) => match[1] ?? '').filter((cue) => sounds.includes(cue));
};

test('every recorded cue a public event plays is short, under what a heard cue may hold', () => {
  const cues = new Set([...cuesIn('./publicView.ts'), ...cuesIn('./publicMoments.ts')]);
  assert.ok(cues.size >= 10, 'the cues are found');
  for (const cue of cues) {
    const length = LENGTH_S[cue];
    assert.ok(length !== undefined, `${cue}'s length is measured`);
    assert.ok(length < HEARD_MOST_S, `${cue} (${length} s) is under ${HEARD_MOST_S} s`);
  }
});

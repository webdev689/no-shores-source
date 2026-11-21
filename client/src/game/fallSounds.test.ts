import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FallSounds, type HeardFall } from './fallSounds.ts';

/** A page's audio as far as the fall's sounds use it, counting the voices started. */
function fakeAudio(): { audio: AudioContext; voices: () => number } {
  let voices = 0;
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    cancelScheduledValues: () => undefined,
  });
  const node = () => ({ connect: (next: unknown) => next, disconnect: () => undefined });
  const audio = {
    currentTime: 0,
    createPanner: () => ({ ...node(), positionX: param(), positionY: param(), positionZ: param() }),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      voices += 1;
      return {
        ...node(),
        frequency: param(),
        context: audio,
        start: () => undefined,
        stop: () => undefined,
        addEventListener: () => undefined,
      };
    },
  };
  return { audio: audio as unknown as AudioContext, voices: () => voices };
}

const body = (falling: boolean, lying: boolean): HeardFall => ({ id: 7, at: [0, 0, 10], falling, lying });

test("a body's fall whistles once and thuds once, though it slides off a ledge and lands again", () => {
  const { audio, voices } = fakeAudio();
  const sounds = new FallSounds(() => ({ audio, out: audio.createGain() }));
  const before = voices();
  for (const [falling, lying] of [
    [true, false],
    [false, true],
    [true, false],
    [false, true],
  ] as const)
    sounds.frame([body(falling, lying)], 0.1, [0, 0, 0], false);
  assert.equal(voices() - before, 4, 'a whistle (voice and warble) and a thud (two strikes), once');
  sounds.frame([body(false, false)], 0.1, [0, 0, 0], false);
  sounds.frame([body(true, false)], 0.1, [0, 0, 0], false);
  assert.equal(voices() - before, 6, 'stood again, its next fall whistles');
});

test('a fall cut short by the menu is not whistled again from the top once the menu closes', () => {
  const { audio, voices } = fakeAudio();
  const sounds = new FallSounds(() => ({ audio, out: audio.createGain() }));
  const before = voices();
  sounds.frame([body(true, false)], 0.1, [0, 0, 0], false);
  sounds.frame([body(true, false)], 0.1, [0, 0, 0], true);
  sounds.frame([body(true, false)], 0.1, [0, 0, 0], false);
  assert.equal(voices() - before, 2, 'one whistle');
});

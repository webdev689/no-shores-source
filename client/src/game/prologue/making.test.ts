import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import { STORM } from './skies.ts';
import type { Tick } from './beat.ts';
import { FIRST_LOOK, type Look } from './look.ts';
import { Making, type MakingSteps } from './making.ts';
import type { Story } from './story.ts';

const tick: Tick = {
  seconds: 0.1,
  clock: 0,
  controls: {} as InputFrame,
  size: { width: 960, height: 540 },
  viewport: { width: 960, height: 540 },
};

/** The helm's story, as far as Making uses it, writing down the storm it is set in. */
function story() {
  const set: string[] = [];
  const place = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  const made = {
    stage: {
      parts: {
        hudRoot: {},
        screen: { bars: () => undefined },
        ambience: { set: (bed: { rain?: number }) => set.push(`rain ${bed.rain}`) },
      },
      weatherTowards: (weather: unknown) => set.push(weather === STORM ? 'storm' : 'other weather'),
      stepWeather: () => undefined,
      windBearing: () => 0,
      swell: () => undefined,
    },
    brig: { step: () => undefined, sailed: () => ({}), crew: () => [] },
    lightning: { striking: false, step: () => ({ flash: 0, bolt: null }) },
    sailing: { frame: () => [{ place }] },
    walker: { you: { dress: null } },
    look: FIRST_LOOK,
    dress: null,
    link: null,
  };
  return { story: made as unknown as Story, set, lightning: made.lightning };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

/** Steps that answer at once: the account step goes on alone, the look step chooses `look`. */
const steps = (look: Look): MakingSteps => ({
  account: async () => ({ kind: 'alone' }),
  look: async () => look,
});

test('the helm starts in its own storm: its weather, its rain and its lightning, as the story leaves them', () => {
  const { story: helm, set, lightning } = story();
  new Making(helm, steps(FIRST_LOOK));
  assert.ok(set.includes('storm'));
  assert.ok(set.includes('rain 1'));
  assert.ok(lightning.striking);
});

test('the steps end the helm, the look chosen and kept, even where the browser keeps nothing', async () => {
  Object.assign(globalThis, {
    localStorage: {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
  });
  const { story: helm } = story();
  const chosen: Look = { ...FIRST_LOOK, race: 'felid' };
  const making = new Making(helm, steps(chosen));
  await settle();
  assert.ok(making.done);
  assert.equal(helm.look, chosen);
});

test('a step that fails is thrown from the frame, so the story goes on past the helm', async () => {
  const { story: helm } = story();
  const making = new Making(helm, {
    account: () => Promise.reject(new Error('the window could not be made')),
    look: async () => FIRST_LOOK,
  });
  await settle();
  assert.throws(() => making.frame(tick), /the window could not be made/);
});

test('the story moving on from the helm ends its windows, and the step ending then dresses nobody', async () => {
  const { story: helm } = story();
  const signals: AbortSignal[] = [];
  const making = new Making(helm, {
    account: async (_root, _link, signal) => {
      if (signal) signals.push(signal);
      return { kind: 'alone' };
    },
    // A look step that, left, still answers with a choice, as a press landing as the helm goes would.
    look: (_root, _start, changed, _turn, signal) =>
      new Promise((resolve) =>
        signal?.addEventListener('abort', () => {
          if (!signal.aborted) changed(chosen);
          resolve(chosen);
        }),
      ),
  });
  const chosen: Look = { ...FIRST_LOOK, race: 'anole' };
  await settle();
  making.leave();
  await settle();
  assert.equal(signals[0]?.aborted, true, 'the windows are told the helm is left');
  assert.equal(making.done, false, 'a helm left is not done');
  assert.equal(helm.look, FIRST_LOOK, 'what the step answers after the helm is left dresses nobody');
});

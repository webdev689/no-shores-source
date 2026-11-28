import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import { STORM } from './skies.ts';
import type { Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
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
        stack: {},
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

test('a turn at a press turns the figure on the spot, the camera standing still; done, it faces the bow again', async () => {
  const { story: helm } = story();
  let turn: (step: -1 | 1) => void = () => undefined;
  let finish: (look: Look) => void = () => undefined;
  const making = new Making(helm, {
    account: async () => ({ kind: 'alone' }),
    look: (_root, _start, _changed, turning) => {
      turn = turning;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  await settle();
  const facing = (frame: ReturnType<Making['frame']>) => frame.actors?.find((actor) => actor.id === YOU_ID)?.facing;
  const first = making.frame(tick);
  turn(-1);
  turn(-1);
  let shown = first;
  for (let step = 0; step < 30; step++) shown = making.frame(tick);
  assert.deepEqual(shown.shot, first.shot, 'the camera stands where it opened');
  assert.ok(Math.abs((facing(shown) ?? 0) + Math.PI / 2) < 0.01, `turned to its left, to port: ${facing(shown)}`);
  finish(FIRST_LOOK);
  await settle();
  assert.equal(making.done, false, 'not done while it faces away from the bow');
  for (let step = 0; step < 30 && !making.done; step++) shown = making.frame(tick);
  assert.ok(making.done);
  assert.ok(Math.abs(facing(shown) ?? 1) < 0.01, 'facing the bow, as it stands in the beats after');
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

test('signed in at the helm to an account whose character has played the story, the player goes past it', async () => {
  Object.assign(globalThis, { localStorage: { getItem: () => null } });
  const account = async () => ({ kind: 'account', username: 'ada' }) as const;
  const asked: string[] = [];
  const played = (answer: boolean) => async () => {
    asked.push('played');
    return answer;
  };
  const { story: past } = story();
  Object.assign(past, { link: { keepLook: async () => undefined } });
  const onward = new Making(past, { account, look: async () => FIRST_LOOK, played: played(true) });
  await settle();
  assert.ok(onward.done && onward.onward, 'no look to make: the story ends here');
  const { story: fresh } = story();
  Object.assign(fresh, { link: { keepLook: async () => undefined } });
  const making = new Making(fresh, { account, look: async () => FIRST_LOOK, played: played(false) });
  await settle();
  assert.ok(making.done && !making.onward, 'one not past it makes their look and plays on');
  const { story: alone } = story();
  const guest = new Making(alone, { ...steps(FIRST_LOOK), played: played(true) });
  await settle();
  assert.ok(guest.done && !guest.onward, 'going on without an account asks nothing');
  assert.deepEqual(asked, ['played', 'played']);
});

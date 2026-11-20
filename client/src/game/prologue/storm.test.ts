import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InputFrame } from '../../player/input.ts';
import type { Shot } from '../camera.ts';
import type { Tick } from './beat.ts';
import { Brig } from './brig.ts';
import { creationShot, helmDeck } from './helm.ts';
import { STORM } from './skies.ts';
import { StormDive } from './storm.ts';
import type { Story } from './story.ts';

const VIEW = { width: 1600, height: 900 };
const tick = (seconds: number): Tick => ({
  seconds,
  clock: 0,
  controls: {} as InputFrame,
  size: VIEW,
  viewport: VIEW,
});
/** The Brig in a heavy swell: high on a crest, her bow up and heeled to port. */
const RIDING = { x: 500, y: -300, z: 1.8, heading: 0.6, pitch: 0.09, roll: -0.12 };

/** The storm's story, writing down every sound, flash and strike it makes and the weather it sets. */
function story() {
  const heard: string[] = [];
  const brig = new Brig([RIDING.x, RIDING.y], RIDING.heading);
  const made = {
    stage: {
      parts: {
        ambience: {
          set: () => undefined,
          thunder: () => heard.push('thunder'),
          whoosh: () => heard.push('whoosh'),
        },
        screen: { bars: () => undefined, flash: () => heard.push('flash') },
      },
      weatherTowards: (weather: unknown) => weather === STORM && heard.push('the storm whole'),
      stepWeather: () => undefined,
      windBearing: () => 0,
      swell: () => undefined,
    },
    brig,
    lightning: { striking: false, strike: () => heard.push('strike'), step: () => ({ flash: 0, bolt: null }) },
    sailing: { frame: () => [{ place: RIDING }] },
    places: { home: 0 },
    dress: null,
  };
  return { story: made as unknown as Story, heard, lightning: made.lightning };
}

const FROM: Shot = { eye: [0, 0, 60], yaw: 0, pitch: 0.1, fov: 0.9, near: 0.3, far: 30_000 };

test('a skipped storm is silent: no thunder, whoosh, strike or flash, its world left stormy as its end leaves it', () => {
  const { story: storm, heard, lightning } = story();
  const dive = new StormDive(storm, FROM);
  dive.frame(tick(1));
  dive.skip();
  dive.frame(tick(0.016));
  assert.deepEqual(heard, ['the storm whole']);
  assert.ok(lightning.striking, 'the lightning goes on striking by itself, as at the helm');
  assert.ok(dive.done);
});

test('played through, the storm sounds its moments', () => {
  const { story: storm, heard } = story();
  const dive = new StormDive(storm, FROM);
  for (let second = 0; second < 30; second++) dive.frame(tick(1));
  for (const sound of ['thunder', 'whoosh', 'flash', 'strike']) assert.ok(heard.includes(sound), sound);
});

test("the storm's run ends in the helm's own shot of her riding the swell, so the cut to the helm never jumps", () => {
  const { story: storm } = story();
  const dive = new StormDive(storm, FROM);
  let last = dive.frame(tick(0.5));
  while (!dive.done) last = dive.frame(tick(0.5));
  const helm = creationShot(helmDeck(RIDING), 0, VIEW.width / VIEW.height);
  for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs((last.shot.eye[axis] ?? 0) - (helm.eye[axis] ?? 0)) < 1e-6, `eye ${axis}`);
  assert.ok(Math.abs(last.shot.yaw - helm.yaw) < 1e-6, 'yaw');
  assert.ok(Math.abs(last.shot.pitch - helm.pitch) < 1e-6, 'pitch');
  assert.ok(Math.abs(last.shot.fov - helm.fov) < 1e-6, 'lens');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { railShot } from '../../cinema/rail.ts';
import type { InputFrame } from '../../player/input.ts';
import type { Shot } from '../camera.ts';
import type { Tick } from './beat.ts';
import { Brig } from './brig.ts';
import { creationShot, helmDeck } from './helm.ts';
import { STORM } from './skies.ts';
import { swingOf } from '../../editor/shipClear.ts';
import { HULL_NAMES, hullSails } from '../../ships/hulls.ts';
import { runKeys, StormDive } from './storm.ts';
import type { Story } from './story.ts';

const VIEW = { width: 1600, height: 900 };
const tick = (seconds: number): Tick => ({
  seconds,
  clock: 0,
  controls: {} as InputFrame,
  size: VIEW,
  viewport: VIEW,
});
/** The Brig in a heavy swell: high on a crest, its bow up and heeled to port. */
const RIDING = { x: 500, y: -300, z: 1.8, heading: 0.6, pitch: 0.09, roll: -0.12 };

/** Saltmere as the chart takes it: a square island 100 km a side, its town on its west coast. */
const ISLAND = {
  outline: [
    [0, 0],
    [100_000, 0],
    [100_000, 100_000],
    [0, 100_000],
  ],
  plan: { centre: [0, 50_000], harbour: [-1000, 50_000] },
  nodes: [],
  heightAt: (x: number) => (x < 0 ? -50 : 20),
};

/** The storm's story, writing down every sound, flash and strike it makes, the weather it sets and the insert it
 *  holds over the view. */
function story() {
  const heard: string[] = [];
  const insert = { shown: null as string | null };
  const brig = new Brig([RIDING.x, RIDING.y], RIDING.heading);
  const made = {
    stage: {
      parts: {
        ambience: {
          set: () => undefined,
          thunder: () => heard.push('thunder'),
          whoosh: () => heard.push('whoosh'),
        },
        screen: {
          bars: () => undefined,
          flash: () => heard.push('flash'),
          showInsert: (shown: { label: string } | null) => {
            insert.shown = shown?.label ?? null;
            if (shown) heard.push('chart');
          },
        },
        landmass: () => ISLAND,
      },
      weatherTowards: (weather: unknown) => weather === STORM && heard.push('the storm whole'),
      stepWeather: () => undefined,
      windBearing: () => 0,
      swell: () => undefined,
    },
    brig,
    lightning: { striking: false, strike: () => heard.push('strike'), step: () => ({ flash: 0, bolt: null }) },
    sailing: { frame: () => [{ place: RIDING }] },
    places: { home: 0, storm: [-24_000, 50_000] },
    dress: null,
  };
  return { story: made as unknown as Story, heard, lightning: made.lightning, insert };
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

test('the captain’s chart is held over the run as it leaps out to sea, and gone before the Brig comes close', () => {
  const { story: storm, insert } = story();
  const dive = new StormDive(storm, FROM);
  const held: number[] = [];
  for (let since = 0; since < 30; since += 0.25) {
    dive.frame(tick(0.25));
    if (insert.shown !== null) held.push(since);
  }
  assert.ok(held.length > 0, 'the chart is shown');
  assert.equal(insert.shown, null, 'and taken away');
  // The leap comes 7 s in; the run comes up on the Brig's quarter 9.5 s after it.
  assert.ok(
    Math.min(...held) >= 7 && Math.max(...held) < 7 + 9.5,
    `held from ${Math.min(...held)} to ${Math.max(...held)}`,
  );
  assert.ok(Math.max(...held) - Math.min(...held) >= 4, 'long enough to look at');
});

test("the storm's run ends in the helm's own shot of it riding the swell, so the cut to the helm never jumps", () => {
  const { story: storm } = story();
  const dive = new StormDive(storm, FROM);
  let last = dive.frame(tick(0.5));
  while (!dive.done) last = dive.frame(tick(0.5));
  const helm = creationShot(helmDeck(RIDING), VIEW.width / VIEW.height);
  for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs((last.shot.eye[axis] ?? 0) - (helm.eye[axis] ?? 0)) < 1e-6, `eye ${axis}`);
  assert.ok(Math.abs(last.shot.yaw - helm.yaw) < 1e-6, 'yaw');
  assert.ok(Math.abs(last.shot.pitch - helm.pitch) < 1e-6, 'pitch');
  assert.ok(Math.abs(last.shot.fov - helm.fov) < 1e-6, 'lens');
});

test("the run to the helm keeps clear of the Brig's yards and spanker, coming in only under the boom, aft", () => {
  // In the Brig's own frame: its yards reach 6.5 m out each side and its spanker swings some 8 m out over its
  // quarter, its boom 5.9 m up. Within 9 m of its middle the eye is under the boom and aft of where any yard swings.
  const yards = hullSails(HULL_NAMES.indexOf('brig'))
    .filter((sail) => sail.kind === 'square')
    .map(swingOf);
  const clearAft = Math.min(...yards.map((yard) => yard.pivot - yard.reach));
  for (const aspect of [16 / 9, 9 / 16]) {
    const keys = runKeys(aspect);
    for (let time = 9.5; time <= 20; time += 0.05) {
      const [forward, starboard, up] = railShot(keys, time, 0.9).eye;
      if (Math.abs(starboard) >= 9) continue;
      const where = `${time.toFixed(2)} s: ${forward.toFixed(1)}, ${starboard.toFixed(1)}, ${up.toFixed(1)}`;
      assert.ok(forward <= clearAft && up < 5.9, `among the rig at ${where}`);
    }
  }
});

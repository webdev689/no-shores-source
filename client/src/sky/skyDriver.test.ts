import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIR_EASE_S, heldLight, SkyDriver } from './skyDriver.ts';
import { lookOf } from './skyLook.ts';
import { AFTERNOON } from './skyUniform.ts';
import type { SkyLaw, SkyReading } from './skyLaw.ts';

/** A reading in an air: the sea's cloudy and wet, the desert's clear and dry. */
const readingIn = (climate: string, altitudeM: number): SkyReading => ({
  latitudeDeg: 30,
  sun: [0, 0, 1],
  moon: [0, 0, -1],
  moonPhase: 0,
  moonLit: 0,
  starTurn: 0,
  daylight: 1,
  cloud: climate === 'sea' ? 0.7 : 0.1,
  falling: climate === 'sea' ? 0.5 : 0,
  snowShare: altitudeM > 1000 ? 1 : 0,
  storm: 0,
  fog: 0,
  sand: climate === 'sea' ? 0 : 0.4,
  wind: [4, 0],
  gust: 0,
  temperatureC: 20,
  wetness: 0,
  snowCover: 0,
  steeringMS: 10,
});

const law: SkyLaw = {
  climates: ['desert', 'sea'],
  at: (x, y, altitudeM, worldS, climate) => readingIn(climate, altitudeM),
  strikes: () => [],
  seaWind: () => [4, 0],
  nightSight: (rangeM) => rangeM,
};

async function driverAt(clock: { now: number }): Promise<SkyDriver> {
  const driver = new SkyDriver(Promise.resolve(law), { write: () => undefined }, { seconds: () => clock.now });
  await Promise.resolve();
  return driver;
}

test('landing eases the weather from the sea air into the land air, never in one frame', async () => {
  const clock = { now: 1000 };
  const driver = await driverAt(clock);
  const cloudAt = (climate: string) => driver.frame([0, 0, 2], climate).reading?.cloud ?? Number.NaN;
  assert.equal(cloudAt('sea'), 0.7);
  const steps = Array.from({ length: AIR_EASE_S * 10 + 1 }, (unused, step) => {
    clock.now = 1001 + step / 10;
    return cloudAt('desert');
  });
  assert.ok(
    steps.every((cloud, step) => step === 0 || Math.abs(cloud - (steps[step - 1] ?? 0)) < 0.01),
    'no jump',
  );
  assert.ok(
    Math.abs((steps[0] ?? 0) - 0.7) < 1e-9 && steps.at(-1) === 0.1,
    'from the sea to the land, whole by the end',
  );
});

test("the weather is read at the ground under the eye, not at the camera's height", async () => {
  const driver = await driverAt({ now: 1000 });
  assert.equal(driver.frame([0, 0, 1500], 'sea', [], 0).reading?.snowShare, 0, 'a camera high over the sea');
  assert.equal(driver.frame([0, 0, 1502], 'sea', [], 1500).reading?.snowShare, 1, 'a player on a high peak');
});

test('the hands are lit as the world round them: whole by day, dark at night, warm by a torch they carry', () => {
  assert.deepEqual(heldLight(AFTERNOON, []), [1, 1, 1]);
  const night = lookOf({ ...readingIn('sea', 0), sun: [0, 0, -1], daylight: 0, cloud: 0.2, falling: 0 }, 0, 0);
  const dark = heldLight(night, []);
  assert.ok(
    dark.every((part) => part < 0.25),
    `a moonless night: ${dark}`,
  );
  const torch = { fromEye: [0, 0, -0.5] as const, reachM: 11, light: [1, 0.58, 0.26] as const };
  const lit = heldLight(night, [torch]);
  assert.ok((lit[0] ?? 0) > 0.8 && (lit[0] ?? 0) > (lit[2] ?? 0) * 1.5, `a torch at the hand lights them warm: ${lit}`);
});

test("a told sky is drawn at the story's moment under its weather and lightning, and the world's comes back after", async () => {
  const clock = { now: 1000 };
  const asked: number[] = [];
  const strike = { x: 300, y: 0, atS: 50, toGround: true, power: 1 };
  const driver = new SkyDriver(
    Promise.resolve({ ...law, at: (...args) => (asked.push(args[3]), law.at(...args)), strikes: () => [strike] }),
    { write: () => undefined },
    { seconds: () => clock.now },
  );
  await Promise.resolve();
  const weather = {
    cloud: 1,
    falling: 1,
    snowShare: 0,
    storm: 1,
    fog: 0.9,
    wind: [14, 6],
    gust: 0.9,
    wetness: 1,
    snowCover: 0,
  } as const;
  driver.told = { hourS: 10_800 + 18 * 150, worldS: 50.05, weather, strikes: [{ ...strike, atS: 50 }] };
  const told = driver.frame([0, 0, 2], 'sea');
  assert.equal(asked.at(-1), 10_800 + 18 * 150, "the story's moment, not the wall's");
  assert.deepEqual([told.reading?.storm, told.reading?.fog, told.worldS, told.strikes.length], [1, 0.9, 50.05, 1]);
  assert.ok(told.look.flash > 0.5, 'its strike lights the sky');
  driver.told = null;
  const world = driver.frame([0, 0, 2], 'sea');
  assert.deepEqual([asked.at(-1), world.reading?.storm, world.worldS], [1000, 0, 1000]);
  assert.equal(world.strikes.length, 0, "the world's lightning read afresh: the story's strike is gone");
});

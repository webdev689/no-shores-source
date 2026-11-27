import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startSkyLaw } from './skyLaw.ts';
import { DAY_S, EPOCH_UNIX_MS, WorldClock, hourOf, worldSeconds } from './worldClock.ts';
import { pinned } from '../../../server/pinnedForTests.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** The places crates/sky/src/weather_tests.rs samples, in its order. */
const PLACES: readonly (readonly [string, number])[] = [
  ['temperate-coast', 1_520_000],
  ['highland', 640_000],
  ['woodland', 860_000],
  ['desert', 2_750_000],
  ['savanna', 2_685_000],
  ['rainforest', 2_526_000],
  ['steppe', 535_000],
  ['swamp', 1_945_000],
  ['tundra', 373_000],
  ['sea', 1_500_000],
];

function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  return hash.toString(16).padStart(16, '0');
}

test('the weather agrees to the bit with the native build (weather_tests.rs holds the same fingerprint)', async () => {
  const law = await startSkyLaw(await readFile(MODULE));
  assert.deepEqual(law.climates.at(-1), 'sea');
  const numbers = PLACES.flatMap(([climate, y]) =>
    Array.from({ length: 24 }, (unused, step) => {
      const read = law.at(300_123.25 + step * 170_017.5, y, 120.5, 1_000_000.75 + step * 151, climate);
      const { cloud, falling, snowShare, storm, fog, sand, wind, gust, temperatureC } = read;
      return [cloud, falling, snowShare, storm, fog, sand, ...wind, gust, temperatureC];
    }).flat(),
  );
  assert.equal(fingerprint(numbers), pinned('sky.weather'));
});

test('noon stands half an hour after each midnight, and the sun is up then and down at midnight', async () => {
  const law = await startSkyLaw(await readFile(MODULE));
  assert.equal(hourOf(worldSeconds(EPOCH_UNIX_MS + 1_800_000)), 12);
  assert.ok(law.at(2_500_000, 1_520_000, 0, DAY_S / 2, 'temperate-coast').sun[2] > 0.8);
  assert.ok(law.at(2_500_000, 1_520_000, 0, 0, 'temperate-coast').sun[2] < -0.3);
  assert.throws(() => law.at(Number.NaN, 0, 0, 0, 'sea'), /refused/);
  assert.deepEqual(law.strikes(0, 0, 1e6, 0, 1, 'sea'), [], 'a reach past the law is no strike');
});

test('the world clock takes a room’s word at once, then eases toward later words', () => {
  let wall = EPOCH_UNIX_MS;
  const clock = new WorldClock(() => wall);
  assert.equal(clock.seconds(), 0);
  clock.heard(100);
  assert.equal(clock.seconds(), 100);
  wall += 1000;
  clock.heard(121);
  assert.ok(clock.seconds() > 101.5 && clock.seconds() < 102.5, `${clock.seconds()}`);
});

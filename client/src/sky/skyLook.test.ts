import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkyReading } from './skyLaw.ts';
import { cloudDrift, lookOf, sunLight } from './skyLook.ts';
import { AFTERNOON, skyNumbers } from './skyUniform.ts';

const luminance = (colour: readonly number[]): number =>
  0.2126 * (colour[0] ?? 0) + 0.7152 * (colour[1] ?? 0) + 0.0722 * (colour[2] ?? 0);

/** A clear, calm reading with the sun at a height (its sine) due west and the moon opposite it. */
function readingAt(sunUp: number, change: Partial<SkyReading> = {}): SkyReading {
  const level = Math.sqrt(1 - sunUp * sunUp);
  return {
    latitudeDeg: 40,
    sun: [-level, 0, sunUp],
    moon: [level, 0, -sunUp],
    moonPhase: 0.5,
    moonLit: 1,
    starTurn: 1,
    daylight: Math.min(1, Math.max(0, sunUp / 0.17)),
    cloud: 0,
    falling: 0,
    snowShare: 0,
    storm: 0,
    fog: 0,
    sand: 0,
    wind: [3, 0],
    gust: 0,
    temperatureC: 20,
    wetness: 0,
    snowCover: 0,
    steeringMS: 10,
    ...change,
  };
}

test('the low sun is golden, not a dim brown: red over green over blue, still bright a few degrees up', () => {
  const low = sunLight(0.05);
  assert.ok(low[0] > low[1] && low[1] > low[2], `${low.join()}`);
  assert.ok(luminance(low) > 0.25, `the sun 3 degrees up gives ${luminance(low)}`);
  const noon = sunLight(1);
  assert.ok(noon[2] > 0.75 && noon[0] < 1.1, 'overhead the sun is near white');
});

test('twilight is a blue sky that darkens through civil twilight into a deep blue night, never black', () => {
  const setting = lookOf(readingAt(0), 0, 0);
  const civil = lookOf(readingAt(-0.06), 0, 0);
  const night = lookOf(readingAt(-0.5, { moonLit: 0 }), 0, 0);
  assert.ok(setting.zenith[2] > setting.zenith[0] * 2, 'the zenith at sunset is blue');
  assert.ok(setting.horizon[2] >= setting.horizon[0], 'its horizon away from the glow is no maroon');
  assert.ok(luminance(civil.zenith) > 3 * luminance(night.zenith), 'civil twilight is not night');
  assert.ok(night.zenith[2] > 0.05 && night.zenith[2] > 2 * night.zenith[0], 'night is a deep blue');
});

test('a moonlit night is lit plainly enough to read the land: more than a moonless one, and by the moon', () => {
  const moonless = lookOf(readingAt(-0.5, { moonLit: 0 }), 0, 0);
  const moonlit = lookOf(readingAt(-0.5, { moon: [0.3, 0, 0.95], moonLit: 1 }), 0, 0);
  assert.equal(moonlit.key, moonlit.moon, 'the moon is the key light');
  assert.ok(luminance(moonlit.ambientSky) > 0.15, `moonlit ambient ${luminance(moonlit.ambientSky)}`);
  assert.ok(luminance(moonless.ambientSky) > 0.05, 'a moonless night still shows shapes');
  assert.ok(luminance(moonlit.keyLight) > 0.15 && moonlit.stars < moonless.stars, 'the moon washes out stars');
});

test('a storm darkens the sky and the day; noon keeps the clear afternoon the game was drawn in', () => {
  const noon = lookOf(readingAt(0.9), 0, 0);
  const storm = lookOf(readingAt(0.9, { cloud: 1, storm: 1, falling: 1 }), 0, 0);
  assert.ok(luminance(storm.zenith) < 0.5 * luminance(noon.zenith));
  assert.ok(luminance(storm.keyLight) < 0.3 * luminance(noon.keyLight));
  assert.deepEqual(noon.zenith, AFTERNOON.zenith);
  assert.ok(Math.abs(luminance(noon.ambientSky) - luminance(AFTERNOON.ambientSky)) < 0.05, 'noon ambient as drawn');
});

test('the clouds are carried only through their spell, so a steering flow that changes never sets them racing', () => {
  for (const worldS of [0, 1e5, 1e9, -3e7]) {
    const { drift, driftNext } = cloudDrift(30, worldS);
    // A spell (600 s) carries a pattern 2.4 cells at 30 m/s; the next comes from no more than that behind.
    assert.ok(drift[0] >= 0 && drift[0] <= 2.4 + 1e-9 && driftNext[0] <= 0 && driftNext[0] >= -2.4 - 1e-9, `${worldS}`);
    assert.ok([drift[1], driftNext[1]].every((cells) => Number.isInteger(cells) && cells >= 0 && cells < 1024));
  }
  // From the westerlies into the trades at one moment, the pattern moves by no more than a spell's carry.
  const [west, trades] = [cloudDrift(30, 1e9 + 100), cloudDrift(-18, 1e9 + 100)];
  assert.ok(Math.abs(west.drift[0] - trades.drift[0]) <= 48 * (0.004 / 30) * 600 + 1e-9);
  // A spell's end shows the next pattern whole, and the new spell begins from that pattern where it stood.
  const ending = cloudDrift(30, 1200 - 1e-6);
  const begun = cloudDrift(30, 1200);
  assert.ok(ending.driftFade > 0.999999 && begun.driftFade === 0);
  assert.ok(Math.abs(ending.driftNext[0] - begun.drift[0]) < 1e-6 && ending.driftNext[1] === begun.drift[1]);
  assert.equal(cloudDrift(30, 1200 + 300).driftFade, 0, "no second pattern before the spell's last quarter");
  const look = lookOf(readingAt(-0.4, { latitudeDeg: 30, moonPhase: 0.25 }), 1350, 0);
  const numbers = skyNumbers(look, []);
  assert.ok(Math.abs((numbers[11 * 4 + 2] ?? 0) - Math.PI / 6) < 1e-6, 'drift.z: the latitude, radians');
  assert.ok(Math.abs((numbers[11 * 4 + 3] ?? 0) - 0.25) < 1e-6, 'drift.w: the moon phase');
  assert.ok(Math.abs((numbers[12 * 4 + 2] ?? 0) - look.driftFade) < 1e-6, 'drift_next.z: how far the next has come');
});

test('the key light passes from the sun to a risen moon only while it is dark, so it never jumps at dusk', () => {
  // A first-quarter moon high in the east as the sun sets in the west: the case where the key once swapped early.
  const dusk = (sunUp: number) => lookOf(readingAt(sunUp, { moon: [0.6, 0, 0.6], moonLit: 0.5 }), 0, 0);
  const heights = Array.from({ length: 400 }, (unused, step) => 0.1 - step * 0.0005);
  for (const [above, below] of heights.slice(0, -1).map((height, step) => [height, heights[step + 1] ?? 0])) {
    const [before, after] = [dusk(above), dusk(below)];
    assert.ok(Math.abs(before.keyBright - after.keyBright) < 0.01, `no jump in the key's light at ${below}`);
    // The sun sets in the west and the moon stands in the east: the key's side says which it is.
    if (Math.sign(before.key[0]) !== Math.sign(after.key[0]))
      assert.ok(before.keyBright < 1e-3 && after.keyBright < 1e-3, 'it swaps in the dark');
  }
  assert.deepEqual(dusk(0.01).key.slice(0, 3), readingAt(0.01).sun, 'the sun is the key while it is up');
  assert.ok(dusk(-0.1).keyBright > 0.01, 'the moon is the key once the sun is well set');
});

test("a flash lights the ground's light from above and below and the fog alike, not the sky alone", () => {
  const night = readingAt(-0.5, { cloud: 1, storm: 1, falling: 1 });
  const [dark, lit] = [lookOf(night, 0, 0), lookOf(night, 0, 0.5)];
  const rise = (pick: (look: typeof dark) => readonly number[]) => luminance(pick(lit)) - luminance(pick(dark));
  const fromAbove = rise((look) => look.ambientSky);
  assert.ok(fromAbove > 0.05, `from above: ${fromAbove}`);
  assert.ok(rise((look) => look.ambientGround) > fromAbove * 0.6, 'what the ground throws back takes the flash too');
  assert.ok(rise((look) => look.fogColour) > 0.1, 'the air the rain hazes is lit');
});

test("in a sandstorm the light from above is the dust's: warm, and as bright as the dusty sky", () => {
  const [clear, dusty] = [lookOf(readingAt(0.6), 0, 0), lookOf(readingAt(0.6, { sand: 1 }), 0, 0)];
  const warmth = (colour: readonly number[]) => (colour[0] ?? 0) / Math.max(1e-6, colour[2] ?? 0);
  assert.ok(warmth(dusty.ambientSky) > warmth(clear.ambientSky) * 1.3, `${dusty.ambientSky.join()}`);
  assert.ok(warmth(dusty.ambientSky) > 1, 'more red than blue');
});

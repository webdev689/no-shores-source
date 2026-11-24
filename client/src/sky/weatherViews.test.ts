import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boltPath, boltsInto, LOWEST_BASE_OVER_GROUND_M, MOST_SEGMENTS, throughAir, underWeatherM } from './bolts.ts';
import { carriedOn, FALL_BOX_M, fallingOf, LONGEST_FALL_STEP_S } from './fall.ts';
import { AFTERNOON } from './skyUniform.ts';

const strike = { x: 1000, y: 2000, atS: 50.25, toGround: true, power: 0.8 };

test('a bolt to the ground runs from the cloud base to the strike, and every browser draws it alike', () => {
  const path = boltPath(strike, 900, 12);
  assert.deepEqual(path, boltPath(strike, 900, 12), 'the same strike makes the same bolt');
  const main = path.filter(([, , brightness]) => brightness === 1);
  assert.equal(main[0]?.[0][2], 900, 'it leaves the cloud base');
  assert.deepEqual(main.at(-1)?.[1], [1000, 2000, 12], 'it lands where the strike fell');
  assert.ok(
    path.some(([, , brightness]) => brightness < 1),
    'it has branches',
  );
  assert.notDeepEqual(boltPath({ ...strike, atS: 51 }, 900, 12), path, 'another strike makes another bolt');
});

test('a bolt in the cloud runs across just under the base and never reaches the ground', () => {
  for (const atS of [50.25, 51, 52.5, 60, 75.125]) {
    const path = boltPath({ ...strike, atS, toGround: false }, 900, 12);
    assert.ok(path.every(([from, to]) => Math.max(from[2], to[2]) < 900 && Math.min(from[2], to[2]) > 700));
  }
});

test('a hill that rises into the deck still takes its bolt from above, running down to it', () => {
  const path = boltPath(strike, 150, 400);
  const main = path.filter(([, , brightness]) => brightness === 1);
  assert.equal(main[0]?.[0][2], 400 + LOWEST_BASE_OVER_GROUND_M, 'the base stands over the hill');
  assert.equal(main.at(-1)?.[1][2], 400, 'it lands on the hill');
  assert.ok(
    path.every(([from, to]) => from[2] >= 400 && to[2] >= 400),
    'nothing runs under the ground',
  );
  const inCloud = boltPath({ ...strike, toGround: false }, 150, 400);
  assert.ok(
    inCloud.every(([from, to]) => from[2] > 400 && to[2] > 400),
    'a strike in the cloud stays over the hill',
  );
});

/** The ends of every segment written, as points from the eye. */
function endsOf(into: Float32Array, floats: number): number[][] {
  const ends: number[][] = [];
  for (let first = 0; first < floats; first += 8) {
    ends.push([...into.slice(first, first + 3)], [...into.slice(first + 4, first + 7)]);
  }
  return ends;
}

test('a bolt ends on the ground under its own strike, or on the sea, wherever the eye stands', () => {
  const into = new Float32Array(MOST_SEGMENTS * 8);
  const eye = [0, 0, 302] as const;
  const groundAt = (x: number, y: number) => (x === 0 && y === 0 ? 300 : x === 1000 ? -40 : 120);
  const flashing = {
    worldS: strike.atS + 0.01,
    baseM: 900,
    groundAt,
    air: { clearM: 25_000, fogDensity: 0, topM: 900 },
  };
  const overSea = endsOf(into, boltsInto(into, eye, { ...flashing, list: [strike] }));
  assert.ok(overSea.length > 0, 'a strike flashing near the eye is drawn');
  assert.ok(
    overSea.some(([east, south, up]) => east === 1000 && south === 2000 && up === -302),
    'it lands on the sea',
  );
  assert.ok(
    overSea.every(([, , up]) => (up ?? 0) >= -302),
    'nothing runs under the sea',
  );
  const onLand = endsOf(into, boltsInto(into, eye, { ...flashing, list: [{ ...strike, x: 3000 }] }));
  assert.ok(
    onLand.some(([east, , up]) => east === 3000 && up === 120 - 302),
    'it lands on the land under it',
  );
  const unknown = endsOf(into, boltsInto(into, eye, { ...flashing, groundAt: () => null, list: [strike] }));
  assert.ok(
    unknown.some(([, , up]) => up === -302),
    'where no land is known it lands on the sea',
  );
  const many = Array.from({ length: 40 }, (_unused, which) => ({ ...strike, x: 1000 + which * 10 }));
  assert.ok(boltsInto(into, eye, { ...flashing, list: many }) <= into.length, 'it writes no more than fits');
});

test("a bolt fades into the weather's haze as the sea under it does: its foot most, its top less", () => {
  const eyeHigh = 30;
  const [foot, top] = [
    [2000, 0, -eyeHigh],
    [2000, 0, 800 - eyeHigh],
  ] as const;
  const rain = (point: readonly [number, number, number]) =>
    throughAir(eyeHigh, point, { clearM: 20_000, fogDensity: 0.0012, topM: 900 });
  assert.ok(rain(foot) < 0.1, `the foot 2 km off through heavy rain: ${rain(foot)}`);
  assert.ok(rain(top) > rain(foot) * 3, 'the top, in thinner air, shows more');
  assert.ok(throughAir(eyeHigh, foot, { clearM: 25_000, fogDensity: 0, topM: 900 }) > 0.9, 'clear air barely dims it');
  // Drawn, a far bolt in heavy rain keeps its top's light and loses its foot's: it is far brighter than the haze.
  const into = new Float32Array(MOST_SEGMENTS * 8);
  const far = { ...strike, x: 2000, y: 0 };
  const flashing = { worldS: strike.atS + 0.01, baseM: 900, groundAt: () => 0, list: [far] };
  const lights = (fogDensity: number) => {
    const floats = boltsInto(into, [0, 0, eyeHigh], { ...flashing, air: { clearM: 20_000, fogDensity, topM: 900 } });
    return Array.from({ length: floats / 8 }, (unused, segment) => into[segment * 8 + 3] ?? 0);
  };
  const [clear, rainy] = [lights(0), lights(0.0012)];
  const kept = (segment: number) => (rainy[segment] ?? 0) / (clear[segment] ?? 1);
  assert.ok(kept(0) > 0.1, `the top still shows: ${kept(0)} of its light`);
  assert.ok(kept(27) < 0.05, `the foot fades into the grey: ${kept(27)} of its light`);
  assert.ok(kept(0) > kept(27) * 5, 'the top keeps far more than the foot');
});

test("the weather's fog lies along a whole line of sight under the deck, and only along its part under it from far over", () => {
  const [deck, rain] = [400, 0.0012];
  // Under the deck, as on foot and at the helm, all of a line is in the rain however far it runs or climbs.
  assert.equal(underWeatherM(30, 0, 5_000, deck), 5_000);
  assert.equal(underWeatherM(340, 900, 2_000, deck), 2_000);
  // From the Overworld's view over an island, 20 km up and looking 52 degrees down, only the last 400 m of height.
  const [high, down] = [20_000, (52 * Math.PI) / 180];
  const line = high / Math.sin(down);
  assert.ok(Math.abs(underWeatherM(high, 0, line, deck) - deck / Math.sin(down)) < 1e-6);
  const land = (topM: number) =>
    throughAir(high, [0, high / Math.tan(down), -high], { clearM: 1e6, fogDensity: rain, topM });
  assert.ok(land(deck) > 0.4, `the land shows through heavy rain from over the deck: ${land(deck)}`);
  assert.ok(land(1e9) < 1e-6, `with the rain charged along the whole line it was lost: ${land(1e9)}`);
  // Rising through the deck the share eases over, so the view never jumps.
  const shares = [deck * 0.99, deck * 1.25, deck * 1.5, deck * 1.75, deck * 2.01].map(
    (eye) => underWeatherM(eye, 0, 10_000, deck) / 10_000,
  );
  assert.equal(shares[0], 1);
  for (const [index, share] of shares.slice(1).entries()) assert.ok(share < (shares[index] ?? 0), `${shares}`);
  assert.ok(Math.abs((shares[4] ?? 0) - deck / (deck * 2.01)) < 1e-9, 'past twice the deck, only the part under it');
});

const RAIN = { box: [FALL_BOX_M, FALL_BOX_M, FALL_BOX_M], frame: 1 / 60 } as const;
/** How far a part moved from `before` to `after` in a box `side` wide, the shorter way round. */
const movedBy = (before: number, after: number, side: number) => ((after - before + side * 1.5) % side) - side / 2;

test("the fall's running offset stays in its box and moves on smoothly across its wrap, however long it runs", () => {
  let offset: [number, number, number] = [23.9, 0.05, 0.1];
  let [wrapped, frames] = [0, 0];
  // An hour of a wind that turns and steps, as it does from the sea's air to an island's.
  for (let time = 0; time < 3600; time += RAIN.frame, frames++) {
    const wind = (frames % 3000 < 1500 ? 6 : 14) * Math.sin(time / 40);
    const velocity = [wind * 0.55, -wind * 0.3, -9] as const;
    const next = carriedOn(offset, velocity, RAIN.frame, RAIN.box);
    next.forEach((part, axis) => {
      assert.ok(part >= 0 && part < (RAIN.box[axis] ?? 0), 'it stays in its box');
      const step = movedBy(offset[axis] ?? 0, part, RAIN.box[axis] ?? 0);
      assert.ok(Math.abs(step - (velocity[axis] ?? 0) * RAIN.frame) < 1e-9, 'it moves by the frame motion only');
      if (Math.abs(part - (offset[axis] ?? 0)) > FALL_BOX_M / 2) wrapped++;
    });
    offset = next;
  }
  assert.ok(wrapped > 100, 'it wrapped often on the way');
});

test('a change of wind changes how fast the fall moves, never where it stands', () => {
  let offset: [number, number, number] = [0, 0, 0];
  for (let frame = 0; frame < 36_000; frame++) offset = carriedOn(offset, [3.3, 0, -9], RAIN.frame, RAIN.box);
  const gusted = carriedOn(offset, [11, 4, -9], RAIN.frame, RAIN.box);
  assert.ok(Math.abs(movedBy(offset[0], gusted[0], FALL_BOX_M) - 11 / 60) < 1e-9, 'after ten minutes a gust moves it');
  assert.ok(Math.abs(movedBy(offset[1], gusted[1], FALL_BOX_M) - 4 / 60) < 1e-9, 'by one frame of the new wind');
});

test('a long frame, a hidden tab or a clock set back never jumps the fall', () => {
  const offset = [5, 5, 5] as const;
  const velocity = [10, 0, -9] as const;
  assert.deepEqual(
    carriedOn(offset, velocity, 40, RAIN.box),
    carriedOn(offset, velocity, LONGEST_FALL_STEP_S, RAIN.box),
  );
  assert.deepEqual(carriedOn(offset, velocity, -3, RAIN.box), [5, 5, 5]);
  assert.deepEqual(carriedOn(offset, velocity, Number.NaN, RAIN.box), [5, 5, 5]);
});

test('the fall is shared between rain and snow by the snow share, and sand comes on its own', () => {
  const falling = fallingOf({ ...AFTERNOON, falling: 0.8, snowShare: 0.25, sand: 0.4 });
  assert.ok(Math.abs(falling.rain - 0.6) < 1e-9 && Math.abs(falling.snow - 0.2) < 1e-9 && falling.sand === 0.4);
});

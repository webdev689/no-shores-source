import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { FIRE_FRAMES_PER_SECOND, type Fire, fireFrame, fireParts, GLOW_REACH, inSmoke } from './flameParts.ts';
import { farFire, fireLit, MOST_PARTS, packFires } from './flames.ts';
import { flicker } from '../sky/flicker.ts';
import { PART, PART_KINDS } from './flamesShader.ts';

const FIRE: Fire = { at: [10, 20, 3], sizeM: 1, seed: 4 };
const CALM = [0, 0] as const;
const FRAME_S = 1 / FIRE_FRAMES_PER_SECOND;

test('a fire burns the same from the same seed and otherwise from another', () => {
  assert.deepEqual(fireParts(FIRE, 2.5, CALM), fireParts(FIRE, 2.5, CALM));
  assert.notDeepEqual(fireParts(FIRE, 2.5, CALM), fireParts({ ...FIRE, seed: 5 }, 2.5, CALM));
});

test('it flickers in held frames, as a sprite does: still within a frame, moving from one to the next', () => {
  const moments = [...Array(60).keys()].map((step) => 2 + step / 120);
  for (const [index, moment] of moments.slice(1).entries()) {
    const before = moments[index] ?? 0;
    const same = fireFrame(FIRE, before) === fireFrame(FIRE, moment);
    assert.equal(same, isDeepStrictEqual(fireParts(FIRE, before, CALM), fireParts(FIRE, moment, CALM)), `${moment}`);
  }
  assert.equal(fireFrame(FIRE, 2.5) - fireFrame(FIRE, 2), FIRE_FRAMES_PER_SECOND / 2);
  const startsOf = (seed: number) =>
    moments.find((moment) => fireFrame({ ...FIRE, seed }, moment) > fireFrame({ ...FIRE, seed }, 2));
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(startsOf)).size > 1, 'fires flicker out of step');
});

test('its tongues flicker: their height wanders within a band, never still and never gone', () => {
  const tallest = [...Array(80).keys()].map((frame) =>
    Math.max(...fireParts(FIRE, frame * FRAME_S, CALM).tongues.map((tongue) => tongue.height)),
  );
  assert.ok(
    Math.min(...tallest) > 0.5 && Math.max(...tallest) <= 1.6,
    `${Math.min(...tallest)} ${Math.max(...tallest)}`,
  );
  assert.ok(Math.max(...tallest) - Math.min(...tallest) > 0.15, 'flickers');
  const steps = tallest.slice(1).map((height, index) => Math.abs(height - (tallest[index] ?? height)));
  assert.ok(Math.max(...steps) < 0.25, 'licks rather than jumps');
});

test('its tongues sway: their lean wanders from frame to frame even in a calm', () => {
  const leans = [...Array(40).keys()].map((frame) => fireParts(FIRE, frame * FRAME_S, CALM).tongues[0]?.lean[0] ?? 0);
  assert.ok(Math.max(...leans) - Math.min(...leans) > 0.05);
  assert.ok(leans.every((lean) => Math.abs(lean) <= 0.2));
});

test('wisps tear from the tips of the flames, rise above them and fade as they go', () => {
  const parts = fireParts(FIRE, 1.7, CALM);
  const tallest = Math.max(...parts.tongues.map((tongue) => tongue.height));
  assert.ok(parts.wisps.length >= parts.tongues.length);
  assert.ok(parts.wisps.some((wisp) => wisp.position[2] > FIRE.at[2] + tallest));
  const highest = parts.wisps.reduce((most, wisp) => (wisp.position[2] > most.position[2] ? wisp : most));
  const lowest = parts.wisps.reduce((least, wisp) => (wisp.position[2] < least.position[2] ? wisp : least));
  assert.ok(highest.heat < lowest.heat && highest.radius < lowest.radius);
});

test('its size scales every part, from half a metre to four', () => {
  const small = fireParts({ ...FIRE, sizeM: 0.5 }, 1, CALM);
  const large = fireParts({ ...FIRE, sizeM: 4 }, 1, CALM);
  const height = (parts: typeof small) => Math.max(...parts.tongues.map((tongue) => tongue.height));
  assert.ok(Math.abs(height(large) / height(small) - 8) < 1e-9);
  const widest = (parts: typeof small) => Math.max(...parts.smoke.map((puff) => puff.radius));
  assert.ok(widest(large) > widest(small) * 6);
  assert.ok(large.embers.length > small.embers.length, 'a great fire throws more sparks');
});

test('smoke rises over the fire in a column that widens, thins and leans with the wind', () => {
  const calm = fireParts(FIRE, 3, CALM).smoke;
  for (const puff of calm) {
    assert.ok(puff.position[2] >= FIRE.at[2]);
    assert.ok(Math.hypot(puff.position[0] - FIRE.at[0], puff.position[1] - FIRE.at[1]) < 1.5);
  }
  const oldest = calm.reduce((most, puff) => (puff.age > most.age ? puff : most));
  const youngest = calm.reduce((least, puff) => (puff.age < least.age ? puff : least));
  assert.ok(oldest.position[2] > youngest.position[2] && oldest.radius > youngest.radius);
  const blown = fireParts(FIRE, 3, [6, 0]).smoke;
  const meanEast = (puffs: typeof calm) => puffs.reduce((sum, puff) => sum + puff.position[0], 0) / puffs.length;
  assert.ok(meanEast(blown) > meanEast(calm) + 2, 'leans east in a wind from the west');
});

test('smoke is lit by the flames only while it is low over them', () => {
  const smoke = fireParts(FIRE, 3, CALM).smoke;
  for (const puff of smoke) assert.ok(puff.age < 0.28 ? puff.warmth > 0 : puff.warmth === 0);
  assert.ok(smoke.some((puff) => puff.warmth > 0.5));
});

test('embers swirl up in the heat, drift with the wind and burn out', () => {
  const embers = fireParts(FIRE, 1.3, CALM).embers;
  assert.ok(embers.length >= 24, 'many sparks');
  for (const ember of embers) {
    assert.ok(ember.position[2] >= FIRE.at[2] && ember.position[2] <= FIRE.at[2] + 4.5);
    assert.ok(ember.brightness >= 0 && ember.brightness <= 1);
    assert.ok(ember.texels === 1 || ember.texels === 2);
  }
  const meanEast = (wind: readonly [number, number]) =>
    fireParts(FIRE, 1.3, wind).embers.reduce((sum, ember) => sum + ember.position[0], 0) / embers.length;
  assert.ok(meanEast([5, 0]) > meanEast(CALM) + 1);
});

test("a small fire's embers climb no further for its size than a half-metre fire's", () => {
  const climb = (sizeM: number) =>
    Math.max(
      ...[...Array(40).keys()].flatMap((frame) =>
        fireParts({ ...FIRE, sizeM }, frame * FRAME_S, CALM).embers.map((ember) => ember.position[2] - FIRE.at[2]),
      ),
    ) / sizeM;
  const full = climb(0.5);
  for (const sizeM of [0.09, 0.27, 0.3]) assert.ok(climb(sizeM) <= full, `${sizeM}: ${climb(sizeM)} over ${full}`);
});

test('a flame behind glass keeps its smoke and embers in, its flames and light still burning', () => {
  const glassed = fireParts({ ...FIRE, sizeM: 0.3, glassed: true }, 1.3, CALM);
  const open = fireParts({ ...FIRE, sizeM: 0.3 }, 1.3, CALM);
  assert.deepEqual([glassed.smoke.length, glassed.embers.length], [0, 0]);
  assert.deepEqual([glassed.tongues, glassed.wisps, glassed.glows], [open.tongues, open.wisps, open.glows]);
});

test('a round fire throws its light from its middle, three times its height round', () => {
  const parts = fireParts(FIRE, 2, CALM);
  assert.equal(parts.glows.length, 1);
  assert.deepEqual(parts.glows[0]?.position, [10, 20, 3.5]);
  assert.equal(parts.glows[0]?.reach, GLOW_REACH);
  const strengths = [...Array(40).keys()].map(
    (frame) => fireParts(FIRE, frame * FRAME_S, CALM).glows[0]?.strength ?? 0,
  );
  assert.ok(
    strengths.every((strength) => strength > 0.5 && strength <= 1),
    'never out, never past full',
  );
  assert.ok(new Set(strengths).size > 10, 'flickers with the flames');
});

test('a fire along an edge spreads its flames, smoke, sparks and light from end to end', () => {
  const along = [6, 0, 0] as const;
  const line = fireParts({ ...FIRE, along }, 2, CALM);
  const round = fireParts(FIRE, 2, CALM);
  assert.ok(line.tongues.length > round.tongues.length * 3);
  const spans = (points: readonly { position: readonly number[] }[]) => {
    const easts = points.map((point) => point.position[0] ?? 0);
    return [Math.min(...easts), Math.max(...easts)];
  };
  for (const kind of [line.tongues, line.embers, line.glows]) {
    const [west = 0, east = 0] = spans(kind);
    assert.ok(west < FIRE.at[0] + 0.8 && east > FIRE.at[0] + 5.2, `${west} ${east}`);
  }
  const [, smokeEast = 0] = spans(line.smoke);
  assert.ok(smokeEast > FIRE.at[0] + 4);
  const glowEasts = line.glows.map((glow) => glow.position[0]).sort((first, second) => first - second);
  glowEasts.slice(1).forEach((east, index) => assert.ok(east - (glowEasts[index] ?? 0) <= GLOW_REACH + 1e-9));
});

test('however long the burning edge, a fire takes a bounded number of parts', () => {
  const count = (parts: ReturnType<typeof fireParts>) =>
    parts.tongues.length + parts.wisps.length + parts.smoke.length + parts.embers.length + parts.glows.length;
  const long = count(fireParts({ ...FIRE, sizeM: 4, along: [30, 0, 0] }, 1, CALM));
  const longer = count(fireParts({ ...FIRE, sizeM: 4, along: [300, 0, 0] }, 1, CALM));
  assert.ok(long <= longer && longer < MOST_PARTS / 40, `${long} ${longer}`);
});

test('forty fires, some along edges, are worked out and packed within about a millisecond a frame', () => {
  const fires: Fire[] = Array.from({ length: 40 }, (_slot, index) => ({
    at: [index * 3, 0, 2],
    sizeM: 0.5 + (index % 8) * 0.45,
    seed: index + 1,
    ...(index % 4 === 0 ? { along: [4, 1, 0] as const } : {}),
  }));
  const into = new Float32Array(MOST_PARTS * 12);
  for (let frame = 0; frame < 30; frame++) packFires(fires, frame / 60, [3, 1], [0, -20, 10], into);
  const started = performance.now();
  let written = { shown: 0, glows: 0 };
  for (let frame = 0; frame < 120; frame++) written = packFires(fires, frame / 60, [3, 1], [0, -20, 10], into);
  const each = (performance.now() - started) / 120;
  assert.ok(written.shown + written.glows <= MOST_PARTS && written.glows >= 40);
  // Bound loosely, as a test machine is slower and busier than a player's; the measured time is in the note.
  assert.ok(each < 4, `${each.toFixed(2)} ms a frame`);
});

test('packed parts never pass the buffer, and every fire keeps its glow', () => {
  const fires: Fire[] = Array.from({ length: 30 }, (_slot, index) => ({ ...FIRE, sizeM: 4, seed: index }));
  const into = new Float32Array(200 * 12);
  const written = packFires(fires, 1, CALM, [0, 0, 0], into);
  assert.equal(written.glows, 30);
  assert.equal(written.shown + written.glows, 200);
});

/** The hue of a colour, degrees: 0 red, 30 orange, 60 yellow, 90 lime. */
const hueOf = ([red, green, blue]: readonly number[]) => {
  const [high, low] = [Math.max(red ?? 0, green ?? 0, blue ?? 0), Math.min(red ?? 0, green ?? 0, blue ?? 0)];
  return high === low ? 0 : (60 * ((green ?? 0) - (blue ?? 0))) / (high - low);
};

test("a fire's light warms the planks round it orange, never yellow-green, however bright they stand", () => {
  // Planks as the wreck draws them by a fire, from its pictures: deep, lit and lit to full red.
  for (const plank of [
    [0.5, 0.25, 0.04],
    [0.94, 0.36, 0.05],
    [1, 0.38, 0.05],
    [0.84, 0.5, 0.04],
  ])
    for (const strength of [0.6, 1, 1.4]) {
      const lit = fireLit(plank, strength, 0);
      assert.ok(hueOf(lit) <= 42, `${plank} lit ${lit.map((value) => value.toFixed(2))}: hue ${hueOf(lit).toFixed(0)}`);
      assert.ok((lit[0] ?? 0) >= (plank[0] ?? 0) && (lit[1] ?? 0) >= (plank[1] ?? 0), 'lit, not darkened');
    }
});

test("a fire's light falls off softly to nothing at its reach, never in a step", () => {
  const plank = [0.6, 0.28, 0.04];
  assert.deepEqual(fireLit(plank, 1, 1), plank, 'none at its reach');
  let before = fireLit(plank, 1, 0);
  for (let near = 0.01; near <= 1.0001; near += 0.01) {
    const now = fireLit(plank, 1, near);
    const step = Math.max(...now.map((value, channel) => Math.abs(value - (before[channel] ?? 0))));
    assert.ok(step < 0.012, `a step of ${step.toFixed(3)} at ${near.toFixed(2)} of its reach`);
    assert.ok(
      now.every((value, channel) => value <= (before[channel] ?? 0) + 1e-9),
      'falling as it goes out',
    );
    before = now;
  }
});

test('a packed fire gives each part its kind, its place from the eye and its size, and keeps them for the frame', () => {
  const fire: Fire = { ...FIRE, seed: 9 };
  const into = new Float32Array(4096 * 12);
  const parts = fireParts(fire, 2, CALM);
  const written = packFires([fire], 2, CALM, [1, 2, 3], into);
  const kinds = [...Array(written.shown + written.glows).keys()].map((slot) => (into[slot * 12 + 3] ?? 0) % PART_KINDS);
  const count = (kind: number) => kinds.filter((each) => each === kind).length;
  assert.equal(count(PART.smoke), parts.smoke.length);
  assert.equal(count(PART.tongue), parts.tongues.length);
  assert.equal(count(PART.wisp), parts.wisps.length);
  assert.equal(count(PART.ember), parts.embers.length);
  assert.equal(count(PART.glow), parts.glows.length);
  const glow = written.shown * 12;
  const middle = parts.glows[0]?.position ?? [0, 0, 0];
  assert.deepEqual([...into.subarray(glow, glow + 3)], [middle[0] - 1, middle[1] - 2, middle[2] - 3]);
  assert.equal(into[glow + 4], GLOW_REACH);
  const firstTongue = kinds.indexOf(PART.tongue) * 12;
  const tallest = Math.max(...parts.tongues.map((tongue) => tongue.height));
  assert.ok((into[firstTongue + 5] ?? 0) > 0 && (into[firstTongue + 5] ?? 0) <= tallest + 1e-6);
  const before = Float32Array.from(into.subarray(0, written.shown * 12));
  packFires([fire], 2.001, CALM, [1, 2, 3], into);
  assert.deepEqual(into.subarray(0, written.shown * 12), before, 'the same frame packs the same');
  packFires([fire], 2.001, CALM, [0, 2, 3], into);
  assert.ok(Math.abs((into[0] ?? 0) - ((before[0] ?? 0) + 1)) < 1e-4, 'measured from the eye where it stands now');
});

test('a fire lit from any seed, even a negative or broken one, packs parts of known kinds', () => {
  const into = new Float32Array(2048 * 12);
  const written = packFires([{ ...FIRE, seed: -7.5 }], 1, CALM, [0, 0, 0], into);
  for (let slot = 0; slot < written.shown + written.glows; slot++)
    assert.ok(Object.values(PART).includes(((into[slot * 12 + 3] ?? -1) % PART_KINDS) as 0));
});

test('its smoke column holds every puff it rolls up, for any wind, and nothing well clear of it', () => {
  const fires: Fire[] = [
    { at: [2, -3, 1], sizeM: 1.5, seed: 4 },
    { at: [0, 0, 0], sizeM: 3, seed: 9, along: [4, 1, 0.5] },
  ];
  for (const fire of fires)
    for (const wind of [
      [0, 0],
      [3, -2],
      [-6, 1],
    ] as const)
      for (let seconds = 0; seconds < 9; seconds += 0.25)
        for (const puff of fireParts(fire, seconds, wind).smoke)
          assert.ok(
            inSmoke(fire, wind, puff.position, 0),
            `a puff at ${puff.position.map((value) => value.toFixed(2))}`,
          );
  const [round] = fires;
  assert.ok(round && !inSmoke(round, [0, 0], [round.at[0] + 6, round.at[1], round.at[2] + 3], 1), 'well beside it');
  assert.ok(round && !inSmoke(round, [0, 0], [round.at[0], round.at[1], round.at[2] - 2], 0), 'under the fire');
});

test('a fire flickers with the light it casts: its glow and its core flame burn as `flicker` does for its seed', () => {
  for (let frame = 0; frame < 30; frame++) {
    const seconds = frame * FRAME_S + 0.03;
    const parts = fireParts(FIRE, seconds, CALM);
    assert.equal(parts.glows[0]?.strength, flicker(FIRE.seed, seconds));
    const burning = (flicker(FIRE.seed, seconds) - 0.8) / 0.2;
    assert.ok(Math.abs((parts.tongues[0]?.height ?? 0) - FIRE.sizeM * (0.55 + 0.45 * burning)) < 1e-9);
  }
});

test("a torch's or a candle's small fire takes fewer parts; from half a metre up a fire takes them all", () => {
  const count = (sizeM: number) => {
    const parts = fireParts({ ...FIRE, sizeM }, 2, CALM);
    return [parts.tongues.length, parts.smoke.length, parts.embers.length];
  };
  const [full, torch, candle] = [count(0.5), count(0.27), count(0.09)];
  assert.deepEqual(count(1).slice(0, 2), full.slice(0, 2));
  full.forEach((parts, kind) => {
    assert.ok((torch[kind] ?? 0) < parts && (candle[kind] ?? 0) <= (torch[kind] ?? 0));
    assert.ok((candle[kind] ?? 0) >= 1, 'at least one of each');
  });
});

test('past where its tongues read a fire is its glow alone, flickering as near', () => {
  const torch: Fire = { at: [0, 0, 2], sizeM: 0.27, seed: 3 };
  const into = new Float32Array(1024 * 12);
  assert.ok(!farFire(torch, [10, 0, 2]) && farFire(torch, [40, 0, 2]));
  const near = packFires([torch], 2, CALM, [10, 0, 2], into);
  assert.ok(near.shown > 0 && near.glows === 1);
  const far = packFires([torch], 2, CALM, [40, 0, 2], into);
  assert.deepEqual(far, { shown: 0, glows: 1 });
  assert.ok(Math.abs((into[11] ?? 0) - (fireParts(torch, 2, CALM).glows[0]?.strength ?? -1)) < 1e-6);
});

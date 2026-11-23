import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HULL_FIT, type HullMask, TRACK } from './hullMask.ts';
import { type Track, trackOf, WAKE, WakeTracks, wakeAt, wakeBounds } from './wakes.ts';

/** A Sloop heading north under way: its bow at y = -9, its stern at y = 9; starboard is east. */
const SLOOP: HullMask = { x: 0, y: 0, heading: 0, halfLength: 9, halfBeam: 2.8, way: 4 };
const stern = SLOOP.halfLength * HULL_FIT;
const beam = SLOOP.halfBeam * HULL_FIT;

/** Across its track (east), where its wake's arm is `aft` metres behind its stern. */
const armAt = (aft: number) => beam + aft * WAKE.armTan;

test("its wake's arms open 19.5 degrees either side of its track, as foam and a small wave", () => {
  assert.ok(Math.abs(WAKE.armTan - Math.tan((19.5 * Math.PI) / 180)) < 1e-15);
  for (const aft of [20, 60, 120]) {
    const onArm = wakeAt(SLOOP, [armAt(aft), stern + aft]);
    const port = wakeAt(SLOOP, [-armAt(aft), stern + aft]);
    const off = wakeAt(SLOOP, [armAt(aft) + 8, stern + aft]);
    assert.ok(onArm.foam > 0.3 && onArm.height > 0.05, `on the arm ${aft} m aft: ${JSON.stringify(onArm)}`);
    assert.ok(Math.abs(port.foam - onArm.foam) < 1e-12, 'both arms alike');
    assert.ok(off.foam < onArm.foam * 0.3 && off.height < onArm.height * 0.2, 'outside the V the sea lies still');
  }
  assert.ok(wakeAt(SLOOP, [beam * 0.5, stern + 5]).foam > 0.5, 'its track churns white close aft');
});

test('its wake runs a minute of its way aft and fades, and grows with its drawn size', () => {
  const aft = (seconds: number) => SLOOP.way * seconds;
  const young = wakeAt(SLOOP, [armAt(aft(10)), stern + aft(10)]);
  const old = wakeAt(SLOOP, [armAt(aft(45)), stern + aft(45)]);
  const gone = wakeAt(SLOOP, [armAt(aft(70)), stern + aft(70)]);
  assert.ok(young.foam > old.foam && old.foam > 0 && gone.foam === 0, `${young.foam} ${old.foam} ${gone.foam}`);
  assert.equal(wakeAt({ ...SLOOP, way: 0 }, [armAt(20), stern + 20]).foam, 0, 'at rest, none');
  // Drawn four times its size, as the raised view draws it, its wake is four times as long and wide.
  const big: HullMask = { ...SLOOP, halfLength: 36, halfBeam: 11.2, scale: 4 };
  const bigStern = 36 * HULL_FIT;
  const bigArm = (behind: number) => 11.2 * HULL_FIT + behind * WAKE.armTan;
  const far = wakeAt(big, [bigArm(4 * aft(45)), bigStern + 4 * aft(45)]);
  assert.ok(Math.abs(far.foam - old.foam) < 0.15, `the same share of its minute: ${far.foam} ${old.foam}`);
  assert.ok(far.height > old.height * 3, 'its wave as high as it is large');
});

test('its bow throws a bow wave and spray', () => {
  const bowWave = wakeAt(SLOOP, [4 * WAKE.armTan * 1.6, -stern + 4]);
  assert.ok(bowWave.foam > 0.3 && bowWave.height > 0.1, JSON.stringify(bowWave));
  const still = wakeAt(SLOOP, [beam * 0.8, -stern]).foam;
  const sprayed = wakeAt({ ...SLOOP, spray: 1 }, [beam * 0.8, -stern]).foam;
  assert.ok(sprayed > still + 0.4, `${sprayed} ${still}`);
});

/** A Sloop that sails `straightM` north to the origin, then turns `degrees` to starboard round a circle of `radiusM`,
 *  half a metre a frame, the water keeping its track; where it ends, and its track there. */
function sailed(straightM: number, radiusM: number, degrees: number): { mask: HullMask; track: Track } {
  const tracks = new WakeTracks();
  let last: { mask: HullMask; track: Track } | null = null;
  const lie = (x: number, y: number, heading: number) => {
    const mask: HullMask = { ...SLOOP, id: 'own', x, y, heading };
    last = { mask, track: tracks.tracks([mask], [0, 0])[0] ?? trackOf(mask) };
  };
  for (let gone = 0; gone <= straightM; gone += 0.5) lie(0, straightM - gone, 0);
  const turned = (degrees * Math.PI) / 180;
  for (let angle = 0; angle <= turned + 1e-9; angle += 0.5 / radiusM) {
    lie(radiusM - radiusM * Math.cos(angle), -radiusM * Math.sin(angle), angle);
  }
  if (!last) throw new Error('it never sailed');
  return last;
}

test('a ship sailing straight leaves the wake it always did', () => {
  const { mask, track } = sailed(400, 30, 0);
  const straight = trackOf(mask);
  for (const [index, value] of track.entries()) {
    assert.ok(Math.abs(value - (straight[index] ?? 0)) < 0.05, `track[${index}] ${value} ${straight[index]}`);
  }
  for (const point of [
    [armAt(20), stern + 20],
    [beam * 0.5, stern + 5],
    [armAt(120), stern + 120],
  ] as const) {
    const [kept, before] = [wakeAt(mask, point, track), wakeAt(mask, point)];
    assert.ok(Math.abs(kept.foam - before.foam) < 1e-3 && Math.abs(kept.height - before.height) < 1e-4);
  }
});

test('its wake follows the way it turned, not straight aft of where it heads now', () => {
  const { mask, track } = sailed(400, 30, 90);
  // Heading east now; 60 degrees back round the turn it passed (4, -15), 15 m off a line straight aft of it.
  const passed = [30 - 30 * Math.cos(Math.PI / 6), -30 * Math.sin(Math.PI / 6)] as const;
  assert.ok(wakeAt(mask, passed, track).foam > 0.5, `its track churns white where it sailed`);
  assert.ok(wakeAt(mask, passed).foam < 0.05, 'a wake laid straight aft leaves it untouched');
  // Its arms open either side of the track it sailed, as on a straight course: out from the turn's middle and in.
  const aft = 30 * (Math.PI / 3) - stern;
  const out = [(passed[0] - 30) / 30, passed[1] / 30] as const;
  for (const side of [1, -1]) {
    const onArm = [passed[0] + out[0] * armAt(aft) * side, passed[1] + out[1] * armAt(aft) * side] as const;
    const height = wakeAt(mask, onArm, track).height;
    assert.ok(
      height > 0.05,
      `its arm ${armAt(aft).toFixed(1)} m ${side > 0 ? 'outside' : 'inside'} its turn: ${height}`,
    );
  }
});

test('carried, not sailed, its track begins again', () => {
  const tracks = new WakeTracks();
  const mask: HullMask = { ...SLOOP, id: 'own' };
  for (let gone = 0; gone < 100; gone += 0.5) tracks.tracks([{ ...mask, x: gone, heading: Math.PI / 2 }], [0, 0]);
  const moved: HullMask = { ...mask, x: 5000, y: 0 };
  const [track] = tracks.tracks([moved], [0, 0]);
  assert.deepEqual(Array.from(track ?? []), Array.from(trackOf(moved)), 'straight aft of where it stands now');
  // Its window moving under it is no carrying: its track holds in the world.
  const [still, shifting] = [new WakeTracks(), new WakeTracks()];
  let [one, other]: (Track | undefined)[] = [];
  for (let gone = 0; gone < 300; gone += 0.5) {
    const x = 60 * Math.sin(gone / 60);
    const lying: HullMask = { ...mask, x, y: -gone, heading: Math.atan2(Math.cos(gone / 60), 1) };
    [one] = still.tracks([lying], [0, 0]);
    const shift = gone < 150 ? 0 : 1000;
    [other] = shifting.tracks([{ ...lying, x: x - shift }], [shift, 0]);
  }
  for (let index = 0; index < TRACK * 4; index++) {
    const moved = index % 4 === 0 ? 1000 : 0;
    assert.ok(Math.abs((one?.[index] ?? 0) - (other?.[index] ?? 0) - moved) < 0.01, `track[${index}]`);
  }
});

test('every part of its wake lies within the box the water draws it in', () => {
  for (const { mask, track } of [sailed(400, 30, 90), sailed(400, 30, 200), sailed(50, 80, 45), turnedDrawn(5)]) {
    for (const big of [false, true]) {
      const drawn: HullMask = big ? { ...mask, halfLength: 36, halfBeam: 11.2, scale: 4 } : mask;
      const used = big ? trackOf(drawn, [[drawn.x, drawn.y]]) : track;
      const [west, north, east, south] = wakeBounds(drawn, used);
      for (let x = drawn.x - 1200; x <= drawn.x + 1200; x += 4) {
        for (let y = drawn.y - 1200; y <= drawn.y + 1200; y += 4) {
          if (x >= west && x <= east && y >= north && y <= south) continue;
          const { foam, height } = wakeAt(drawn, [x, y], used);
          assert.ok(
            foam < 1e-3 && height < 1e-4,
            `${foam} ${height} at ${x} ${y} outside ${west} ${north} ${east} ${south}`,
          );
        }
      }
    }
  }
  assert.equal(TRACK, 8);
});

/** A Sloop drawn `scale` times its size, as the sea draws one, for the water's `tracks` to keep. */
const drawnAt = (scale: number): HullMask => ({
  ...SLOOP,
  id: 'own',
  halfLength: SLOOP.halfLength * scale,
  halfBeam: SLOOP.halfBeam * scale,
  scale,
});

test('stopped, then sailing back the way it came, it lays no wake ahead of its bow', () => {
  for (const scale of [1, 5]) {
    const tracks = new WakeTracks();
    const ship = drawnAt(scale);
    for (let gone = 0; gone <= 1500; gone += 0.5) tracks.tracks([{ ...ship, y: -gone }], [0, 0]);
    for (let frame = 0; frame < 10; frame++) tracks.tracks([{ ...ship, y: -1500, way: 0 }], [0, 0]);
    let [lying, track]: [HullMask, Track | undefined] = [ship, undefined];
    for (let back = 0; back <= 30; back += 0.5) {
      lying = { ...ship, y: -1500 + back, heading: Math.PI };
      [track] = tracks.tracks([lying], [0, 0]);
    }
    for (const ahead of [1.5, 3, 6]) {
      const point = [0, lying.y + ahead * lying.halfLength] as const;
      const [kept, before] = [wakeAt(lying, point, track), wakeAt(lying, point)];
      assert.ok(Math.abs(kept.foam - before.foam) < 1e-3, `drawn ${scale}x, ${ahead} half lengths ahead: ${kept.foam}`);
    }
  }
});

test('going astern, its wake runs straight aft, as before', () => {
  const tracks = new WakeTracks();
  const ship = drawnAt(1);
  for (let gone = 0; gone <= 200; gone += 0.5) tracks.tracks([{ ...ship, y: -gone }], [0, 0]);
  let [lying, track]: [HullMask, Track | undefined] = [ship, undefined];
  for (let astern = 0; astern <= 30; astern += 0.5) {
    lying = { ...ship, y: -200 + astern };
    [track] = tracks.tracks([lying], [0, 0]);
  }
  const straight = trackOf(lying);
  for (const [index, value] of (track ?? []).entries()) {
    assert.ok(Math.abs(value - (straight[index] ?? 0)) < 0.05, `track[${index}] ${value} ${straight[index]}`);
  }
});

/** A Sloop drawn `scale` times its size sailing 400 m north, then hard over a quarter turn round 18 m, as the sea
 *  draws one; where it ends, its track, and where its drawn stern was through the turn. */
function turnedDrawn(scale: number): { mask: HullMask; track: Track; sterns: (readonly [number, number])[] } {
  const tracks = new WakeTracks();
  const ship = drawnAt(scale);
  const length = ship.halfLength * HULL_FIT;
  const sterns: (readonly [number, number])[] = [];
  let [mask, track] = [ship, trackOf(ship)];
  for (let gone = 0; gone <= 400; gone += 0.5) [track = track] = tracks.tracks([{ ...ship, y: 400 - gone }], [0, 0]);
  for (let angle = 0; angle <= Math.PI / 2 + 1e-9; angle += 0.5 / 18) {
    mask = { ...ship, x: 18 - 18 * Math.cos(angle), y: -18 * Math.sin(angle), heading: angle };
    sterns.push([mask.x - Math.sin(angle) * length, mask.y + Math.cos(angle) * length]);
    [track = track] = tracks.tracks([mask], [0, 0]);
  }
  return { mask, track, sterns };
}

test('drawn five times its size, its wake leaves along where its drawn stern swung, not through its hull', () => {
  // Its middle turns round 18 m while its drawn half length is 45 m: its stern swings round wide of that.
  const { mask, track, sterns } = turnedDrawn(5);
  // Where its stern was a third of the way round the turn, its track churns white.
  const passed = sterns[Math.round(sterns.length / 3)] ?? [0, 0];
  assert.ok(wakeAt(mask, passed, track).foam > 0.5, `${wakeAt(mask, passed, track).foam} at ${passed}`);
  // Its track's first step leaves its stern aft, not across its hull.
  const [sternEast = 0, sternSouth = 0, , , nextEast = 0, nextSouth = 0] = track;
  const forward = [Math.sin(mask.heading), -Math.cos(mask.heading)] as const;
  assert.ok((nextEast - sternEast) * forward[0] + (nextSouth - sternSouth) * forward[1] < 0, 'its first step runs aft');
});

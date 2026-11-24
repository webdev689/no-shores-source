import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from './marks.ts';
import {
  type LatticeShown,
  LatticeWaves,
  WAVE,
  halved,
  layLatticeLooks,
  loadLatticeWave,
  waveFade,
  waveReady,
  wavePath,
} from './latticeLooks.ts';

const EYE = [0, 10, 1.6] as const;

test('a forge picture halved takes the mean of each four texels', () => {
  const data = new Uint8Array(4 * 4 * 2);
  data.set([200, 200, 200, 255], 0);
  data.set([100, 100, 100, 255], 4);
  const half = halved({ width: 4, height: 2, data });
  assert.deepEqual([half.width, half.height, ...Array.from(half.data).slice(0, 4)], [2, 1, 75, 75, 75, 128]);
});

test('the wave is drawn once its frames have come, scaled, and gone when it is over', async () => {
  const waves = new LatticeWaves();
  waves.burst([0, 0, 0], 'red', 1, 0);
  const laid = (clock: number) => {
    const out: number[] = [];
    waves.lay(out, EYE, clock);
    return out.length;
  };
  assert.equal(laid(0.1), 0, 'nothing before its pictures');
  const asked: string[] = [];
  const [width, height] = WAVE.cell;
  const lit = new Uint8Array(width * height * 4);
  // A spot of crystal at the feet.
  for (const [x, y] of [
    [160, 164],
    [161, 164],
    [160, 165],
    [161, 165],
  ])
    lit.set([255, 255, 255, 255], (y * width + x) * 4);
  loadLatticeWave((path) => (asked.push(path), Promise.resolve({ width, height, data: lit })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked[0], wavePath(0));
  assert.ok(waveReady());
  assert.ok(laid(0.1) > 0, 'its frame drawn');
  const layOf = (backward: boolean, fine: boolean, clock: number) => {
    const played = new LatticeWaves();
    played.burst([0, 0, 0], 'red', 4, 0, backward, fine);
    const out: number[] = [];
    played.lay(out, EYE, clock);
    return out;
  };
  const end = (WAVE.frames - 0.5) * WAVE.frameS;
  assert.deepEqual(layOf(true, false, 0), layOf(false, false, end), 'played back, its last frame first');
  assert.ok(layOf(false, true, 0).length > layOf(false, false, 0).length, 'the fine wave in more, smaller cells');
  const big = new LatticeWaves();
  big.burst([0, 0, 0], 'red', 4, 0);
  const bigOut: number[] = [];
  big.lay(bigOut, EYE, 0.1);
  assert.equal(bigOut.length, laid(0.1), 'the same cells, larger');
  assert.equal(laid(WAVE.frames * WAVE.frameS + 0.01), 0, 'over');
  assert.deepEqual([waveFade(0), waveFade(WAVE.fadeS / 2), waveFade(5)], [0, 0.5, 1]);
});

const shown = (anim: string, frame: number): LatticeShown => ({
  body: 'idol',
  strain: 'purple',
  scale: 1,
  anim,
  frame,
  frames: 8,
  feet: [0, 0, 0],
  facing: 0,
  target: [0, -6, 1.2],
});
const looks = (anim: string, frame: number) => {
  const out: number[] = [];
  layLatticeLooks(out, shown(anim, frame), EYE);
  return out.length;
};

test('the game draws what the pictures cannot: the lens and beam, the core’s flare, the shards thrown', () => {
  assert.equal(looks('idol_idle', 0), 0);
  assert.ok(looks('idol_charge', 7) > looks('idol_charge', 0), 'the lens’s glow grows through the charge');
  assert.ok(looks('idol_fire', 0) > 0, 'the beam');
  assert.equal(looks('idol_fire', 5), 0, 'and gone');
  assert.equal(looks('bulwark_discharge', 0), 0);
  assert.ok(looks('bulwark_discharge', 4) > 0, 'the core flaring in its tell');
  assert.ok(looks('bulwark_discharge', 7) > 0, 'its burst');
  assert.equal(looks('ravager_hurl', 3), 0, 'wound up, nothing thrown');
  assert.ok(looks('ravager_hurl', 4) > 0, 'its first shard flies');
});

test('a move with no frames draws no glow, and throws nothing', () => {
  const out: number[] = [];
  assert.doesNotThrow(() => layLatticeLooks(out, { ...shown('idol_charge', 0), frames: 0 }, EYE));
  assert.equal(out.length, 0);
});

const blow = (body: string, anim: string, frame: number, frames = 10) => {
  const out: number[] = [];
  layLatticeLooks(out, { ...shown(anim, frame), body, frames, strain: 'red' }, EYE);
  return out;
};

test("each Lattice foe's blow shows its wind-up, its strike and where it lands, and nothing at rest", () => {
  for (const [body, anim] of [
    ['husk', 'husk_lunge'],
    ['husk', 'husk_gore'],
    ['flicker', 'flicker_slash_left'],
    ['flicker', 'flicker_slash_right'],
    ['flicker', 'flicker_overhead'],
    ['ravager', 'ravager_maul'],
    ['bulwark', 'bulwark_sweep'],
    ['bulwark', 'bulwark_slam'],
    ['heart', 'heart_slam'],
    ['heart', 'heart_sweep'],
    ['heart', 'heart_stomp'],
  ] as const) {
    const [windup, strike, lands] = [blow(body, anim, 1), blow(body, anim, 4), blow(body, anim, 6)];
    assert.ok(windup.length > 0, `${anim}: its tell glints`);
    assert.ok(strike.length > 0 && lands.length > 0, `${anim}: its strike and its landing`);
    assert.notDeepEqual(strike, lands, `${anim}: the strike and the landing are drawn apart`);
    assert.equal(blow(body, anim, 9).length, 0, `${anim}: then gone`);
  }
  assert.equal(blow('husk', 'husk_idle', 4).length, 0, 'at rest, nothing');
});

test("the Idol's beam leaves a fading tracer and bursts where it lands; the Ravager's shards trail back to its hand", () => {
  const out = (anim: string, frame: number) => blow(anim.split('_')[0] ?? '', anim, frame, 8);
  // Whether any vertex lies within `reach` metres of `point`.
  const near = (laid: readonly number[], point: readonly number[], reach: number) =>
    Array.from({ length: laid.length / MARK_FLOATS }, (unused, index) => index * MARK_FLOATS).some(
      (first) => Math.hypot(...point.map((axis, index) => (laid[first + index] ?? 0) - axis)) < reach,
    );
  assert.ok(out('idol_fire', 3).length > 0 && out('idol_fire', 4).length > 0, 'the beam’s tracer after it');
  assert.equal(out('idol_fire', 6).length, 0, 'gone');
  assert.ok(near(out('idol_fire', 0), [0, -6, 1.2], 0.15), 'a burst where it lands');
  // Its sixth frame's shard is half flown: its trail runs back to within a hand's breadth of the hand.
  assert.ok(near(out('ravager_hurl', 6), [0.25, -0.4, 1.45], 0.3), 'the shard trails back toward the hand');
});

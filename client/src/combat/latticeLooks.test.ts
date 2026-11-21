import assert from 'node:assert/strict';
import { test } from 'node:test';
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

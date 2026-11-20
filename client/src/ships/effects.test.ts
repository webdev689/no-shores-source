import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effects, FLASH_S, SMOKE_S, SPLASH_M, SPLASH_S, SPLINTERS } from './effects.ts';

const highest = (marks: readonly { z: number }[]) => Math.max(...marks.map((mark) => mark.z));
const FLASH_COLOUR = [1, 0.78, 0.35];

test("a gun's flash lasts a tenth of a second, its smoke rolls out with the shot and thins over seven", () => {
  const effects = new Effects(1);
  effects.fire([0, 0, 0], [0, 5, 1.5], [0, 400, 3], 0);
  const flashes = (now: number) =>
    effects.marks(now).filter((mark) => mark.colour.every((value, axis) => value === FLASH_COLOUR[axis]));
  assert.equal(flashes(0.05).length, 1);
  assert.ok((flashes(0.05)[0]?.radius ?? 0) > 0.5, 'it flashes at its full size, not shrinking from the start');
  assert.equal(flashes(FLASH_S + 0.01).length, 0);
  const early = effects.marks(0.5);
  const later = effects.marks(4);
  const meanOut = (marks: readonly { y: number }[]) => marks.reduce((sum, mark) => sum + mark.y, 0) / marks.length;
  assert.ok(meanOut(later) > meanOut(early) + 1, 'the smoke rolls out the way the ball went');
  const late = effects.marks(SMOKE_S - 0.3);
  const meanRadius = (marks: readonly { radius: number }[]) =>
    marks.reduce((sum, mark) => sum + mark.radius, 0) / marks.length;
  assert.ok(late.length === 0 || meanRadius(late) < meanRadius(later), 'it thins');
  assert.equal(effects.marks(SMOKE_S + 0.1).length, 0);
});

test('powder smoke drifts downwind', () => {
  const effects = new Effects(2);
  effects.blow(Math.PI / 2);
  effects.fire([0, 0, 0], [0, 0, 1], [0, 1, 0], 0);
  const smoke = effects.marks(5);
  assert.ok(smoke.length > 0);
  assert.ok(
    smoke.every((mark) => mark.x > 4),
    'the wind blowing east has taken it east',
  );
});

test('a splash stands about four metres high and is back in the water in a second and a half', () => {
  const effects = new Effects(3);
  const stir = effects.splash([5, 6, 0], 0);
  assert.deepEqual([stir.x, stir.y], [5, 6]);
  let top = 0;
  for (let now = 0; now < SPLASH_S; now += 0.05) top = Math.max(top, highest(effects.marks(now)));
  assert.ok(top > SPLASH_M * 0.8 && top < SPLASH_M * 1.2, `${top}`);
  const spray = effects.marks(SPLASH_S + 0.01).filter((mark) => mark.z > 0.01);
  assert.equal(spray.length, 0, 'the column has fallen back');
  const foam = effects.marks(SPLASH_S + 0.2);
  assert.ok(foam.length >= 12 && foam.every((mark) => Math.abs(mark.z) < 0.01), 'its ring of foam lies on the water');
  const spreadOf = (now: number) => Math.max(...effects.marks(now).map((mark) => Math.hypot(mark.x - 5, mark.y - 6)));
  assert.ok(spreadOf(1.5) > spreadOf(0.1), 'the ring spreads');
  assert.equal(effects.marks(5).length, 0);
});

test('a hull hit bursts a few dozen chips of her paint that fall to the water', () => {
  const effects = new Effects(4);
  const paint = [0.1, 0.2, 0.3] as const;
  effects.splinter([0, 0, 0], [0, 3, 1.5], [0, 1], paint, 0);
  const chips = effects.marks(0.1).filter((mark) => mark.radius < 0.2);
  assert.equal(chips.length, SPLINTERS);
  assert.ok(chips.filter((mark) => mark.colour === paint).length > SPLINTERS / 2, "most are her paint's");
  assert.ok(
    effects.marks(1.5).every((mark) => mark.z >= 0),
    'none falls through the water',
  );
  assert.ok(highest(effects.marks(1.5).filter((mark) => mark.radius < 0.2)) < 0.5, 'they lie on the water');
});

test('at the raised view every puff is drawn as many times larger about where it came from', () => {
  const [near, far] = [new Effects(5), new Effects(5)];
  for (const effects of [near, far]) effects.splash([10, 10, 0], 0);
  const [one, four] = [near.marks(0.4, 1), far.marks(0.4, 4)];
  assert.equal(one.length, four.length);
  one.forEach((mark, index) => {
    const big = four[index];
    assert.ok(big && Math.abs(big.radius - mark.radius * 4) < 1e-9);
    assert.ok(Math.abs(big.z - mark.z * 4) < 1e-9);
    assert.ok(Math.abs(big.x - 10 - (mark.x - 10) * 4) < 1e-9);
  });
});

test('a ball aloft leaves a faint trail that fades behind it', () => {
  const effects = new Effects(6);
  effects.trail([[0, 0, 5]], 0);
  effects.trail([[1, 0, 5]], 0.01);
  assert.equal(effects.marks(0.02).length, 1, 'a puff every few hundredths of a second');
  effects.trail([[2, 0, 5]], 0.05);
  assert.equal(effects.marks(0.06).length, 2);
  assert.equal(effects.marks(1).length, 0);
});

test('a ship afire flames and smokes over her deck while she burns', () => {
  const effects = new Effects(7);
  for (let frame = 0; frame < 30; frame++) effects.burn([0, 0, 0], [0, 0, 2.4], 1, 1.5, frame / 30, 1 / 30);
  assert.ok(effects.marks(1).length > 5);
  assert.ok(effects.marks(1).every((mark) => mark.z >= 2.4));
  const quiet = new Effects(8);
  quiet.burn([0, 0, 0], [0, 0, 2.4], 0, 1.5, 0, 1);
  assert.equal(quiet.marks(0).length, 0);
});

test('where a ship went down the water foams and bubbles rise to it', () => {
  const effects = new Effects(9);
  for (let frame = 0; frame < 30; frame++) effects.foam([0, 0, 0], 6, frame / 30, 1 / 30);
  const marks = effects.marks(1);
  assert.ok(marks.length > 20);
  assert.ok(marks.every((mark) => Math.hypot(mark.x, mark.y) < 6.5 && mark.z <= 0.01));
  assert.equal(effects.marks(10).length, 0);
});

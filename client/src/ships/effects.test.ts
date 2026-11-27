import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Effects,
  FLASH_S,
  GUN_SMOKE_LIFE,
  GUN_SMOKE_SWELL,
  type Mark,
  MUZZLE_LIGHT,
  PUFF_BUDGET,
  ROUND_SHOT_M,
  SPLINTERS,
} from './effects.ts';
import { EVICT_RANK, fadeOf } from './puffLaw.ts';

const highest = (marks: readonly { z: number }[]) => Math.max(...marks.map((mark) => mark.z));
const blended = (marks: readonly Mark[], blend: Mark['blend']) => marks.filter((mark) => mark.blend === blend);
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

test("a gun's flash is light added unlit for a tenth of a second, its light reaching DFO's 26 m", () => {
  const effects = new Effects(1);
  effects.fire([0, 0, 0], [0, 5, 1.5], [0, 400, 3], 0);
  const glows = blended(effects.marks(0.02), 'glow');
  assert.equal(glows.length, 2, 'the bloom and its tongue along the shot');
  assert.ok(glows.every((mark) => (mark.alpha ?? 0) > 0.4));
  // Read in time's order: a puff once spent is let go.
  const lights = blended(effects.marks(0.05), 'light');
  assert.equal(lights.length, 1);
  assert.equal(lights[0]?.radius, MUZZLE_LIGHT.reachM);
  assert.equal(blended(effects.marks(FLASH_S + 0.005), 'glow').length, 0);
  assert.equal(blended(effects.marks(MUZZLE_LIGHT.seconds + 0.01), 'light').length, 0);
});

test("a broadside's smoke is blended, swells as it thins, and hangs DFO's nine to fourteen seconds", () => {
  const effects = new Effects(2);
  effects.fire([0, 0, 0], [0, 4, 2], [0, 300, 3], 0);
  const smoke = (now: number) => blended(effects.marks(now), 'smoke');
  assert.equal(smoke(0.5).length, 8, 'five puffs and three a unit of gun');
  const [early, late] = [smoke(1), smoke(8)];
  assert.ok(mean(late.map((mark) => mark.radius)) > mean(early.map((mark) => mark.radius)) * 1.5, 'it swells');
  assert.ok(mean(late.map((mark) => mark.alpha ?? 1)) < mean(early.map((mark) => mark.alpha ?? 1)), 'as it thins');
  assert.ok(Math.max(...late.map((mark) => mark.radius)) <= GUN_SMOKE_SWELL[1] / 2);
  assert.ok(smoke(GUN_SMOKE_LIFE[0] - 0.5).length > 0, 'still hanging at nine seconds');
  assert.equal(smoke(GUN_SMOKE_LIFE[1] + 0.1).length, 0);
});

test('powder smoke comes to ride the wind', () => {
  const effects = new Effects(3);
  effects.blow(Math.PI / 2);
  effects.fire([0, 0, 0], [0, 0, 1], [0, 1, 0], 0);
  const smoke = blended(effects.marks(6), 'smoke');
  assert.ok(smoke.length > 0);
  assert.ok(
    smoke.every((mark) => mark.x > 15),
    'the wind blowing east at four metres a second has taken it east',
  );
});

test("a round shot's splash: blended spray and a spout falling back, and a ring of foam spreading flat on the water", () => {
  const effects = new Effects(4);
  const stir = effects.splash([5, 6, 0], 0);
  assert.deepEqual([stir.x, stir.y], [5, 6]);
  const marks = effects.marks(0.4);
  assert.ok(
    marks.every((mark) => mark.blend === 'smoke'),
    'water is blended, never a lit ball',
  );
  assert.ok(highest(marks) > 3, 'its spout stands high');
  const rings = (now: number) => effects.marks(now).filter((mark) => mark.flat);
  assert.equal(rings(0.4).length, 1);
  assert.ok((rings(2)[0]?.radius ?? 0) > (rings(0.4)[0]?.radius ?? 0), 'the ring spreads');
  assert.equal(effects.marks(2.3).filter((mark) => !mark.flat).length, 0, 'the spray has fallen back');
  assert.equal(effects.marks(2.5).length, 0);
});

test('a heavier ball throws a bigger splash', () => {
  const [round, heavy] = [new Effects(5), new Effects(5)];
  round.splash([0, 0, 0], 0, ROUND_SHOT_M);
  heavy.splash([0, 0, 0], 0, ROUND_SHOT_M * 1.5);
  assert.ok(heavy.count > round.count);
  const tallest = (effects: Effects) =>
    Math.max(...Array.from({ length: 30 }, (unused, step) => highest(effects.marks(step * 0.05))));
  assert.ok(tallest(heavy) > tallest(round));
});

test('a hull hit throws splinters of its paint that fall to the water, a puff of smoke and a small flash', () => {
  const effects = new Effects(6);
  const paint = [0.1, 0.2, 0.3] as const;
  effects.splinter([0, 0, 0], [0, 3, 1.5], [0, 1], paint, 0);
  const chips = effects.marks(0.05).filter((mark) => mark.blend === undefined);
  assert.equal(chips.length, SPLINTERS);
  assert.ok(chips.filter((mark) => mark.colour === paint).length > SPLINTERS / 3, "many are its paint's");
  assert.ok(blended(effects.marks(0.05), 'smoke').length >= 3);
  assert.equal(blended(effects.marks(0.05), 'glow').length, 1);
  assert.ok(
    effects.marks(2).every((mark) => mark.z >= 0),
    'none falls through the water',
  );
});

test('a ship afire burns in unlit flames and embers under dark blended smoke', () => {
  const effects = new Effects(7);
  for (let frame = 0; frame < 60; frame++) effects.burn([0, 0, 0], [0, 0, 2.4], 1, 1.5, frame / 30, 1 / 30);
  const marks = effects.marks(2);
  assert.ok(blended(marks, 'glow').length > 10);
  // A flame reads at the fight's distance: born two metres and more across, as tall as DFO's fire stood on a deck.
  const flames = blended(effects.marks(2), 'glow').filter((mark) => mark.colour[1] < 0.5);
  assert.ok(Math.max(...flames.map((mark) => mark.radius)) > 0.95, 'a flame a metre round at its start');
  assert.ok(blended(marks, 'smoke').some((mark) => (mark.colour[0] ?? 1) < 0.3));
  assert.ok(marks.every((mark) => mark.z >= 2.4));
  const quiet = new Effects(8);
  quiet.burn([0, 0, 0], [0, 0, 2.4], 0, 1.5, 0, 1);
  assert.equal(quiet.marks(0).length, 0);
});

test('past the budget, the spray and foam go first and the smoke last', () => {
  const effects = new Effects(9);
  for (let gun = 0; gun < 40; gun++) effects.fire([0, 0, 0], [gun, 0, 1], [0, 300, 0], 0);
  // Powder smoke is the grey of the blended puffs; spray and foam are white.
  const powder = (now: number) => blended(effects.marks(now), 'smoke').filter((mark) => (mark.colour[2] ?? 1) < 0.85);
  const smoke = powder(0.01).length;
  for (let fall = 0; fall < 60; fall++) effects.splash([fall, 50, 0], 0.01);
  assert.equal(effects.count, PUFF_BUDGET);
  assert.equal(powder(0.02).length, smoke, 'every puff of smoke kept');
  assert.ok(EVICT_RANK.spray < EVICT_RANK.smoke && EVICT_RANK.foam < EVICT_RANK.flash);
});

test("each kind fades by DFO's law: smoke in and out, a flash at once, splinters only at the end", () => {
  assert.equal(fadeOf('smoke', 0), 0);
  assert.ok(fadeOf('smoke', 0.2) > 0.75);
  assert.equal(fadeOf('flash', 0), 1);
  assert.equal(fadeOf('debris', 0.5), 1);
  assert.ok(fadeOf('debris', 0.9) < 0.5);
});

test('water thrown over a rail by a fall alongside goes toward its deck and more of it the nearer', () => {
  const [near, far] = [new Effects(10), new Effects(10)];
  near.drench([0, 0, 0], [10, 0, 2], 1, 0);
  far.drench([0, 0, 0], [10, 0, 2], 0, 0);
  assert.ok(near.count > far.count);
  assert.ok(mean(near.marks(0.6).map((mark) => mark.x)) > 1, 'toward it');
});

test('a magazine blows in a fireball, a column of smoke, splinters and a big splash', () => {
  const effects = new Effects(11);
  effects.blast([0, 0, 0], 0);
  const marks = effects.marks(0.2);
  assert.ok(blended(marks, 'glow').length >= 10);
  assert.ok(blended(marks, 'smoke').length >= 12);
  assert.ok(
    marks.some((mark) => mark.blend === undefined),
    'splinters',
  );
  assert.ok(blended(marks, 'light').length === 1);
});

test('a battered hull smokes along its deck, more the more it is hurt', () => {
  const [hurt, whole] = [new Effects(12), new Effects(12)];
  for (let frame = 0; frame < 90; frame++) {
    hurt.smolder([0, 0, 0], [-6, 0, 2], [6, 0, 2], 1, frame / 30, 1 / 30);
    whole.smolder([0, 0, 0], [-6, 0, 2], [6, 0, 2], 0, frame / 30, 1 / 30);
  }
  assert.ok(hurt.count >= 8);
  assert.equal(whole.count, 0);
  assert.ok(hurt.marks(3).every((mark) => Math.abs(mark.x) < 9));
});

test('a battery running out glints at its ports, brighter as the guns come out', () => {
  const effects = new Effects(13);
  const ports = [
    [-3, 2.5, 1.5],
    [0, 2.5, 1.5],
    [3, 2.5, 1.5],
  ] as const;
  for (let frame = 0; frame < 30; frame++) effects.glint([0, 0, 0], ports, 1, frame / 30, 1 / 30);
  const glints = blended(effects.marks(29 / 30), 'glow');
  assert.ok(glints.length > 0 && glints.every((mark) => (mark.alpha ?? 0) > 0));
});

test('at the raised view every puff is drawn as many times larger about where it came from', () => {
  const [near, far] = [new Effects(14), new Effects(14)];
  for (const effects of [near, far]) effects.splash([10, 10, 0], 0);
  const [one, four] = [near.marks(0.4, 1), far.marks(0.4, 4)];
  assert.equal(one.length, four.length);
  one.forEach((mark, index) => {
    const big = four[index];
    assert.ok(big && Math.abs(big.radius - mark.radius * 4) < 1e-9);
    assert.ok(Math.abs(big.x - 10 - (mark.x - 10) * 4) < 1e-9);
  });
});

test('a ball aloft leaves a faint trail that fades behind it', () => {
  const effects = new Effects(15);
  effects.trail([[0, 0, 5]], 0);
  effects.trail([[1, 0, 5]], 0.01);
  assert.equal(effects.marks(0.02).length, 1, 'a puff every few hundredths of a second');
  effects.trail([[2, 0, 5]], 0.05);
  assert.equal(effects.marks(0.06).length, 2);
  assert.equal(effects.marks(1).length, 0);
});

test("a ball's trail rides the wind as a gun's smoke does", () => {
  const effects = new Effects(15);
  effects.blow(Math.PI / 2);
  effects.trail([[0, 0, 5]], 0);
  const [puff] = effects.marks(0.4);
  assert.ok(puff && puff.x > 0.2, 'the wind blowing east has taken it east');
});

test('where a ship went down foam rings lie on the water and the air boils up in drops', () => {
  const effects = new Effects(16);
  for (let frame = 0; frame < 30; frame++) effects.foam([0, 0, 0], 6, frame / 30, 1 / 30);
  const marks = effects.marks(1);
  assert.ok(marks.some((mark) => mark.flat) && marks.some((mark) => !mark.flat));
  assert.ok(marks.every((mark) => Math.hypot(mark.x, mark.y) < 8));
  assert.equal(effects.marks(10).length, 0);
});

test("each puff of a broadside's smoke is turned its own way, and keeps its turn as it drifts but for a slow spin", () => {
  const effects = new Effects(3);
  effects.fire([0, 0, 0], [0, 5, 1.5], [0, 400, 3], 0);
  const turns = (now: number) => blended(effects.marks(now), 'smoke').map((mark) => mark.yaw ?? NaN);
  const [early, later] = [turns(1), turns(2)];
  assert.ok(early.every(Number.isFinite), 'every puff has a turn');
  assert.equal(new Set(early.map((turn) => turn.toFixed(3))).size, early.length, 'no two alike');
  early.forEach((turn, index) => assert.ok(Math.abs((later[index] ?? 0) - turn) < 0.1, 'a slow spin, no jump'));
});

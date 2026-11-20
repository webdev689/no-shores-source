import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StationInfo } from '../nodes.ts';
import { inPlaza } from '../townsfolk.ts';
import { FRAME, STATIONS } from './plazaForTests.ts';
import { FOLLOW_M, MEET_M, MET_SCENE, STOPS, WelcomeWalk } from './walk.ts';

const station = (kind: string) => STATIONS.find((station) => station.kind === kind) as StationInfo;
const near = (walk: WelcomeWalk, point: readonly [number, number]) =>
  Math.hypot(walk.maren.x - point[0], walk.maren.y - point[1]);

test('she comes from behind her counter round its end to the player, and speaks there facing them', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  const home = station('lamplighters');
  assert.deepEqual([walk.maren.x, walk.maren.y], home.keeper);
  const player = [1010, 2040] as const;
  let asked = walk.step(0, player);
  for (let tick = 0; tick < 2000 && !asked.say; tick++) {
    asked = walk.step(0.1, player);
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    const homeAcross = inPlaza(FRAME, home.keeper).across;
    // Behind the counter's line she is only ever past its ends, never through it.
    if (toward < -50.8 && toward > -52.4) assert.ok(Math.abs(across - homeAcross) > 2.6, `through the counter`);
  }
  assert.equal(asked.say, MET_SCENE);
  assert.equal(walk.phase, 'speaking');
  assert.ok(near(walk, player) <= MEET_M + 1e-6 && near(walk, player) > MEET_M - 0.2, 'stopped before them');
  const facing = Math.atan2(player[0] - walk.maren.x, walk.maren.y - player[1]);
  assert.ok(Math.abs(walk.maren.facing - facing) < 1e-6, 'facing the player');
  assert.equal(walk.step(1, player).say, null, 'she says it once');
});

test('she leads to the next stop and waits there for a lagging player, the prompt up, then names its keepers', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  const player = [1000, 2040] as const;
  for (let tick = 0; tick < 9000 && !walk.step(0.1, player).say; tick++);
  walk.said();
  assert.equal(walk.phase, 'leading');
  let lagged = false;
  for (let tick = 0; tick < 4000 && walk.phase === 'leading'; tick++) {
    const { lagging } = walk.step(0.1, player);
    lagged ||= lagging;
  }
  assert.ok(lagged, 'the player stood still, so lagged behind');
  assert.equal(walk.phase, 'waiting');
  assert.ok(near(walk, station('mage').counter) < 3.2, 'before the Mage');
  assert.deepEqual(walk.named, [station('mage')]);
  for (let tick = 0; tick < 50; tick++) assert.deepEqual(walk.step(0.1, player), { say: null, lagging: true });
  const close = [walk.maren.x, walk.maren.y + FOLLOW_M - 0.5] as const;
  assert.deepEqual(walk.step(0.1, close), { say: STOPS[0]?.scene, lagging: false });
});

test('a player who follows hears every stop in the plaza’s order, never off the lanes, and she ends at her counter', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  const heard: string[] = [];
  const named: string[][] = [];
  for (let tick = 0; tick < 40_000 && walk.phase !== 'done'; tick++) {
    // The player keeps close behind her.
    const player = [walk.maren.x, walk.maren.y + 1.5] as const;
    const { say } = walk.step(0.1, tick === 0 ? [1000, 2040] : player);
    if (say) {
      heard.push(say);
      named.push(walk.named.map((station) => station.kind));
      walk.said();
    }
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    assert.ok(!(toward < -42 && toward > -50 && Math.abs(across) < 26), `on the portico at ${across}, ${toward}`);
    assert.ok(Math.abs(across) < 130 && toward > -54 && toward < 60, 'inside the plaza');
  }
  assert.deepEqual(heard, [MET_SCENE, ...STOPS.map((stop) => stop.scene)]);
  assert.deepEqual(named.slice(1), [
    ['mage'],
    ['armorsmith', 'weaponsmith'],
    ['tailor', 'tack'],
    ['vault'],
    ['stormcallers'],
    ['veiled'],
    ['lamplighters'],
  ]);
  assert.equal(walk.phase, 'done');
  assert.ok(near(walk, station('lamplighters').keeper) < 1e-6, 'behind her own counter, where her figure takes over');
});

test('the vault she names is the one on her own side, on the way to her counter', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  for (let tick = 0; tick < 9000 && !walk.step(1, [walk.maren.x, walk.maren.y + 1.5]).say; tick++);
  for (let stop = 0; stop < 4; stop++) {
    walk.said();
    for (let tick = 0; tick < 9000 && !walk.step(1, [walk.maren.x, walk.maren.y + 1.5]).say; tick++);
  }
  const vault = walk.named[0];
  assert.equal(vault?.kind, 'vault');
  assert.ok((vault?.counter[0] ?? 0) < 1000, 'west of the portico, with the factions');
});

test('ended, she stops where she is; a plaza without her counter has no welcome', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  walk.step(2, [1000, 2040]);
  walk.end();
  assert.equal(walk.phase, 'done');
  assert.equal(walk.maren.walking, false);
  const without = STATIONS.filter((station) => station.kind !== 'lamplighters');
  assert.equal(WelcomeWalk.round(without, FRAME), null);
});

test('coming to a player at the far side’s counters, she goes round by the landward lane, never over the portico', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME) as WelcomeWalk;
  const player = [station('weaponsmith').counter[0], 1951.5] as const;
  let said = null;
  for (let tick = 0; tick < 6000 && !said; tick++) {
    said = walk.step(0.1, player).say;
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    assert.ok(!(toward < -42 && toward > -50 && Math.abs(across) < 26), `on the portico at ${across}, ${toward}`);
  }
  assert.equal(said, MET_SCENE);
});

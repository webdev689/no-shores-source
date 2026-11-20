import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StationInfo } from '../nodes.ts';
import { inPlaza, plazaPoint } from '../townsfolk.ts';
import { FRAME, STATIONS, solidAt } from './plazaForTests.ts';
import { CAUGHT_UP_M, FOLLOW_M, LEFT_BEHIND_S, MEET_M, MET_SCENE, STOPS, WALK_M_S, WelcomeWalk } from './walk.ts';

type Point = readonly [number, number];
const station = (kind: string) => STATIONS.find((station) => station.kind === kind) as StationInfo;
const phaseOf = (walk: WelcomeWalk): string => walk.phase;
const near = (walk: WelcomeWalk, point: Point) => Math.hypot(walk.maren.x - point[0], walk.maren.y - point[1]);
/** A point of the plaza by its own frame: metres toward the sea, and across. */
const place = (toward: number, across: number): Point => plazaPoint(FRAME, toward, across);
/** Where the player arrives: the spawns just inside the seaward parapet. */
const SPAWNS: readonly Point[] = [place(56, -60), place(56, -20), place(56, 20), place(56, 60)];
/** Half a body's width, metres: no solid of the courtyard comes nearer her middle. */
const BODY_M = 0.3;

/** The whole walk with a player who stands at `start` until she has met them, then keeps close behind her: the
 *  scenes heard, each with the stations named, and the seconds walked. Every step she stands clear of every solid. */
function walkedFrom(start: Point) {
  const walk = WelcomeWalk.round(STATIONS, FRAME, start) as WelcomeWalk;
  const heard: { scene: string; named: string[]; across: number }[] = [];
  let [seconds, given] = [0, 0];
  for (let tick = 0; tick < 40_000 && walk.phase !== 'done'; tick++) {
    const player = walk.phase === 'coming' ? start : ([walk.maren.x, walk.maren.y + 1.5] as const);
    const { say } = walk.step(0.1, player);
    seconds += 0.1;
    if (say) {
      const named = walk.named.map((each) => each.kind);
      const across = walk.named.reduce((sum, each) => sum + inPlaza(FRAME, each.counter).across, 0) / named.length;
      heard.push({ scene: say, named, across });
      walk.said();
      if (walk.given && !given) given = seconds;
    }
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    const solid = solidAt(toward, across, BODY_M);
    assert.equal(solid, null, `from ${start}: in the ${solid} at (${toward.toFixed(2)}, ${across.toFixed(2)})`);
  }
  return { walk, heard, given };
}

test('she starts within sight of where the player arrives, and comes to them', () => {
  for (const spawn of SPAWNS) {
    const walk = WelcomeWalk.round(STATIONS, FRAME, spawn) as WelcomeWalk;
    assert.ok(near(walk, spawn) < 30, `starts ${near(walk, spawn).toFixed(1)} m from them`);
    let asked = walk.step(0, spawn);
    let seconds = 0;
    for (; seconds < 120 && !asked.say; seconds += 0.1) asked = walk.step(0.1, spawn);
    assert.equal(asked.say, MET_SCENE);
    assert.ok(seconds < 30, `met after ${seconds.toFixed(0)} s`);
    assert.ok(near(walk, spawn) <= MEET_M + 1e-6, 'stopped before them');
    const facing = Math.atan2(spawn[0] - walk.maren.x, walk.maren.y - spawn[1]);
    assert.ok(Math.abs(walk.maren.facing - facing) < 1e-6, 'facing the player');
    assert.equal(walk.step(1, spawn).say, null, 'she says it once');
  }
});

test('from every spawn, and from about the plaza, she walks clear of every solid of the courtyard', () => {
  const about = [place(12, -12), place(47, 40), place(2, 45), place(-30, 100), place(-46, -82)];
  for (const start of [...SPAWNS, ...about]) assert.equal(walkedFrom(start).walk.phase, 'done');
});

test('a player who follows hears every stop once, the nearest first each time, and she ends behind her counter', () => {
  for (const spawn of SPAWNS) followedFrom(spawn);
});

function followedFrom(spawn: Point): void {
  const { walk, heard, given } = walkedFrom(spawn);
  assert.deepEqual(heard.map((each) => each.scene).sort(), [MET_SCENE, ...STOPS.map((stop) => stop.scene)].sort());
  assert.equal(heard[0]?.scene, MET_SCENE);
  // Each stop is the nearest of those left to the one before, the counters all standing along the arcades' front.
  const acrosses = heard.slice(1).map((each) => each.across);
  acrosses.forEach((here, nth) => {
    const [next, ...later] = acrosses.slice(nth + 1).map((there) => Math.abs(there - here));
    for (const other of later) assert.ok((next ?? 0) <= other + 1e-6, `stop ${nth + 1} goes on to the nearest`);
  });
  assert.ok(near(walk, station('lamplighters').keeper) < 1e-6, 'behind her own counter, where her figure takes over');
  assert.ok(walk.given);
  // The walk to the last stop alone, speech aside: about the plaza's length once and the way in.
  assert.ok(given < 360, `walked ${given.toFixed(0)} s at ${WALK_M_S} m/s`);
}

test('the follow prompt shows past the follow reach and clears only once the player is nearer still', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME, SPAWNS[1] as Point) as WelcomeWalk;
  for (let tick = 0; tick < 9000 && !walk.step(0.1, SPAWNS[1] as Point).say; tick++);
  walk.said();
  assert.equal(walk.phase, 'leading');
  const behind = (metres: number) => walk.step(0.01, [walk.maren.x, walk.maren.y + metres]).lagging;
  assert.equal(behind(FOLLOW_M - 0.5), false);
  assert.equal(behind(FOLLOW_M + 0.5), true, 'lagging past the follow reach');
  assert.equal(behind((FOLLOW_M + CAUGHT_UP_M) / 2), true, 'still lagging between the two');
  assert.equal(behind(CAUGHT_UP_M - 0.5), false, 'caught up');
  assert.equal(behind((FOLLOW_M + CAUGHT_UP_M) / 2), false, 'and stays so short of the follow reach');
});

test('a player left far behind for a minute ends the walk: she goes home, and the stops said are kept', () => {
  const start = SPAWNS[0] as Point;
  const walk = WelcomeWalk.round(STATIONS, FRAME, start) as WelcomeWalk;
  for (let tick = 0; tick < 9000 && !walk.step(0.1, start).say; tick++);
  walk.said();
  const far = place(56, 120);
  for (let tick = 0; tick < (LEFT_BEHIND_S - 5) * 10; tick++) walk.step(0.1, far);
  assert.notEqual(walk.phase, 'returning', 'not before the minute is out');
  for (let tick = 0; tick < 100 && walk.phase !== 'returning'; tick++) walk.step(0.1, far);
  assert.equal(walk.phase, 'returning');
  assert.deepEqual(walk.named, []);
  for (let tick = 0; tick < 40_000 && phaseOf(walk) !== 'done'; tick++)
    assert.equal(walk.step(0.1, far).say, null, 'she says nothing on her way home');
  assert.ok(near(walk, station('lamplighters').keeper) < 1e-6, 'behind her counter');
  assert.deepEqual([...walk.heard], [MET_SCENE]);
  assert.equal(walk.given, false);
});

test('taken up after the stops said, she greets no more and leads to a stop not yet said', () => {
  const start = SPAWNS[0] as Point;
  const said = [MET_SCENE, 'welcomeMage', 'welcomeSmiths'];
  const walk = WelcomeWalk.round(STATIONS, FRAME, start, said) as WelcomeWalk;
  let asked = walk.step(0, start);
  for (let tick = 0; tick < 40_000 && !asked.say; tick++)
    asked = walk.step(0.1, walk.phase === 'coming' ? start : [walk.maren.x, walk.maren.y + 1.5]);
  assert.ok(asked.say && !said.includes(asked.say), `said ${asked.say}`);
});

test('ended, she stops where she is; a plaza without her counter has no welcome', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME, SPAWNS[0] as Point) as WelcomeWalk;
  walk.step(2, SPAWNS[0] as Point);
  walk.end();
  assert.equal(walk.phase, 'done');
  assert.equal(walk.maren.walking, false);
  const without = STATIONS.filter((station) => station.kind !== 'lamplighters');
  assert.equal(WelcomeWalk.round(without, FRAME, SPAWNS[0] as Point), null);
});

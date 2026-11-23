import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StationInfo } from '../nodes.ts';
import { inPlaza, plazaPoint } from '../townsfolk.ts';
import { WayGraph } from '../life/ways.ts';
import { FRAME, SHAPE_SPOTS, STATIONS, WAYS, solidAt } from './plazaForTests.ts';
import {
  CALL_M,
  CAUGHT_UP_M,
  FOLLOW_M,
  LEFT_BEHIND_S,
  MEET_M,
  MET_SCENE,
  START_FAR_M,
  STOPS,
  WALK_M_S,
  WelcomeWalk,
} from './walk.ts';

type Point = readonly [number, number];
const GRAPH = new WayGraph(WAYS);
const station = (kind: string) => STATIONS.find((station) => station.kind === kind) as StationInfo;
const phaseOf = (walk: WelcomeWalk): string => walk.phase;
const near = (walk: WelcomeWalk, point: Point) => Math.hypot(walk.maren.x - point[0], walk.maren.y - point[1]);
/** A point of the plaza by its own frame: metres toward the sea, and across. */
const place = (toward: number, across: number): Point => plazaPoint(FRAME, toward, across);
/** Where the player arrives: the spawns just inside the seaward parapet. */
const SPAWNS: readonly Point[] = [place(56, -60), place(56, -20), place(56, 20), place(56, 60)];
/** Half a body's width, metres: no solid of the courtyard comes nearer her middle. */
const BODY_M = 0.3;

/** The whole walk with a player who stands at `start` until she has met them, or waits for them on the lanes, then
 *  keeps close behind her: the scenes heard, each with the stations named, and the seconds walked. Every step she
 *  stands clear of every solid and of Shape. */
function walkedFrom(start: Point) {
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, start) as WelcomeWalk;
  const heard: { scene: string; named: string[]; across: number }[] = [];
  let [seconds, given, waited] = [0, 0, false];
  for (let tick = 0; tick < 40_000 && walk.phase !== 'done'; tick++) {
    const player = walk.phase === 'coming' && !waited ? start : ([walk.maren.x, walk.maren.y + 1.5] as const);
    const { say, lagging } = walk.step(0.1, player);
    waited ||= lagging;
    seconds += 0.1;
    if (say) {
      const named = walk.named.map((each) => each.kind);
      const across = walk.named.reduce((sum, each) => sum + inPlaza(FRAME, each.counter).across, 0) / named.length;
      heard.push({ scene: say, named, across });
      walk.said();
      if (walk.given && !given) given = seconds;
    }
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    clearOfAll(toward, across, `from ${start}`);
  }
  return { walk, heard, given };
}

/** She stands clear of every solid of the courtyard and of Shape at any spot of his. */
function clearOfAll(toward: number, across: number, why: string): void {
  const solid = solidAt(toward, across, BODY_M);
  assert.equal(solid, null, `${why}: in the ${solid} at (${toward.toFixed(2)}, ${across.toFixed(2)})`);
  for (const [spotToward, spotAcross] of SHAPE_SPOTS) {
    const apart = Math.hypot(toward - spotToward, across - spotAcross);
    assert.ok(apart > 2 * BODY_M, `${why}: ${apart.toFixed(2)} m from Shape at (${spotToward}, ${spotAcross})`);
  }
}

/** The places a player may stand on the plaza, in its own frame: a grid every `step` metres clear of the solids, in
 *  each alcove before and behind its counter, under the portico, and a step before each of Shape's spots. */
function playerPlaces(step: number): [number, number][] {
  const places: [number, number][] = [];
  for (let toward = -58; toward <= 58; toward += step)
    for (let across = -128; across <= 128; across += step) places.push([toward, across]);
  for (const station of STATIONS) {
    const { across } = inPlaza(FRAME, station.counter);
    for (const toward of [-50.4, -53, -55]) for (const aside of [-2.5, 0, 2.5]) places.push([toward, across + aside]);
  }
  for (const across of [-24, -12, -4, 4, 12, 24]) for (const toward of [-58, -50, -43]) places.push([toward, across]);
  for (const [toward, across] of SHAPE_SPOTS) places.push([toward + 2, across], [toward - 2, across]);
  return places.filter(([toward, across]) => solidAt(toward, across, BODY_M) === null);
}

/** She comes to a player standing still at `start`, by the lanes: clear of every solid, of Shape and of the player,
 *  until she greets them or stands on the lanes nearest them, waiting with no prompt. */
function cameTo(start: Point, seen?: (point: Point) => boolean): WelcomeWalk {
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, start, [], seen) as WelcomeWalk;
  const from = inPlaza(FRAME, start);
  const why = `to a player at (${from.toward}, ${from.across})`;
  for (let tick = 0; tick < 3000; tick++) {
    const asked = walk.step(0.1, start);
    const { toward, across } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
    clearOfAll(toward, across, why);
    assert.ok(near(walk, start) > MEET_M - WALK_M_S * 0.1 - 1e-6, `${why}: she comes within ${near(walk, start)} m`);
    if (asked.say) {
      assert.equal(asked.say, MET_SCENE);
      return walk;
    }
    if (!walk.maren.walking && tick > 0) {
      assert.ok(!asked.lagging, `${why}: she waits on the lanes, bidding no one follow before her greeting`);
      assert.ok(near(walk, start) > CALL_M, `${why}: she waits only for a player out of call`);
      return walk;
    }
  }
  assert.fail(`${why}: she never came`);
}

test('coming to a player wherever they stand, she keeps to the lanes, clear of every solid, Shape and the player', () => {
  for (const [toward, across] of playerPlaces(8)) cameTo(place(toward, across));
});

test('coming to a player out of call of the lanes, she waits on them and calls her greeting once they come near', () => {
  const portico = place(-58, 4);
  const walk = cameTo(portico);
  assert.equal(walk.phase, 'coming');
  const { toward } = inPlaza(FRAME, [walk.maren.x, walk.maren.y]);
  assert.ok(Math.abs(toward - -38) < 1e-6, `on the landward lane, at ${toward}`);
  assert.equal(walk.step(0.1, place(-50, 4)).say, MET_SCENE, 'within call, 12 m off the lane');
});

test('between the last row and the benches, she greets the player from the row before them', () => {
  assert.equal(cameTo(place(38, 0)).phase, 'speaking');
});

test('she starts well away from the player, and out of their view where a crossing of the lanes is', () => {
  const crossing = place(34, 20);
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, crossing) as WelcomeWalk;
  assert.ok(near(walk, crossing) >= START_FAR_M, `starts ${near(walk, crossing).toFixed(2)} m from them`);
  for (const [toward, across] of playerPlaces(8)) {
    const player = place(toward, across);
    for (const look of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // A view of 120 degrees about the way they look, as far as the plaza reaches.
      const seen = (point: Point) => {
        const there = inPlaza(FRAME, point);
        const off = Math.atan2(there.across - across, there.toward - toward) - look;
        return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < Math.PI / 3;
      };
      const started = WelcomeWalk.round(STATIONS, FRAME, GRAPH, player, [], seen) as WelcomeWalk;
      const start: Point = [started.maren.x, started.maren.y];
      assert.ok(near(started, player) >= START_FAR_M, `from (${toward}, ${across}): ${near(started, player)} m`);
      assert.ok(!seen(start), `from (${toward}, ${across}) looking ${look}: she starts in their view`);
      if (look === 0) cameTo(player, seen);
    }
  }
});

test('she starts a way off from where the player arrives, and comes to them', () => {
  for (const spawn of SPAWNS) {
    const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, spawn) as WelcomeWalk;
    assert.ok(near(walk, spawn) < 30, `starts ${near(walk, spawn).toFixed(1)} m from them`);
    let asked = walk.step(0, spawn);
    let seconds = 0;
    for (; seconds < 120 && !asked.say; seconds += 0.1) asked = walk.step(0.1, spawn);
    assert.equal(asked.say, MET_SCENE);
    assert.ok(seconds < 30, `met after ${seconds.toFixed(0)} s`);
    assert.ok(near(walk, spawn) <= FOLLOW_M, 'stopped before them, on the lanes');
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
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, SPAWNS[1] as Point) as WelcomeWalk;
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
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, start) as WelcomeWalk;
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

test('taken up after the stops said, she greets a player who stands still before leading to a stop not yet said', () => {
  const start = SPAWNS[0] as Point;
  const said = [MET_SCENE, 'welcomeMage', 'welcomeSmiths'];
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, start, said) as WelcomeWalk;
  const heard: string[] = [];
  for (let tick = 0; tick < 40_000 && heard.length < 2; tick++) {
    const { say, lagging } = walk.step(0.1, heard.length === 0 ? start : [walk.maren.x, walk.maren.y + 1.5]);
    if (heard.length === 0) assert.equal(lagging, false, 'no follow prompt before she has greeted them');
    if (say) (heard.push(say), walk.said());
  }
  assert.equal(heard[0], MET_SCENE, 'she greets them again, so they see her come');
  assert.ok(heard[1] && !said.includes(heard[1]), `then said ${heard[1]}`);
});

test('ended, she stops where she is; a plaza without her counter has no welcome', () => {
  const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, SPAWNS[0] as Point) as WelcomeWalk;
  walk.step(2, SPAWNS[0] as Point);
  walk.end();
  assert.equal(walk.phase, 'done');
  assert.equal(walk.maren.walking, false);
  const without = STATIONS.filter((station) => station.kind !== 'lamplighters');
  assert.equal(WelcomeWalk.round(without, FRAME, GRAPH, SPAWNS[0] as Point), null);
});

test('coming to a player anywhere on the plaza, she bids them follow only once she has greeted them', () => {
  for (const at of [place(-58, 4), place(0, 40), place(-50, 4), ...SPAWNS]) {
    const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, at, [MET_SCENE]) as WelcomeWalk;
    // The player stands where they are until she has greeted them, then walks in from under the portico.
    let player = at;
    for (let tick = 0; tick < 3000 && walk.phase === 'coming'; tick++) {
      const { lagging } = walk.step(0.1, player);
      assert.equal(lagging, false, `no Follow before her greeting, for a player at ${at}`);
      if (tick > 600) player = [player[0], player[1] + (inPlaza(FRAME, player).toward < -45 ? 0.1 : 0)];
    }
    assert.equal(walk.phase, 'speaking', `she greets a player at ${at}`);
  }
});

test('she leads by the ways and stops at each stop’s counters’ way points, on the ways until she goes home', () => {
  const offWays = (walk: WelcomeWalk) => {
    const onWays = GRAPH.onWays([walk.maren.x, walk.maren.y])?.place ?? [Infinity, Infinity];
    return near(walk, onWays);
  };
  for (const spawn of SPAWNS) {
    const walk = WelcomeWalk.round(STATIONS, FRAME, GRAPH, spawn) as WelcomeWalk;
    let stops = 0;
    for (let tick = 0; tick < 40_000 && walk.phase !== 'returning' && walk.phase !== 'done'; tick++) {
      const { say } = walk.step(0.1, [walk.maren.x, walk.maren.y + 1.5]);
      assert.ok(offWays(walk) < 1e-6, `from ${spawn} she leaves the ways at ${walk.maren.x}, ${walk.maren.y}`);
      if (!say) continue;
      if (say !== MET_SCENE) {
        const points = walk.named.map((named) => {
          const index = GRAPH.nearestPoint(named.counter, (each) => GRAPH.names[each]?.startsWith('counter:') ?? false);
          assert.equal(GRAPH.names[index], `counter:${named.kind}`, 'each counter has its own way point');
          return GRAPH.points[index] as Point;
        });
        const middle: Point = [
          points.reduce((sum, point) => sum + point[0], 0) / points.length,
          points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ];
        assert.ok(
          near(walk, middle) < 1e-6,
          `${say}: she stands ${near(walk, middle).toFixed(2)} m from its way points`,
        );
        stops += 1;
      }
      walk.said();
    }
    assert.equal(stops, STOPS.length);
  }
});

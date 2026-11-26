import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { HEAL_RAMP, HEAL_S, HealLights, QUIET_HEAL, healEdgeNode, showHealEdge } from './healLight.ts';
import { MARK_FLOATS } from './marks.ts';
import { coloursDrawn } from './nodes.test.ts';
import { Sparks } from './sparks.ts';
import { Laid } from './spellPixels.ts';
import type { Frame } from './spellPlaces.ts';

type Point = readonly [number, number, number];

const OWN = 1;
const OTHER = 2;
const FEET: Point = [0, 0, 0];
const healed = (player: number, amount = 40): FightEvent => ({
  tick: 0n,
  kind: EVENT.healed,
  how: 0,
  striker: player,
  defender: player,
  amount,
  stroke: 0,
});
/** One frame at `clock` seen from `eye`, the drinker `id` standing at the origin, its jobs run. */
function frameAt(lights: HealLights, clock: number, id: number, eye: Point, still = false) {
  const frame: Frame = {
    ground: new Laid(),
    out: new Laid(),
    eye,
    seconds: 1 / 60,
    clock,
    sparks: new Sparks(),
    random: Math.random,
    players: [{ id, feet: FEET, aim: 0, statuses: undefined }],
    foes: [],
    own: OWN,
  };
  const jobs: { far: number; run: () => void }[] = [];
  lights.frame(frame, jobs, still);
  for (const job of jobs) job.run();
  return { ground: frame.ground.laid(), out: frame.out.laid() };
}
const stops = new Set(HEAL_RAMP.map((colour) => colour.join(',')));
const coloursIn = (out: readonly number[]) => {
  const found = new Set<string>();
  for (let start = 0; start < out.length; start += MARK_FLOATS) found.add(out.slice(start + 3, start + 6).join(','));
  return found;
};
const AWAY: Point = [0, 8, 1.6];

test("a drink's heal glints at the drinker's feet and swirls up round them in red, gone after a second", () => {
  const lights = new HealLights();
  lights.heard([healed(OTHER), { ...healed(OTHER), kind: EVENT.hit }]);
  const first = frameAt(lights, 10, OTHER, AWAY);
  assert.ok(first.ground.length > 0, 'a faint glint at the feet');
  for (const colour of coloursIn(first.ground)) assert.ok(stops.has(colour), colour);
  const later = frameAt(lights, 10.5, OTHER, AWAY);
  assert.equal(later.ground.length, 0, 'the glint gone');
  assert.ok(later.out.length > 0, 'motes swirling');
  for (const colour of coloursIn(later.out)) assert.ok(stops.has(colour), colour);
  const gone = frameAt(lights, 10 + HEAL_S + 0.01, OTHER, AWAY);
  assert.deepEqual([gone.ground.length, gone.out.length], [0, 0]);
});

/** Each vertex's (east, south, up) in a frame's standing marks. */
const pointsOf = (out: readonly number[]) => {
  const points: [number, number, number][] = [];
  for (let start = 0; start < out.length; start += MARK_FLOATS)
    points.push([out[start] ?? 0, out[start + 1] ?? 0, out[start + 2] ?? 0]);
  return points;
};

test('the motes circle the figure, before and behind it, from the feet to just over the head, never dark', () => {
  const lights = new HealLights();
  lights.heard([healed(OTHER)]);
  const dark = HEAL_RAMP[0].join(',');
  // Each leaves the feet in its own time within the first quarter.
  const low = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3].flatMap((clock) => pointsOf(frameAt(lights, clock, OTHER, AWAY).out));
  assert.ok(low.length > 0 && Math.min(...low.map(([, , up]) => up)) < 0.5, 'leaving the feet');
  // The eye stands to the south: the figure's card a body's radius (0.35 m) toward it.
  const middle = pointsOf(frameAt(lights, 0.5, OTHER, AWAY).out);
  assert.ok(middle.some(([, south]) => south > 0.4) && middle.some(([, south]) => south < 0.3), 'before and behind');
  for (const [east, south] of middle) assert.ok(Math.hypot(east, south) < 0.75, 'round the figure, close');
  const high = pointsOf(frameAt(lights, 0.95, OTHER, AWAY).out);
  const top = Math.max(...high.map(([, , up]) => up));
  assert.ok(top > 1.8 && top < 2.4, `just over the head: ${top}`);
  for (const clock of [0, 0.2, 0.5, 0.8, 0.95]) {
    const { out } = frameAt(lights, clock, OTHER, AWAY);
    assert.ok(!coloursIn(out).has(dark), `no dark stop at ${clock}`);
  }
});

test('a heal of nothing shows nothing; another heal heard starts the light again', () => {
  const lights = new HealLights();
  lights.heard([healed(OTHER, 0)]);
  assert.equal(frameAt(lights, 0, OTHER, AWAY).ground.length, 0);
  lights.heard([healed(OTHER)]);
  frameAt(lights, 0, OTHER, AWAY);
  lights.heard([healed(OTHER)]);
  assert.ok(frameAt(lights, 0.9, OTHER, AWAY).ground.length > 0, 'the ring flares anew');
});

test('with motion reduced only a still glint shows, and nothing circles or rises', () => {
  const lights = new HealLights();
  lights.heard([healed(OTHER)]);
  const first = frameAt(lights, 0, OTHER, AWAY, true);
  assert.ok(first.ground.length > 0, 'the glint');
  assert.deepEqual(frameAt(lights, 0.2, OTHER, AWAY, true).ground, first.ground, 'held still');
  for (const clock of [0.1, 0.4, 0.8])
    assert.equal(frameAt(lights, clock, OTHER, AWAY, true).out.length, 0, 'no motes');
});

test("the player's own heal through their own eyes takes the screen's edge, not their figure", () => {
  const lights = new HealLights();
  lights.heard([healed(OWN)]);
  const eye: Point = [0, 0, 1.6];
  const seen = frameAt(lights, 0, OWN, eye);
  assert.deepEqual([seen.ground.length, seen.out.length], [0, 0]);
  assert.ok(lights.screen.edge > 0);
  assert.ok(lights.screen.motes !== null, 'motes rise round the edge');
  frameAt(lights, 0.5, OWN, eye);
  assert.ok(lights.screen.edge > 0 && lights.screen.edge < 0.45, 'fading');
  frameAt(lights, HEAL_S + 0.01, OWN, eye);
  assert.deepEqual(lights.screen, QUIET_HEAL);
  // From behind, in third person, the figure's own light shows and the edge is quiet.
  lights.heard([healed(OWN)]);
  assert.ok(frameAt(lights, 2, OWN, AWAY).ground.length > 0);
  assert.deepEqual(lights.screen, QUIET_HEAL);
  // Nor does a third person's camera looking straight down on the drinker take the edge.
  lights.heard([healed(OWN)]);
  assert.ok(frameAt(lights, 3, OWN, [0, 0.5, 4]).ground.length > 0);
  assert.deepEqual(lights.screen, QUIET_HEAL);
  // Nor one pulled in behind their back against a wall, its eye at head height.
  lights.heard([healed(OWN)]);
  assert.ok(frameAt(lights, 5, OWN, [0, 0.7, 1.6]).ground.length > 0);
  assert.deepEqual(lights.screen, QUIET_HEAL);
});

test('the edge glows in warm red light, with motes; none when quiet', () => {
  assert.equal(healEdgeNode(QUIET_HEAL), null);
  const node = healEdgeNode({ edge: 0.3, motes: 0.2 });
  const drawn = node ? coloursDrawn({ width: 'grow', height: 'grow', children: [node] }, 200, 100) : new Set();
  assert.ok(drawn.size > 0);
  // Warm red light, not a dull band: every colour strongly red.
  for (const css of drawn) {
    const [red = 0, green = 0, blue = 0] = (/rgba\((\d+),(\d+),(\d+)/.exec(String(css)) ?? []).slice(1).map(Number);
    assert.ok(red >= 230 && red - green >= 60 && red - blue >= 60, String(css));
  }
  const still = healEdgeNode({ edge: 0.3, motes: null });
  const plain = still ? coloursDrawn({ width: 'grow', height: 'grow', children: [still] }, 200, 100) : new Set();
  assert.ok(drawn.size > plain.size, 'the motes in a stop of their own');
  showHealEdge({ edge: 0.3, motes: null });
  assert.notEqual(healEdgeNode(), null, 'shown from now on');
  showHealEdge(QUIET_HEAL);
  assert.equal(healEdgeNode(), null);
});

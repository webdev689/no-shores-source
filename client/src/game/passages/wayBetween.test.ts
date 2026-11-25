import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Flow } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { Interface } from '../../ui/ui.ts';
import { LEG_DOTS, WAY_S, type WayFrame } from './passageWay.ts';
import { WayBetween } from './wayBetween.ts';

Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, document: { exitPointerLock: () => undefined } });

/** A game's stand-in: its flow, whether the place has come, the body its room stood and what failed. */
function game() {
  const held = {
    flow: { mode: 'foot', node: 'saltgrass-downs' } as Flow,
    ready: true,
    own: null as unknown,
    failed: '',
  };
  const ways = new WayBetween({
    flow: () => held.flow,
    setFlow: (flow) => (held.flow = flow),
    setReady: (ready) => (held.ready = ready),
    foot: () => (held.own ? ({ fight: { own: held.own } } as unknown as Foot) : null),
    player: () => ({ body: { x: 100, y: 200, z: 5 }, facing: 0 }),
    failed: (why) => (held.failed = why),
  });
  return { held, ways };
}

test('a crossing gate plays the way between the two patrol zones, never the veil, and ends on foot in the far zone', async () => {
  const { held, ways } = game();
  const pass = { kind: 'pass', node: 'mill', name: 'The Mill', into: true } as const;
  assert.equal(
    ways.cross(pass, [0, 0], [1, 1], () => Promise.resolve()),
    false,
    'a gate into an instance is no way',
  );
  const cross = { kind: 'cross', node: 'gullwing-vale', name: 'The Gullwing Vale' } as const;
  let joined = false;
  const work = () => ((joined = true), Promise.resolve());
  assert.equal(ways.cross(cross, [2_800_000, 1_290_000], [2_330_000, 1_900_000], work), true);
  assert.deepEqual(held.flow, { mode: 'passing', then: { mode: 'foot', node: 'gullwing-vale' } });
  assert.equal(held.ready, false);
  await Promise.resolve();
  assert.ok(joined && held.ready, 'the far zone joined behind the way');
  const over = ways.passing(1, held.ready);
  assert.ok(over && over !== 'place' && over.eye[2] > 1_000, 'risen over the island');
  // Held over the island until the far room has stood the body, then down to it and on foot.
  assert.notEqual(ways.passing(WAY_S, held.ready), null);
  held.own = { x: -50, y: 30, z: 2 };
  assert.equal(ways.passing(0.01, held.ready), 'place');
  let shown = ways.passing(WAY_S, held.ready);
  for (let frame = 0; frame < 10 && shown !== null; frame++) shown = ways.passing(0.5, held.ready);
  assert.equal(shown, null);
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
  assert.equal(held.failed, '');
});

const ui = { size: { width: 1280, height: 720, scale: 1 } } as unknown as Interface;
const cross = { kind: 'cross', node: 'gullwing-vale', name: 'The Gullwing Vale' } as const;

test('the way rises from the shot the foot’s camera last stood at, not from a fixed one', () => {
  const { ways } = game();
  const own = { eye: [90, 210, 8], yaw: 2, pitch: 0.3, fov: 0.9, near: 0.1, far: 900 } as const;
  assert.equal(ways.shot(own), own);
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  const first = ways.passing(0.001, false);
  assert.ok(first && first !== 'place');
  assert.ok(Math.hypot(first.eye[0] - 90, first.eye[1] - 210, first.eye[2] - 8) < 0.5, 'the eye where it was');
  assert.ok(Math.abs(first.yaw - 2) < 0.01 && Math.abs(first.fov - 0.9) < 0.01, 'looking where it looked');
});

test('the way’s dots go with the way once the flow leaves it, however it ends', () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(2, false);
  assert.ok(ways.dots(ui), 'drawn over the island');
  // The room gone to shut while the way was held: the player is sent to their ship.
  held.flow = { mode: 'sea' };
  assert.equal(ways.dots(ui), null);
});

test('a room that never stands the body is waited on as the veil waits, then the way comes down', async () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  await Promise.resolve();
  let shown = ways.passing(WAY_S, held.ready);
  for (let frame = 0; frame < 400 && shown !== null; frame++) shown = ways.passing(0.1, held.ready);
  assert.equal(shown, null, 'on foot in the far zone');
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
});

test('the way so far is drawn before the leg being taken', () => {
  const { ways } = game();
  const happening = { kind: 'onward', node: 'passage-continent-1-w1-z7' } as const;
  const come = [
    [0, 0],
    [1_000, 0],
    [2_000, 0],
  ] as const;
  ways.play({ happening, come, to: [3_000, 0], framed: [] }, () => Promise.resolve());
  ways.passing(1, false);
  const dots = (ways as unknown as { way: { frame: WayFrame } }).way.frame.dots;
  assert.equal(dots.filter((dot) => !dot.taking).length, 1 + 2 * LEG_DOTS);
});

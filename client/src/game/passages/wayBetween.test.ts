import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Flow } from '../flow.ts';
import type { Foot } from '../foot.ts';
import { WAY_S } from './passageWay.ts';
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

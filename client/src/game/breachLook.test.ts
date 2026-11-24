import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { BreachSeen } from '../network/breachMessages.ts';
import { RUN_DARK_M, idleBells, runLightAt, runSky, shoresShown } from './breachLook.ts';
import { breachPlanOf, spaceSocket } from './breachPlan.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const plan = breachPlanOf(new WebAssembly.Module(await readFile(MODULE)));
const seen = (more: Partial<BreachSeen>) => ({ rifts: [], awayShore: -1, ...more }) as BreachSeen;

test('a shore is drawn only while someone stands in it, a rift to it opens, or the Steward has taken some there', () => {
  const [was, isNow] = plan.shores.shores ?? [];
  const [stewardWas, stewardIs] = plan.shores.steward ?? [];
  assert.ok(was && isNow && stewardWas && stewardIs);
  assert.deepEqual([...shoresShown(plan, seen({}), [[0, 0, 60]])], [], 'from the Descent, none');
  assert.deepEqual([...shoresShown(plan, seen({ rifts: [0, 1] }), [])], [isNow], 'a rift opening');
  assert.deepEqual([...shoresShown(plan, seen({ awayShore: 1 }), [])], [stewardIs], "the Steward's taken");
  const inside = spaceSocket(plan, stewardWas, 'arrival');
  assert.ok(inside);
  assert.deepEqual([...shoresShown(plan, seen({}), [inside])], [stewardWas], 'a player standing in one');
});

test('a sleeping bell hangs at every bell socket of the spaces drawn but where a bell foe stands', () => {
  const first = spaceSocket(plan, 'choir', 'bell-1');
  assert.ok(first);
  const idle = idleBells(plan, (key) => key === 'choir', [[first[0] + 0.5, first[1], first[2]]]);
  assert.equal(idle.length, 6, "the Choir's seven, one woken");
  assert.ok(!idle.some((bell) => bell[0] === first[0] && bell[1] === first[1]));
});

test("the run's sky is underground: no key light, a low cool light from above, all lost in the dark past its reach", () => {
  const sky = runSky(12);
  assert.deepEqual(sky.keyLight, [0, 0, 0]);
  assert.equal(sky.darkM, RUN_DARK_M);
  assert.equal(sky.worldS, 12, 'the water ripples by the seconds');
  const [red, green, blue] = sky.ambientSky;
  assert.ok(blue > red, 'cool');
  assert.ok(0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.35, "dimmer than a clear noon's 0.35");
  const dark = runLightAt(sky, []);
  const lit = runLightAt(sky, [{ fromEye: [1, 0, 0], reachM: 7, light: [1, 0.6, 0.3] }]);
  assert.ok(
    dark.every((part) => part < 0.55),
    'far from any lamp a figure is dimmer than in the open shade',
  );
  assert.ok((lit[0] ?? 0) > (dark[0] ?? 0) + 0.4, 'and warm by a fire');
  assert.ok(lit.every((part) => part <= 1.2));
});

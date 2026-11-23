import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { MarkDrawer } from '../editor/naval.ts';
import type { FightSource } from '../editor/fighting.ts';
import { startLand } from '../rules/landRules.ts';
import { onScreen } from './camera.ts';
import { SeaCombat } from './seaCombat.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);
/** A square continent far from the fight, so the fight is on the open sea's swell. */
const SQUARE = JSON.stringify({
  continents: [
    {
      id: 'square',
      outline: [
        [200_000, 300_000],
        [320_000, 300_000],
        [320_000, 420_000],
        [200_000, 420_000],
      ],
    },
  ],
  isles: [],
});
const SCREEN = { width: 1920, height: 1080 };

test("aiming on the rules' own swell, the volley's fall stands under the crosshair, the ship heaving under the eye", async () => {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
  });
  const rules = await startLand(bytes);
  rules.open(SQUARE, 'square', null);
  // Under way with its sails set, in a breeze, the swell lifting it a metre and more.
  const first = rules.fightBegin(new Float64Array([180_000, 360_000, 0.3, 6, 0, 0, 6, 2]), 7, 1000);
  let answers = 0;
  const source: FightSource = {
    fightBegin: () => Promise.reject(new Error('begun here')),
    fightStep: (_id, orders, time, ticks) => {
      const view = rules.fightStep(orders, time, ticks, 0, [0, 4]);
      // Every third answer comes a frame late, as over a busy link.
      answers += 1;
      return answers % 3 ? Promise.resolve(view) : new Promise((done) => setImmediate(() => done(view)));
    },
    fightEnd: () => Promise.resolve(),
  };
  const fight = new SeaCombat(
    { source, own: 'Sloop', hull: 0 },
    first,
    { drawInto: () => undefined } as unknown as MarkDrawer,
    1000,
  );
  fight.aim(true);
  let worst = 0;
  for (let frame = 0; frame < 300; frame++) {
    if (frame === 150) fight.drag(0, -60);
    const shot = fight.frame(1 / 60, 1000 + frame / 60, 3000, (error) => assert.fail(String(error)));
    await new Promise((settled) => setImmediate(settled));
    const ends = (fight.view.lay?.ends ?? []).flatMap((end) => (end?.water ? [end.point] : []));
    // Once eased in and its scatter settled; and again a second after the drag laid it farther.
    if (frame < 120 || (frame >= 150 && frame < 210) || !ends.length) continue;
    const middle = [0, 1, 2].map((axis) => ends.reduce((sum, point) => sum + point[axis], 0) / ends.length);
    const seen = onScreen(shot, SCREEN, middle as [number, number, number]);
    assert.ok(seen, `frame ${frame}: the fall is behind the eye`);
    worst = Math.max(worst, Math.hypot(seen[0] - SCREEN.width / 2, seen[1] - SCREEN.height / 2));
  }
  // Inside the landing ring however far it is laid; laid for a sea at rest at the ship's heave, it stood 100 px off.
  assert.ok(worst < 12, `the fall stood ${worst.toFixed(1)} px off the crosshair on a 1080-line screen`);
  rules.fightEnd();
});

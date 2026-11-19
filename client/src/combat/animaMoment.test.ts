import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPELLS } from '../network/artMessages.ts';
import { animaOf, animaScreen, pushedIn, sunAbove } from './animaMoment.ts';

test('the Animas are Tempest, the Sunwell and the Duskraven, each in its Art and element', () => {
  assert.deepEqual(animaOf(SPELLS.tempest), { art: 1, look: 2 });
  assert.deepEqual(animaOf(SPELLS.sunwell), { art: 2, look: 1 });
  assert.deepEqual(animaOf(SPELLS.duskraven), { art: 3, look: 3 });
  assert.equal(animaOf(SPELLS.quicken), null);
});

test("a release takes its caster's screen in held steps: the edge frame for 6 frames, the push in back over 20", () => {
  const after = (frame: number) => animaScreen(3, frame / 60);
  assert.deepEqual(after(0), { look: 3, edge: 0.25, push: 0.05 });
  assert.equal(after(1).edge, 0.25, 'held');
  assert.ok(after(4).edge < after(2).edge && after(4).edge > 0);
  assert.equal(after(6).edge, 0, 'the frame gone after six');
  assert.ok(after(6).push > 0 && after(6).push < 0.05);
  assert.ok(after(19).push > 0);
  assert.deepEqual(after(20), { look: 0, edge: 0, push: 0 });
  for (let frame = 0; frame < 20; frame++) assert.ok(after(frame).edge <= 0.25, 'never past a quarter');
});

test('a view pushed in zooms by its share, and one not pushed is the same view', () => {
  const view: { yaw: number; zoom?: number } = { yaw: 1, zoom: 2 };
  assert.equal(pushedIn(view, 0), view);
  assert.deepEqual(pushedIn(view, 0.05), { yaw: 1, zoom: 2.1 });
  assert.equal(pushedIn<{ yaw: number; zoom?: number }>({ yaw: 0 }, 0.05).zoom, 1.05);
});

test("the Sunwell's sun stands 3.5 m up and 1.5 m along its caster's aim", () => {
  const [x, y, z] = sunAbove([2, 2, 1], Math.PI / 2);
  assert.ok(Math.abs(x - 3.5) < 1e-9 && Math.abs(y - 2) < 1e-9, 'aiming east, east of the well');
  assert.equal(z, 4.5);
});

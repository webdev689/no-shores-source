import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE } from '../overworld/islandView.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { SeaView } from './seaView.ts';

const toward = (dt: number) => ({ feet: [0, 0, 0] as const, dt, ceiling: 3000, heightAt: () => 0 });
const quay: Mark = { id: 'quay', kind: 'social', name: 'The Quay', at: [500, 0, 2] };
const overSide = { focus: [500, 0, 0] as const, yaw: 0, tilt: 0.9, height: 400 };

test('the view comes down to the helm over a second, stands there, and goes back up to the sea', () => {
  const view = new SeaView([0, 0], 0);
  assert.equal(view.toHelm(), true);
  for (let step = 0; step < 12; step += 1) view.step(0.1);
  assert.ok(view.atHelm && view.helmShare === 1);
  view.fromHelm();
  assert.ok(view.helmView && !view.atHelm, 'on the way up');
  for (let step = 0; step < 12; step += 1) view.step(0.1);
  assert.equal(view.kind, 'sail');
  view.step(0.1);
  assert.equal(view.helmShare, 0);
});

test('the view flies up over an island side, its landings marked, and back down to the ship', () => {
  const view = new SeaView([0, 0], 0);
  view.flyToSide([quay], overSide);
  assert.equal(view.toHelm(), false, 'no way down to the helm while it flies');
  view.shot(toward(SIDE.flySeconds / 2));
  assert.equal(view.kind, 'fly');
  const landed = view.shot(toward(SIDE.flySeconds));
  assert.equal(view.kind, 'landing');
  assert.deepEqual(view.shot(toward(0.1)).eye, landed.eye, 'it stands over the side');
  assert.deepEqual(view.landingOf('quay'), { id: 'quay', name: 'The Quay' });
  assert.equal(view.landingOf('harbour'), null);
  view.chosen = 'quay';
  view.backToSea();
  assert.equal(view.chosen, null);
  view.shot(toward(5));
  assert.equal(view.kind, 'sail');
});

test('the switch moves between the Oversea and the Sealevel views; the wheel zooms the Oversea camera alone', () => {
  const view = new SeaView([0, 0], 0);
  assert.equal(view.level, 'oversea');
  const height = () => view.shot(toward(10)).eye[2];
  const start = height();
  view.zoom(3, 3000);
  assert.ok(height() < start, 'the wheel brings the Oversea camera down');
  assert.equal(view.switchLevel(), true);
  assert.equal(view.level, 'sealevel');
  view.step(10);
  assert.equal(view.closeShare, 1, 'eased down to sea level');
  const atSea = height();
  view.zoom(-5, 3000);
  view.zoom(5, 3000);
  assert.equal(height(), atSea, 'at sea level the wheel changes nothing');
  assert.equal(view.level, 'sealevel', 'and never changes the view');
  view.switchLevel('oversea');
  view.step(10);
  assert.equal(view.closeShare, 0);
});

test('the switch acts over the ship alone; flying up over an island takes the view back up, noting a dock', () => {
  const view = new SeaView([0, 0], 0);
  view.switchLevel('sealevel');
  view.flyToSide([quay], overSide, true);
  assert.equal(view.level, 'oversea', 'up over the island from either view');
  assert.equal(view.docked, true);
  assert.equal(view.switchLevel('sealevel'), false, 'no switch while it flies');
  view.flyToSide([quay], overSide);
  assert.equal(view.docked, false, 'gone ashore');
});

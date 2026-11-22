// The pieces both bars of abilities are built of: a recharge's wedge and seconds, a ring's light in use, the turned
// pictures and the slot over its keycap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allOf, wordsIn } from './nodes.test.ts';
import {
  drainSteps,
  filteredSvg,
  ringNode,
  type RingLook,
  slotNode,
  sweepOf,
  TurnedPictures,
  USED_SECONDS,
} from './ringSlot.ts';

const LOOK: RingLook = {
  ring: { key: 'test ring', svg: '<svg></svg>' },
  icon: { key: 'test icon', svg: '<svg></svg>' },
  frame: [1, 1.25],
  iconTurn: [1, 1],
  glow: { width: 2, colour: '#ffffff', opacity: 0.45 },
  sweep: null,
  unable: false,
  used: 0,
};
const keysOf = (look: RingLook, zoom = 1, still = false) =>
  allOf(ringNode(look, new TurnedPictures(), 2, zoom, still)).flatMap((node) => node.picture?.key ?? []);

test('a recharge sweeps its wedge away in steps and counts its last seconds, rounded up', () => {
  assert.deepEqual(sweepOf(0, 12), { sweep: 360, seconds: '', ready: false }, 'just used: all dark, too long to count');
  assert.deepEqual(sweepOf(0.5, 6), { sweep: 180, seconds: '6', ready: false });
  assert.deepEqual(sweepOf(0.75, 2.2), { sweep: 90, seconds: '3', ready: false });
  assert.equal(sweepOf(0.999, 0.01).sweep, 6, 'a sliver left still shows one step');
  assert.equal(sweepOf(0.999, 0.01).seconds, '1', 'never 0 before it is ready');
  assert.deepEqual(sweepOf(1, 0), { sweep: 0, seconds: '', ready: true });
  assert.deepEqual(sweepOf(Number.NaN, 4), { sweep: 360, seconds: '4', ready: false }, 'an unknown share is none');
});

test('a ring in use is lit in steps of the share still to run', () => {
  assert.deepEqual([drainSteps(1), drainSteps(0.5), drainSteps(0.001), drainSteps(0)], [60, 30, 1, 0]);
});

test("a ring's frame glows when lit, its wedge and seconds show as it recharges, and it greys under a hatch when it cannot be used", () => {
  const lit = keysOf(LOOK);
  assert.ok(lit.includes('test ring 1 1.25'), 'its frame lit');
  assert.ok(lit.includes('test ring 1 1'), 'its glow, the frame in its colour');
  const charging = { ...LOOK, glow: null, sweep: sweepOf(0.5, 3) };
  assert.ok(keysOf(charging).includes('ring sweep 180'));
  assert.deepEqual(wordsIn(ringNode(charging, new TurnedPictures(), 2, 1, false)), ['3']);
  const unable = keysOf({ ...LOOK, unable: true });
  assert.ok(unable.includes('unable hatch'));
  assert.ok(
    unable.every((key) => key === 'unable hatch' || / 0 [\d.]+$/.test(key)),
    'every picture grey',
  );
  assert.ok(keysOf({ ...LOOK, drain: 30 }).includes('ring drain 30'), 'lit half round while in use');
});

test('a ring just used brightens its frame for half its flash, or is ringed white with less motion asked for', () => {
  const used = { ...LOOK, used: USED_SECONDS };
  assert.ok(keysOf(used).includes('test ring 1 3'));
  assert.ok(!keysOf({ ...used, used: USED_SECONDS / 4 }).includes('test ring 1 3'), 'its flash over');
  const still = allOf(ringNode(used, new TurnedPictures(), 2, 1, true));
  assert.ok(!still.some((node) => node.picture?.key === 'test ring 1 3'));
  assert.ok(still.some((node) => node.outline?.colour === '#ffffff'));
});

test('a ring stands 22 cells across, its slot its keycap under it, a face drawn on the cap in place of words', () => {
  const ring = ringNode(LOOK, new TurnedPictures(), 3, 2, false);
  assert.deepEqual([ring.width, ring.height], [132, 132], 'at the larger step, doubled');
  const slot = slotNode(ring, 'Shift', 'Burst (Shift), ready', 2, 1);
  assert.equal(slot.label, 'Burst (Shift), ready');
  assert.deepEqual(wordsIn(slot), ['Shift']);
  const drawn = slotNode(ring, 'Right button', '', 2, 1, { width: 7, height: 11, label: 'mouse' });
  assert.deepEqual(wordsIn(drawn), [], 'no words on a drawn cap');
  assert.ok(allOf(drawn).some((node) => node.label === 'mouse'));
});

test('a picture’s colours are turned by a filter laid over it inside its own SVG', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/></svg>';
  assert.equal(filteredSvg(svg, 1, 1), svg, 'untouched');
  const turned = filteredSvg(svg, 0.45, 0.8);
  assert.match(turned, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 2 2"><defs>/);
  assert.match(turned, /type="saturate" values="0.45"/);
  assert.match(turned, /slope="0.8"/);
  assert.match(turned, /<g filter="url\(#turned\)"><rect width="1" height="1"\/><\/g><\/svg>$/);
});

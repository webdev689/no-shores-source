import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../rules/fightRules.ts';
import { Effects } from './effects.ts';

const here = (point: readonly [number, number, number]) => [point[0], point[1], point[2]] as const;

test('a muzzle flashes and smokes, and both are gone a few seconds on', () => {
  const effects = new Effects(1);
  const muzzle: FightEvent = { kind: 'muzzle', ship: 0, point: [10, 20, 1.2], launch: [55, 0, 3] };
  effects.take([muzzle], 0, here);
  const shown = effects.marks(0.05);
  assert.ok(shown.length >= 5, `${shown.length}`);
  assert.ok(shown.every((mark) => Math.hypot(mark.x - 10, mark.y - 20) < 1));
  assert.equal(effects.marks(10).length, 0);
});

test('a splash throws spray up and stirs the water where it fell', () => {
  const effects = new Effects(2);
  const stirs = effects.take([{ kind: 'splash', point: [5, 6, 0] }], 0, here);
  assert.equal(stirs.length, 1);
  assert.deepEqual([stirs[0]?.x, stirs[0]?.y], [5, 6]);
  const rising = effects.marks(0.2);
  assert.ok(rising.length > 0 && rising.every((mark) => mark.z > 0), 'the spray rises at first');
  assert.equal(effects.marks(5).length, 0);
});

test('a hull hit throws splinters that fall', () => {
  const effects = new Effects(3);
  effects.take([{ kind: 'hit', ship: 1, by: 0, zone: 'holed', point: [0, 0, 0.5] }], 0, here);
  const early = effects.marks(0.1);
  const late = effects.marks(0.9);
  const meanHeight = (marks: readonly { z: number }[]) => marks.reduce((sum, mark) => sum + mark.z, 0) / marks.length;
  assert.ok(early.length >= 6);
  assert.ok(meanHeight(late) < meanHeight(early), 'they fall');
});

test('a ship afire flames and smokes over her deck while she burns', () => {
  const effects = new Effects(4);
  for (let frame = 0; frame < 30; frame++) effects.burn([0, 0, 0], 1, frame / 30, 1 / 30);
  assert.ok(effects.marks(1).length > 5);
  const quiet = new Effects(5);
  quiet.burn([0, 0, 0], 0, 0, 1);
  assert.equal(quiet.marks(0).length, 0);
});

test('events with nothing to show show nothing', () => {
  const effects = new Effects(6);
  effects.take(
    [
      { kind: 'run-out', side: 'port' },
      { kind: 'load', shot: 'grape' },
    ],
    0,
    here,
  );
  assert.equal(effects.marks(0).length, 0);
});

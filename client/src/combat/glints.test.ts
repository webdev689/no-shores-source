import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLASH } from '../player/cardLooks.ts';
import type { FighterView } from '../rules/fighters.ts';
import { GLINT, foeGlints, glintStage, ironOutline } from './glints.ts';
import { MARK_FLOATS } from './marks.ts';
import { IRON, STEEL } from './markSprites.ts';

const telegraph = (elapsed: number, iron: boolean): FighterView['action'] => ({
  kind: 'telegraph',
  shape: 'slam',
  elapsed,
  windup: 54,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 0,
  iron,
  feintAt: null,
});
const foe = (action: FighterView['action']) => ({ view: { x: 0, y: 0, z: 0, facing: 0, action } as FighterView });
const eye = [0, 6, 2] as const;

test('a glint flashes at 80% of the way to its blow for four ticks, white-hot for the first two', () => {
  const stages = Array.from({ length: 60 }, (unused, elapsed) => glintStage(elapsed, 50));
  assert.equal(stages.indexOf(0), Math.floor(GLINT.at * 50));
  assert.deepEqual(stages.slice(40, 44), [0, 0, 1, 1]);
  assert.equal(stages.filter((stage) => stage !== null).length, GLINT.ticks);
});

test("a foe's glint stands over its weapon in steel, red for an iron blow, and none outside its moment", () => {
  const glintAt = Math.floor(GLINT.at * 54);
  assert.equal(foeGlints([foe(telegraph(glintAt - 1, false))], eye).length, 0);
  const plain = foeGlints([foe(telegraph(glintAt, false))], eye);
  const iron = foeGlints([foe(telegraph(glintAt, true))], eye);
  const coloured = (mesh: number[], colour: readonly number[]) =>
    Array.from({ length: mesh.length / MARK_FLOATS }).some((unused, vertex) =>
      colour.every((part, index) => mesh[vertex * MARK_FLOATS + 3 + index] === part),
    );
  assert.ok(coloured(plain, STEEL[3]) && coloured(iron, IRON[2]) && !coloured(plain, IRON[2]));
  const heights = Array.from(
    { length: plain.length / MARK_FLOATS },
    (unused, vertex) => plain[vertex * MARK_FLOATS + 2] ?? 0,
  );
  assert.ok(Math.min(...heights) > 1.7, 'a slam is wound up overhead');
  const swing: FighterView['action'] = {
    kind: 'attack',
    stroke: 1,
    elapsed: 19,
    strike: 24,
    end: 60,
    swing: 'plain',
    leftHand: false,
  };
  assert.ok(foeGlints([foe(swing)], eye).length > 0, 'a plain swing glints too');
});

test("an iron blow outlines its foe in iron red for its wind-up's last 12 ticks, a plain one never", () => {
  assert.equal(ironOutline(telegraph(41, true)), undefined);
  assert.deepEqual(ironOutline(telegraph(42, true)), { stage: FLASH.outline, colour: IRON[2] });
  assert.equal(ironOutline(telegraph(50, false)), undefined);
  assert.equal(ironOutline({ kind: 'idle' }), undefined);
});

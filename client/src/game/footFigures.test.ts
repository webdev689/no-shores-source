import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fighting } from '../combat/fighting.ts';
import type { Flashes } from '../combat/flashes.ts';
import type { Cards } from '../player/cards.ts';
import { plainDress } from '../player/dressing.ts';
import { CARD_NEAREST_M } from '../player/figures.ts';
import { Walker } from '../player/walker.ts';
import type { Body } from '../rules/movementRules.ts';
import { figuresEye, ownCard } from './footFigures.ts';

const body = { x: 0, y: 0, z: 0, facing: 0, mode: 'ground', over: null } as unknown as Body;

/** A walker standing at the origin, its camera in its head. */
function inTheirOwnEyes(): Walker {
  const player = { body, previous: body, blend: 1, mounted: false, view: { shown: 0 } } as unknown as Walker['player'];
  const you = { id: 1, dress: plainDress('human', 0.3), facing: 0 } as unknown as ConstructorParameters<
    typeof Walker
  >[1];
  const hands = { strokes: () => 0 } as unknown as ConstructorParameters<typeof Walker>[2];
  return new Walker(player, you, hands, { card: () => ({}) } as unknown as Cards);
}

test("the player's own figure is drawn from a cutscene's eye whatever their own view, and never through their eyes", () => {
  const walker = inTheirOwnEyes();
  assert.equal(walker.inFirstPerson, true);
  const fight = { player: 1, own: null, others: new Map() } as unknown as Fighting;
  const flashes = { flashOf: () => undefined } as unknown as Flashes;
  const feel = { shift: () => [0, 0, 0] as const, smear: () => null, drawnAt: new Map() };
  const own = (eye: ReturnType<typeof figuresEye>) => ownCard(walker, fight, flashes, undefined, eye, feel);
  assert.equal(own(figuresEye(null, [3, 0, 1.6], true)), null, 'through their own eyes, no figure');
  assert.notEqual(own(figuresEye([3, 0, 1.6], [0, 0, 1.6], true)), null, 'a cutscene sees them');
});

test("every figure is placed for a cutscene's eye while one holds the camera, none kept off its lens", () => {
  assert.deepEqual(figuresEye([5, 6, 2], [1, 2, 1.6], true), { x: 5, y: 6, nearest: 0, held: true });
  assert.deepEqual(figuresEye(null, [1, 2, 1.6], true), { x: 1, y: 2, nearest: CARD_NEAREST_M, held: false });
  assert.deepEqual(figuresEye(undefined, [1, 2, 1.6], false), { x: 1, y: 2, nearest: 0, held: false });
});

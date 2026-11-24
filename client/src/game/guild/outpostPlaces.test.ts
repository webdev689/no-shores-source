import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CELL_M, PLOT_M, type Plot } from './outpostLaw.ts';
import { decorPlaceOf, moduleOf, placeOf, plotBoxes, socketOf } from './outpostPlaces.ts';

const GROUND = { plot: [1000, 2000], level: 12 } as const;
const WEST = 1000 - PLOT_M / 2;
const NORTH = 2000 - PLOT_M / 2;
const standing = (kind: string, x: number, y: number, turn = 0, tier = 1, building = 0) => ({
  id: 1,
  kind,
  tier,
  building,
  x,
  y,
  turn,
});

test('a structure is its kind at its tier, a scaffold of its cells while built, and a standard of its staff', () => {
  assert.equal(moduleOf(standing('hall', 6, 6, 0, 2), 'oak'), 'outpost-hall-2');
  assert.equal(moduleOf(standing('dock', 0, 0, 1, 0, 1), 'oak'), 'outpost-scaffold-2x3');
  assert.equal(moduleOf(standing('counting', 0, 0, 0, 1, 2), 'oak'), 'outpost-scaffold-2', 'rising, it is built again');
  assert.equal(moduleOf(standing('standard', 7, 11), 'whalebone'), 'outpost-standard-whalebone');
});

test('a structure stands at the middle of its cells on the level ground, turned its quarters', () => {
  const hall = placeOf(standing('hall', 6, 6), GROUND, 'oak');
  assert.deepEqual(hall.at, [WEST + 8 * CELL_M, NORTH + 8 * CELL_M, 12], 'the plot middle');
  const dock = placeOf(standing('dock', 0, 0, 1), GROUND, 'oak');
  assert.deepEqual(dock.at, [WEST + 1.5 * CELL_M, NORTH + 1 * CELL_M, 12], 'turned, three cells across and two down');
  assert.equal(dock.turn, Math.PI / 2);
});

test('decoration stands at its metres from the corner, turned in steps of fifteen degrees', () => {
  const well = decorPlaceOf({ id: 1, piece: 'well', x: 3.25, y: 10, turn: 6 }, GROUND);
  assert.deepEqual(well.at, [WEST + 3.25, NORTH + 10, 12]);
  assert.ok(Math.abs(well.turn - Math.PI / 2) < 1e-9);
});

test("a structure walls its own cells and no other's, turned or not", () => {
  const plot: Plot = { structures: [standing('dock', 4, 4, 1)], decor: [] };
  const boxes = plotBoxes(plot, GROUND, 'oak');
  assert.ok(boxes.length > 0);
  for (const box of boxes) {
    assert.ok(box.minX >= WEST + 4 * CELL_M - 1e-6 && box.maxX <= WEST + 7 * CELL_M + 1e-6, 'three cells across');
    assert.ok(box.minY >= NORTH + 4 * CELL_M - 1e-6 && box.maxY <= NORTH + 6 * CELL_M + 1e-6, 'two cells down');
    assert.ok(box.bottom >= 12 - 1e-6 && box.top > box.bottom);
  }
});

test("a structure's use is where its module says, toward its front, which a quarter turn swings round", () => {
  const [x, y] = socketOf(standing('counting', 2, 2), GROUND, 'oak', 'use');
  assert.ok(x > WEST + 2 * CELL_M && x < WEST + 4 * CELL_M, 'within its cells across');
  assert.ok(y > NORTH + 3 * CELL_M, 'toward its front, the south, unturned');
  const [westward] = socketOf(standing('counting', 2, 2, 1), GROUND, 'oak', 'use');
  assert.ok(westward < WEST + 3 * CELL_M, 'turned a quarter, toward the west');
  const [, bare] = socketOf(standing('counting', 2, 2), GROUND, 'oak', 'none such');
  assert.equal(bare, NORTH + 4 * CELL_M + 1, 'a metre before its front edge where its module has no such socket');
});

test('a piece turned off the quarters is walled where it is drawn: a Lawn Bed at 45 degrees along its diagonal', () => {
  const ground = { plot: [1000, 2000], level: 0 } as const;
  const [middleX, middleY] = [ground.plot[0] - PLOT_M / 2 + 20, ground.plot[1] - PLOT_M / 2 + 20];
  const boxes = plotBoxes({ structures: [], decor: [{ id: 1, piece: 'lawn-bed', x: 20, y: 20, turn: 3 }] }, ground, '');
  const inside = (x: number, y: number) =>
    boxes.some((box) => x > box.minX && x < box.maxX && y > box.minY && y < box.maxY);
  const along = Math.PI / 4;
  assert.equal(inside(middleX + 3.5 * Math.cos(along), middleY + 3.5 * Math.sin(along)), true, 'its drawn end walls');
  assert.equal(inside(middleX, middleY + 3.5), false, 'empty ground beside it does not');
});

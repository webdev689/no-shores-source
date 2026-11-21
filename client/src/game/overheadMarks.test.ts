import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import { resourcePicture } from './gearGlyphs.ts';
import type { StationInfo } from './nodes.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import {
  MIN_RAD,
  MOST,
  OVER_HEAD_M,
  OVER_NODE_M,
  REACH_M,
  WIDTH_M,
  markOfKind,
  markedHere,
  overheadMarks,
} from './overheadMarks.ts';

const station = (kind: string, keeper: readonly [number, number]): StationInfo => ({
  kind,
  keeper,
  counter: [keeper[0], keeper[1] + 2],
});

test('each keeper who deals with a player wears their own mark over their crown; a stall that deals with no one none', () => {
  const here = {
    stations: [station('weaponsmith', [0, 0]), station('chandler', [10, 0]), station('harbourmaster', [20, 0])],
  };
  const marked = markedHere(null, here, () => 3);
  assert.equal(marked.length, 2, 'the chandler deals with no one');
  assert.equal(marked[0]?.picture, keeperPicture('weaponsmith'), "the Weaponsmith's sign, as his screen shows it");
  assert.deepEqual(
    marked[0]?.at,
    [0, 0, 3 + BODY_HEIGHT + OVER_HEAD_M],
    'over his crown, on the floor where he stands',
  );
  assert.ok(keeperPicture('harbourmaster'), 'the Harbourmaster has a sign of his own');
});

test("a faction keeper's mark is its emblem in the diamond, edged in its Art's colour", () => {
  const mark = markOfKind('lamplighters');
  assert.ok(mark);
  assert.equal(mark.rows.length, 21);
  assert.ok(mark.rows.every((row) => row.length === 21));
  assert.equal(mark.rows[0], `${'.'.repeat(10)}a${'.'.repeat(10)}`, 'a diamond, its point outlined');
  assert.equal(mark.rows[10]?.charAt(1), 'b', 'its edge in the faction’s colour');
  assert.ok(
    mark.rows.every((row) => /^[.a-f]+$/.test(row)),
    'six colours at most, as a picture is laid',
  );
  assert.equal(markOfKind('lamplighters'), mark, 'cut once');
  assert.equal(markOfKind('chandler'), null);
});

test("Shape wears his mark on his week's spot, and each node to gather its resource's picture over its ground", () => {
  const gear = {
    shape: { place: 0, wares: [] },
    nodes: [{ index: 1, x: 5, y: 5, resource: 0 }],
  } as unknown as GearState;
  const marked = markedHere(gear, { stations: [], visitorSpots: [[40, 40]] }, () => 1);
  assert.equal(marked[0]?.picture, keeperPicture('shape'));
  assert.deepEqual(marked[0]?.at, [40, 40, 1 + BODY_HEIGHT + OVER_HEAD_M]);
  assert.equal(marked[1]?.picture, resourcePicture(0));
  assert.deepEqual(marked[1]?.at, [5, 5, 1 + OVER_NODE_M]);
});

/** The widest a laid mark stands across, metres, from its vertices. */
const widthOf = (vertices: readonly number[]): number => {
  const across = vertices.filter((unused, index) => index % MARK_FLOATS === 0);
  return Math.max(...across) - Math.min(...across);
};

test('a mark is a hand across near, never narrower on the screen than MIN_RAD far, faded at the end of its reach', () => {
  const picture = keeperPicture('mage');
  assert.ok(picture);
  const over = [0, 0, 2] as const;
  const seen = (far: number) => overheadMarks([{ picture, at: over }], [0, -far, 2], 0, true);
  assert.ok(Math.abs(widthOf(seen(3)) - WIDTH_M) < 0.05, 'a hand across, near');
  const far = 25;
  assert.ok(Math.abs(widthOf(seen(far)) - 2 * far * Math.tan(MIN_RAD)) < 0.1, 'wider far off, so it still shows');
  const opacities = (vertices: readonly number[]) => vertices.filter((unused, index) => index % MARK_FLOATS === 6);
  assert.ok(
    opacities(seen(10)).every((opacity) => opacity === 1),
    'whole within the reach',
  );
  assert.ok(
    opacities(seen(REACH_M - 1)).every((opacity) => opacity > 0 && opacity < 1),
    'fading at its end',
  );
  assert.deepEqual(seen(REACH_M + 1), [], 'none past it');
});

test('a mark bobs on a phase of its own, holds still under reduced motion, and only the nearest are laid', () => {
  const picture = keeperPicture('vault');
  assert.ok(picture);
  const one = [{ picture, at: [0, 0, 2] as const }];
  assert.notDeepEqual(overheadMarks(one, [0, -5, 2], 0, false), overheadMarks(one, [0, -5, 2], 0.25, false));
  assert.deepEqual(overheadMarks(one, [0, -5, 2], 0, true), overheadMarks(one, [0, -5, 2], 0.25, true), 'held still');
  const each = overheadMarks(one, [0, -5, 2], 0, true).length;
  const many = Array.from({ length: MOST + 4 }, (unused, place) => ({ picture, at: [place * 0.5, 0, 2] as const }));
  assert.equal(overheadMarks(many, [0, -5, 2], 0, true).length, MOST * each, `the nearest ${MOST}`);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markPicture } from '../combat/drops.ts';
import { OVER_HEAD_M, WIDTH_M, marksSeen } from '../combat/marksOver.ts';
import type { PropTable } from '../models/tables.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import type { StationInfo } from './nodes.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import { entrancesOf } from './entrances.ts';
import { DOOR_PICTURE, keeperLit, markOfKind, markedHere } from './overheadMarks.ts';
import { countersOf } from './plazaLife.ts';
import { STATIONS } from './welcome/plazaForTests.ts';
import { awayFromCounters } from './townsfolk.ts';

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

test("the Postmaster's sealed letter is lit over him while letters wait for the player, and unlit while none does", () => {
  const here = { stations: [station('mail', [0, 0]), station('weaponsmith', [10, 0])] };
  const letter = { id: 9, from: 0, crowded: false, vestige: null, item: null };
  const lit = (mail: readonly unknown[]) =>
    markedHere({ mail } as unknown as GearState, here, () => 0).map((mark) => mark.lit);
  assert.equal(markedHere(null, here, () => 0)[0]?.picture, keeperPicture('mail'), 'his own sign');
  assert.deepEqual(lit([letter]), [true, false], 'his alone, while a letter waits');
  assert.deepEqual(lit([]), [false, false]);
});

test('a keeper a quest step asks the player to speak with is lit; the others are not', () => {
  const here = { stations: [station('stormcallers', [0, 0]), station('lamplighters', [10, 0])] };
  const lit = markedHere(
    null,
    here,
    () => 0,
    null,
    (counter) => counter === 'lamplighters',
  ).map((mark) => mark.lit);
  assert.deepEqual(lit, [false, true]);
  assert.deepEqual(
    markedHere(null, here, () => 0).map((mark) => mark.lit),
    [false, false],
    'none, asked by no quest',
  );
});

test('the bounty board wears a gold "!" over its gable, a sign of its own in the keepers\' diamond; no other plaza one', () => {
  const here = countersOf({ stations: [], board: [5, 2], boardAt: [5, 0] });
  const marked = markedHere(null, here, () => 1);
  const sign = keeperPicture('board');
  assert.ok(sign);
  assert.equal(marked.length, 1);
  assert.equal(marked[0]?.picture, sign);
  assert.deepEqual(marked[0]?.at.slice(0, 2), [5, 0], 'over the board, not where it is read');
  assert.ok((marked[0]?.at[2] ?? 0) > 1 + 3 + OVER_HEAD_M, 'over its gable, higher than a keeper’s crown');
  assert.deepEqual([sign.rows.length, sign.rows[0]?.length], [21, 21], 'the size of every keeper’s sign');
  assert.notDeepEqual(sign.colours, keeperPicture('weaponsmith')?.colours, 'in gold, not the keepers’ brass');
  // The "!": a stroke over a dot, a gap between.
  const column = sign.rows.map((row) => row.charAt(10));
  assert.deepEqual([column[6], column[11], column[12], column[14]], ['d', 'd', 'b', 'd']);
  assert.equal(markedHere(null, countersOf({ stations: [] }), () => 1).length, 0, 'no board, no mark');
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

test("Shape wears his mark on his week's spot; a node to gather wears none, its own picture standing on the ground", () => {
  const gear = {
    shape: { place: 0, wares: [] },
    nodes: [{ index: 1, x: 5, y: 5, resource: 0 }],
  } as unknown as GearState;
  const marked = markedHere(gear, { stations: [], visitorSpots: [[40, 40]] }, () => 1);
  assert.equal(marked[0]?.picture, keeperPicture('shape'));
  assert.deepEqual(marked[0]?.at, [40, 40, 1 + BODY_HEIGHT + OVER_HEAD_M]);
  assert.equal(marked.length, 1, 'no mark over the node');
});

test("alone, where the page holds no gear, a patrol's entrances the room told still wear their doors", () => {
  const door = { type: 2, a: [-0.634, 0.045, -1.692], b: [-0.634, -2.205, -1.692], c: [0.616, -2.205, -1.692] };
  const props = { 42000: { doors: [{ ...door, n: [0, 0, -1] }] } } as unknown as PropTable;
  const told = entrancesOf([100, 200, 10, 0, 0, -50, 80, 4, Math.PI / 2, 0]);
  const marked = markedHere(
    null,
    { stations: [] },
    () => 0,
    props,
    () => null,
    told,
  );
  assert.equal(marked.length, 2, 'one mark an entrance');
  assert.ok(marked.every((mark) => mark.picture === DOOR_PICTURE));
});

test("each of a patrol's dungeon entrances wears a door over its door; none where its gear names none", () => {
  // Entrance model 0 (42000) with its door as the forged props measure it.
  const door = { type: 2, a: [-0.634, 0.045, -1.692], b: [-0.634, -2.205, -1.692], c: [0.616, -2.205, -1.692] };
  const props = { 42000: { doors: [{ ...door, n: [0, 0, -1] }] } } as unknown as PropTable;
  // Three entrances, five numbers each: x, y, the ground, the yaw and the model.
  const dungeons = [100, 200, 10, 0, 0, -50, 80, 4, Math.PI / 2, 0, 300, -20, 0, Math.PI, 0];
  const patrol = { dungeons } as unknown as GearState;
  const marked = markedHere(patrol, { stations: [] }, () => 0, props);
  assert.equal(marked.length, 3, 'one mark an entrance');
  assert.ok(marked.every((mark) => mark.picture === DOOR_PICTURE));
  const [x = 0, y = 0, z = 0] = marked[0]?.at ?? [];
  // Its door looks south at yaw 0: the mark stands a mark's width before it, over its lintel on the lifted block.
  const near = (one: number, other: number) => Math.abs(one - other) < 1e-9;
  assert.ok(near(x, 100 - 0.009) && near(y, 200 + 1.692 + WIDTH_M), `over its door: ${x}, ${y}`);
  assert.ok(near(z, 10 + 2.5 + 0.045 + OVER_HEAD_M), `over its lintel: ${z}`);
  assert.deepEqual(
    markedHere({ dungeons: [] } as unknown as GearState, { stations: [] }, () => 0, props),
    [],
  );
  assert.deepEqual(
    markedHere(null, { stations: [] }, () => 0, props),
    [],
    'none with no gear',
  );
  assert.deepEqual(
    markedHere(patrol, { stations: [] }, () => 0),
    [],
    'none before the props say where doors are',
  );
  assert.ok(
    DOOR_PICTURE.rows.every((row) => row.length === 12 && /^[.a-f]+$/.test(row)),
    'as a resource is drawn',
  );
});

test("near, the hub's twelve marks are laid in layers, in under half the vertices of laying them flat", () => {
  const pictures = [...STATIONS.map((station) => markOfKind(station.kind)), keeperPicture('shape')].filter(
    (picture) => picture !== null,
  );
  assert.equal(pictures.length, 12, 'eleven counters that deal with a player, and Shape');
  const around = pictures.map((picture, index) => ({
    picture,
    at: [5 * Math.cos(index), 5 * Math.sin(index), 2] as const,
  }));
  const layered = marksSeen(around, [0, 0, 1.7], 0, true).length;
  const flat = pictures.reduce((sum, picture) => {
    const out: number[] = [];
    markPicture(out, picture, [0, 0, 0], [0, -5, 0], 1, 0.5);
    return sum + out.length;
  }, 0);
  assert.ok(layered < flat / 2, `${layered} numbers a frame against ${flat}`);
});

test('a keeper away from their counter is not lit, on the map or over their post', () => {
  const letter = { id: 9, from: 0, crowded: false, vestige: null, item: null };
  const gear = { mail: [letter] } as unknown as GearState;
  assert.equal(
    keeperLit(gear, 'mail', () => false),
    true,
    'letters wait',
  );
  awayFromCounters.add('mail');
  try {
    assert.equal(
      keeperLit(gear, 'mail', () => true),
      false,
      'away, whatever waits',
    );
  } finally {
    awayFromCounters.delete('mail');
  }
});

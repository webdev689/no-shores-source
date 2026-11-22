import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markPicture } from '../combat/drops.ts';
import { OVER_HEAD_M, marksSeen } from '../combat/marksOver.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import type { StationInfo } from './nodes.ts';
import { keeperPicture } from './npc/npcMarks.ts';
import { markOfKind, markedHere } from './overheadMarks.ts';
import { STATIONS } from './welcome/plazaForTests.ts';

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

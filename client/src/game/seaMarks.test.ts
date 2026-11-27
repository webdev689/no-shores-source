import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { eyeFor, poseOf, TILT } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { islandMarksOf, landfallMarks, seaMarks } from './seaMarks.ts';
import type { NodeKind } from './worldData.ts';

const viewport = { width: 1600, height: 900 };
const ship: Point2 = [3_800_000, 2_400_000];
const node = (id: string, kind: NodeKind, name: string, centre: Point2, locked: boolean) => ({
  ...{ id, kind, name, continent: 'continent-1', ring: [], spawns: [], centre },
  locked,
});

test("an island's locked node is marked locked, and over the island no node is marked on the map: its panel holds them", () => {
  const nodes = [
    node('downs', 'patrol', 'The Downs', [ship[0], ship[1] - 300], false),
    node('mill', 'mission', 'The Burned Mill', [ship[0] + 60, ship[1] - 300], true),
  ];
  const marks = islandMarksOf({ nodes, plan: null, heightAt: () => 5 });
  assert.deepEqual(
    marks.map((mark) => [mark.id, mark.locked]),
    [
      ['downs', false],
      ['mill', true],
    ],
  );
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], 0, TILT.initial, 260));
  assert.deepEqual(seaMarks('landing', marks, ship, pose, viewport, null), { placed: [], shown: [] });
  assert.deepEqual(seaMarks('sail', marks, ship, pose, viewport, null).shown, [], 'nor at sea');
});

test('at sea a port city shows its port alone, with no Playlist beside it; a ruined city shows none', () => {
  const harbour: Point2 = [ship[0], ship[1] - 400];
  const plan = { id: 'sunspire', name: 'Sunspire', harbour, ruined: false, social: { level: 4 } };
  const marksOf = (shape: object) => islandMarksOf(shape as unknown as Parameters<typeof islandMarksOf>[0]);
  const marks = marksOf({ nodes: [], plan, heightAt: () => 5 });
  assert.deepEqual(
    marks.map((mark) => [mark.id, mark.kind]),
    [['sunspire-port', 'port']],
  );
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], 0, TILT.initial, 260));
  const { shown } = seaMarks('sail', marks, ship, pose, viewport, null);
  assert.deepEqual(
    shown.map((mark) => [mark.id, mark.note]),
    [['sunspire-port', '400 m']],
  );
  assert.deepEqual(
    marksOf({ nodes: [], plan: { ...plan, ruined: true }, heightAt: () => 5 }),
    [],
    'a ruin has no port',
  );
});

test('a landfall frames only the nodes on its side, its city among them when docking, never its port', () => {
  const centre: Point2 = [ship[0], ship[1] - 2_000];
  const island: Mark[] = [
    { id: 'downs', kind: 'patrol', name: 'The Downs', at: [ship[0], ship[1] - 300, 0] },
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', at: [ship[0], ship[1] - 3_800, 0] },
    { id: 'sunspire-port', kind: 'port', name: 'Sunspire', at: [ship[0], ship[1] - 3_900, 0] },
  ];
  assert.deepEqual(
    landfallMarks(island, ship, centre, false).map((mark) => mark.id),
    ['downs'],
  );
  assert.deepEqual(
    landfallMarks(island, ship, centre, true).map((mark) => mark.id),
    ['sunspire-social', 'downs'],
  );
  const far: Mark = { id: 'moors', kind: 'patrol', name: 'The Moors', at: [ship[0] + 9_000, ship[1] + 4_000, 0] };
  const regions = [
    { centre: ship, nodes: ['moors'] },
    { centre: [ship[0] - 50_000, ship[1]] as Point2, nodes: ['downs'] },
  ];
  assert.deepEqual(
    landfallMarks([...island, far], ship, centre, true, regions).map((mark) => mark.id),
    ['sunspire-social', 'moors'],
    'a region frames its own places, wherever they lie, and not the side’s others',
  );
  const unlisted: Mark = { ...far, id: 'cairn' };
  assert.deepEqual(
    landfallMarks([...island, far, unlisted], ship, centre, false, regions).map((mark) => mark.id),
    ['moors', 'cairn'],
    'and a place no region lists',
  );
  assert.deepEqual(
    landfallMarks(island, ship, centre, false, [{ centre: ship, nodes: ['elsewhere'] }]).map((mark) => mark.id),
    ['downs'],
    'a region with none of its places marked frames the side',
  );
});

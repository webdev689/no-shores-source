import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { eyeFor, poseOf, TILT } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { islandMarksOf, landingChoice, playlistPort, seaMarks } from './seaMarks.ts';
import type { NodeKind } from './worldData.ts';

const viewport = { width: 1600, height: 900 };
const ship: Point2 = [3_800_000, 2_400_000];
const node = (id: string, kind: NodeKind, name: string, centre: Point2, locked: boolean) => ({
  ...{ id, kind, name, continent: 'continent-1', ring: [], spawns: [], centre },
  locked,
});

test("an island's locked node is marked locked, and over its side its mark says Locked where its distance was", () => {
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
  const { shown } = seaMarks('landing', marks, marks, ship, pose, viewport, null);
  const looks = Object.fromEntries(shown.map((mark) => [mark.id, [mark.locked, mark.note]]));
  assert.deepEqual(looks, { downs: [false, '300 m'], mill: [true, 'Locked'] });
});

test('a click over the side chooses an open landing and a second lands there; a locked one only says it is locked', () => {
  const side: Mark[] = [
    { id: 'downs', kind: 'patrol', name: 'The Downs', at: [0, 0, 0] },
    { id: 'mill', kind: 'mission', name: 'The Burned Mill', at: [0, 0, 0], locked: true },
  ];
  assert.deepEqual(landingChoice(side, null, 'downs'), { kind: 'choose' });
  assert.deepEqual(landingChoice(side, 'downs', 'downs'), { kind: 'land' });
  assert.deepEqual(landingChoice(side, 'downs', 'mill'), { kind: 'locked', words: 'The Burned Mill is locked' });
  assert.deepEqual(landingChoice(side, null, 'mill'), { kind: 'locked', words: 'The Burned Mill is locked' });
  assert.equal(landingChoice(side, null, 'elsewhere'), null, 'a mark not on the side');
});

test('a port city’s Playlist stands beside its port at sea, never covering it nor thinned by it, and over its side', () => {
  const harbour: Point2 = [ship[0], ship[1] - 400];
  const plan = { id: 'sunspire', name: 'Sunspire', harbour, ruined: false, social: { level: 4 } };
  const marks = islandMarksOf({ nodes: [], plan, heightAt: () => 5 } as unknown as Parameters<typeof islandMarksOf>[0]);
  assert.deepEqual(
    marks.map((mark) => [mark.id, mark.kind]),
    [
      ['sunspire-port', 'port'],
      ['sunspire-playlist', 'playlist'],
    ],
  );
  assert.deepEqual([playlistPort('sunspire-playlist'), playlistPort('sunspire-port')], ['sunspire', null]);
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], 0, TILT.initial, 260));
  const { placed } = seaMarks('sail', marks, [], ship, pose, viewport, null);
  const [port, playlist] = ['sunspire-port', 'sunspire-playlist'].map((id) => placed.find((mark) => mark.id === id));
  assert.ok(port && playlist, 'both shown at sea');
  assert.ok(Math.abs(playlist.x - port.x) >= (port.sizePx + playlist.sizePx) / 2, 'beside it, never over it');
  const side = seaMarks(
    'landing',
    marks,
    [marks[1]].filter((mark) => mark !== undefined),
    ship,
    pose,
    viewport,
    null,
  );
  assert.deepEqual(
    side.shown.map((mark) => mark.id),
    ['sunspire-playlist'],
    'shown over the side, though Sunspire’s social space is shut',
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { eyeFor, poseOf, TILT } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { islandMarksOf, landfallMarks, landingChoice, playlistPort, seaMarks } from './seaMarks.ts';
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

test('a Playlist shows at sea only while its port’s mark does, so a port thinned away takes its Playlist with it', () => {
  const ashore = (east: number): Mark['at'] => [ship[0] + east, ship[1] - 900, 2];
  const marks: Mark[] = [
    { id: 'near-port', kind: 'port', name: 'Near', at: ashore(0), edge: true },
    { id: 'near-playlist', kind: 'playlist', name: 'Playlist', at: ashore(0), edge: true },
    { id: 'far-port', kind: 'port', name: 'Far', at: ashore(1), edge: true },
    { id: 'far-playlist', kind: 'playlist', name: 'Playlist', at: ashore(1), edge: true },
  ];
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], 0, TILT.initial, 260));
  const shown = seaMarks('sail', marks, [], ship, pose, viewport, null).placed.map((mark) => mark.id);
  assert.equal(shown.filter((id) => id.endsWith('-port')).length, 1, 'one port of two a metre apart');
  const port = shown.find((id) => id.endsWith('-port'))?.replace('-port', '');
  assert.deepEqual(
    shown.filter((id) => id.endsWith('-playlist')),
    [`${port}-playlist`],
  );
});

test('a landfall frames only the nodes on its side; the Playlist shows there however the island is reached', () => {
  const centre: Point2 = [ship[0], ship[1] - 2_000];
  const island: Mark[] = [
    { id: 'downs', kind: 'patrol', name: 'The Downs', at: [ship[0], ship[1] - 300, 0] },
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', at: [ship[0], ship[1] - 3_800, 0] },
    { id: 'sunspire-port', kind: 'port', name: 'Sunspire', at: [ship[0], ship[1] - 3_900, 0] },
    { id: 'sunspire-playlist', kind: 'playlist', name: 'Playlist', at: [ship[0], ship[1] - 3_900, 0] },
  ];
  const ashore = landfallMarks(island, ship, centre, false);
  assert.deepEqual(
    ashore.side.map((mark) => mark.id),
    ['downs', 'sunspire-playlist'],
  );
  assert.deepEqual(
    ashore.framed.map((mark) => mark.id),
    ['downs'],
    'the far harbour’s Playlist is not stretched into view',
  );
  const docking = landfallMarks(island, ship, centre, true);
  assert.deepEqual(
    docking.side.map((mark) => mark.id),
    ['sunspire-social', 'downs', 'sunspire-playlist'],
  );
  assert.deepEqual(
    docking.framed.map((mark) => mark.id),
    ['sunspire-social', 'downs'],
    'framed on the nodes',
  );
});

test('over the island’s side the Playlist stands beside its city’s mark, never on it, and off the picture at its edge', () => {
  const centre: Point2 = [ship[0], ship[1] - 2_000];
  // The plaza a few hundred metres from the harbour: from over the side the two would be drawn as one.
  const island: Mark[] = [
    { id: 'downs', kind: 'patrol', name: 'The Downs', at: [ship[0] + 1_500, ship[1] - 1_200, 0], edge: true },
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', at: [ship[0], ship[1] - 1_500, 0], edge: true },
    {
      id: 'sunspire-playlist',
      kind: 'playlist',
      name: 'Playlist',
      at: [ship[0] + 200, ship[1] - 1_400, 0],
      edge: true,
    },
  ];
  const pose = poseOf(eyeFor([ship[0], ship[1] - 1_400, 0], 0, TILT.initial, 6_000));
  const { side } = landfallMarks(island, ship, centre, true);
  const { placed } = seaMarks('landing', island, side, ship, pose, viewport, null);
  const placedAs = (id: string) => placed.find((mark) => mark.id === id);
  const [social, playlist] = [placedAs('sunspire-social'), placedAs('sunspire-playlist')];
  assert.ok(social && playlist, 'both shown');
  assert.equal(playlist.y, social.y, 'level with it');
  assert.ok(Math.abs(playlist.x - social.x) >= (playlist.sizePx + social.sizePx) / 2, 'clear of it');
  // Gone ashore far along the coast, the harbour off the picture: the Playlist waits at its edge.
  const far = poseOf(eyeFor([ship[0] + 60_000, ship[1], 0], 0, TILT.initial, 2_000));
  const away = seaMarks('landing', island, landfallMarks(island, ship, centre, false).side, ship, far, viewport, null);
  const held = away.placed.find((mark) => mark.id === 'sunspire-playlist');
  assert.ok(held, 'still shown');
  assert.ok(held.x >= 0 && held.x <= viewport.width && held.y >= 0 && held.y <= viewport.height, 'on the picture');
});

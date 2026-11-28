import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenHostile } from '../network/messages.ts';
import { eyeFor, poseOf, TILT } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { emblemSvg, markPicture } from '../plus/emblems.ts';
import { rankColour } from '../ships/shipBars.ts';
import {
  hostileLook,
  hostileMarks,
  hostileName,
  hostileNote,
  hostileUnder,
  orHostile,
  SAID_S,
  SeaWatch,
  sightedHostiles,
  sightOf,
  type WaterNamed,
  waterWords,
} from './seaHostiles.ts';
import { seaMarks } from './seaMarks.ts';

const ship = [3_800_000, 2_400_000] as const;
const hostile = (id: number, east: number, rest: Partial<SeenHostile> = {}): SeenHostile => ({
  id,
  x: ship[0] + east,
  y: ship[1],
  heading: 0,
  faction: 1,
  rank: 2,
  hull: 0,
  level: 23,
  sight: 25_920,
  ...rest,
});

test('a hostile ship is sighted within its own sight of the ship, the least sight where the room sends none', () => {
  assert.equal(sightOf({ faction: 1 }), 5_000);
  assert.equal(sightOf({ faction: 1, sight: 25_920 }), 25_920);
  const ships = [
    hostile(1, 25_000),
    hostile(2, 27_000),
    hostile(3, 4_900, { sight: undefined }),
    hostile(4, 5_100, { sight: 0 }),
  ];
  assert.deepEqual(
    sightedHostiles(ships, ship).map((each) => each.id),
    [1, 3],
  );
});

test('its mark bears its name on its hull, its faction’s emblem, its rank’s colour and a Miniboss’s mark', () => {
  assert.equal(hostileName(hostile(1, 0, { hull: 2 })), 'Tithe Brig');
  assert.equal(hostileName(hostile(1, 0, { faction: 1, hull: 1 })), 'Tithe Schooner');
  assert.equal(hostileName(hostile(1, 0, { hull: undefined })), 'Tithe Sloop');
  const [minor, major, elite, miniboss] = [1, 2, 3, 4].map((rank) => hostileLook(hostile(1, 0, { rank })));
  assert.deepEqual(
    [minor, major, elite, miniboss].map((look) => look?.colour),
    [rankColour(1), rankColour(2), rankColour(3), rankColour(4)],
  );
  assert.ok(rankColour(1) !== rankColour(2) && rankColour(2) !== rankColour(3) && rankColour(3) === rankColour(4));
  assert.equal(miniboss?.badge, markPicture('miniboss').svg);
  assert.deepEqual([minor?.badge, major?.badge, elite?.badge], [null, null, null], 'only a Miniboss bears the mark');
  assert.equal(minor?.emblem, emblemSvg(1));
  assert.equal(hostileNote(hostile(1, 0), 12_000), 'Level 23 · 12.0 km');
  assert.equal(hostileNote(hostile(1, 0, { level: 0 }), 600), '600 m', 'no level from a room that sends none');
});

test('the view marks every sighted hostile ship, never thinned away by a port beside it', () => {
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], Math.PI / 2, TILT.initial, 260));
  const viewport = { width: 1600, height: 900 };
  const ships = [hostile(1, 8_000), hostile(2, 40_000)];
  const port: Mark = { id: 'port', kind: 'port', name: 'Sunspire', at: [ship[0] + 8_000, ship[1] + 10, 2], edge: true };
  const { shown } = seaMarks('sail', [port], ship, pose, viewport, null, ships);
  const marked = shown.find((mark) => mark.id === 'hostile-1');
  assert.ok(marked, 'its mark, though a port stands where it does');
  assert.deepEqual([marked.kind, marked.name, marked.note], ['hostile', 'Tithe Sloop', 'Level 23 · 8.0 km']);
  assert.ok(!shown.some((mark) => mark.id === 'hostile-2'), 'out of its sight: no mark');
  const behind = seaMarks('sail', [], ship, pose, viewport, null, [hostile(3, -8_000)]).shown[0];
  assert.ok(behind && behind.arrowDegrees !== null, 'off the picture, held at its edge with its arrow');
  assert.equal(seaMarks('other', [], ship, pose, viewport, null, ships).shown.length, 0, 'none in a fight');
  assert.equal(hostileMarks(ships, ship)[0]?.edge, true);
});

const water = (name: string, holder: WaterNamed['holder'], levels: [number, number] | null): WaterNamed => ({
  island: 'continent-1',
  name,
  holder,
  levels,
});

test('the status line names the water, its band and its holder', () => {
  assert.equal(waterWords(water('The Fen Deeps', 'grey-tithe', [22, 26])), 'The Fen Deeps, levels 22-26, Grey Tithe');
  assert.equal(waterWords(water('The Lantern Sea', 'home', [1, 4])), 'The Lantern Sea, Overlook’s home waters');
  assert.equal(waterWords(water('The Mistwrack', 'lattice', [16, 19])), 'The Mistwrack, levels 16-19, The Lattice');
  for (const each of [
    water('The Sunscorch Coves', 'grey-tithe', [10, 13]),
    water('The Fen Deeps', 'grey-tithe', [22, 26]),
  ])
    assert.ok(waterWords(each).split(' ').length <= 25);
});

test('the voyage’s line says when a hostile ship is first sighted, and when the ship enters other waters', () => {
  const watch = new SeaWatch();
  const deeps = water('The Fen Deeps', 'grey-tithe', [22, 26]);
  watch.step(0.1, [], ship, water('The Windward Levy', 'grey-tithe', [19, 22]));
  assert.equal(watch.words, null, 'the first water is the one it is in, not one entered');
  watch.step(0.1, [], ship, deeps);
  assert.equal(watch.words, 'Entering The Fen Deeps, levels 22-26, Grey Tithe.');
  assert.equal(watch.waterWords, 'The Fen Deeps, levels 22-26, Grey Tithe');
  watch.step(0.1, [hostile(5, 12_000, { hull: 2 }), hostile(6, 20_000)], ship, deeps);
  assert.equal(watch.words, 'A Tithe Brig sighted, 12.0 km off.', 'the nearest first');
  watch.step(SAID_S, [hostile(5, 11_000, { hull: 2 }), hostile(6, 19_000)], ship, deeps);
  assert.equal(watch.words, null, 'said once, held its while, then gone');
  watch.step(0.1, [], ship, deeps);
  watch.step(0.1, [hostile(5, 11_000, { hull: 2 })], ship, deeps);
  assert.match(String(watch.words), /^A Tithe Brig sighted/, 'one gone from the sea and back is sighted again');
});

test('by night a Grey Tithe ship sails dark and is sighted only close, as the sky says', () => {
  const night = (rangeM: number, lit: boolean) => Math.min(rangeM, lit ? 650 : 220);
  assert.equal(sightOf({ faction: 1, sight: 25_920 }, night), 220);
  assert.equal(sightOf({ faction: 0, sight: 25_920 }, night), 650, 'a ship showing her lanterns is seen farther');
});

test("a click on a hostile ship's hull or rig meets it, the nearest first, as large as it is drawn", () => {
  // Heading north (its bow to -y), 2 km east of the player's ship; an eye 200 m west of it and 30 m up.
  const near = hostile(7, 2_000);
  const far = hostile(8, 2_400);
  const eye = [near.x - 200, near.y, 30] as const;
  const toward = (east: number, south: number, up: number) => {
    const length = Math.hypot(east, south, up);
    return [east / length, south / length, up / length] as const;
  };
  const atNear = toward(200, 0, -26);
  assert.deepEqual(hostileUnder(eye, atNear, [far, near], 1)?.id, 'hostile-7', 'its hull, before the one behind');
  assert.ok(Math.abs((hostileUnder(eye, atNear, [near], 1)?.distance ?? 0) - 195) < 10);
  assert.equal(hostileUnder(eye, toward(200, 0, -20), [near], 1)?.id, 'hostile-7', 'its sails, over its deck');
  assert.equal(hostileUnder(eye, toward(200, 0, -10), [near], 1), null, 'the sky over its mastheads');
  assert.equal(hostileUnder(eye, toward(200, 30, -30), [near], 1), null, 'the water 30 m aft of it');
  assert.equal(hostileUnder(eye, toward(200, 30, -30), [near], 4)?.id, 'hostile-7', 'drawn four times its size');
  assert.equal(hostileUnder(eye, toward(0, 1, 0), [near], 1), null, 'looking away');
  // By night a dark ship is sighted only close, but one drawn farther is still one to click.
  const unsighted = hostile(9, 2_000, { sight: 1_000 });
  assert.equal(hostileUnder(eye, atNear, [unsighted], 1)?.id, 'hostile-9', 'drawn beyond its sight: clicked');
});

test('a click meets a hostile ship before the sea behind it, but never before a mark, nor before land in front of it', () => {
  const near = hostile(7, 2_000);
  const eye = [near.x - 200, near.y, 30] as const;
  const ray = { eye, direction: [200 / 201.7, 0, -26 / 201.7] as const };
  const along = (east: number) => [eye[0] + east, eye[1], 0] as const;
  const met = (picked: Parameters<typeof orHostile>[0]) => orHostile(picked, ray, [near], 1, (hull) => hull);
  assert.deepEqual(met({ kind: 'sea', point: along(230) }), { kind: 'mark', id: 'hostile-7' }, 'the sea behind it');
  assert.deepEqual(met({ kind: 'none' }), { kind: 'mark', id: 'hostile-7' });
  assert.deepEqual(met({ kind: 'mark', id: 'port-1' }), { kind: 'mark', id: 'port-1' }, 'a mark first');
  assert.deepEqual(
    met({ kind: 'land', point: along(100) }),
    { kind: 'land', point: along(100) },
    'a headland in front',
  );
});

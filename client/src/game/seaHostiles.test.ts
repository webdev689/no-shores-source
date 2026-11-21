import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenPirate } from '../network/messages.ts';
import { eyeFor, poseOf, TILT } from '../overworld/overworldCamera.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { emblemUrl, markPicture } from '../plus/emblems.ts';
import { rankColour } from '../ships/shipBars.ts';
import {
  hostileLook,
  hostileMarks,
  hostileName,
  hostileNote,
  SAID_S,
  SeaWatch,
  sightedHostiles,
  sightOf,
  type WaterNamed,
  waterWords,
} from './seaHostiles.ts';
import { seaMarks } from './seaMarks.ts';

const ship = [3_800_000, 2_400_000] as const;
const pirate = (id: number, east: number, rest: Partial<SeenPirate> = {}): SeenPirate => ({
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
  assert.equal(sightOf({}), 5_000);
  assert.equal(sightOf({ sight: 25_920 }), 25_920);
  const ships = [
    pirate(1, 25_000),
    pirate(2, 27_000),
    pirate(3, 4_900, { sight: undefined }),
    pirate(4, 5_100, { sight: 0 }),
  ];
  assert.deepEqual(
    sightedHostiles(ships, ship).map((each) => each.id),
    [1, 3],
  );
});

test('its mark bears its name on its hull, its faction’s emblem, its rank’s colour and a Miniboss’s mark', () => {
  assert.equal(hostileName(pirate(1, 0, { hull: 2 })), 'Tithe Brig');
  assert.equal(hostileName(pirate(1, 0, { faction: 2, hull: 1 })), 'Pirate Schooner');
  assert.equal(hostileName(pirate(1, 0, { hull: undefined })), 'Tithe Sloop');
  const [minor, major, elite, miniboss] = [1, 2, 3, 4].map((rank) => hostileLook(pirate(1, 0, { rank })));
  assert.deepEqual(
    [minor, major, elite, miniboss].map((look) => look?.colour),
    [rankColour(1), rankColour(2), rankColour(3), rankColour(4)],
  );
  assert.ok(rankColour(1) !== rankColour(2) && rankColour(2) !== rankColour(3) && rankColour(3) === rankColour(4));
  assert.equal(miniboss?.badge, markPicture('miniboss').url);
  assert.deepEqual([minor?.badge, major?.badge, elite?.badge], [null, null, null], 'only a Miniboss bears the mark');
  assert.equal(minor?.emblem, emblemUrl(1));
  assert.equal(hostileNote(pirate(1, 0), 12_000), 'Level 23 · 12.0 km');
  assert.equal(hostileNote(pirate(1, 0, { level: 0 }), 600), '600 m', 'no level from a room that sends none');
});

test('the view marks every sighted hostile ship, never thinned away by a port beside it', () => {
  const pose = poseOf(eyeFor([ship[0], ship[1], 0], Math.PI / 2, TILT.initial, 260));
  const viewport = { width: 1600, height: 900 };
  const ships = [pirate(1, 8_000), pirate(2, 40_000)];
  const port: Mark = { id: 'port', kind: 'port', name: 'Sunspire', at: [ship[0] + 8_000, ship[1] + 10, 2], edge: true };
  const { shown } = seaMarks('sail', [port], [], ship, pose, viewport, null, ships);
  const hostile = shown.find((mark) => mark.id === 'hostile-1');
  assert.ok(hostile, 'its mark, though a port stands where it does');
  assert.deepEqual([hostile.kind, hostile.name, hostile.note], ['hostile', 'Tithe Sloop', 'Level 23 · 8.0 km']);
  assert.ok(!shown.some((mark) => mark.id === 'hostile-2'), 'out of its sight: no mark');
  const behind = seaMarks('sail', [], [], ship, pose, viewport, null, [pirate(3, -8_000)]).shown[0];
  assert.ok(behind && behind.arrowDegrees !== null, 'off the picture, held at its edge with its arrow');
  assert.equal(seaMarks('other', [], [], ship, pose, viewport, null, ships).shown.length, 0, 'none in a fight');
  assert.equal(hostileMarks(ships, ship)[0]?.edge, true);
});

const water = (name: string, holder: WaterNamed['holder'], levels: [number, number] | null): WaterNamed => ({
  name,
  holder,
  levels,
});

test('the status line names the water, its band and its holder', () => {
  assert.equal(waterWords(water('The Fen Deeps', 'grey-tithe', [22, 26])), 'The Fen Deeps, levels 22-26, Grey Tithe');
  assert.equal(waterWords(water('The Lantern Sea', 'home', [1, 4])), 'The Lantern Sea, Overlook’s home waters');
  assert.equal(waterWords(water('The Cairn Straits', 'contested', [4, 7])), 'The Cairn Straits, levels 4-7, Contested');
  assert.equal(waterWords(water('The Mistwrack', 'pirates', [16, 19])), 'The Mistwrack, levels 16-19, Pirates');
  for (const each of [
    water('The Sunscorch Coves', 'contested', [10, 13]),
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
  watch.step(0.1, [pirate(5, 12_000, { hull: 2 }), pirate(6, 20_000)], ship, deeps);
  assert.equal(watch.words, 'A Tithe Brig sighted, 12.0 km off.', 'the nearest first');
  watch.step(SAID_S, [pirate(5, 11_000, { hull: 2 }), pirate(6, 19_000)], ship, deeps);
  assert.equal(watch.words, null, 'said once, held its while, then gone');
  watch.step(0.1, [], ship, deeps);
  watch.step(0.1, [pirate(5, 11_000, { hull: 2 })], ship, deeps);
  assert.match(String(watch.words), /^A Tithe Brig sighted/, 'one gone from the sea and back is sighted again');
});

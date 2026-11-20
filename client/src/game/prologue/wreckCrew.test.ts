import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../../network/localRoom.ts';
import type { Snapshot } from '../../network/roomConnection.ts';
import { glanceView } from '../../rules/fighters.ts';
import { CREW_ALIVE_MOST, CREW_TYPES, ROOM_FOES_MOST, crewSpots, WreckCrew, type CrewRun } from './wreckCrew.ts';
import { courseOf, inArea, readWreck, topAt, type Zone } from './wreckLayout.ts';
import type { Standing } from './wreckProgress.ts';

const layout = readWreck();
const course = courseOf(layout);
const withCrew = (zone: Zone) => zone as Zone & { readonly crew?: readonly (readonly [number, number])[] };

test('every zone with a wave but the arena stands two or three of the crew on its deck, by the boarders', () => {
  layout.zones.forEach((zone, index) => {
    const spots = crewSpots(zone, course);
    if (zone.wave.length === 0 || index === layout.arena.zone) {
      assert.deepEqual(spots, [], `${zone.name}: no wave, no crew`);
      return;
    }
    const laid = withCrew(zone).crew;
    if (laid)
      assert.deepEqual(
        spots.map((spot) => spot.at),
        laid.map(([x, y]) => [x, y]),
        `${zone.name}: where the layout says`,
      );
    else assert.ok(spots.length >= 2 && spots.length <= 3, `${zone.name}: ${spots.length}`);
    for (const { at } of spots) {
      const [x, y] = at;
      const top = topAt(course, x, y);
      assert.ok(top > 0, `${zone.name}: (${x}, ${y}) stands on a deck`);
      assert.ok(inArea(zone.area, x, y), `${zone.name}: (${x}, ${y}) in its zone`);
      const apart = (foe: (typeof zone.wave)[number]) => Math.hypot(foe.at[0] - x, foe.at[1] - y);
      const near = zone.wave.reduce((best, foe) => (apart(foe) < apart(best) ? foe : best));
      assert.ok(apart(near) < 4, `${zone.name}: (${x}, ${y}) by a boarder, ${apart(near).toFixed(1)} m`);
      assert.ok(Math.abs(top - topAt(course, ...near.at)) < 0.7, `${zone.name}: (${x}, ${y}) on the boarder's deck`);
    }
  });
});

test('a crewman faces the boarder he stands by', () => {
  const zone = layout.zones.find((each) => each.wave.length >= 2 && !withCrew(each).crew);
  if (!zone) return;
  const [spot] = crewSpots(zone, course);
  const foe = zone.wave[0];
  assert.ok(spot && foe);
  const toward = Math.atan2(foe.at[0] - spot.at[0], -(foe.at[1] - spot.at[1]));
  assert.ok(Math.abs(Math.atan2(Math.sin(spot.facing - toward), Math.cos(spot.facing - toward))) < 1e-9);
});

/** A run whose room numbers each foe it stands in turn, and keeps what was stood and dressed. */
function fakeRun(alive: Map<number, number>): { run: CrewRun; stood: number[][]; dressed: number[] } {
  const stood: number[][] = [];
  const dressed: number[] = [];
  let next = 100;
  const run: CrewRun = {
    room: {
      standFoe: (type, rank, x, y, facing, level) => {
        stood.push([type, rank, x, y, facing, level]);
        return next++;
      },
    },
    figures: { dressFoe: (id) => void dressed.push(id) },
    foes: new Map([...alive].map(([id, health]) => [id, { view: { health } }])),
    layout,
    level: 2,
  };
  return { run, stood, dressed };
}

const waveOf = (zone: number): Standing[] => (layout.zones[zone]?.wave ?? []).map((foe) => ({ ...foe, zone }));
const fought = layout.zones.findIndex((zone, index) => zone.wave.length > 0 && index !== layout.arena.zone);

test("a zone's crew stand once, as its first boarder does, as the crew's types at the boarders' level", () => {
  const crew = new WreckCrew();
  const { run, stood, dressed } = fakeRun(new Map());
  crew.stand([], run);
  assert.equal(stood.length, 0, 'no boarder, no crew');
  const [first, ...rest] = waveOf(fought);
  assert.ok(first);
  crew.stand([first], run);
  const spots = crewSpots(layout.zones[fought] as Zone, course);
  assert.equal(stood.length, spots.length);
  stood.forEach(([type, rank, x, y, facing, level], index) => {
    assert.ok(CREW_TYPES.includes(type ?? 0));
    assert.deepEqual([rank, x, y, facing, level], [1, ...(spots[index]?.at ?? []), spots[index]?.facing, 2]);
  });
  assert.deepEqual(dressed, [100, 101, 102].slice(0, spots.length), 'each dressed as a hand of the Brig');
  assert.ok(dressed.every((id) => crew.has(id)) && !crew.has(99), 'known for one of the crew');
  crew.stand(rest, run);
  assert.equal(stood.length, spots.length, 'never twice');
});

test('no more of the crew stand than may live at once, so the boarders always find room', () => {
  const crew = new WreckCrew();
  const zones = layout.zones.flatMap((zone, index) => (crewSpots(zone, course).length ? [index] : []));
  const ids: number[] = [];
  let next = 100;
  const runWith = (alive: Map<number, number>): CrewRun => ({
    ...fakeRun(alive).run,
    room: { standFoe: () => (ids.push(next), next++) },
  });
  // Standing every zone's crew, none yet shown by the room: all are counted living.
  for (const zone of zones.slice(0, -1)) crew.stand(waveOf(zone).slice(0, 1), runWith(new Map()));
  assert.ok(ids.length <= CREW_ALIVE_MOST && ids.length > 0, `${ids.length} living`);
  const before = ids.length;
  // Every one of them shown fallen: the last zone's crew find room.
  crew.stand(waveOf(zones.at(-1) ?? 0).slice(0, 1), runWith(new Map(ids.map((id) => [id, 0]))));
  assert.ok(ids.length > before, 'the fallen leave room');
});

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);

test('in the room on the wreck, a zone’s crew and boarders fight each other with the player far off', async () => {
  const compiled = new WebAssembly.Module(await readFile(MODULE));
  let last: Snapshot | null = null;
  const [wakeX, wakeY] = layout.wake.at;
  const room = LocalRoom.openOverSea(compiled, { x: wakeX, y: wakeY }, course, (snapshot) => (last = snapshot));
  const zone = layout.zones.length - 2;
  const crew = new WreckCrew();
  const ids = new Set<number>();
  const figures = { dressFoe: (id: number) => void ids.add(id) };
  crew.stand(waveOf(zone), { room, figures, foes: new Map(), layout, level: 1 });
  for (const foe of waveOf(zone)) room.standFoe(foe.type, foe.rank, ...foe.at, foe.facing, 1);
  const hurt = new Set<number>();
  for (let tick = 0; tick < 30 * 60; tick++) {
    room.pump(1 / 60);
    for (const foe of (last as Snapshot | null)?.foes ?? []) {
      const { health, healthMax } = glanceView(foe.glance);
      if (health < healthMax) hurt.add(foe.id);
    }
  }
  assert.ok(ids.size >= 2, `${ids.size} of the crew`);
  assert.ok(
    [...ids].some((id) => hurt.has(id)),
    'the boarders strike the crew',
  );
  assert.ok(
    [...hurt].some((id) => !ids.has(id)),
    'the crew strike the boarders',
  );
});

test('the wreck’s room stands as many foes alive as the crew’s share counts on, and no more', async () => {
  const compiled = new WebAssembly.Module(await readFile(MODULE));
  const [wakeX, wakeY] = layout.wake.at;
  const room = LocalRoom.openOverSea(compiled, { x: wakeX, y: wakeY }, course, () => undefined);
  const stood = [...Array(ROOM_FOES_MOST + 1).keys()].map(() => room.standFoe(7, 1, wakeX, wakeY, 0, 1));
  assert.equal(stood.filter((id) => id !== 0).length, ROOM_FOES_MOST);
  assert.equal(stood.at(-1), 0);
});

test('a crewman shown fallen and taken away by the room is never counted living again', () => {
  const crew = new WreckCrew();
  const ids: number[] = [];
  let next = 100;
  const runWith = (alive: Map<number, number>): CrewRun => ({
    ...fakeRun(alive).run,
    room: { standFoe: () => (ids.push(next), next++) },
  });
  const zones = layout.zones.flatMap((zone, index) => (crewSpots(zone, course).length ? [index] : []));
  for (const zone of zones) {
    crew.stand(waveOf(zone).slice(0, 1), runWith(new Map()));
    const shown = [...ids];
    crew.stand([], runWith(new Map(shown.map((id) => [id, 50]))));
    crew.stand([], runWith(new Map()));
  }
  const wanted = zones.reduce((sum, zone) => sum + crewSpots(layout.zones[zone] as Zone, course).length, 0);
  assert.equal(ids.length, wanted, 'every zone stood its whole crew');
});

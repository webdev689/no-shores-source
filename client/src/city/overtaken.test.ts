import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildingMasses } from '../models/buildingPlan.ts';
import type { BuildingTable } from '../models/tables.ts';
import { hullOf, keptMasses, massShape } from './cityMasses.ts';
import { brokenMass } from './ruins.ts';
import type { MassShape } from './cityMasses.ts';
import { FORMATION_HEIGHT, FORMATION_REACH, formationMeshes, FORMATIONS, kindOf, spire } from './crystalFormations.ts';
import {
  buildingGrowth,
  clearOfPlaza,
  type CrystalPlace,
  crystalLamps,
  GREAT_CHANCE,
  greatLamp,
  heapGrowth,
  inPlazaWindow,
  OVERTAKEN,
  worksGrowth,
  wreckCrust,
  wreckCrustAt,
} from './overtaken.ts';
import type { CityPlan, Solid } from './plan.ts';

/** The highest a formation placed in the world reaches, metres. */
const placedTop = (place: CrystalPlace): number => place.at[2] + FORMATION_HEIGHT[place.formation] * place.scale;

test("a spire's tip stands on its leaning body, where the city crate stands it", () => {
  const [body, tip] = spire([10, 20, 5], 8, 2, [0.3, 0.4, 0.1]);
  assert.deepEqual([body.shape, tip.shape], ['column', 'column']);
  assert.equal(tip.material, 'crystal');
  // crates/city/src/overtaken.rs a_spires_tip_stands_on_its_leaning_body holds the same place
  assert.ok(Math.abs(tip.at[0] - 9.885211) < 1e-5 && Math.abs(tip.at[1] - 22.398019) < 1e-5, `${tip.at}`);
  assert.ok(Math.abs(tip.at[2] - 10.498757) < 1e-5, `${tip.at}`);
  assert.ok(tip.shape === 'column' && tip.top === 0 && Math.abs(tip.size[0] - 1.6) < 1e-12);
});

test('every formation is six-sided crystal made alike on every load; a great one is a cluster round a main spire', () => {
  assert.equal(FORMATIONS.length, 40);
  for (const solids of FORMATIONS)
    assert.ok(solids.length >= 2 && solids.every((solid) => solid.material === 'crystal' && solid.shape === 'column'));
  FORMATIONS.forEach((solids, formation) => {
    if (kindOf(formation) !== 'great') return;
    const bodies = solids.filter((solid) => solid.shape === 'column' && solid.top > 0);
    assert.ok(bodies.length >= 5, 'a main spire and several leaning ones, never one lone needle');
    const heights = bodies.map((body) => body.size[2]).sort((a, b) => b - a);
    assert.ok(heights[0] > heights[1] * 1.2, 'one main spire tallest');
    assert.ok(new Set(heights.map((height) => height.toFixed(1))).size >= heights.length - 1, 'of different heights');
    assert.ok(FORMATION_HEIGHT[formation] >= 9);
  });
  const meshes = formationMeshes(9);
  assert.ok(meshes.every((mesh) => mesh.layers.every((layer) => layer === 9)));
  // a forged model's frame: up is its y, so a formation stands up off its foot
  assert.ok(meshes.every((mesh) => Math.max(...mesh.positions.filter((_unused, k) => k % 3 === 1)) > 0.3));
});

/** A house 12 m by 8 m, its walls broken off 6 m up, somewhere in the world. */
const HOUSE: MassShape = {
  east: 0,
  south: 0,
  base: 30,
  turn: 0.4,
  halfAlong: 6,
  halfAcross: 4,
  wall: 6,
  rise: 0,
  hip: false,
};
const breakAt = HOUSE.base + HOUSE.wall;
const places = (count: number) =>
  Array.from({ length: count }, (_unused, k) => [480_000 + k * 37.31, 2_270_000 + k * 11.7] as [number, number]);

test('most buildings are overtaken, some heavily and some lightly, a few untouched, each by its place', () => {
  let [untouched, heavy] = [0, 0];
  for (const place of places(1500)) {
    const growth = buildingGrowth([HOUSE], place, place, 0);
    assert.deepEqual(growth, buildingGrowth([HOUSE], place, place, 0), 'the same every time');
    if (!growth.length) {
      untouched++;
      continue;
    }
    if (growth.some((each) => kindOf(each.formation) === 'mass')) heavy++;
    // the growth hugs its building: every foot within a few metres of its walls, none under its floor or over its break
    for (const { at } of growth) {
      assert.ok(Math.hypot(at[0] - place[0], at[1] - place[1]) < Math.hypot(6, 4) + 4.5, `${at}`);
      assert.ok(at[2] >= HOUSE.base - 0.5 && at[2] <= breakAt, `${at[2]}`);
    }
  }
  assert.ok(Math.abs(untouched / 1500 - OVERTAKEN.untouched) < 0.03, `${untouched} untouched`);
  assert.ok(Math.abs(heavy / 1500 - OVERTAKEN.heavy) < 0.04, `${heavy} heavy`);
});

test('a heavily overtaken building is mostly crystal over its break, its walls sheeted and veined, its foot choked', () => {
  const heavy = places(400)
    .map((place) => buildingGrowth([HOUSE], place, place, 0))
    .filter((growth) => growth.some((each) => kindOf(each.formation) === 'mass'));
  assert.ok(heavy.length > 60);
  for (const growth of heavy) {
    const kinds = growth.map((each) => kindOf(each.formation));
    const over = growth.filter((each) => each.at[2] >= breakAt - 0.5);
    // a mass sized to its footprint and 2 to 3 clusters out of its break, standing well over it
    assert.ok(over.length >= 2 && Math.max(...growth.map(placedTop)) > breakAt + 0.6 * HOUSE.wall);
    assert.ok(kinds.filter((kind) => kind === 'sheet').length >= 2, 'sheets of shards over its walls');
    assert.ok(kinds.includes('vein') && kinds.includes('doorway') && kinds.includes('patch'));
    // its clusters and mass drawn in the middle distance too; its sheets, veins and the rest near
    for (const each of growth)
      assert.equal(each.reach === 'middle', ['breakHeavy', 'mass'].includes(kindOf(each.formation)));
    assert.ok(growth.filter((each) => each.reach === 'middle').length >= 3);
  }
});

test("every foot of a building's crystal stands on its kept masses, never in the air beside them", () => {
  const table = JSON.parse(
    readFileSync(new URL('../../../content/forged/buildings.json', import.meta.url), 'utf8'),
  ) as BuildingTable;
  const place = { east: 480_000, south: 2_270_000, up: 30, yaw: 0.3 };
  let [buildings, feet] = [0, 0];
  for (const id of Object.keys(table).map(Number)) {
    const all = buildingMasses(table, id);
    const hull = hullOf(all);
    if (!hull) continue;
    const cut = hull.base + 0.6 * (Math.min(...keptMasses(all).map((mass) => mass.eaves)) - hull.base);
    const masses = keptMasses(all).flatMap((mass) => {
      const broken = brokenMass(mass, cut);
      return broken ? [massShape(broken, place, [0, 0])] : [];
    });
    buildings++;
    for (let k = 0; k < 6; k++) {
      const standing = [place.east + k * 31.7, place.south + k * 7.3];
      const moved = masses.map((mass) => ({ ...mass, east: mass.east + k * 31.7, south: mass.south + k * 7.3 }));
      for (const each of buildingGrowth(moved, [place.east, place.south], standing, 1)) {
        if (kindOf(each.formation) === 'patch') continue;
        feet++;
        // its foot on or within a kept mass's footprint, as that mass stands turned
        const onMass = moved.some((mass) => {
          const [east, south] = [each.at[0] - place.east - mass.east, each.at[1] - place.south - mass.south];
          const [along, across] = [
            east * Math.cos(mass.turn) + south * Math.sin(mass.turn),
            -east * Math.sin(mass.turn) + south * Math.cos(mass.turn),
          ];
          return Math.abs(along) <= mass.halfAlong + 0.3 && Math.abs(across) <= mass.halfAcross + 0.3;
        });
        assert.ok(onMass, `building ${id}: a ${kindOf(each.formation)} at ${each.at} stands off its masses`);
      }
    }
  }
  assert.ok(buildings > 300 && feet > 10_000, `${buildings} buildings, ${feet} feet`);
});

test('the great formations grow most often by the heart of the city, thinning toward its edge', () => {
  const greats = (heart: number) =>
    places(2000)
      .map((place) => buildingGrowth([HOUSE], place, place, heart))
      .filter((growth) => growth.some((each) => each.reach === 'great')).length;
  const [atHeart, atEdge] = [greats(1), greats(0)];
  assert.ok(Math.abs(atHeart / 2000 - OVERTAKEN.heavy * GREAT_CHANCE.heart) < 0.04, `${atHeart} at the heart`);
  assert.ok(Math.abs(atEdge / 2000 - OVERTAKEN.heavy * GREAT_CHANCE.edge) < 0.02, `${atEdge} at the edge`);
});

test('a fallen heap has a formation at its heart; a large one by the heart of the city may bear a great one', () => {
  const heap = (size: number): Solid => ({
    shape: 'pyramid',
    top: 0.3,
    at: [100, 200, 10],
    size: [size, size * 0.7, 2],
    turn: 0.2,
    lean: 0,
    roll: 0,
    material: 'rubble',
  });
  const grown = places(300).map((place) => heapGrowth(heap(20), place, 1));
  assert.ok(grown.filter((growth) => growth.length > 0).length > 240);
  assert.ok(grown.filter((growth) => growth.some((each) => each.reach === 'great')).length > 100);
  assert.ok(grown.flat().every((each) => Math.hypot(each.at[0] - 100, each.at[1] - 200) < 1e-9 && each.at[2] > 10));
  const small = places(300).map((place) => heapGrowth(heap(8), place, 1));
  assert.ok(!small.flat().some((each) => each.reach === 'great'), 'a small heap bears none');
});

test("great formations crown the wall's towers and breaches, the broken piers' ends and stretches of the quay", () => {
  const solid = (shape: Solid['shape'], material: Solid['material'], foot: number[], size: number[], turn = 0) =>
    ({
      shape,
      ...(shape === 'column' ? { sides: 16, top: 1 } : shape === 'pyramid' ? { top: 0.3 } : {}),
      at: foot,
      size,
      turn,
      lean: 0,
      roll: 0,
      material,
    }) as unknown as Solid;
  const tower = solid('column', 'stone', [0, 0, 10], [16, 16, 12]);
  const breach = solid('pyramid', 'rubble', [100, 0, 10], [8, 17, 4.5]);
  const pier = solid('block', 'timber', [200, 0, -5], [6, 80, 7], Math.PI / 2);
  const quay = solid('block', 'stone', [300, 0, -4], [8, 600, 7]);
  const wall = solid('block', 'stone', [400, 0, 10], [6, 25, 20]);
  const grown = worksGrowth([tower, breach, pier, quay, wall]);
  assert.ok(grown.every((each) => each.reach === 'great' && kindOf(each.formation) === 'great'));
  const near = (east: number) => grown.filter((each) => Math.abs(each.at[0] - east) < 50);
  assert.equal(near(0).length, 1);
  assert.ok(Math.abs(near(0)[0].at[2] - 21.7) < 1e-9, 'on its broken top');
  assert.equal(near(100).length, 1);
  // a pier turned a quarter runs out west along its own +y: its broken end 40 m out
  assert.ok(near(200).length === 1 && Math.abs(near(200)[0].at[0] - 160) < 1e-6, `${near(200)[0]?.at}`);
  const along = grown.filter((each) => Math.abs(each.at[0] - 300) < 1e-6).length;
  assert.ok(along >= 3 && along <= 10, `${along} along the quay`);
  assert.equal(near(400).length, 0, 'a standing stretch of wall bears none');
});

test("a wreck's crust rings its waterline, set out as large as the wreck is drawn", () => {
  const wreck = { ship: 'schooner', at: [5000, 6000], heading: 1, heel: 0.4 } as const;
  const crust = wreckCrust(wreck);
  assert.ok(crust.length >= 8 && crust.every((each) => each.reach === 'great'));
  const asDrawn = (scale: number) => wreckCrustAt(wreck, crust, scale);
  for (const [one, four] of asDrawn(1).map((each, k) => [each, asDrawn(4)[k]])) {
    const [near, far] = [one, four].map((each) => Math.hypot(each.at[0] - 5000, each.at[1] - 6000));
    assert.ok(near < 15 && Math.abs(far - 4 * near) < 1e-6 && four.scale === 4 * one.scale);
  }
});

test('each great formation lights a lamp of the crystal, over its foot; the crown its three tallest spires', () => {
  const place: CrystalPlace = { formation: 36, at: [10, 20, 30], yaw: 0, scale: 1.5, reach: 'great' };
  const lamp = greatLamp(place, 0);
  assert.ok(lamp.at[0] === 10 && lamp.at[2] > 30 && lamp.reachM > 10);
  const great = [...spire([0, 0, 0], 20, 3, [0, 0, 0]), ...spire([30, 0, 0], 12, 2, [0, 0, 0])];
  assert.equal(crystalLamps(great, 1)[0].at[0], 0);
});

test("the plaza's window holds no crystal the page lays", () => {
  const plan = { social: { bounds: [0, 0, 100, 50] } } as unknown as CityPlan;
  assert.ok(inPlazaWindow([-100, 25], 3, plan) && inPlazaWindow([-112, 25], 3, plan));
  assert.ok(!inPlazaWindow([-115, 25], 3, plan) && !inPlazaWindow([50, 200], 3, plan));
  const standing = (east: number, scale: number): CrystalPlace => ({
    formation: 36,
    at: [east, 25, 0],
    yaw: 0,
    scale,
    reach: 'great',
  });
  const reach = FORMATION_REACH[36];
  assert.ok(
    clearOfPlaza(standing(-111 - reach, 1), plan) && !clearOfPlaza(standing(-111 - reach, 1.5), plan),
    'as far as it reaches',
  );
});

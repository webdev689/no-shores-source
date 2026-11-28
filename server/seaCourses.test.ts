import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import islands from '../content/world/islands.json' with { type: 'json' };
import { Passage } from '../client/src/game/passage.ts';
import { portsOf, sitesOf, type CityInfo, type NodeInfo, type WorldData } from '../client/src/game/worldData.ts';
import { worldShown } from '../client/src/game/worldShown.ts';
import { courseBytes } from '../client/src/network/courseMessages.ts';
import type { Point2 } from '../client/src/overworld/ground.ts';
import { regionsOf } from '../client/src/overworld/regions.ts';
import { COURSE_POINTS, maskFromGrid } from '../client/src/overworld/seaRoute.ts';
import { startLand } from '../client/src/rules/landRules.ts';
import { startWatersRules } from '../client/src/rules/watersRules.ts';
import { startRoomDoor } from './roomDoor.ts';
import { SEA_REQUEST } from './seaPorts.ts';

const built = (name: string) =>
  readFile(new URL(`../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const content = (path: string) => readFile(new URL(`../content/world/${path}`, import.meta.url), 'utf8');

/** The world as the page loads it, from the repository's files. */
async function world(): Promise<WorldData> {
  const layoutText = await content('layout.json');
  const layout = JSON.parse(layoutText) as { continents: { id: string; outline: Point2[] }[] };
  const continents = await Promise.all(
    layout.continents.map(async ({ id, outline }) => ({
      id,
      outline,
      climate: null,
      editsText: await content(`land/${id}.json`).catch(() => null),
    })),
  );
  const [cities, nodes]: [CityInfo[], NodeInfo[]] = [[], []];
  for (const continent of continents) {
    if (continent.editsText === null) continue;
    const sites = sitesOf(continent.id, continent.editsText, []);
    if (sites.city) cities.push(sites.city);
    nodes.push(...sites.nodes);
  }
  return { layoutText, continents, cities, nodes, regions: regionsOf(await content('regions.json'), continents) };
}

test('every port, node and region of a named island, chosen on the held map from Overlook, asks to travel there, and the sea takes it as a travel and as a course', async () => {
  const room = await built('room_wasm');
  const module = new WebAssembly.Module(room);
  const shown = await world();
  const rules = startWatersRules(module);
  const table = rules.open(shown.layoutText, portsOf(shown.cities));
  const start = table.ports[0]?.roadstead;
  const home = rules.waterAt(start ?? [0, 0]);
  assert.ok(start && home, "Overlook's roadstead lies in its own water");
  const island = shown.continents[home.continent];
  assert.ok(island?.editsText);
  // Planned as the page plans it near its island: on the island's own fine mask, from its land as the land worker
  // makes it.
  const land = await startLand(await built('land_wasm'));
  const mask = maskFromGrid(land.open(shown.layoutText, island.id, island.editsText, true));
  const outlines = shown.continents.map((continent) => continent.outline);
  const named = new Set(Object.keys(islands));
  const places = [
    ...worldShown(shown).places.map((place) => ({ name: place.id, to: place.sail })),
    ...(shown.regions ?? []).map((region) => ({ name: region.name, to: region.anchorage })),
  ];
  const sea = startRoomDoor(module);
  assert.equal(sea.openSea(SEA_REQUEST, 7), true);
  const asked: { name: string; player: number; ahead: Point2[]; travel: boolean }[] = [];
  for (const { name, to } of places) {
    const there = rules.waterAt(to);
    // Every other island's sea is locked, and the page plans no voyage into it.
    if (!named.has(shown.continents[there?.continent ?? -1]?.id ?? '')) continue;
    const course = new Passage(outlines, () => mask, start, 0).planTo(to);
    assert.ok(course.ok, `${name}: ${course.ok || course.why}`);
    const ahead = course.points.slice(1);
    assert.ok(ahead.length <= COURSE_POINTS.most, `${name}: ${ahead.length} points, more than the sea takes`);
    assert.ok(rules.waterAt(course.points.at(-1) ?? to), `${name}: its end lies at sea, so the map asks to travel`);
    for (const travel of [true, false]) {
      const player = sea.join();
      assert.equal(sea.input(player, courseBytes([start], 1)), 'taken');
      asked.push({ name, player, ahead, travel });
    }
  }
  assert.ok(asked.length >= 40, `${asked.length / 2} places on the named islands`);
  // A course's wait over, each is asked once.
  for (let tick = 0; tick < 40; tick++) sea.tick();
  for (const { name, player, ahead, travel } of asked) {
    const kind = travel ? 'a travel' : 'a course';
    assert.equal(sea.input(player, courseBytes(ahead, 200, travel)), 'taken', `${name}: ${kind} refused`);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mark } from '../overworld/overworldMarks.ts';
import { LOCKED_WORDS, OPEN_SOCIAL_SPACES, socialLocked } from './nodes.ts';
import { entriesOf, islandPanelOf } from './islandWords.ts';
import { islandMarksOf, landable } from './seaMarks.ts';
import { type WorldData, arrivalAt } from './worldData.ts';

/** No draws read yet: the panel says what the island holds alone. */
const NO_FACTS = { activities: null, gates: null, named: (id: string) => id };

/** A port city's island, its city `id` and `name`, `ruined` or living, with its social space and one patrol. */
const cityIsland = (id: string, name: string, ruined: boolean) => {
  const where = { continent: 'continent-4', ring: [], spawns: [], centre: [0, 0] as const };
  return {
    id: 'continent-4',
    plan: { id, name, harbour: [0, 0], ruined, social: { moorings: [] } },
    nodes: [
      { ...where, id: `${id}-social`, kind: 'social', name },
      { ...where, id: `${id}-patrol`, kind: 'patrol', name: 'Dunes' },
    ],
  } as unknown as Parameters<typeof islandPanelOf>[0];
};

test('only the listed cities’ social spaces open: Overlook’s; the rest of every island is open', () => {
  assert.deepEqual([...OPEN_SOCIAL_SPACES], ['overlook']);
  for (const city of OPEN_SOCIAL_SPACES) assert.equal(socialLocked(`${city}-social`), false, city);
  assert.equal(socialLocked('cairnwatch-social'), true);
  assert.equal(socialLocked('cairnwatch-patrol-1'), false, 'the rest of a locked city’s island is open');
});

test('a locked social space says "Opens later" in the island’s panel and cannot be landed at', () => {
  const side: Mark[] = [
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', at: [0, -100, 5], edge: true, locked: true },
    { id: 'sunspire-patrol', kind: 'patrol', name: 'Dunes', at: [40, -100, 5], edge: true },
  ];
  const panel = islandPanelOf(cityIsland('sunspire', 'Sunspire', false), true, NO_FACTS);
  assert.deepEqual([panel.port?.shut, panel.port?.line], [LOCKED_WORDS, `Port city · ${LOCKED_WORDS}`]);
  assert.equal(panel.groups[0]?.entries[0]?.shut, null, 'the rest of its island open');
  assert.equal(landable(side, 'sunspire-social'), null);
  assert.equal(landable(side, 'sunspire-patrol')?.name, 'Dunes');
});

test('a page asked to start in a locked social space starts in Overlook instead', () => {
  const world = {
    cities: [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1' },
      { id: 'rimeholt', name: 'Rimeholt', continent: 'continent-9' },
    ],
    nodes: [],
  } as unknown as WorldData;
  assert.equal(arrivalAt(world, 'rimeholt-social'), null);
  assert.deepEqual(arrivalAt(world, 'overlook-social'), {
    continent: 'continent-1',
    node: 'overlook-social',
    name: 'Overlook',
  });
});

test('a page asked to start in a locked patrol, played alone, is refused it as the server refuses it', () => {
  const world = {
    cities: [],
    nodes: [
      { id: 'tidewall-patrol', kind: 'patrol', name: 'Tidewall', continent: 'continent-2', locked: true },
      { id: 'saltgrass-downs', kind: 'patrol', name: 'Saltgrass Downs', continent: 'continent-1', locked: false },
    ],
  } as unknown as WorldData;
  assert.equal(arrivalAt(world, 'tidewall-patrol'), null, 'its pass is not done');
  assert.equal(arrivalAt(world, 'saltgrass-downs')?.node, 'saltgrass-downs', 'an open one');
});

test('of the locked social spaces only the two other ports’ say "Opens later"; a desolate city’s is listed nowhere', () => {
  const rimeholt = islandPanelOf(cityIsland('rimeholt', 'Rimeholt', false), true, NO_FACTS);
  assert.equal(rimeholt.port?.shut, LOCKED_WORDS);
  const cairnwatch = islandPanelOf(cityIsland('cairnwatch', 'Cairnwatch', true), true, NO_FACTS);
  assert.equal(cairnwatch.port, null, 'a ruin has no port to dock at');
  assert.equal(cairnwatch.playlist, null);
  assert.ok(!entriesOf(cairnwatch).some((entry) => entry.id === 'cairnwatch-social'), 'its plaza is no landing');
  const desolate: Mark[] = [
    { id: 'cairnwatch-social', kind: 'social', name: 'Cairnwatch', at: [20, -100, 5], edge: true, locked: true },
  ];
  assert.equal(landable(desolate, 'cairnwatch-social'), null);
});

test('a social space still locked is a locked mark, never landed at', () => {
  const where = { continent: 'continent-4', ring: [], spawns: [], centre: [0, 0] as const };
  const nodes = [
    { id: 'sunspire-social', kind: 'social', name: 'Sunspire', ...where },
    { id: 'sunspire-patrol', kind: 'patrol', name: 'Dunes', ...where },
  ] as const;
  const marks = islandMarksOf({ nodes, plan: null, heightAt: () => 0 });
  assert.deepEqual(
    marks.map((mark) => mark.locked),
    [true, false],
  );
  assert.equal(landable(marks, 'sunspire-social'), null);
});

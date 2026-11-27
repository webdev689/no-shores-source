import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compassOf, hullBuildsOf, shipPanelOf } from './shipPanel.ts';

const CLASS = '"lasts":1,"rig_lasts":1,"broadside":1,"reload_s":5.6,"way":1,"turn":1,"boarders":2';
const BUILD = `{"name":"Sloop","hull":240,"sail":96,"crew":0,"guns":{"port":3,"starboard":3},"loads":["round","grape","chain","heated"],${CLASS}}`;
/** The build read from the door's JSON as a list of one. */
const sloopBuildOf = (text: string) => hullBuildsOf(`[${text}]`)?.[0] ?? null;

test("each hull's build reads from the door's JSON, and anything else does not", () => {
  assert.equal(sloopBuildOf(BUILD)?.hull, 240);
  assert.equal(hullBuildsOf('not JSON'), null);
  assert.equal(hullBuildsOf(BUILD), null, 'a build alone is no list of them');
  assert.equal(hullBuildsOf('[]'), null);
  assert.equal(hullBuildsOf(`[${BUILD},{"name":"Brig"}]`), null, 'every one must read');
  const negative = BUILD.replace('"hull":240', '"hull":-1');
  assert.equal(sloopBuildOf(negative), null);
  assert.equal(sloopBuildOf(BUILD.replace('"starboard":3', '"other":3')), null);
  assert.equal(sloopBuildOf(BUILD.replace('"boarders":2', '"boarders":"two"')), null, 'its class too');
});

test('a heading reads as whole degrees and the nearest of the eight points', () => {
  assert.equal(compassOf(0), '0° N');
  assert.equal(compassOf(Math.PI / 2), '90° E');
  assert.equal(compassOf((3 * Math.PI) / 4 + 0.05), '138° SE');
  assert.equal(compassOf(-Math.PI / 4), '315° NW');
});

test('Manage shows its vessel and its voyage, and nothing marked Later', () => {
  const build = sloopBuildOf(BUILD);
  assert.ok(build);
  const panel = shipPanelOf(
    build,
    { lengthM: 6.2258, beamM: 1.8561, draughtM: 0.6 },
    { heading: 0, pace: 60, voyageNote: 'At anchor' },
  );
  assert.equal(panel.title, 'Your Sloop');
  assert.deepEqual(
    panel.parts.map((part) => part.heading),
    ['Vessel', 'Voyage'],
  );
  const vessel = new Map(panel.parts[0]?.rows);
  assert.deepEqual(
    [vessel.get('Hull'), vessel.get('Guns'), vessel.get('Loads'), vessel.get('Length')],
    ['240 / 240', '3 a side', 'Round, Grape, Chain, Heated', '6.2 m'],
  );
  assert.deepEqual(panel.parts[1]?.rows, [
    ['Heading', '0° N'],
    ['Pace', '×60'],
    ['Now', 'At anchor'],
  ]);
});

test('Manage lists its men only once its build carries a crew', () => {
  const measure = { lengthM: 6, beamM: 2, draughtM: 0.6 };
  const rowsOf = (crew: number) => {
    const build = sloopBuildOf(BUILD.replace('"crew":0', `"crew":${crew}`));
    assert.ok(build);
    return new Map(shipPanelOf(build, measure, null).parts[0]?.rows);
  };
  assert.equal(rowsOf(0).has('Men'), false, 'no crew yet: no Men row over the Crew marked Later');
  assert.equal(rowsOf(12).get('Men'), '12 / 12');
});

test("Manage's title names its hull, and the ship once it is named", () => {
  const build = sloopBuildOf(BUILD);
  assert.ok(build);
  const measure = { lengthM: 6, beamM: 2, draughtM: 0.6 };
  assert.equal(shipPanelOf(build, measure, null).title, 'Your Sloop');
  assert.equal(shipPanelOf(build, measure, null, null, 'the Grey Gull').title, 'Your Sloop, the Grey Gull');
});

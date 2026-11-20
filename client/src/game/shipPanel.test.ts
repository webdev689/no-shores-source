import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compassOf, shipPanelOf, sloopBuildOf } from './shipPanel.ts';

const BUILD =
  '{"name":"Sloop","hull":240,"sail":96,"crew":0,"guns":{"port":3,"starboard":3},"loads":["round","grape","chain","heated"]}';

test("the Sloop's build reads from the door's JSON, and anything else does not", () => {
  assert.equal(sloopBuildOf(BUILD)?.hull, 240);
  assert.equal(sloopBuildOf('not JSON'), null);
  assert.equal(
    sloopBuildOf('{"name":"Sloop","hull":-1,"sail":96,"crew":0,"guns":{"port":3,"starboard":3},"loads":[]}'),
    null,
  );
  assert.equal(sloopBuildOf('{"name":"Sloop","hull":240,"sail":96,"crew":0,"guns":{"port":3},"loads":[]}'), null);
});

test('a heading reads as whole degrees and the nearest of the eight points', () => {
  assert.equal(compassOf(0), '0° N');
  assert.equal(compassOf(Math.PI / 2), '90° E');
  assert.equal(compassOf((3 * Math.PI) / 4 + 0.05), '138° SE');
  assert.equal(compassOf(-Math.PI / 4), '315° NW');
});

test('Manage shows her vessel and her voyage, and nothing marked Later', () => {
  const build = sloopBuildOf(BUILD);
  assert.ok(build);
  const panel = shipPanelOf(
    build,
    { lengthM: 6.2258, beamM: 1.8561, draughtM: 0.6 },
    { heading: 0, paceStep: 60, voyageNote: 'At anchor' },
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

test('Manage lists her men only once her build carries a crew', () => {
  const measure = { lengthM: 6, beamM: 2, draughtM: 0.6 };
  const rowsOf = (crew: number) => {
    const build = sloopBuildOf(BUILD.replace('"crew":0', `"crew":${crew}`));
    assert.ok(build);
    return new Map(shipPanelOf(build, measure, null).parts[0]?.rows);
  };
  assert.equal(rowsOf(0).has('Men'), false, 'no crew yet: no Men row over the Crew marked Later');
  assert.equal(rowsOf(12).get('Men'), '12 / 12');
});

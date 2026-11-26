import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { byId, fakeInterface } from '../ui/uiForTests.ts';
import type { IsleAt } from './isleLaw.ts';
import type { IsleHeld, Isles } from './isles.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Sea } from './sea.ts';
import type { Landfall } from './seaLaw.ts';
import { aimOf, clickContext, landingAskNode, SeaLandings } from './seaLandings.ts';

const HARBOUR: Point2 = [1_000, -2_000];
/** Its pier's two places, out from the harbour. */
const PIER = [
  [1_000, -2_050, 0],
  [1_020, -2_060, 0],
] as const;
const PLAN = {
  ...{ id: 'overlook', name: 'Overlook', harbour: HARBOUR, ruined: false },
  ...{ centre: [1_000, 3_000], social: { moorings: PIER } },
};
/** The landmass's coast: a square 100 km a side from the world's corner. */
const COAST: Point2[] = [
  [0, 0],
  [100_000, 0],
  [100_000, 100_000],
  [0, 100_000],
];
const NO_ISLES = { all: () => [] } as unknown as Isles;
/** A cove out at sea, landed on from the north: its anchorage 150 m north of its middle. */
const COVE: IsleAt = {
  seen: { id: 3, seed: '255', at: [0, -50_000], kind: 'cove', continent: 3, found: true },
  built: { reach: 250, anchorage: [0, -50_150], landing: 0 },
};
const COVE_HELD = { seen: COVE.seen } as unknown as IsleHeld;
const WITH_COVE = { all: () => [COVE], byId: (id: number) => (id === 3 ? COVE_HELD : null) } as unknown as Isles;

/** A sea the landings drive: what it was asked, and what it offers. */
function seaOf() {
  const asked: string[] = [];
  const sea = {
    level: 'oversea' as 'oversea' | 'sealevel',
    landfall: null as Landfall,
    position: [0, 0] as Point2,
    bound: null as Point2 | null,
    course: [] as Point2[],
    fight: null as object | null,
    busy: false,
    view: { kind: 'sail' },
    sighted: { others: [] as { x: number; y: number }[] },
    switchLevel: (level: string) => void asked.push(`view ${level}`),
    sailTo: (point: Point2) => {
      asked.push(`sail ${point.join(',')}`);
      sea.bound = point;
    },
    sailIn: (offing: Point2, anchorage: Point2) => {
      asked.push(`in ${anchorage.join(',')}`);
      [sea.bound, sea.course] = [anchorage, [sea.position, offing, anchorage]];
      return true;
    },
    sailToMark: (id: string) => void asked.push(`chase ${id}`),
  };
  return { sea, asked };
}

/** The landings over `seaOf`'s sea, off a port city's island (a ruined one's), among `isles`; `hold` says whether
 *  something else holds the player, and the game lands only while nothing does. */
function landingsOf(ruined = false, isles = NO_ISLES) {
  const { sea, asked } = seaOf();
  const landed: LandingAim[] = [];
  const held = { now: false };
  const landings = new SeaLandings({
    sea: () => sea as unknown as Sea,
    landmass: () => ({ id: 'continent-1', plan: { ...PLAN, ruined }, outline: COAST, heightAt: () => -50 }) as never,
    isles,
    free: () => !held.now,
    land: (aim) => void (!held.now && landed.push(aim)),
  });
  return { landings, sea, asked, landed, hold: (holding: boolean) => (held.now = holding) };
}

test('a click on the sea sails at once; on the island it asks first, and no answer leaves the ship as it was', () => {
  const { landings, asked } = landingsOf();
  landings.click({ kind: 'sea', point: [5, 6, 0] });
  assert.deepEqual(asked, ['sail 5,6']);
  landings.click({ kind: 'land', point: [400, 900, 20] });
  assert.equal(landings.asking?.aim.kind, 'dock');
  assert.equal(landings.asking?.near, false);
  landings.answer(false);
  assert.deepEqual([landings.asking, asked.length], [null, 1], 'no lets it go, nothing sailed');
});

test('yes to dock out of reach makes for the harbour; in reach it sails in to its pier in sight, and docks there', () => {
  const { landings, sea, asked, landed } = landingsOf();
  landings.click({ kind: 'mark', id: 'overlook-port' });
  landings.answer(true);
  assert.deepEqual(asked, [`sail ${HARBOUR.join(',')}`]);
  landings.frame();
  assert.equal(landed.length, 0, 'not yet in reach');
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  landings.frame();
  assert.deepEqual(asked.slice(1), ['view oversea', 'in 1000,-2050'], 'seen from the Oversea view, in to its pier');
  assert.deepEqual([landed.length, landings.making?.kind], [0, 'dock'], 'not docked till it lies there');
  [sea.position, sea.course] = [[1_000, -2_050], []];
  landings.frame();
  assert.deepEqual(
    landed.map((aim) => aim.kind),
    ['dock'],
  );
  landings.frame();
  assert.equal(landed.length, 1, 'once');
  landings.click({ kind: 'land', point: [1, 1, 3] });
  assert.equal(landings.asking?.near, true, 'lying off the harbour now');
  landings.answer(true);
  landings.frame();
  assert.equal(landed.length, 2, 'lying at its berth, docked at once');
});

test("a port's berth is the place of its pier no player's ship lies in, as the sea shows the ships", () => {
  const { landings, sea, asked } = landingsOf();
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  sea.sighted.others = [{ x: 1_002, y: -2_049 }];
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.answer(true);
  assert.deepEqual(asked, ['view oversea', 'in 1020,-2060']);
});

test('another course given while making for a landing lets it go; a fight puts the question by', () => {
  const { landings, sea, landed } = landingsOf();
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.answer(true);
  landings.click({ kind: 'sea', point: [9, 9, 0] });
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  landings.frame();
  assert.deepEqual(landed, [], 'sent elsewhere, it never docks');
  landings.click({ kind: 'land', point: [400, 900, 20] });
  sea.fight = {};
  landings.frame();
  assert.equal(landings.asking, null);
});

test('a coast with no port asks to go ashore, and L asks after what the sea offers where the ship lies', () => {
  const { landings, sea } = landingsOf(true);
  landings.click({ kind: 'land', point: [400, 900, 20] });
  assert.equal(landings.asking?.aim.kind, 'ashore');
  landings.answer(false);
  landings.askHere();
  assert.equal(landings.asking, null, 'nothing offered out of reach');
  sea.landfall = { kind: 'ashore' };
  landings.askHere();
  assert.deepEqual(landings.asking, { aim: { kind: 'ashore', coast: 'Saltmere', toward: [0, 0] }, near: true });
});

test('the island a click is judged against: its living port, its name, and a sea island by its reach', () => {
  const isles = {
    all: () => [{ seen: { id: 3, at: [10_000, 0], kind: 'cove', found: true }, built: { reach: 600 } }],
  } as unknown as Isles;
  const here = clickContext({ id: 'continent-1', plan: PLAN } as never, isles);
  assert.deepEqual(here.port, { id: 'overlook-port', name: 'Overlook', harbour: HARBOUR });
  assert.equal(here.coast, 'Saltmere');
  assert.equal(here.isleAt([10_900, 0])?.id, 3, 'within its reach and a little more');
  assert.equal(here.isleAt([12_000, 0]), null);
  assert.equal(aimOf({ kind: 'isle', id: 3, words: 'the cove' }, here, [0, 0])?.kind, 'isle');
});

test('the confirmation asks in brass; its yes’s press answers yes, and Cancel’s no', () => {
  const { ui, step } = fakeInterface(1280, 720);
  const answers: boolean[] = [];
  const asking = { aim: { kind: 'dock', port: 'Overlook', harbour: HARBOUR } as const, near: false };
  const root = () => landingAskNode(ui, asking, (yes) => answers.push(yes));
  step(root);
  const card = root();
  assert.equal(card.id, 'sea:ask');
  assert.ok(byId(card, 'sea:ask-yes') && byId(card, 'sea:ask-no'));
  assert.match(card.label ?? '', /^Dock at Overlook\? Your ship will make for/);
  const press = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const spot = { x: box.x + 4, y: box.y + 4 };
    step(root, [
      { kind: 'pointer', ...spot },
      { kind: 'down', ...spot, button: 0 },
      { kind: 'up', ...spot, button: 0 },
    ]);
  };
  press('sea:ask-yes');
  press('sea:ask-no');
  assert.deepEqual(answers, [true, false]);
});

test('a question still standing is put by once the player is no longer at sea', () => {
  const { landings } = landingsOf();
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.frame(false);
  assert.equal(landings.asking, null, 'walked ashore on an island, or taken elsewhere');
});

test('leaving the sea while the ship sails for a landing said yes to forgets the landing, on a coast or an island', () => {
  const { landings, sea, landed } = landingsOf(false, WITH_COVE);
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.answer(true);
  assert.equal(landings.making?.kind, 'dock');
  landings.frame(false);
  assert.equal(landings.making, null, 'taken elsewhere, the landing is forgotten');
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  landings.frame();
  assert.deepEqual(landed, [], 'back at sea, the ship never docks of itself');
  landings.click({ kind: 'sea', point: [0, -50_500, 0] });
  landings.answer(true);
  landings.frame(false);
  [sea.position, sea.course] = [[0, -50_150], []];
  assert.equal(landings.anchored(), null, 'nor walks ashore on the island');
});

test('yes to go ashore on a coast clicked far inland makes for the coast nearest it, not the point clicked', () => {
  const { landings, sea, asked } = landingsOf(true);
  landings.click({ kind: 'land', point: [50_000, 30_000, 200] });
  assert.equal(landings.asking?.aim.kind, 'ashore');
  landings.answer(true);
  assert.deepEqual(asked, ['sail 50000,0']);
  assert.equal(landings.making?.kind, 'ashore', 'made for');
  sea.landfall = { kind: 'ashore' };
  landings.frame();
  assert.deepEqual(asked.slice(1), ['view oversea', 'in 50000,-50'], 'in reach, in to just off the shore');
});

test('yes within reach while something else holds the player keeps the landing, made once nothing does', () => {
  const { landings, sea, landed, hold } = landingsOf();
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  landings.click({ kind: 'land', point: [400, 900, 20] });
  assert.equal(landings.asking?.near, true);
  hold(true);
  landings.answer(true);
  assert.equal(landed.length, 0, 'not while another landmass opens');
  assert.equal(landings.making?.kind, 'dock', 'kept, made for');
  landings.frame();
  assert.equal(landed.length, 0);
  hold(false);
  landings.frame();
  assert.equal(landed.length, 0, 'sailing in to its berth');
  [sea.position, sea.course] = [[1_000, -2_050], []];
  landings.frame();
  assert.deepEqual(
    landed.map((aim) => aim.kind),
    ['dock'],
  );
});

test('yes to a sea island makes for its anchorage, named as made for, and lands once the ship lies there', () => {
  const { landings, sea, asked } = landingsOf(false, WITH_COVE);
  landings.click({ kind: 'sea', point: [0, -50_500, 0] });
  assert.equal(landings.asking?.aim.kind, 'isle');
  landings.answer(true);
  assert.deepEqual(asked, ['view oversea', 'in 0,-50150']);
  assert.deepEqual(landings.making, { kind: 'isle', id: 3, words: 'a cove' });
  landings.frame();
  assert.equal(landings.anchored(), null, 'under way to it');
  [sea.position, sea.course] = [[0, -50_150], []];
  assert.equal(landings.anchored(), COVE_HELD);
  assert.equal(landings.making, null, 'taken once');
});

test('a fight lets a landing made for go, on a sea island as on a coast; the ship never lands of itself after it', () => {
  const { landings, sea, landed } = landingsOf(false, WITH_COVE);
  landings.click({ kind: 'sea', point: [0, -50_500, 0] });
  landings.answer(true);
  sea.fight = {};
  landings.frame();
  assert.equal(landings.making, null, 'let go');
  sea.fight = null;
  [sea.position, sea.course] = [[0, -50_150], []];
  landings.frame();
  assert.equal(landings.anchored(), null, 'anchored after the fight, it stays aboard');
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.answer(true);
  sea.fight = {};
  landings.frame();
  sea.fight = null;
  sea.landfall = { kind: 'dock', port: 'Overlook' };
  landings.frame();
  assert.deepEqual(landed, [], 'nor docks');
});

test('with nothing made for, what the sea offers is never asked of it each frame', () => {
  const { landings, sea } = landingsOf();
  let read = 0;
  Object.defineProperty(sea, 'landfall', { get: () => (read++, null) });
  landings.frame();
  landings.frame();
  assert.equal(read, 0);
});

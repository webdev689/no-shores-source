import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { byId, fakeInterface } from '../ui/uiForTests.ts';
import type { Isles } from './isles.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Sea } from './sea.ts';
import type { Landfall } from './seaLaw.ts';
import { aimOf, clickContext, landingAskNode, SeaLandings } from './seaLandings.ts';

const HARBOUR: Point2 = [1_000, -2_000];
const PLAN = { id: 'overlook', name: 'Overlook', harbour: HARBOUR, ruined: false };
const NO_ISLES = { all: () => [] } as unknown as Isles;

/** A sea the landings drive: what it was asked, and what it offers. */
function seaOf() {
  const asked: string[] = [];
  const sea = {
    level: 'oversea' as 'oversea' | 'sealevel',
    landfall: null as Landfall,
    position: [0, 0] as Point2,
    bound: null as Point2 | null,
    fight: null as object | null,
    busy: false,
    view: { kind: 'sail' },
    sailTo: (point: Point2) => {
      asked.push(`sail ${point.join(',')}`);
      sea.bound = point;
    },
    sailToMark: (id: string) => void asked.push(`chase ${id}`),
  };
  return { sea, asked };
}

function landingsOf(ruined = false) {
  const { sea, asked } = seaOf();
  const landed: LandingAim[] = [];
  const landings = new SeaLandings({
    sea: () => sea as unknown as Sea,
    landmass: () => ({ id: 'continent-1', plan: { ...PLAN, ruined } }) as never,
    isles: NO_ISLES,
    free: () => true,
    land: (aim) => void landed.push(aim),
  });
  return { landings, sea, asked, landed };
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

test('yes to dock out of reach makes for the harbour, and docks once the sea offers it; in reach it docks at once', () => {
  const { landings, sea, asked, landed } = landingsOf();
  landings.click({ kind: 'mark', id: 'overlook-port' });
  landings.answer(true);
  assert.deepEqual(asked, [`sail ${HARBOUR.join(',')}`]);
  landings.frame();
  assert.equal(landed.length, 0, 'not yet in reach');
  sea.landfall = { kind: 'dock', port: 'Overlook' };
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
  assert.equal(landed.length, 2, 'docked at once');
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

test('the confirmation asks in brass and answers yes with Enter’s press and no with Cancel’s', () => {
  const { ui, step } = fakeInterface(1280, 720);
  const answers: boolean[] = [];
  const asking = { aim: { kind: 'dock', port: 'Overlook', harbour: HARBOUR } as const, near: false };
  const root = () => landingAskNode(ui, asking, (yes) => answers.push(yes));
  step(root);
  const card = root();
  assert.equal(card.id, 'sea:ask');
  assert.ok(byId(card, 'sea:ask-yes') && byId(card, 'sea:ask-no'));
  assert.match(card.label ?? '', /^Dock at Overlook\? Your ship will make for/);
  const box = ui.boxOf('sea:ask-yes');
  assert.ok(box);
  const spot = { x: box.x + 4, y: box.y + 4 };
  step(root, [
    { kind: 'pointer', ...spot },
    { kind: 'down', ...spot, button: 0 },
    { kind: 'up', ...spot, button: 0 },
  ]);
  assert.deepEqual(answers, [true]);
});

test('a question still standing is put by once the player is no longer at sea', () => {
  const { landings } = landingsOf();
  landings.click({ kind: 'land', point: [400, 900, 20] });
  landings.frame(false);
  assert.equal(landings.asking, null, 'walked ashore on an island, or taken elsewhere');
});

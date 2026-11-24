import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearOfficer, GearShip, GearState } from '../network/gearMessages.ts';
import { sampleItem } from './gearShots.ts';
import { drawn } from './drawnForTests.ts';
import { NO_SHIP_YET, musterAt, shipTab, shipwrightPart } from './shipPages.ts';
import { stationTitle } from './stationView.ts';

const officer = (fields: Partial<GearOfficer>): GearOfficer => ({
  id: 4,
  post: 1,
  grade: 2,
  given: 0,
  family: 1,
  duty: 1,
  level: 3,
  toNext: 0.4,
  trained: 500,
  trainedMost: 2_000,
  strength: 0.5,
  bought: 1,
  chosen: [0],
  columns: [{ kind: 3, traits: ['gun_captain', 'layer'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 }],
  wage: 0,
  ...fields,
});

const ship = (fields: Partial<GearShip> = {}): GearShip => ({
  xp: 0n,
  level: 4,
  prestige: 9,
  attack: 100,
  defense: 60,
  toNext: 0.35,
  toNextNeeds: 1_200,
  stocks: [140, 62, 31, 3],
  hands: 18,
  handsMost: 24,
  officers: [officer({})],
  offers: [officer({ id: 7, post: 4, wage: 1_500 }), officer({ id: 8, post: 3, wage: 16_000 })],
  trim: [],
  pledge: 2,
  fleet: [{ hull: 0, name: [255, 255], named: false, dress: [] }],
  sailed: 0,
  dresses: [],
  ...fields,
});

/** Guns fitted, the Sails carried, and the Shipwright's six modules for sale after the smiths' eighteen wares. */
const gear = (fields: Partial<GearState> = {}): GearState =>
  ({
    aurem: 12_480,
    items: [
      sampleItem({ id: 20, kind: 24, rarity: 2, level: 3, at: 9, bucket: 7, attack: 48 }),
      sampleItem({ id: 23, kind: 26, rarity: 3, level: 5, at: 0, bucket: 9, prestige: 6 }),
    ],
    wares: [
      ...Array.from({ length: 18 }, (unused, place) => sampleItem({ id: 100 + place, kind: 13, price: 500 })),
      ...[24, 25, 26, 27, 24, 26].map((kind, place) =>
        sampleItem({ id: 120 + place, kind, level: 2 + place, price: place === 5 ? 13_400 : 2_400 }),
      ),
    ],
    ship: ship(),
    ...fields,
  }) as GearState;

const PAPERS = { title: 'Your Sloop', parts: [{ heading: 'Vessel', rows: [['Hull', '96 / 120']] as const }] };

test('Manage shows its papers with its materials and hands, its power and its modules; a module opens its page', () => {
  let part = 'manage';
  const page = drawn(gear(), (context) => shipTab(context, PAPERS, [part, null], (chosen) => (part = chosen)));
  const shown = page.shows();
  assert.match(shown, /Your Sloop \| VESSEL \| Hull \| 96 \/ 120 \| MATERIALS \| 140 \| Timber/);
  assert.match(shown, /CREW \| Hands aboard \| 18 \/ 24/);
  assert.match(shown, /SHIP LEVEL \| 4 \| Attack \| 100 \| Defense \| 60 \| Prestige \| 9/);
  assert.match(shown, /Sea fights carry your ship to level 5/);
  assert.match(shown, /FITTED .*Level 3 \| 48 Attack \| Hull \| None fitted/);
  assert.match(shown, /CARRIED .*Level 5 \| 6 Prestige/);
  page.click('item-20');
  assert.deepEqual(
    page.opened.map((item) => item.id),
    [20],
    'a fitted module opens its page',
  );
  page.click('ship-crew');
  assert.equal(part, 'crew', 'the Crew press shows the crew');
});

test('without the room’s word on the ship, Manage shows its papers alone', () => {
  const page = drawn(gear({ ship: null }), (context) => shipTab(context, PAPERS, ['manage', null], () => undefined));
  assert.match(page.shows(), /Your Sloop \| VESSEL/);
  assert.doesNotMatch(page.shows(), /SHIP LEVEL|MATERIALS/);
});

test('before the Harbourmaster hands over the first ship, the Ship tab says there is none', () => {
  const shipless = gear({ ship: ship({ fleet: [] }) });
  for (const part of ['manage', 'crew']) {
    const page = drawn(shipless, (context) => shipTab(context, PAPERS, [part, null], () => undefined));
    assert.equal(page.shows(), NO_SHIP_YET, part);
  }
});

test('an officer’s duty is a click, their page a press, and paying them off is held', () => {
  let open: number | null = null;
  const page = drawn(gear(), (context) => shipTab(context, PAPERS, ['crew', open], (part, chosen) => (open = chosen)));
  assert.match(page.shows(), /Gunner · Seasoned · level 3 · at post \| At post \| Ashore \| Aboard \| Nodes/);
  page.click('duty-4-2');
  assert.deepEqual(page.asked, [{ kind: 59, item: 4, slot: 2 }], 'sent ashore');
  page.click('dismiss-4');
  assert.equal(page.asked.length, 1, 'a click pays no one off');
  page.hold('dismiss-4', 900);
  assert.deepEqual(page.asked[1], { kind: 60, item: 4 }, 'held, they are paid off');
  page.click('officer-4');
  assert.equal(open, 4);
  page.frame();
  assert.match(page.shows(), /PERKS \| Gun Captain/);
  assert.ok(page.ui.boxOf('node-0-0'), 'their node grid is laid');
});

test('with no officers, the crew says where they sign on', () => {
  const page = drawn(gear({ ship: ship({ officers: [] }) }), (context) =>
    shipTab(context, PAPERS, ['crew', null], () => undefined),
  );
  assert.equal(page.shows(), "MANAGE | CREW | No officers yet. Sign them on at your faction's counter.");
});

test('the muster stands only on the screen of the faction pledged to, and signs on only what can be paid', () => {
  const muster = (pledge: number, faction: number | undefined) =>
    drawn(gear({ ship: ship({ pledge }) }), (context) => ({ children: musterAt(context, faction) }));
  assert.equal(muster(0, 2).shows(), '', 'no pledge, no muster');
  assert.equal(muster(2, 3).shows(), '', "another faction's screen");
  assert.equal(muster(2, undefined).shows(), '', 'a keeper of no faction');
  const page = muster(2, 2);
  assert.match(page.shows(), /THE MUSTER .*1,500 \| Hold to sign on .*16,000 \| Not enough Aurem \| Hold to sign on/);
  page.hold('recruit-8', 900);
  assert.deepEqual(page.asked, [], 'one not paid for is never signed on');
  page.hold('recruit-7', 900);
  assert.deepEqual(page.asked, [{ kind: 58, column: 2, node: 7 }]);
});

test('the Harbourmaster sells the Shipwright’s modules, each held to buy, and none the player cannot pay for', () => {
  const page = drawn(gear(), (context) => shipwrightPart(context));
  assert.match(page.shows(), /Guns \| Normal Guns · level 2 \| .*2,400/);
  assert.match(page.shows(), /13,400 \| Not enough Aurem/);
  page.click('buy-2-0');
  assert.deepEqual(page.asked, [], 'a click buys nothing');
  page.hold('buy-2-0', 900);
  assert.equal(page.asked.length, 1, 'held, it is bought');
  page.hold('buy-2-5', 900);
  assert.equal(page.asked.length, 1, 'one not paid for is never bought');
  assert.equal(stationTitle('harbourmaster'), 'The Harbourmaster');
  assert.equal(stationTitle('lamplighters'), 'Lamplighters');
});

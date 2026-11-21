// The sea fight's readout is the on-foot HUD's own build: the ship's plate the vitals' thin bars, the card the target
// plate, each sheeted by the same rules (the kit's bar sheet), so the sea reads as the same HUD.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAll, onFakePage } from '../combat/page.test.ts';
import { fightSheetCss } from '../combat/hudSheet.ts';
import { barSheetCss, thinBarsCss } from '../plus/barSheet.ts';
import { SeaFightReadout, seaFightCss, type SeaFightModel } from '../plus/seaFight.ts';

const side = { fill: 1, ready: true, fresh: false, laid: false, load: 'Round', left: 0 };
const MODEL: SeaFightModel = {
  ship: {
    name: 'Your Sloop',
    hull: 0.2,
    sail: 0.5,
    crew: 1,
    fire: false,
    braced: true,
    boost: { state: 'charging', share: 0.25 },
    port: side,
    starboard: side,
    blow: null,
  },
  card: {
    name: 'Pirate Brig',
    sub: 'Brig - 140 m',
    hull: 0.55,
    sail: 1,
    state: 'afloat',
    hostile: true,
    boardKey: null,
    faction: 2,
    band: 'orange',
  },
  tally: null,
  warn: null,
};

test("the ship's plate is the vitals' thin bars: Hull over Sails over Crew, each saying its percent to a reader", () => {
  onFakePage((root) => {
    const readout = new SeaFightReadout(root);
    readout.update(MODEL);
    const [panel] = findAll(root, 'vitals');
    assert.ok(!panel?.classList.contains('plus-window'), 'no window round them, as on foot');
    assert.equal((panel as unknown as Record<string, string>)['ariaLabel'], 'Your ship');
    const rows = findAll(root, 'vital');
    assert.deepEqual(
      rows.map((row) => row.className.split(' ')[1]),
      ['hull', 'sails', 'crew'],
    );
    assert.deepEqual(
      rows.map((row) => {
        const { role, ariaLabel, ariaValueNow } = row as unknown as Record<string, string>;
        return [role, ariaLabel, ariaValueNow];
      }),
      [
        ['meter', 'Hull', '20'],
        ['meter', 'Sails', '50'],
        ['meter', 'Crew', '100'],
      ],
    );
    assert.equal(findAll(root, 'label').length, 0, 'no words inside the bars, as on foot');
    assert.ok(rows[0]?.classList.contains('low'), "the hull's frame flashes low as health's does");
    assert.ok(!findAll(root, 'plus-chip', 'brace')[0]?.hidden, "Braced is the kit's chip");
  });
});

test("the boost ring under the ship's bars is lit as far as its burst has recharged, and says so to a reader", () => {
  onFakePage((root) => {
    const readout = new SeaFightReadout(root);
    readout.update(MODEL);
    const [ring] = findAll(root, 'seafight-boost');
    assert.deepEqual([ring?.dataset['state'], ring?.style['--lit']], ['charging', '90deg']);
    assert.equal((ring as unknown as Record<string, string>)['ariaLabel'], 'Boost recharging');
    if (!MODEL.ship) return;
    readout.update({ ...MODEL, ship: { ...MODEL.ship, boost: { state: 'ready', share: 1 } } });
    assert.deepEqual([ring?.dataset['state'], ring?.style['--lit']], ['ready', '360deg']);
    assert.equal((ring as unknown as Record<string, string>)['ariaLabel'], 'Boost ready');
  });
});

test("the ship's bars wear the very thin bars the vitals wear on foot", () => {
  const first = (scope: string) => thinBarsCss(scope, {}).trim().split('\n')[0] ?? '';
  assert.ok(fightSheetCss().includes(first('.fight-hud')), 'on foot');
  assert.ok(seaFightCss().includes(first('.seafight')), 'at sea');
  assert.match(seaFightCss(), /\.seafight \.vital\.hull \{ height: 12px;/, "the hull at health's height");
  assert.match(
    seaFightCss(),
    /\.seafight\.wide \.vital\.crew \{ height: 14px;/,
    "the crew at stamina's, a step larger",
  );
});

test("the card is the target plate: the faction's emblem framed, its name, one bar in its rank's colour, small words", () => {
  onFakePage((root) => {
    const readout = new SeaFightReadout(root);
    readout.update(MODEL);
    const [card] = findAll(root, 'plate', 'target');
    assert.equal(card?.dataset['band'], 'orange');
    assert.equal(findAll(card as unknown as HTMLElement, 'emblem')[0]?.dataset['faction'], '2');
    assert.equal(findAll(card as unknown as HTMLElement, 'name')[0]?.textContent, 'Pirate Brig');
    assert.equal(findAll(card as unknown as HTMLElement, 'meter').length, 1, 'one bar, the hull, as a foe has');
    assert.equal(findAll(card as unknown as HTMLElement, 'sub')[0]?.textContent, 'Brig - 140 m');
  });
});

test('the card wears the very rules the on-foot target plate wears', () => {
  const rules = (scope: string) => barSheetCss(scope).replaceAll(scope, '');
  assert.ok(fightSheetCss().includes(barSheetCss('.fight-hud')), 'on foot');
  assert.ok(seaFightCss().includes(barSheetCss('.seafight')), 'at sea');
  assert.equal(rules('.seafight'), rules('.fight-hud'));
});

test('the warning stands under the card, and the ships’ plates under both, never over the sight', () => {
  onFakePage((root) => {
    const readout = new SeaFightReadout(root);
    const [card] = findAll(root, 'plate', 'target');
    const [warn] = findAll(root, 'seafight-warn');
    Object.assign(card as object, { offsetTop: 56, offsetHeight: 37 });
    Object.assign(warn as object, { offsetHeight: 29 });
    readout.update({ ...MODEL, warn: 'Broadside from the Pirate Brig - C: brace' });
    assert.equal(warn?.style['top'], '101px', 'the card’s foot and the gap');
    assert.equal(readout.under, 138, 'the plates under the warning');
    readout.update(MODEL);
    assert.equal(readout.under, 101, 'under the card alone while none warns');
  });
});

// The sea fight's readout is the on-foot HUD's own build: the ship's plate the vitals' window, the card the target
// plate, each sheeted by the same rules (the kit's bar sheet), so the sea reads as the same HUD.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAll, onFakePage } from '../combat/page.test.ts';
import { fightSheetCss } from '../combat/hudSheet.ts';
import { barSheetCss } from '../plus/barSheet.ts';
import { SeaFightReadout, seaFightCss, type SeaFightModel } from '../plus/seaFight.ts';

/** The fake page, its styles given `setProperty` as a page's are. */
function onPage(run: (root: HTMLElement) => void): void {
  onFakePage((root) => {
    const page = globalThis.document as unknown as { createElement: (tag: string) => { style: object } };
    const made = page.createElement;
    page.createElement = (tag) => {
      const node = made(tag);
      Object.assign(node.style, { setProperty: () => undefined });
      return node;
    };
    run(root);
  });
}

const side = { fill: 1, ready: true, fresh: false, laid: false, load: 'Round', left: 0 };
const MODEL: SeaFightModel = {
  ship: {
    name: 'Your Sloop',
    hull: 0.2,
    sail: 0.5,
    crew: 1,
    fire: false,
    braced: true,
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

test("the ship's plate is the vitals' window: Hull, Sails and Crew bars naming themselves and their percent inside", () => {
  onPage((root) => {
    const readout = new SeaFightReadout(root);
    readout.update(MODEL);
    const [panel] = findAll(root, 'vitals');
    assert.ok(panel?.classList.contains('plus-window'), 'the carved window');
    const rows = findAll(root, 'meter', 'vital');
    assert.deepEqual(
      rows.map((row) => row.className.split(' ')[2]),
      ['hull', 'sails', 'crew'],
    );
    const words = (row: (typeof rows)[number]) => [
      findAll(row as unknown as HTMLElement, 'label')[0]?.textContent,
      findAll(row as unknown as HTMLElement, 'number')[0]?.textContent,
    ];
    assert.deepEqual(rows.map(words), [
      ['Hull', '20%'],
      ['Sails', '50%'],
      ['Crew', '100%'],
    ]);
    assert.ok(rows[0]?.classList.contains('low'), 'the hull flashes low as health does');
    assert.ok(!findAll(root, 'plus-chip', 'brace')[0]?.hidden, "Braced is the kit's chip");
  });
});

test("the card is the target plate: the faction's emblem framed, its name, one bar in its rank's colour, small words", () => {
  onPage((root) => {
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

test('the plate and the card wear the very rules the on-foot vitals and target plate wear', () => {
  const rules = (scope: string) => barSheetCss(scope).replaceAll(scope, '');
  assert.ok(fightSheetCss().includes(barSheetCss('.fight-hud')), 'on foot');
  assert.ok(seaFightCss().includes(barSheetCss('.seafight')), 'at sea');
  assert.equal(rules('.seafight'), rules('.fight-hud'));
});

test('the warning stands under the card, and the ships’ plates under both, never over the sight', () => {
  onPage((root) => {
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

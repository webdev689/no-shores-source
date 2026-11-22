// The sea fight's readout is the on-foot display's own build: the ship's plate the vitals' thin bars, its abilities
// the Arts' bar, the card the target plate, so the sea reads as the same display.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VITAL_SIZES } from '../plus/barFrame.ts';
import { UNDER_COMPASS } from '../plus/compass.ts';
import type { SeaFightModel, ShipAbility } from '../plus/seaFight.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { drawLaid } from '../ui/drawLaid.ts';
import type { Node } from '../ui/node.ts';
import { allOf, coloursDrawn, fakeRenderer, laidOf, wordsIn, written } from './nodes.test.ts';
import { withMotionReduced } from './page.test.ts';
import { SeaFightReadout } from './seaReadout.ts';

/** One of the ship's abilities, ready unless `more` says otherwise. */
const ability = (id: string, icon: ShipAbility['icon'], name: string, more: Partial<ShipAbility> = {}) =>
  ({
    id,
    icon,
    name,
    key: 'C',
    state: 'ready',
    unable: false,
    charge: 1,
    left: 0,
    running: 0,
    laid: false,
    said: 'ready',
    ...more,
  }) as const satisfies ShipAbility;
const MODEL: SeaFightModel = {
  ship: {
    name: 'Your Sloop',
    hull: 0.2,
    sail: 0.5,
    crew: 1,
    fire: false,
    // Braced, its guns holding fire, and its burst recharging.
    abilities: [
      ability('port', 'port', 'Port broadside', { unable: true }),
      ability('starboard', 'starboard', 'Starboard broadside', { unable: true }),
      ability('burst', 'burst', 'Burst', { state: 'charging', charge: 0.25, left: 9 }),
      ability('brace', 'brace', 'Brace', { state: 'active', running: 1 }),
      ability('load', 'round', 'Round shot'),
    ],
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
const readoutOf = (model: SeaFightModel | null, now = 0) => {
  const readout = new SeaFightReadout();
  readout.update(model, now);
  return readout;
};
/** The tiles a tree draws (a bar's frame is one), by their keys. */
function tilesDrawn(root: Node): string[] {
  const renderer = fakeRenderer();
  const keys: string[] = [];
  const tiles = renderer.tileTexels;
  renderer.tileTexels = (key, ...rest) => (keys.push(key), tiles(key, ...rest));
  drawLaid(renderer, laidOf(root), 1, {
    clock: 0,
    field: () => null,
    focused: () => false,
    state: () => 'rest',
    fieldScroll: new Map(),
  });
  return keys;
}
const labelled = (root: Node | null, start: string) =>
  allOf(root).find((node) => node.label?.startsWith(start)) ?? null;

test('nothing shows with no fight', () => {
  assert.equal(readoutOf(null).node(), null);
});

test("the ship's plate is the vitals' thin bars: Hull over Sails over Crew, each saying its percent to a reader", () => {
  const readout = readoutOf(MODEL);
  const plate = labelled(readout.node(), 'Your ship');
  assert.deepEqual(
    (plate?.children ?? []).flatMap((child) => (child && child.label ? [[child.label, child.height]] : [])),
    [
      ['Hull: 20%', VITAL_SIZES.base.health],
      ['Sails: 50%', VITAL_SIZES.base.stamina],
      ['Crew: 100%', VITAL_SIZES.base.stamina],
    ],
  );
  assert.deepEqual(plate?.float && [plate.float.x, plate.float.y], [28, 14], "at the vitals' corner");
  readout.lay({ length: 333, wide: true, zoom: 1 });
  const wide = labelled(readout.node(), 'Hull');
  assert.deepEqual([wide?.width, wide?.height], [333, VITAL_SIZES.wide.health], 'laid as the vitals are');
});

test("the plate keeps only its bars and the fire's chip: the burst, the brace and the guns stand on the ship's bar", () => {
  const plate = (model: SeaFightModel) => labelled(readoutOf(model).node(), 'Your ship');
  assert.deepEqual(wordsIn(plate(MODEL)), [], 'braced and recharging, yet no words on the plate');
  assert.ok(MODEL.ship);
  assert.deepEqual(wordsIn(plate({ ...MODEL, ship: { ...MODEL.ship, fire: true } })), ['On fire']);
  const shown = allOf(plate(MODEL));
  assert.equal(
    shown.some((node) => /Boost|Braced|Bow|Stern|broadside/.test(`${node.label ?? ''} ${node.text?.words ?? ''}`)),
    false,
    'no boost ring, brace chip or battery rose',
  );
});

test("the ship's bar stands at the Arts' corner at the bottom left, at each step and doubled, its abilities in order", () => {
  const readout = readoutOf(MODEL);
  const bar = () => labelled(readout.node(), 'Your Ship');
  const placed = (node: Node | null) => node?.float && [node.float.at, node.float.anchor, node.float.x, node.float.y];
  assert.deepEqual(placed(bar()), [[0, 1], [0, 1], 28, -22], '28 in and 22 up, as the Arts and weapons');
  assert.deepEqual(
    (bar()?.children ?? []).map((slot) => slot && slot.label?.split(' (')[0]),
    ['Port broadside', 'Starboard broadside', 'Burst', 'Brace', 'Round shot'],
  );
  const ringSide = () => (bar()?.children?.[0] as Node | undefined)?.children?.[0];
  assert.equal((ringSide() as Node | undefined)?.width, 44);
  assert.equal(readout.reach?.right, 28 + 5 * 44 + 4 * 8);
  readout.lay({ length: 333, wide: true, zoom: 1 });
  assert.equal((ringSide() as Node | undefined)?.width, 66, 'the larger step');
  assert.equal(bar()?.gap, 12);
  readout.lay({ length: 333, wide: false, zoom: 2 });
  assert.deepEqual(placed(bar()), [[0, 1], [0, 1], 56, -44], 'doubled past 1440p');
  assert.equal((ringSide() as Node | undefined)?.width, 88);
  assert.equal(readout.reach?.right, 56 + (5 * 44 + 4 * 8) * 2);
  readout.update(null, 1);
  assert.equal(readout.node(), null, 'gone with the readout');
  assert.equal(readout.reach, null);
});

test("the hull's frame flashes blood low as health's does, on for the first half of each 0.9 s", () => {
  const hull = (readout: SeaFightReadout) => tilesDrawn(labelled(readout.node(), 'Hull') ?? {});
  const readout = readoutOf(MODEL, 0);
  assert.ok(hull(readout).includes('bar frame ship hull 12'), 'low: its warning frame');
  readout.update(MODEL, 0.6);
  assert.ok(!hull(readout).includes('bar frame ship hull 12'), 'blinked off');
  readout.update({ ...MODEL, ship: { ...MODEL.ship!, hull: 0.8 } }, 0.7);
  assert.ok(!hull(readout).includes('bar frame ship hull 12'), 'whole enough: none');
  withMotionReduced(true, () => {
    const still = readoutOf(MODEL, 0);
    still.update(MODEL, 0.6);
    assert.ok(hull(still).includes('bar frame ship hull 12'), 'held with reduced motion');
  });
});

test("the card is the target plate under the compass: the faction's emblem framed, its name, one bar in its rank's colour, small words", () => {
  const root = readoutOf(MODEL).node();
  const card = labelled(root, 'Pirate Brig');
  assert.ok(card, 'the card');
  const emblem = allOf(card).find((node) => node.picture?.key === 'emblem 2');
  assert.ok(emblem, "the pirates' emblem");
  assert.deepEqual(
    wordsIn(card),
    ['Pir', 'ate Brig', 'BRIG - 140 M', 'HOSTILE'],
    'the name its first letters and the rest',
  );
  assert.equal(allOf(card).filter((node) => node.role === 'track').length, 1, 'one bar, the hull, as a foe has');
  assert.ok(coloursDrawn(card).has(written(FILLS.orange)), "a Major's orange");
  assert.deepEqual([card.width, card.maxWidth], ['76%', 340], 'as wide as the target plate');
});

test('long class and state words leave the name its first letters, cut short after them', () => {
  const struck = {
    ...MODEL.card!,
    name: 'Pirate Sloop',
    sub: 'Frigate - 1,254 m',
    state: 'struck' as const,
    boardKey: 'E',
  };
  const root = readoutOf({ ...MODEL, ship: null, card: struck }).node();
  assert.ok(root);
  const shown = laidOf(root)
    .filter((each) => each.node.text && each.box.y < 80)
    .map((each) => each.lines.map((line) => line.map((span) => span.words).join('')).join(''));
  assert.match(shown.join(''), /^Pir.*\.\.\./, `the name kept as "Pir..." (${JSON.stringify(shown)})`);
});

test("an ally's card shows no emblem, its name in the players' colour and its bar in their blue", () => {
  const card = labelled(
    readoutOf({ ...MODEL, card: { ...MODEL.card!, name: 'Tithe Schooner', hostile: false, band: 'ally' } }).node(),
    'Tithe Schooner',
  );
  assert.equal(
    allOf(card).some((node) => node.picture?.key.startsWith('emblem')),
    false,
  );
  const named = allOf(card).filter((node) => node.text?.words === 'Tit' || node.text?.words === 'he Schooner');
  assert.deepEqual(
    named.map((node) => node.text?.colour),
    [TONES.ally, TONES.ally],
  );
  assert.ok(card && coloursDrawn(card).has(written(FILLS.ally)));
});

test('the broadside warning stands under the target card at the top, never over the sight; the ships’ plates under both', () => {
  assert.equal(readoutOf({ ...MODEL, card: null }).under, UNDER_COMPASS, 'under the compass with nothing shown');
  const carded = readoutOf(MODEL).under;
  assert.equal(carded, UNDER_COMPASS + 37 + 8, 'under the card');
  const warned = readoutOf({ ...MODEL, warn: 'Broadside! Brace' });
  assert.ok(warned.under > carded + 20, 'and under the warning');
  const warn = labelled(warned.node(), 'Broadside! Brace');
  assert.deepEqual(warn?.float?.at, [0.5, 0], 'set from the top, not the middle where the sight is');
  assert.equal(warn?.float?.y, carded, 'just under the card');
  assert.deepEqual(wordsIn(warn), ['BROADSIDE! BRACE']);
});

test('the warning pulses in steps, its lit look the second half of each half second, and stands still with reduced motion', () => {
  const warned = { ...MODEL, warn: 'Broadside! Brace' };
  const colourAt = (now: number, reduced = false) =>
    withMotionReduced(reduced, () => {
      const readout = readoutOf(warned, 0);
      readout.update(warned, now);
      return allOf(readout.node()).find((node) => node.text?.words === 'BROADSIDE! BRACE')?.text?.colour;
    });
  assert.equal(colourAt(0.1), '#ffd9cf');
  assert.equal(colourAt(0.3), '#ff9c8a');
  assert.equal(colourAt(0.3, true), '#ffd9cf');
});

test('the warning is said to a screen reader once as it comes, and again only when it comes again', () => {
  const said: string[] = [];
  const page = globalThis as { document?: unknown };
  const was = page.document;
  page.document = { ariaNotify: (words: string) => said.push(words) };
  try {
    const warned = { ...MODEL, warn: 'Broadside! Brace' };
    const readout = readoutOf(MODEL, 0);
    readout.update(warned, 0.1);
    readout.update(warned, 0.2);
    assert.deepEqual(said, ['Broadside! Brace'], 'once while it stands');
    readout.update(MODEL, 0.3);
    readout.update(warned, 0.4);
    assert.deepEqual(said, ['Broadside! Brace', 'Broadside! Brace'], 'and again once it comes back');
  } finally {
    page.document = was;
  }
});

test("the tally says the last volley under the view's middle, a miss dimmed", () => {
  const tallied = (hits: number) =>
    allOf(readoutOf({ ...MODEL, tally: { balls: 6, hits, holed: 0, rig: 0 } }).node()).find((node) =>
      String(node.text?.words ?? '').endsWith('STRUCK'),
    );
  assert.equal(tallied(4)?.text?.words, '4 OF 6 BALLS STRUCK');
  assert.deepEqual([tallied(4)?.text?.colour, tallied(0)?.text?.colour], [TONES.brassHi, '#b3a684']);
  assert.deepEqual(tallied(4)?.float?.at, [0.5, 0.5]);
});

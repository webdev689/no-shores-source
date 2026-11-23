import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS } from '../forge/cosmetics.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { HORSE, MOUNT_SLOT, WORN } from '../player/gear.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { Stack } from '../ui/stack.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { appearanceRows } from './appearance/appearanceModel.ts';
import { NO_ART_WORDS } from './characterPage.ts';
import { levelOf, owns } from './artLevels.ts';
import { ARTS, artOf, coreChoices } from './artsCards.ts';
import { HOLD_MS } from './gearHold.ts';
import { OPEN_AT } from './gearScreen.ts';
import { vaultOf } from './gearCards.ts';
import { sampleGear, sampleItem } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';
import { rowsOf } from './npc/npcWares.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 1280, height: 720, scale: 1 };

/** A renderer that lays quads and measures words, with an atlas that never has room: enough to lay and hit. */
function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

/** The menu on a fake page with `gear`, a frame at a time, the keys pressed on the page, and every ask it made. */
function menu(gear: GearState) {
  const { window } = fakePage();
  Object.assign(globalThis, {
    devicePixelRatio: 1,
    innerWidth: VIEW.width,
    innerHeight: VIEW.height,
    setInterval: () => 0,
    requestAnimationFrame: () => 0,
  });
  Object.assign(globalThis.document, { exitPointerLock: () => undefined, hidden: false });
  const asked: GearAsk[] = [];
  const state = { gear };
  const here = () => ({ gear: state.gear, ask: (ask: GearAsk) => asked.push(ask), forge: null, dress: null });
  const stack = new Stack();
  stack.add(
    startGearWindow(
      () => false,
      null,
      here,
      () => null,
    ),
  );
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  let drawn: Node | null = null;
  const frame = (events: UiEvent[] = []) => {
    ui.frame(VIEW, events, 1 / 60);
    drawn = stack.node(ui);
    ui.draw(drawn);
  };
  /** What the node `id` drawn last says to a screen reader. */
  const labelOf = (id: string): string | undefined => {
    const find = (child: Child): Node | undefined =>
      child ? (child.id === id ? child : (child.children ?? []).map(find).find(Boolean)) : undefined;
    return find(drawn)?.label;
  };
  const key = (name: string) => {
    const event = new FakeEvent('keydown', { key: name });
    window.dispatchEvent(event);
    frame([{ kind: 'key', key: name }]);
    frame();
  };
  const middle = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const click = (id: string) => {
    const point = middle(id);
    frame([
      { kind: 'pointer', ...point },
      { kind: 'down', ...point, button: 0 },
      { kind: 'up', ...point, button: 0 },
    ]);
    frame();
  };
  const open = (view: string) => {
    window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view } }));
    frame();
    frame();
  };
  return { ui, frame, key, click, open, asked, middle, state, labelOf };
}

test("the Art's screen opens from its diamond at its Anima, sets a fragment owned, and steps back by Escape", () => {
  // Its first fragment owned, the rest not.
  const gear = { ...sampleGear(), standing: { ...sampleGear().standing!, artOwned: [1] } };
  const { ui, frame, click, open, key, asked } = menu(gear);
  open('character');
  click('art-diamond');
  frame();
  const art = artOf(gear.arts?.art ?? 0);
  assert.ok(art);
  assert.equal(ui.focusedId, `spell-${art.anima.key}`, 'the screen is read from its Anima');
  click('core-1');
  frame();
  assert.ok(ui.boxOf('arts-flyout'), "the slot's flyout opens");
  const standing = levelOf(gear.standing, art.id);
  const choices = coreChoices(art, [null, null, null], 1, (fragment) => owns(standing, fragment));
  const refused = choices.find((each) => !each.owned);
  const chosen = choices.find((each) => each.ask);
  assert.ok(refused && chosen);
  assert.equal(
    ui.focusedId,
    `fragment-${chosen.index}`,
    'the focus goes into the flyout, at the first that may be set',
  );
  click(`fragment-${refused.index}`);
  assert.equal(asked.length, 0, 'a fragment not owned is refused before any ask');
  assert.ok(ui.boxOf('arts-flyout'), 'and the flyout stays');
  click(`fragment-${chosen.index}`);
  assert.deepEqual(asked, [{ kind: ASKS.setCore, column: art.id, slot: 1, node: chosen.index }]);
  assert.equal(ui.boxOf('arts-flyout'), null, 'a fragment set closes the flyout');
  click('core-0');
  key('Escape');
  assert.equal(ui.boxOf('arts-flyout'), null, 'Escape closes the flyout first');
  assert.equal(ui.focusedId, 'core-0', 'its slot takes the focus');
  key('Escape');
  assert.equal(ui.boxOf('arts-page'), null, 'then the screen');
  assert.equal(ui.focusedId, 'art-diamond', 'its diamond takes the focus back');
  assert.ok(ui.boxOf('slot-0'), 'the Character page shows again');
});

test("another Art's diamond wears it; the worn one asks nothing", () => {
  const gear = sampleGear();
  const { click, open, asked } = menu(gear);
  open('character');
  click('art-diamond');
  const worn = gear.arts?.art ?? 0;
  const other = ARTS.find((each) => each.id !== worn);
  assert.ok(other);
  click(`art-${worn}`);
  assert.equal(asked.length, 0);
  click(`art-${other.id}`);
  assert.deepEqual(asked, [{ kind: ASKS.wearArt, column: other.id }]);
});

test("the Art's level bar fills to its share of the next level", () => {
  const gear = { ...sampleGear(), standing: { ...sampleGear().standing!, artLevels: [2], artXp: [4000] } };
  const { ui, click, open } = menu(gear);
  open('character');
  click('art-diamond');
  const [bar, fill] = [ui.boxOf('arts-bar'), ui.boxOf('arts-bar-fill')];
  assert.ok(bar && fill);
  assert.ok(Math.abs(fill.width / (bar.width - 2) - 0.25) < 0.02, '4,000 of 16,000');
});

test('Appearance wears a piece kept with a click, refuses one not kept, and Escape returns to its button', () => {
  const gear = { ...sampleGear(), cosmetics: [1] };
  const { ui, click, open, key, asked } = menu(gear);
  open('character');
  click('appearance');
  assert.ok(ui.boxOf('appearance-page'));
  const dyes = appearanceRows(gear)[1]?.tiles ?? [];
  const kept = dyes.find((tile) => tile.kept && !tile.worn);
  const missing = dyes.find((tile) => !tile.kept);
  assert.ok(kept && missing);
  click(`${missing.kind}-${missing.id}`);
  assert.equal(asked.length, 0, 'a piece not kept asks nothing');
  click(`${kept.kind}-${kept.id}`);
  assert.deepEqual(asked, [{ kind: ASKS.wearCosmetic, item: kept.number }]);
  key('Escape');
  assert.equal(ui.boxOf('appearance-page'), null);
  assert.equal(ui.focusedId, 'appearance');
});

test("the vault's cells move a piece across with a click", () => {
  const gear = sampleGear();
  const { click, open, asked } = menu(gear);
  open('vault');
  const cell = vaultOf(gear)
    .carried.flatMap((shelf) => shelf.cells)
    .find((each) => each.press && !each.press.held);
  assert.ok(cell?.press);
  click(`cell-${cell.key}`);
  assert.deepEqual(asked, [cell.press.ask]);
});

test("a focused vault cell that goes leaves the focus on the one beside it, as the inventory's do", () => {
  const gear = sampleGear();
  const { ui, frame, open, state } = menu(gear);
  open('vault');
  const cells = vaultOf(gear).carried.flatMap((shelf) => shelf.cells.map((cell) => `cell-${cell.key}`));
  const [first, second] = cells;
  assert.ok(first && second && ui.boxOf(first) && ui.boxOf(second), 'two carried cells are laid');
  ui.focusOn(first);
  frame();
  const gone = Number(first.slice('cell-item-'.length));
  state.gear = { ...gear, items: gear.items.filter((item) => item.id !== gone), answered: 1 };
  frame();
  frame();
  assert.equal(ui.focusedId, second);
});

test("a smith's ware is bought by holding it, never by a click", async () => {
  const item = (id: number, bucket: number) => sampleItem({ id, kind: 2, bucket, level: 12, price: 900 });
  const gear = { ...sampleGear(), wares: [item(101, 2), item(102, 0)] };
  const { frame, click, open, asked, middle } = menu(gear);
  open('armorsmith');
  click('npc-buy-0-0');
  assert.equal(asked.length, 0, 'a click buys nothing');
  const point = middle('npc-buy-0-0');
  frame([
    { kind: 'pointer', ...point },
    { kind: 'down', ...point, button: 0 },
  ]);
  await new Promise((done) => setTimeout(done, HOLD_MS + 60));
  frame();
  frame();
  assert.equal(asked.length, 1, 'held its time, it buys');
  assert.equal(asked[0]?.kind, ASKS.vend);
});

test("a faction's rise opens its choice of fragments, and Escape steps out of it before the screen", () => {
  const gear = {
    ...sampleGear(),
    standing: {
      pledge: 1,
      reputation: [0, 0, 0],
      packages: [0, 0, 0],
      artLevels: [1, 1, 1],
      artXp: [8000, 0, 0],
      artOwned: [0, 0, 0],
    },
  };
  const rise = rowsOf('stormcallers', gear)
    .flatMap((row) => row.wares)
    .find((ware) => ware.opens);
  assert.ok(rise, 'the Art is ready to rise');
  const { ui, frame, click, open, key } = menu(gear);
  open('stormcallers');
  click(`npc-${rise.key}`);
  frame();
  const fragments = rowsOf('stormcallers', gear, true)
    .flatMap((row) => row.wares)
    .filter((ware) => ware.key.startsWith('rise-'));
  assert.ok(fragments[0]);
  assert.equal(ui.focusedId, `npc-${fragments[0].key}`, 'the focus goes to the first fragment');
  key('Escape');
  assert.equal(ui.focusedId, `npc-${rise.key}`, 'Escape closes the choice, the focus back on the rise');
  assert.ok(ui.boxOf('npc-rows'), 'the screen stays');
  key('Escape');
  assert.equal(ui.boxOf('npc-rows'), null, 'then the screen closes');
});

test("an Art or a Tenet its road has not earned stands locked on the Art's screen, saying which road earns it", () => {
  const sample = sampleGear();
  const gear = { ...sample, arts: { ...sample.arts!, earned: [0b011, 0, 0] } };
  const { click, open, asked, labelOf } = menu(gear);
  open('character');
  click('art-diamond');
  click('art-2');
  assert.deepEqual(asked, [], 'an Art not earned is refused before any ask');
  assert.match(labelOf('art-2') ?? '', /not earned\. Earned on the Lamplighters' road\.$/);
  assert.doesNotMatch(labelOf('art-1') ?? '', /not earned/);
  assert.match(labelOf('spell-arcLash') ?? '', /not earned\. Earned on the Stormcallers' road\.$/, 'its second Tenet');
  assert.doesNotMatch(labelOf('spell-quicken') ?? '', /not earned/, 'its first, earned');
  assert.doesNotMatch(labelOf('spell-tempest') ?? '', /not earned/);
});

test("a fragment choice waiting is offered on the Art's screen: its fragments not owned, one chosen by a click", () => {
  const sample = sampleGear();
  const standing = { ...sample.standing!, artOwned: [0b000011] };
  const choosing = { quest: 2, task: 7, counts: [], done: [1, 0, 0, 0], choices: [1, 0, 0], at: null };
  const { ui, click, open, asked } = menu({ ...sample, standing, quest: choosing });
  open('character');
  click('art-diamond');
  assert.ok(ui.boxOf('arts-choice'), 'offered');
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((index) => ui.boxOf(`choose-${index}`) !== null),
    [false, false, true, true, true, true],
    'the fragments owned are not among them',
  );
  click('choose-3');
  assert.deepEqual(asked, [{ kind: ASKS.chooseFragment, column: 1, node: 3 }]);
  const none = menu({ ...sample, standing, quest: { ...choosing, choices: [0, 0, 0] } });
  none.open('character');
  none.click('art-diamond');
  assert.equal(none.ui.boxOf('arts-choice'), null, 'none waiting, none offered');
  const every = menu({ ...sample, standing: { ...standing, artOwned: [0b11_1111] }, quest: choosing });
  every.open('character');
  every.click('art-diamond');
  assert.equal(every.ui.boxOf('arts-choice'), null, 'every fragment owned: the room pays the choice in Aurem');
});

test("with no Art worn, the Character page says a house's road gives one, and the Arts' screen shows all three locked", () => {
  const sample = sampleGear();
  const gear = { ...sample, arts: { ...sample.arts!, art: 0, earned: [0, 0, 0] } };
  const { ui, click, open, asked, labelOf } = menu(gear);
  open('character');
  assert.equal(labelOf('art-diamond'), `Art: none. ${NO_ART_WORDS}`);
  assert.equal(NO_ART_WORDS, 'Pledge to a house; its road gives its Art.');
  click('art-diamond');
  assert.ok(ui.boxOf('arts-page'), "the Arts' screen opens");
  for (const art of ARTS) {
    assert.match(labelOf(`art-${art.id}`) ?? '', /not earned\. Earned on the .+ road\.$/, `${art.name} locked`);
    assert.doesNotMatch(labelOf(`art-${art.id}`) ?? '', /worn/, 'none worn');
  }
  click('art-1');
  assert.deepEqual(asked, [], 'none may be worn');
});

test('the Mount slot stands with the gear: empty with a horse glyph, then the horse worn; its flyout wears a horse and a barding', () => {
  const sample = sampleGear();
  const empty = menu(sample);
  empty.open('character');
  assert.equal(empty.labelOf('slot-11'), 'Mount: empty');
  const numberOf = (id: string) => COSMETICS.findIndex((each) => each.id === id);
  const carried = sampleItem({ id: 40, kind: HORSE, name: 3, level: 1, at: 0, bucket: MOUNT_SLOT });
  const worn = sampleItem({ id: 41, kind: HORSE, name: 1, level: 1, at: WORN + MOUNT_SLOT, bucket: MOUNT_SLOT });
  const gear = {
    ...sample,
    items: [...sample.items, carried, worn],
    cosmetics: [numberOf('dawnfire')],
    worn: { dye: 0, coat: numberOf('chestnut'), barding: numberOf('bare') },
  };
  const { ui, click, open, asked, labelOf } = menu(gear);
  open('character');
  assert.equal(labelOf('slot-11'), 'Mount: Chestnut Horse, Normal');
  click('slot-11');
  assert.ok(ui.boxOf('flyout'), 'it opens as a gear slot does');
  click('item-40');
  assert.deepEqual(asked, [{ kind: ASKS.wear, item: 40, slot: MOUNT_SLOT }], 'a horse kept is worn by a click');
  click('barding-ember_plate');
  assert.equal(asked.length, 1, 'a barding not kept asks nothing');
  click('barding-dawnfire');
  assert.deepEqual(asked[1], { kind: ASKS.wearCosmetic, item: numberOf('dawnfire') }, 'a barding kept is worn over it');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import { QuadList } from '../ui/quads.ts';
import { Stack } from '../ui/stack.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { wordsOf } from '../ui/uiForTests.ts';
import type { Laid } from '../ui/node.ts';
import { OPEN_AT, gearTakesKeys } from './gearScreen.ts';
import { sampleGear } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';
import { Hud } from './hud.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';
import type { ShipPanel } from './shipPanel.ts';

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

/** The menu on a fake page, its gear `gear` (null for none), resting while `resting` says; with a step of frames and
 *  the keys pressed on the page, and every ask it made. */
function menu(
  gear: GearState | null = sampleGear(),
  resting = () => false,
  papers: ShipPanel | null = null,
  view = VIEW,
) {
  const { window } = fakePage();
  Object.assign(globalThis, {
    devicePixelRatio: 1,
    innerWidth: view.width,
    innerHeight: view.height,
    setInterval: () => 0,
    requestAnimationFrame: () => 0,
  });
  Object.assign(globalThis.document, { exitPointerLock: () => undefined, hidden: false });
  const asked: GearAsk[] = [];
  const state = { gear };
  const here = () =>
    state.gear && { gear: state.gear, ask: (ask: GearAsk) => asked.push(ask), forge: null, dress: null };
  const stack = new Stack();
  stack.add(
    startGearWindow(
      () => false,
      null,
      here,
      () => papers,
      () => null,
      resting,
      here,
      { week: () => null, kept: () => null },
    ),
  );
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  const frame = (events: UiEvent[] = []) => {
    ui.frame(view, events, 1 / 60);
    ui.draw(stack.node(ui));
  };
  /** A key as the page sends it: to the window's listeners, and a key going down to the interface's next frame. */
  const key = (name: string, kind = 'keydown') => {
    const event = new FakeEvent(kind, { key: name });
    window.dispatchEvent(event);
    if (kind === 'keydown') frame([{ kind: 'key', key: name }]);
  };
  /** A click on what `id` names, laid last frame. */
  const click = (id: string, button = 0) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button },
      ...(button === 0 ? [{ kind: 'up' as const, x, y, button }] : []),
    ]);
    frame();
  };
  const open = (view: string) => {
    window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view } }));
    frame();
    frame();
  };
  return { ui, frame, key, click, open, asked, window, state };
}

test('while the story plays the menu never opens, by its keys or when asked, so the keys stay with the story', () => {
  let resting = true;
  const { ui, frame, key, open } = menu(sampleGear(), () => resting);
  key('i');
  open('character');
  frame();
  assert.equal(ui.boxOf('gear-screen'), null);
  resting = false;
  key('i');
  frame();
  frame();
  assert.ok(ui.boxOf('gear-screen'), 'I opens it once the story is over');
  assert.ok(gearTakesKeys(), 'and the drawn menu takes the keys');
  key('Escape');
  frame();
  assert.equal(ui.boxOf('gear-screen'), null, 'Escape closes it');
});

test('the tabs open their pages; the arrows on a tab move to the next and open it', () => {
  const { ui, frame, click, open } = menu();
  open('character');
  assert.ok(ui.boxOf('slot-0'), 'the Character page shows its slots');
  click('tab-inventory');
  assert.ok(ui.boxOf('shelf-materials'), 'the Inventory shows its shelves');
  assert.equal(ui.boxOf('slot-0'), null);
  ui.focusOn('tab-inventory');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  frame();
  assert.equal(ui.focusedId, 'tab-journal');
  assert.equal(ui.boxOf('shelf-materials'), null, 'the Journal is shown');
});

test('two arrows on a tab in one frame move two tabs on, never closing the menu', () => {
  const { ui, frame, open } = menu();
  open('character');
  ui.focusOn('tab-character');
  frame([
    { kind: 'key', key: 'ArrowRight' },
    { kind: 'key', key: 'ArrowRight' },
  ]);
  frame();
  frame();
  assert.ok(ui.boxOf('gear-screen'), 'the menu stays open');
  assert.equal(ui.focusedId, 'tab-journal');
  // From a tab walked to but not shown, the arrow steps from it; onto the tab shown, it only takes the focus.
  ui.focusOn('tab-social');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  frame();
  assert.equal(ui.focusedId, 'tab-guild');
  ui.focusOn('tab-social');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  frame();
  assert.ok(ui.boxOf('gear-screen'), 'onto the tab shown, the menu stays open');
  assert.equal(ui.focusedId, 'tab-guild');
});

test("the pad's bumpers turn the menu's tabs, round from the last to the first, and a toggling ask shuts it", () => {
  const { ui, frame, open, window } = menu();
  open('character');
  frame([{ kind: 'pad', button: 'next' }]);
  frame();
  assert.ok(ui.boxOf('shelf-materials'), 'RB: the Inventory');
  frame([{ kind: 'pad', button: 'previous' }]);
  frame([{ kind: 'pad', button: 'previous' }]);
  frame();
  frame();
  assert.ok(
    ui.boxOf('gear-screen') && !ui.boxOf('slot-0') && !ui.boxOf('shelf-materials'),
    'LB twice: round to the last tab',
  );
  open('character');
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'character', toggle: true } }));
  frame();
  assert.equal(ui.boxOf('gear-screen'), null, 'Start again shuts it, as I does');
});

test('a slot opens its flyout of nine, a carried piece is worn by a click, and Escape steps back before closing', () => {
  const { ui, click, open, key, frame, asked } = menu();
  open('character');
  assert.deepEqual(
    ui.boxOf('slot-0') && [ui.boxOf('slot-0')?.width, ui.boxOf('slot-0')?.height],
    [77, 77],
    "a short screen's slot",
  );
  click('slot-0');
  const grid = ui.boxOf('flyout');
  assert.ok(grid, 'the flyout opens');
  const cell = ui.boxOf('item-7');
  assert.ok(cell && cell.width === 64, 'a carried piece stands in a 64 px cell');
  click('item-7');
  assert.equal(asked.length, 1, 'a click wears it');
  key('Escape');
  frame();
  assert.equal(ui.boxOf('flyout'), null, 'Escape closes the flyout first');
  assert.ok(ui.boxOf('gear-screen'), 'and leaves the menu open');
});

test('a right press opens an item’s page over the menu; X on a focused piece does too; Escape closes it first', () => {
  const { ui, click, open, key, frame } = menu();
  open('character');
  ui.focusOn('slot-0');
  click('slot-0', 2);
  frame();
  assert.ok(ui.boxOf('item-page'), 'the item’s page lies over the body');
  assert.ok(ui.boxOf('press-Take off'), 'its presses go to the footer');
  assert.equal(ui.boxOf('slot-1'), null, 'the page under it is out of reach');
  assert.equal(ui.focusedId, 'item-name', 'it is read from its name');
  key('Escape');
  frame();
  frame();
  assert.equal(ui.boxOf('item-page'), null);
  assert.ok(ui.boxOf('gear-screen'));
  assert.equal(ui.focusedId, 'slot-0', 'the focus goes back to the slot it was asked from');
  ui.focusOn('slot-1');
  frame();
  key('x');
  frame();
  frame();
  assert.ok(ui.boxOf('item-page'), 'X opens the focused piece’s page');
});

test('a dismantle held on an item’s page that Escape closes does nothing', async () => {
  const { ui, open, frame, key, asked } = menu();
  open('character');
  frame();
  // A carried sword's page, its dismantle held down.
  const press = (id: string, button = 0) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    const [x, y] = [box.x + 2, box.y + 2];
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button },
      ...(button === 0 ? [{ kind: 'up' as const, x, y, button }] : []),
    ]);
    frame();
  };
  press('slot-0');
  press('item-7', 2);
  const held = ui.boxOf('press-Hold to dismantle');
  assert.ok(held);
  frame([
    { kind: 'pointer', x: held.x + 2, y: held.y + 2 },
    { kind: 'down', x: held.x + 2, y: held.y + 2, button: 0 },
  ]);
  frame();
  key('Escape');
  await new Promise((done) => setTimeout(done, 1000));
  frame();
  assert.deepEqual(asked, [], 'nothing was dismantled');
});

test('a hover card shows beside a slot under the pointer, kept on the screen', () => {
  const { ui, open, frame } = menu();
  open('character');
  const slot = ui.boxOf('slot-3');
  assert.ok(slot);
  frame([{ kind: 'pointer', x: slot.x + 4, y: slot.y + 4 }]);
  frame();
  frame();
  const card = ui.boxOf('gear-card');
  assert.ok(card, 'the card is laid');
  assert.ok(card.x + card.width <= VIEW.width, 'within the screen');
  assert.ok(card.x + card.width <= slot.x || card.x >= slot.x + slot.width, 'beside the slot, not over it');
});

test('the hover card lets the pointer through, so where it must cover its tile, as on a phone, it holds still', () => {
  const vestige = { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false, source: 0 };
  const mail = [{ id: 31, from: 0, crowded: false, vestige, item: null }];
  const { ui, open, frame } = menu({ ...sampleGear(), mail }, () => false, null, { width: 390, height: 844, scale: 1 });
  open('mail');
  const tile = ui.boxOf('letter-31');
  assert.ok(tile);
  frame([{ kind: 'pointer', x: tile.x + 4, y: tile.y + 4 }]);
  const shown = Array.from({ length: 4 }, () => (frame(), [ui.hovered('letter-31'), ui.boxOf('gear-card') !== null]));
  assert.deepEqual(shown.slice(1), [
    [true, true],
    [true, true],
    [true, true],
  ]);
});

test('without a room keeping gear the menu says where gear shows, and the inventory none of its shelves', () => {
  const { ui, open } = menu(null);
  open('inventory');
  assert.ok(ui.boxOf('gear-screen'));
  assert.equal(ui.boxOf('shelf-materials'), null);
});

test('Settings is drawn in the menu’s body, which the wheel scrolls to its volumes', () => {
  const { ui, frame, click, open } = menu();
  open('settings');
  const before = ui.boxOf('volume-ambience');
  assert.ok(before, 'the volumes are laid');
  frame([
    { kind: 'pointer', x: 640, y: 400 },
    // Far enough that the volumes stand a little under the body's top.
    { kind: 'wheel', x: 640, y: 400, dy: before.y - (ui.boxOf('gear-body')?.y ?? 0) - 60 },
  ]);
  frame();
  const after = ui.boxOf('volume-ambience');
  assert.ok(after && after.y < before.y, 'the body scrolled');
  click('volume-music');
  assert.equal(ui.focusedId, 'volume-music');
  frame([{ kind: 'key', key: 'ArrowLeft' }]);
  frame();
  assert.equal(ui.focusedId, 'volume-music', 'the slider keeps its arrows');
  assert.ok(Math.abs((ui.boxOf('volume-ambience')?.y ?? 0) - after.y) < 4, 'and the body stays where it was scrolled');
});

test('the Ship tab steps back from an officer’s page with Escape, and shows its papers without the room’s word', () => {
  const columns = [{ kind: 3, traits: ['gun_captain'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 }];
  const officer = { id: 4, post: 1, grade: 2, given: 0, family: 1, duty: 1, level: 3, toNext: 0.4, trained: 500 };
  const ship = {
    ...{ xp: 0n, level: 4, prestige: 9, attack: 100, defense: 60, toNext: 0.35, toNextNeeds: 1_200 },
    ...{ stocks: [1, 2, 3, 4], hands: 18, handsMost: 24, offers: [], trim: [], pledge: 0 },
    officers: [{ ...officer, trainedMost: 2_000, strength: 0.5, bought: 0, chosen: [255], columns, wage: 0 }],
  };
  const papers = { title: 'Your Sloop', parts: [{ heading: 'Vessel', rows: [['Hull', '9 / 9']] as const }] };
  const { ui, frame, click, open, key } = menu({ ...sampleGear(), ship }, () => false, papers);
  open('ship');
  assert.ok(ui.boxOf('page-ship'), 'Manage shows its papers');
  click('ship-crew');
  click('officer-4');
  assert.ok(ui.boxOf('node-0-0'), "the officer's page shows their nodes");
  assert.ok(ui.boxOf('press-step'), 'and the footer offers Back');
  key('Escape');
  frame();
  assert.equal(ui.boxOf('node-0-0'), null, 'Escape steps back to the roster');
  assert.ok(ui.boxOf('gear-screen'), 'and leaves the menu open');
  const away = menu(null, () => false, papers);
  away.open('ship');
  assert.ok(away.ui.boxOf('page-ship'), 'with no gear, its papers still show');
});

test("the pad's B steps the menu back as Escape does: the flyout first, then the menu", () => {
  const { ui, frame, click, open } = menu();
  open('character');
  click('slot-0');
  assert.ok(ui.boxOf('flyout'), 'the flyout is open');
  frame([{ kind: 'pad', button: 'back' }]);
  frame();
  assert.equal(ui.boxOf('flyout'), null, 'B closes the flyout');
  assert.ok(ui.boxOf('gear-screen'), 'and leaves the menu open');
  frame([{ kind: 'pad', button: 'back' }]);
  frame();
  assert.equal(ui.boxOf('gear-screen'), null, 'B again closes the menu');
});

test("a key's focus in a slot's flyout goes back to its slot as Escape closes it", () => {
  const { ui, frame, key, open } = menu();
  open('character');
  ui.focusOn('slot-0');
  frame([{ kind: 'key', key: 'Enter' }]);
  frame();
  assert.ok(ui.boxOf('flyout'), 'Enter on the slot opens its flyout');
  ui.focusOn('item-8');
  frame([{ kind: 'key', key: 'ArrowLeft' }]);
  assert.equal(ui.focusedId, 'item-7', 'the keys walk the flyout');
  key('Escape');
  frame();
  assert.equal(ui.boxOf('flyout'), null);
  assert.equal(ui.focusedId, 'slot-0', 'the focus is back on its slot');
});

test('a focused carried piece that goes (dismantled, worn, sold) leaves the focus on the one beside it', () => {
  const { ui, frame, click, open, state } = menu();
  open('character');
  click('slot-0');
  ui.focusOn('item-8');
  frame([{ kind: 'key', key: 'ArrowLeft' }]);
  assert.equal(ui.focusedId, 'item-7');
  const gear = sampleGear();
  state.gear = { ...gear, items: gear.items.filter((item) => item.id !== 7), answered: 1 };
  frame();
  frame();
  assert.equal(ui.focusedId, 'item-8', 'the next piece takes the focus');
  assert.ok(ui.keyFocused, 'as the keys left it');
});

test("an item's words take its page's room as a grid's minmax(380px, 660px) 1fr does, the art the rest", () => {
  const { ui, click, open, frame } = menu();
  open('character');
  click('slot-0', 2);
  frame();
  const [words, art] = [ui.boxOf('item-words'), ui.boxOf('item-art')];
  assert.ok(words && art);
  assert.equal(words.width, 660, 'at 1280 by 720, as wide as the grid lets it');
  assert.equal(art.x - (words.x + words.width), 32, 'the grid’s gap before the art');
});

test("a keeper's coin and the account's mark are named in a card on hover, and on a key's focus", () => {
  const { ui, open, frame } = menu();
  open('weaponsmith');
  const laid = () => (ui as unknown as { laid: readonly Laid[] }).laid;
  const card = () => wordsOf(laid().filter((each) => ui.boxOf('gear-card') && inside(each, 'gear-card')));
  const inside = (each: Laid, id: string): boolean =>
    each.node.id === id || (each.parent !== null && inside(each.parent, id));
  const coin = laid().find((each) => each.node.label?.endsWith('Aurem'));
  assert.ok(coin?.node.id, 'the purse shows Aurem, which the pointer and the keys reach');
  frame([{ kind: 'pointer', x: coin.box.x + 4, y: coin.box.y + 4 }]);
  frame();
  frame();
  assert.ok(card().includes('Aurem'), `the currency is named on hover (${JSON.stringify(card())})`);
  frame([{ kind: 'leave' }]);
  ui.focusOn('account-mark');
  frame([
    { kind: 'key', key: 'Tab', shift: true },
    { kind: 'key', key: 'Tab' },
  ]);
  frame();
  frame();
  assert.equal(ui.focusedId, 'account-mark');
  assert.ok(card().includes('Offline'), `the account is named on a key's focus (${JSON.stringify(card())})`);
});

test('with the menu open, Tab never reaches the sea bar under it, and Enter presses nothing there', () => {
  const { window } = fakePage();
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: VIEW.width, innerHeight: VIEW.height });
  Object.assign(globalThis.document, { exitPointerLock: () => undefined, hidden: false });
  const gear = sampleGear();
  const hud = new Hud();
  hud.veil(null);
  let left = 0;
  hud.onLeaveHelm(() => left++);
  hud.seaBar({ pace: 2, sailing: true, resumable: false, landfall: null, canLeave: true, canManage: true });
  const stack = new Stack();
  stack.add((ui) => hud.node(ui));
  const here = () => ({ gear, ask: () => undefined, forge: null, dress: null });
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
  const frame = (events: UiEvent[] = []) => {
    ui.frame(VIEW, events, 1 / 60);
    ui.draw(stack.node(ui));
  };
  frame();
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'ship' } }));
  frame();
  frame();
  assert.ok(ui.boxOf('gear-screen') && ui.boxOf('sea:leave'), 'the menu open over the sea bar');
  const seen = new Set<string | null>();
  for (let step = 0; step < 60; step++) {
    frame([{ kind: 'key', key: 'Tab' }]);
    seen.add(ui.focusedId);
  }
  assert.equal(seen.has('sea:leave'), false, 'Tab walks the menu alone');
  ui.focusOn('sea:leave');
  frame([{ kind: 'key', key: 'Enter' }]);
  frame();
  assert.equal(left, 0, 'Enter presses nothing under the menu');
});

test('on the Journal the hourglass stands in the account mark’s place, T drops its timers, and they go up as it is left', () => {
  const { ui, frame, key, open } = menu();
  open('journal');
  assert.ok(ui.boxOf('hourglass') && !ui.boxOf('account-mark'), 'the hourglass in the mark’s place');
  assert.equal(ui.boxOf('journal-timers'), null);
  key('t');
  frame();
  assert.ok(ui.boxOf('journal-timers'), 'T drops the timers');
  key('Escape');
  frame();
  assert.ok(ui.boxOf('gear-screen') && !ui.boxOf('journal-timers'), 'Escape takes them up before the menu');
  key('t');
  frame();
  open('character');
  assert.ok(ui.boxOf('account-mark') && !ui.boxOf('hourglass'), 'the mark again on another tab');
  open('journal');
  assert.equal(ui.boxOf('journal-timers'), null, 'gone up as the Journal was left');
});

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
import { FakeEvent, fakeWindow } from './pageForTests.ts';
import type { ShipPanel } from './shipPanel.ts';
import { readFile } from 'node:fs/promises';
import { startCombatRules } from '../rules/combatRules.ts';
import { setItemRules } from './itemStats.ts';

// An item's fight numbers are the room's rules', as the game gives them to its pages.
const ROOM_WASM = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
setItemRules(startCombatRules(new WebAssembly.Module(await readFile(ROOM_WASM))));

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
  const { window } = fakeWindow();
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

test('Settings is drawn in the menu’s body, its tabs standing over a panel the wheel scrolls, Controls the longest', () => {
  const { ui, frame, click, open } = menu();
  open('settings');
  assert.ok(ui.boxOf('settings-graphics') && ui.boxOf('resolution'), 'at its first tab, Graphics');
  click('settings-audio');
  click('volume-music');
  assert.equal(ui.focusedId, 'volume-music');
  frame([{ kind: 'key', key: 'ArrowLeft' }]);
  frame();
  assert.equal(ui.focusedId, 'volume-music', 'the slider keeps its arrows');
  click('settings-controls');
  /** How far down its panel the first key stands. */
  const down = () => (ui.boxOf('controls:jump:keys:0')?.y ?? 0) - (ui.boxOf('settings-list')?.y ?? 0);
  const before = ui.boxOf('controls:jump:keys:0');
  assert.ok(before, 'every control is laid');
  const top = down();
  frame([
    { kind: 'pointer', x: 640, y: 400 },
    { kind: 'wheel', x: 640, y: 400, dy: 200 },
  ]);
  frame();
  const after = ui.boxOf('controls:jump:keys:0');
  assert.ok(after && after.y < before.y, 'the body scrolled');
  assert.ok(ui.boxOf('settings-graphics'), 'the tabs stay where they stand');
  click('settings-graphics');
  click('settings-controls');
  assert.equal(down(), top, 'a tab shown anew stands from its top');
});

test('the Escape that opened Settings, heard by the menu a frame later, does not close it again', () => {
  const { ui, frame, key, window } = menu();
  // As the game's keys open it on Escape: the menu opens, then its interface hears the same key.
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'settings' } }));
  frame([{ kind: 'key', key: 'Escape' }]);
  frame();
  assert.ok(ui.boxOf('gear-screen') && ui.boxOf('settings-graphics'), 'Settings stands open');
  key('Escape');
  frame();
  assert.equal(ui.boxOf('gear-screen'), null, 'a later Escape closes it');
});

test("the account's mark opens Settings at Account, and from Settings shows Account there, never shutting it", () => {
  const { ui, click, open } = menu();
  open('character');
  click('account-mark');
  assert.ok(ui.boxOf('settings-account') && !ui.boxOf('resolution'), 'Settings at Account, not Graphics');
  click('settings-graphics');
  assert.ok(ui.boxOf('resolution'));
  click('account-mark');
  assert.ok(ui.boxOf('gear-screen'), 'Settings stays open');
  assert.equal(ui.boxOf('resolution'), null, 'at Account again');
});

test('Settings shut and opened again keeps its tab with the credits put away; while they show the footer says Back', () => {
  const { ui, click, open, window, frame } = menu();
  open('settings');
  click('settings-audio');
  click('settings-credits');
  assert.ok(ui.boxOf('press-step') && !ui.boxOf('press-close'), 'Back, as Escape steps back to Audio');
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'settings', toggle: true } }));
  frame();
  assert.equal(ui.boxOf('gear-screen'), null, 'shut');
  open('settings');
  assert.ok(ui.boxOf('volume-music') && !ui.boxOf('settings-credits-back'), 'at Audio, the credits put away');
  assert.ok(ui.boxOf('press-close'));
  click('settings-credits');
  open('character');
  open('settings');
  assert.ok(ui.boxOf('volume-music'), 'another tab and back puts them away too');
});

test('the keys’ focus goes to the way back as the credits show, and to their press as Escape puts them away', () => {
  const { ui, click, key, frame, open } = menu();
  open('settings');
  click('settings-audio');
  ui.focusOn('settings-credits');
  frame([{ kind: 'key', key: 'Enter' }]);
  frame();
  frame();
  assert.equal(ui.focusedId, 'settings-credits-back');
  key('Escape');
  key('Escape', 'keyup');
  frame();
  assert.equal(ui.focusedId, 'settings-credits', 'never an exit');
});

test('Escape steps back from the sound credits to Audio before it closes the menu', () => {
  const { ui, click, key, open } = menu();
  open('settings');
  click('settings-audio');
  click('settings-credits');
  assert.ok(ui.boxOf('settings-credits-back'), 'the credits stand in the volumes’ place');
  key('Escape');
  key('Escape', 'keyup');
  assert.ok(ui.boxOf('volume-music') && !ui.boxOf('settings-credits-back'), 'back at Audio, the menu still open');
  key('Escape');
  assert.equal(ui.boxOf('gear-screen'), null, 'then the menu closes');
});

test('the Ship tab steps back from an officer’s page with Escape, and shows its papers without the room’s word', () => {
  const columns = [{ kind: 3, traits: ['gun_captain'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 }];
  const officer = { id: 4, post: 1, grade: 2, given: 0, family: 1, duty: 1, level: 3, toNext: 0.4, trained: 500 };
  const ship = {
    ...{ xp: 0n, level: 4, prestige: 9, attack: 100, defense: 60, toNext: 0.35, toNextNeeds: 1_200 },
    ...{
      stocks: [1, 2, 3, 4],
      hands: 18,
      handsMost: 24,
      offers: [],
      trim: [],
      pledge: 0,
      fleet: [{ hull: 0, name: [255, 255], named: false, dress: [] }],
      sailed: 0,
      dresses: [],
    },
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

test("an item's page stands whole on a 1600 by 900 screen: its words half across, its nodes over the footer, the art the rest", () => {
  const view = { width: 1600, height: 900, scale: 1 };
  const { ui, click, open, frame } = menu(sampleGear(), () => false, null, view);
  open('character');
  click('slot-0', 2);
  frame();
  const [body, words, art, foot] = ['gear-body', 'item-words', 'item-art', 'gear-foot'].map((id) => ui.boxOf(id));
  assert.ok(body && words && art && foot);
  assert.equal(words.width, 740, 'half the page across, within 460 and 780 at the larger words');
  assert.equal(art.x - (words.x + words.width), 32, 'the gap before the art');
  assert.ok(art.width > 600 && art.height > 400, `the art takes the rest (${art.width} by ${art.height})`);
  for (const id of ['node-0-0', 'node-0-1', 'node-2-0']) {
    const node = ui.boxOf(id);
    assert.ok(node && node.y + node.height <= foot.y, `${id} stands over the footer, in reach`);
  }
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
  const { window } = fakeWindow();
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

/** Every word laid in the menu's last frame. */
const laidWords = (ui: Interface) => wordsOf((ui as unknown as { laid: readonly Laid[] }).laid);

test("Compare sets the piece worn beside a carried one's page, by its press or C; a worn piece's page offers none", () => {
  const { ui, frame, key, click, open } = menu();
  open('character');
  click('slot-0');
  click('item-7', 2);
  assert.ok(ui.boxOf('press-compare'), 'a carried sword is set beside the one worn');
  assert.ok(!laidWords(ui).includes('WORN'));
  click('press-compare');
  assert.ok(laidWords(ui).includes('WORN'), 'the worn piece stands beside the page');
  assert.ok(laidWords(ui).includes('+18'), 'and its Attack is set against the worn one’s (230 over 212)');
  key('c');
  frame();
  assert.ok(!laidWords(ui).includes('WORN'), 'C takes it away');
  key('Escape');
  frame();
  click('slot-0', 2);
  assert.equal(ui.boxOf('press-compare'), null, 'the worn sword has nothing worn beside it');
  key('c');
  frame();
  assert.ok(!laidWords(ui).includes('WORN'), 'nor does C set anything there');
});

test("a node tried on an item's page shows on its bars what choosing it would change; its card, what it costs", () => {
  const { ui, frame, click, open } = menu();
  open('character');
  click('slot-0', 2);
  const before = laidWords(ui);
  assert.ok(before.includes('SWING COST') && !before.some((words) => /^\d+(\.\d)? [+−]/.test(words)));
  const node = ui.boxOf('node-0-1');
  assert.ok(node, 'Weighted, bought beside the Light Grip chosen');
  frame([{ kind: 'pointer', x: node.x + 4, y: node.y + 4 }]);
  frame();
  frame();
  const tried = laidWords(ui);
  assert.ok(tried.includes('12 +2'), `its blows fill a foe's poise 20% more (${tried.join(' | ')})`);
  assert.ok(tried.includes('12 +1.8'), 'and a swing costs what Light Grip no longer takes off');
  const open1 = ui.boxOf('node-1-0');
  assert.ok(open1);
  frame([{ kind: 'pointer', x: open1.x + 4, y: open1.y + 4 }]);
  frame();
  frame();
  const card = laidWords(ui);
  assert.ok(card.includes('COSTS'), 'a node not bought says what it costs');
  assert.ok(card.includes('12,480 / 200') && card.includes('14 / 4'), 'beside what the player has');
  const growth = (ui as unknown as { laid: readonly Laid[] }).laid.filter((each) =>
    each.node.picture?.key.startsWith('growth'),
  );
  assert.ok(growth.length > 0, 'a locked node grows a square round its edge');
  assert.ok(
    !(ui as unknown as { laid: readonly Laid[] }).laid.some((each) => each.node.picture?.key.startsWith('ring')),
  );
});

test("a locked node's card shows on hover; Ctrl+C copies and sets nothing beside; a node tried drops the worn's change", () => {
  const { ui, frame, click, open, window } = menu();
  open('character');
  click('slot-0');
  click('item-7', 2);
  const locked = ui.boxOf('node-0-0');
  assert.ok(locked, 'its one column, locked until it grows');
  frame([{ kind: 'pointer', x: locked.x + 4, y: locked.y + 4 }]);
  frame();
  frame();
  assert.ok(laidWords(ui).includes('Locked'), 'its card says it is locked, and how it unlocks');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'c', ctrlKey: true }));
  frame();
  assert.ok(!laidWords(ui).includes('WORN'), 'Ctrl+C is the browser’s');
  click('press-compare');
  assert.ok(laidWords(ui).includes('+18'));
  const tried = ui.boxOf('node-0-1');
  assert.ok(tried);
  frame([{ kind: 'pointer', x: tried.x + 4, y: tried.y + 4 }]);
  frame();
  frame();
  assert.ok(!laidWords(ui).includes('+18'), 'while a node is tried the numbers stand beside its own choice alone');
});

test('on a narrow screen the words stand under the nodes as wide as their column', () => {
  const { ui, click, open } = menu(sampleGear(), () => false, null, { width: 900, height: 700, scale: 1 });
  open('character');
  click('slot-0', 2);
  const [words, flavour] = [ui.boxOf('item-words'), ui.boxOf('item-flavour')];
  assert.ok(words && flavour);
  assert.ok(flavour.width > words.width * 0.8, `${flavour.width} of ${words.width}`);
});

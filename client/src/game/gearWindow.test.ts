import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import { QuadList } from '../ui/quads.ts';
import { Stack } from '../ui/stack.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { OPEN_AT, gearTakesKeys } from './gearScreen.ts';
import { sampleGear } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';
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

/** The menu on a fake page, its gear `gear` (null for none), resting while `resting` says; with a step of frames and
 *  the keys pressed on the page, and every ask it made. */
function menu(gear: GearState | null = sampleGear(), resting = () => false) {
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
  const here = gear && (() => ({ gear, ask: (ask: GearAsk) => asked.push(ask), forge: null, dress: null }));
  const stack = new Stack();
  stack.add(
    startGearWindow(
      () => false,
      null,
      here ?? (() => null),
      () => null,
      () => null,
      resting,
    ),
  );
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  const frame = (events: UiEvent[] = []) => {
    ui.frame(VIEW, events, 1 / 60);
    ui.draw(stack.node(ui));
  };
  const key = (name: string, kind = 'keydown') => {
    const event = new FakeEvent(kind, { key: name });
    window.dispatchEvent(event);
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
  return { ui, frame, key, click, open, asked, window };
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

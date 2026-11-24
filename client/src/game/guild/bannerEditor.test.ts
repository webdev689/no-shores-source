import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Child, Node } from '../../ui/node.ts';
import { sizesOf } from '../gearNodes.ts';
import { drawn } from '../menuForTests.ts';
import { BACK_ID, BannerEditor, DRAW_ID, SAVE_ID, choiceId, partId } from './bannerEditor.ts';
import { type Banner, type Part, bannerRefusal, choicesOf, nameOf } from './bannerLaw.ts';

const BANNER: Banner = {
  cut: 'swallowtail',
  cloth: 'navy',
  device: 'halves',
  deviceColour: 'storm',
  sign: 'raven',
  signColour: 'bone',
  ground: 'roundel',
  groundColour: 'blood',
  staff: 'iron',
};

/** The editor drawn alone in `room`, at the sizes of a `view` window, on `part`. */
function editor(part: Part, room = { width: 1180, height: 470 }, view: [number, number] = [1280, 720], level = 4) {
  const made = new BannerEditor(BANNER, 'Salt Kings');
  let last: Node = {};
  const page = drawn((context) => {
    last = made.node(
      { ...context, sizes: sizesOf(view[0], view[1], 1) },
      { level, mayKeep: true, busy: false, keep: () => undefined, back: () => undefined },
    );
    return { width: room.width, height: room.height, children: [last] };
  }, room);
  page.frame();
  page.click(partId(part));
  page.frame();
  return { ...page, tree: () => last };
}

/** Whether a press or choice lies wholly in the room. */
function inRoom(
  box: { x: number; y: number; width: number; height: number } | null,
  room: { width: number; height: number },
) {
  return box !== null && box.x + box.width <= room.width && box.y + box.height <= room.height;
}

test('at 1280 by 720 and by 600 every sign and the Keep, Draw and Back presses lie in the room', () => {
  for (const room of [
    { width: 1180, height: 470 },
    { width: 1180, height: 350 },
  ]) {
    const { ui } = editor('sign', room);
    for (const sign of choicesOf('sign'))
      assert.ok(inRoom(ui.boxOf(choiceId('sign', sign)), room), `${sign} at ${room.height}`);
    for (const id of [SAVE_ID, DRAW_ID, BACK_ID]) assert.ok(inRoom(ui.boxOf(id), room), `${id} at ${room.height}`);
  }
});

test('a refused colour takes the focus and says why', () => {
  const { ui, frame, shows } = editor('signColour');
  const why = bannerRefusal({ ...BANNER, signColour: 'blood' }, 99);
  ui.focusOn(choiceId('signColour', 'blood'));
  frame();
  assert.equal(ui.focused(choiceId('signColour', 'blood')), true, 'it takes the focus');
  assert.ok(why && shows().includes(`Blood: ${why}`), shows());
});

test('a staff the guild has not earned shows the level that opens it', () => {
  const { shows } = editor('staff', undefined, undefined, 1);
  assert.ok(shows().includes('Opens at guild level 10'), shows());
});

test('a cut, device, sign or ground says its name when the focus is on it', () => {
  for (const part of ['cut', 'device', 'sign', 'ground'] as const) {
    const { ui, frame, shows } = editor(part);
    const choice = choicesOf(part)[1] ?? '';
    ui.focusOn(choiceId(part, choice));
    frame();
    assert.ok(shows().includes(nameOf(part, choice)), `${part}: ${shows()}`);
  }
});

test('every colour stands in a cell of one width, so the two rows line up', () => {
  const { ui } = editor('cloth');
  const widths = new Set(choicesOf('cloth').map((colour) => ui.boxOf(choiceId('cloth', colour))?.width));
  assert.equal(widths.size, 1, [...widths].join(', '));
});

test("at 1600 by 900 the parts' names stand at the label's step", () => {
  const { tree } = editor('cut', { width: 1500, height: 650 }, [1600, 900]);
  const texts: { words: string; size: number }[] = [];
  const walk = (node: Child): void => {
    if (!node) return;
    if (node.text) texts.push({ words: String(node.text.words), size: node.text.size ?? 1 });
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree());
  assert.equal(texts.find((text) => text.words === 'CUT')?.size, 2);
});

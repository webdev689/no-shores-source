import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Child, Node } from '../../ui/node.ts';
import { sizesOf } from '../gearNodes.ts';
import { drawn } from '../menuForTests.ts';
import { BACK_ID, BannerEditor, DRAW_ID, SAVE_ID, choiceId, clashOf, partId } from './bannerEditor.ts';
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

// The 32 signs keep to the room unnamed at 720 tall, the line under the head naming the one under the focus.
test('every cut, device and ground is named under its face, as the colours are', () => {
  for (const part of ['cut', 'device', 'ground'] as const) {
    const { tree } = editor(part);
    const texts: string[] = [];
    const walk = (node: Child): void => {
      if (!node) return;
      if (node.id === choiceId(part, choicesOf(part)[1] ?? '')) texts.push(...(node.children ?? []).flatMap(wordsIn));
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree());
    assert.ok(texts.includes(nameOf(part, choicesOf(part)[1] ?? '')), `${part}: ${texts.join(' | ')}`);
  }
});

function wordsIn(node: Child): string[] {
  if (!node) return [];
  return [...(node.text ? [String(node.text.words)] : []), ...(node.children ?? []).flatMap(wordsIn)];
}

test('a refused colour says under it what it would match', () => {
  const { tree } = editor('signColour');
  const blood: string[] = [];
  const walk = (node: Child): void => {
    if (!node) return;
    if (node.id === choiceId('signColour', 'blood')) blood.push(...wordsIn(node));
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree());
  assert.ok(blood.includes('Same as ground'), blood.join(' | '));
});

test("at 800 by 600 a member's editor keeps its note and every staff in the room", () => {
  const room = { width: 710, height: 350 };
  const made = new BannerEditor(BANNER, 'Salt Kings');
  const page = drawn(
    (context) => ({
      width: room.width,
      height: room.height,
      children: [
        made.node(
          { ...context, sizes: sizesOf(800, 600, 1) },
          { level: 1, mayKeep: false, busy: false, keep: () => undefined, back: () => undefined },
        ),
      ],
    }),
    room,
  );
  page.frame();
  page.click(partId('staff'));
  page.frame();
  const laid = (page.ui as unknown as { laid: { node: Node; box: { x: number; width: number } }[] }).laid;
  for (const each of laid)
    if (each.node.text)
      assert.ok(
        each.box.x + each.box.width <= room.width,
        `"${String(each.node.text.words)}" ends at ${each.box.x + each.box.width}`,
      );
});

test('every refusal a part can meet has a few words for its cell', () => {
  for (const ground of ['roundel', 'none'])
    for (const part of ['cloth', 'device', 'deviceColour', 'signColour', 'ground', 'groundColour'] as const)
      for (const choice of choicesOf(part)) {
        const shown = { ...BANNER, ground, [part]: choice };
        const why = bannerRefusal(shown, 99);
        if (why) assert.match(clashOf(part, why, shown), /^Same as (cloth|device|sign|ground)$/, `${part} ${choice}`);
      }
});

test('at 1600 by 900 the signs stand at twice their cells where they fit so, named or not', () => {
  const { ui } = editor('sign', { width: 1500, height: 650 }, [1600, 900]);
  assert.equal(ui.boxOf(choiceId('sign', 'raven'))?.width, 72);
});

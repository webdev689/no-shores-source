import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Laid } from '../ui/node.ts';
import { type Box, QuadList } from '../ui/quads.ts';
import { Stack } from '../ui/stack.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { OPEN_AT } from './gearScreen.ts';
import { sampleGear } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';
import { Hud } from './hud.ts';
import { FakeEvent, fakeWindow } from './pageForTests.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const LESSON = {
  name: 'Prologue',
  task: 'Arm yourself with the bow',
  steps: [
    { text: 'Take up the bow', done: true },
    { text: 'Equip it', done: false, keys: ['I'] },
  ],
};
/** The longest lesson kept over the menu, and the one most seen there. */
const EQUIP = {
  name: 'Prologue',
  task: 'Equip your sword and shield',
  steps: [
    { text: 'Open your Character page', done: true, keys: ['I'] },
    { text: 'Equip them from the Melee slot', done: false },
  ],
};

/** The HUD, the lesson tracked and kept in the menu while `inMenu`, under the Character page open on a view
 *  `width` by `height`: everything laid, in drawing order. */
function laidWithMenu(width: number, height: number, inMenu: boolean, lesson = LESSON, close = false): Laid[] {
  const { window } = fakeWindow();
  Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: width, innerHeight: height, setInterval: () => 0 });
  Object.assign(globalThis, { requestAnimationFrame: () => 0 });
  Object.assign(globalThis.document, { exitPointerLock: () => undefined, hidden: false });
  const hud = new Hud();
  hud.veil(null);
  hud.tasks.show(lesson, 0);
  hud.tasks.inMenu = inMenu;
  const stack = new Stack();
  stack.add((ui) => hud.node(ui));
  const gear = sampleGear();
  const here = () => ({ gear, ask: () => undefined, forge: null, dress: null });
  stack.add(
    startGearWindow(
      () => false,
      null,
      here,
      () => null,
    ),
  );
  const ui = new Interface({
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer);
  ui.speak = () => undefined;
  const frame = (events: UiEvent[] = []) => {
    ui.frame({ width, height, scale: 1 }, events, 1 / 60);
    ui.draw(stack.node(ui));
  };
  frame();
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'character' } }));
  for (let step = 0; step < 30; step++) frame();
  if (close) {
    window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
    frame([{ kind: 'key', key: 'Escape' }]);
  }
  return layout(stack.node(ui), { x: 0, y: 0, width, height }, { face, scrollOf: () => 0 });
}

const wordsOf = (laid: Laid): string => {
  const words = laid.node.text?.words;
  return typeof words === 'string' ? words : (words ?? []).map((span) => span.words).join('');
};
const meets = (one: Box, two: Box) =>
  one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height;
const PAGE_Z = 20;

for (const [width, height, lesson] of [
  [1280, 720, LESSON],
  [1920, 1080, LESSON],
  [1280, 720, EQUIP],
  [1920, 1080, EQUIP],
  [960, 540, EQUIP],
] as const) {
  test(`at ${width}x${height} "${lesson.task}" stands over the open Character page, clear of every tile and label`, () => {
    const laid = laidWithMenu(width, height, true, lesson);
    const next = lesson.steps.find((each) => !each.done)?.text;
    const step = laid.filter((each) => [lesson.task, next].some((words) => words && wordsOf(each).includes(words)));
    assert.ok(step.length >= 2, 'the task and its step are laid');
    const page = laid.filter(
      (each) => each.z >= PAGE_Z && !step.includes(each) && (wordsOf(each) !== '' || each.node.role !== undefined),
    );
    const foot = laid.find((each) => each.node.id === 'gear-foot');
    assert.ok(foot, 'the menu has its foot');
    for (const words of step) {
      const { x, y, width: wide, height: high } = words.box;
      const within = x >= foot.box.x && y >= foot.box.y && x + wide <= foot.box.x + foot.box.width;
      assert.ok(within && y + high <= foot.box.y + foot.box.height, `"${wordsOf(words)}" stands in the menu's foot`);
      assert.ok(words.z > PAGE_Z, `"${wordsOf(words)}" is drawn over the page`);
      const hit = page.find((each) => each.node.role !== 'window' && meets(each.box, words.box));
      assert.equal(hit, undefined, `"${wordsOf(words)}" meets ${hit && (hit.node.id ?? wordsOf(hit))}`);
    }
  });
}

test('in the foot game the tracker stays under the open menu, as it was', () => {
  const laid = laidWithMenu(1280, 720, false);
  const task = laid.find((each) => wordsOf(each) === LESSON.task);
  assert.ok(task && task.z < PAGE_Z);
});

test('the frame the menu closes, the step leaves its foot and the tracker stands where it does', () => {
  const laid = laidWithMenu(1280, 720, true, LESSON, true);
  assert.equal(
    laid.find((each) => each.node.id === 'gear-screen'),
    undefined,
    'the menu closed',
  );
  const task = laid.find((each) => wordsOf(each) === LESSON.task);
  assert.ok(task && task.z < PAGE_Z && task.box.y < 400, `the tracker at the right (${JSON.stringify(task?.box)})`);
});

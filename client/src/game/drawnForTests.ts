// A menu page drawn frame by frame for a test, through the real interface and its holds: every ask it made, each item
// it opened, its words as shown, and presses clicked and held by their ids.
import type { GearAsk, GearItem, GearState } from '../network/gearMessages.ts';
import type { Node } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { fakeInterface } from '../ui/uiForTests.ts';
import { Holds } from './gearHold.ts';
import { sizesOf } from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';

/** A page drawn frame by frame with the clock `now` for its holds; every ask it made, and each item it opened. */
export function drawn(state: GearState, page: (context: MenuContext) => Node) {
  let now = 0;
  const { ui, step } = fakeInterface();
  const holds = new Holds(() => now);
  const asked: GearAsk[] = [];
  const opened: GearItem[] = [];
  const context: MenuContext = {
    ui,
    gear: state,
    ask: (ask) => asked.push(ask),
    picture: () => null,
    figure: null,
    room: { width: 1180, height: 520 },
    sizes: sizesOf(1280, 720, 1),
    holds,
    card: () => undefined,
    inspect: (item) => opened.push(item),
    details: () => undefined,
    atVault: false,
    forge: null,
    dress: null,
  };
  let words: string[] = [];
  const frame = (events: UiEvent[] = [], spent = 16) => {
    now += spent;
    step(() => {
      holds.frame(ui);
      const root = page(context);
      holds.end();
      words = wordsOf(root);
      return { width: 'grow', height: 'grow', direction: 'column', children: [root] };
    }, events);
  };
  const middle = (id: string) => {
    const box = ui.boxOf(id);
    if (!box) throw new Error(`${id} is not laid`);
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
  /** Held down for `held` milliseconds, then let go. */
  const hold = (id: string, held: number) => {
    const point = middle(id);
    frame([
      { kind: 'pointer', ...point },
      { kind: 'down', ...point, button: 0 },
    ]);
    for (let spent = 0; spent < held; spent += 100) frame([], 100);
    frame([{ kind: 'up', ...point, button: 0 }]);
  };
  frame();
  frame();
  return { ui, asked, opened, frame, click, hold, shows: () => words.join(' | ') };
}

export function wordsOf(node: Node | null | false | undefined | ''): string[] {
  if (!node) return [];
  const own = node.text && typeof node.text.words === 'string' ? [node.text.words] : [];
  return [...own, ...(node.children ?? []).flatMap((child) => wordsOf(child))];
}

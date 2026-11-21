// The Test Ground's panels for the page's tests: an interface with a renderer that draws nothing, and a driver that
// builds a panel's nodes each frame and presses, types into and drags them by their ids.
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 1280, height: 4000, scale: 1 };

const renderer = () =>
  ({
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  }) as unknown as UiRenderer;

/** A panel's nodes in an interface tall enough to show all of them, driven by its controls' ids. */
export class Driven {
  readonly ui = new Interface(renderer());
  readonly said: string[] = [];
  private readonly build: (ui: Interface) => readonly Child[];

  constructor(build: (ui: Interface) => readonly Child[]) {
    this.build = build;
    this.ui.speak = (words) => this.said.push(words);
    this.frame([]);
  }

  /** A frame hearing `events`, `seconds` after the last. */
  frame(events: readonly UiEvent[], seconds = 1 / 60): void {
    this.ui.frame(VIEW, events, seconds);
    const root: Node = { width: 400, direction: 'column', gap: 4, children: this.build(this.ui) };
    this.ui.draw(root);
  }

  private middle(id: string): { x: number; y: number } {
    const box = this.ui.boxOf(id);
    if (!box) throw new Error(`nothing laid as ${id}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Presses `id` and lets go, then draws a frame after. */
  press(id: string): void {
    const { x, y } = this.middle(id);
    this.frame([
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
    this.frame([]);
  }

  /** Holds `id` down for `seconds`, a frame each sixtieth, then lets go. */
  hold(id: string, seconds: number): void {
    const { x, y } = this.middle(id);
    this.frame([{ kind: 'down', x, y, button: 0 }]);
    for (let held = 0; held < seconds; held += 1 / 60) this.frame([], 1 / 60);
    this.frame([{ kind: 'up', x, y, button: 0 }]);
  }

  /** Picks `value` from the drop-down list `id`. */
  pick(id: string, value: string): void {
    this.press(id);
    this.press(`${id}:${value}`);
  }

  /** Types `words` into field `id`, in place of what it held. */
  type(id: string, words: string): void {
    this.ui.setFieldText(id, words);
    this.frame([]);
  }

  /** Gives `id` the focus, then presses `keys` on it. */
  keys(id: string, ...keys: string[]): void {
    this.ui.focusOn(id);
    this.frame(keys.map((key) => ({ kind: 'key', key })));
    this.frame([]);
  }

  has(id: string): boolean {
    return this.ui.boxOf(id) !== null;
  }
}

// shortcut: the menu's pages still made of elements (Ship, Social, Settings, the pages to come, the Art's screen,
// Appearance and the keepers' screens) stand in one element laid over the drawn body's box each frame; it goes once
// those pages are drawn and take `MenuContext` (menuPage.ts).

import type { Box } from '../ui/quads.ts';

export class Island {
  /** The element the page stands in, over the menu's body. */
  readonly node: HTMLElement;
  private shown: HTMLElement | null = null;
  private placed = '';

  constructor(root: HTMLElement) {
    this.node = document.createElement('div');
    // Its pages read the menu's tones and sizes, which the sheet sets on the menu.
    this.node.className = 'gear-screen gear-island';
    this.node.setAttribute('role', 'tabpanel');
    this.node.id = 'gear-body';
    this.node.hidden = true;
    root.append(this.node);
  }

  /** The page shown, if any. */
  get page(): HTMLElement | null {
    return this.shown;
  }

  /** Shows `page` (nothing for none), laid over `box`, CSS pixels on `canvas`. */
  show(page: HTMLElement | null, box: Box | null, canvas: HTMLElement | null): void {
    if (page !== this.shown) {
      this.node.replaceChildren(...(page ? [page] : []));
      this.shown = page;
      this.placed = '';
    }
    this.node.hidden = !page || !box;
    if (!page || !box) return;
    // Measured only as the body moves, so the page is not laid out again each frame.
    const where = `${box.x} ${box.y} ${box.width} ${box.height}`;
    if (where === this.placed) return;
    this.placed = where;
    const parent = this.node.parentElement?.getBoundingClientRect();
    const own = canvas?.getBoundingClientRect();
    const [left, top] = [(own?.left ?? 0) - (parent?.left ?? 0) + box.x, (own?.top ?? 0) - (parent?.top ?? 0) + box.y];
    const style = this.node.style;
    const place = (name: 'left' | 'top' | 'width' | 'height', value: number) => {
      if (style[name] !== `${value}px`) style[name] = `${value}px`;
    };
    place('left', left);
    place('top', top);
    place('width', box.width);
    place('height', box.height);
  }

  /** Whether the focus is on one of its controls, so the keys are the page's, not the drawn menu's. */
  get focused(): boolean {
    return !this.node.hidden && this.node.contains(document.activeElement);
  }
}

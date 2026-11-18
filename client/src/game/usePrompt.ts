// What E does where the player stands, shown as Destiny shows it: a keycap and the deed, low in the middle of the view,
// above the player's bars; gone when nothing is within reach.

import './usePrompt.css';
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';

export class UsePrompt {
  private readonly shown: HTMLElement;
  private readonly words: HTMLElement;
  private said: string | null = null;

  constructor(root: HTMLElement) {
    this.shown = make('div', '', `use-prompt ${ROLES.chip}`);
    this.shown.setAttribute('role', 'status');
    this.words = make('span', '', 'use-prompt-words');
    this.shown.append(make('kbd', 'E', 'use-prompt-key'), this.words);
    this.shown.hidden = true;
    root.append(this.shown);
  }

  /** Shows the deed within reach, or nothing; the page is touched only when it changes. */
  show(deed: string | null): void {
    if (deed === this.said) return;
    this.said = deed;
    this.shown.hidden = deed === null;
    this.words.textContent = deed ?? '';
  }

  remove(): void {
    this.shown.remove();
  }
}

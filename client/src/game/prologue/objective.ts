// The story's prompts to act: a word that says what to do now ("Engage") and one plain line under it, in the
// Enhanced Plus kit at the top of the view, fading after a while or when the story clears it.
import { make } from '../../editor/dom.ts';
import { ROLES, wearKit } from '../../plus/kit.ts';

const STYLE_ID = 'story-objective';
const CSS = `
.story-objective { position: absolute; left: 50%; top: 15%; translate: -50% 0; min-width: 330px; max-width: 70vw;
  padding: 11px 33px 14px; border: 2px solid transparent; text-align: center; opacity: 0; transition: opacity 0.6s;
  pointer-events: none; z-index: 25; }
.story-objective.shown { opacity: 1; }
.story-objective-word { font-size: 33px; letter-spacing: round(up, calc(4em / 22), 1px); text-transform: uppercase;
  color: #e9d8a6; text-shadow: 0 2px 0 #000; }
.story-objective-line { margin-top: 6px; font-size: 22px; color: var(--ink, #efe6cf); }
`;

export class Objective {
  private readonly card: HTMLElement;
  private readonly word: HTMLElement;
  private readonly line: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    const page = root.ownerDocument;
    wearKit(page);
    if (!page.getElementById(STYLE_ID)) {
      const sheet = page.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = CSS;
      page.head.append(sheet);
    }
    this.card = make('div', '', `story-objective ${ROLES.window}`);
    this.word = make('div', '', 'story-objective-word');
    this.line = make('div', '', 'story-objective-line');
    this.card.append(this.word, this.line);
    this.card.setAttribute('role', 'status');
    root.append(this.card);
  }

  /** Shows the prompt, for `seconds` or until cleared. */
  show(word: string, line: string, seconds = 6): void {
    this.word.textContent = word;
    this.line.textContent = line;
    this.card.classList.add('shown');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.clear(), seconds * 1000);
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.card.classList.remove('shown');
  }

  remove(): void {
    this.clear();
    this.card.remove();
  }
}

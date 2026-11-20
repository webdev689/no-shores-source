// The card E opens at a dungeon's entrance, in the menu's window: what the run it opens is, and the way in.
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { EntranceCard } from './activityWords.ts';
import { pressOf } from './gearDom.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import { play } from './uiSounds.ts';

export interface CardPresses {
  enter(): void;
  close(): void;
}

/** The card E opens at a dungeon's entrance, in the kit's window: the dungeon's name under its header; its tier and
 *  level, its rules, its modifiers and what it pays; why it is shut, if it is; and Enter (E) and Close (Esc) on its
 *  footer. While it stands, the pointer is free and the game's keys rest, as under the menu. */
export class EntranceCardView {
  private readonly scrim: HTMLElement;
  private readonly window: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly enterPress: HTMLButtonElement;
  private shown = false;

  constructor(root: HTMLElement, presses: CardPresses) {
    this.scrim = make('div', '', 'gear-scrim');
    this.window = make('div', '', `gear-screen entrance-card ${ROLES.window}`);
    this.window.setAttribute('role', 'dialog');
    this.window.setAttribute('aria-modal', 'true');
    this.window.setAttribute('aria-labelledby', 'entrance-card-name');
    const header = make('div', '', `gear-head ${ROLES.header}`);
    this.title = make('h2', '', 'gear-station-name');
    this.title.id = 'entrance-card-name';
    this.title.tabIndex = -1;
    header.append(this.title);
    this.body = make('div', '', 'gear-body entrance-card-body');
    this.enterPress = pressOf('Enter', () => presses.enter(), 'primary', 'E');
    this.enterPress.dataset['key'] = 'card-enter';
    const closePress = pressOf('Close', () => presses.close(), 'button', 'Esc');
    closePress.dataset['key'] = 'card-close';
    const actions = make('div', '', 'gear-actions');
    actions.append(this.enterPress, closePress);
    const footer = make('div', '', `gear-foot ${ROLES.footer}`);
    footer.append(make('div', '', 'gear-said'), actions);
    this.window.append(header, this.body, footer);
    this.scrim.hidden = this.window.hidden = true;
    root.append(this.scrim, this.window);
    // Heard before the game and the menu, so while the card stands no key of theirs acts behind it.
    addEventListener(
      'keydown',
      (event) => {
        if (!this.shown) return;
        event.stopImmediatePropagation();
        const key = event.key.toLowerCase();
        if (event.repeat || (key !== 'e' && key !== 'escape')) return;
        event.preventDefault();
        if (key === 'escape') presses.close();
        else if (!this.enterPress.disabled) presses.enter();
      },
      { capture: true },
    );
  }

  /** Shows the card, or builds it again where it stands. */
  show(card: EntranceCard): void {
    this.title.textContent = card.name;
    const parts = [make('p', card.tier, 'entrance-card-tier')];
    for (const rule of card.rules) parts.push(make('p', rule, 'entrance-card-rule'));
    for (const modifier of card.modifiers) {
      const line = make('p', '', 'gear-week-modifier');
      line.append(make('b', modifier.name), make('span', modifier.words, 'gear-hint'));
      parts.push(line);
    }
    parts.push(make('p', card.pays, 'gear-hint'));
    if (card.shut !== null) parts.push(make('p', card.shut, 'entrance-card-shut'));
    this.body.replaceChildren(...parts);
    this.enterPress.disabled = card.shut !== null;
    setGearScreenOpen(true);
    if (this.shown) return;
    this.shown = true;
    this.scrim.hidden = this.window.hidden = false;
    document.exitPointerLock();
    play('open');
    (this.enterPress.disabled ? this.title : this.enterPress).focus();
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    if (document.activeElement instanceof HTMLElement && this.window.contains(document.activeElement))
      document.activeElement.blur();
    this.scrim.hidden = this.window.hidden = true;
    setGearScreenOpen(false);
    play('close');
  }

  get open(): boolean {
    return this.shown;
  }
}

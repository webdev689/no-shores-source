// The card E opens at a dungeon's entrance, drawn by the game in a window of the menu's kit: what the run it opens is,
// and the way in.
import { motionReduced } from '../plus/kit.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { EntranceCard } from './activityWords.ts';
import { INK, pressNode, words } from './gearNodes.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import { play } from './uiSounds.ts';

export interface CardPresses {
  enter(): void;
  close(): void;
  find(): void;
  stop(): void;
}

/** What the card says of Find a Company: whether it is offered, the wait while one is under way, and the words of a
 *  search that ended unasked. */
export interface CardSearch {
  readonly canFind: boolean;
  readonly finding: string | null;
  readonly said: string | null;
}

const NO_SEARCH: CardSearch = { canFind: false, finding: null, said: null };
/** The presses' ids, which the keys and the pointer press alike. */
const ENTER = 'card-enter';
const FIND = 'card-find';
const STOP = 'card-stop';
const CLOSE = 'card-close';
/** How wide the card stands at most. */
const WIDE = 520;

/** The card E opens at a dungeon's entrance, in the kit's window over the dimmed world: the dungeon's name at its head;
 *  its tier and level, its rules, its modifiers and what it pays; why it is shut, if it is; the wait while Find a
 *  Company finds; and Enter (E), Find a Company or Stop finding (F) and Close (Esc) on its footer. While it stands the
 *  pointer is free and the game's keys rest, as under the menu; its `layer` draws it. */
export class EntranceCardView {
  private card: EntranceCard | null = null;
  private search: CardSearch = NO_SEARCH;
  /** The press to give the focus to on the next frame: Enter as it opens (Close on a shut card), the search's press
   *  as one takes the other's place. */
  private focusNext: string | null = null;

  private readonly presses: CardPresses;

  constructor(presses: CardPresses) {
    this.presses = presses;
    // Heard before the game and the menu, so while the card stands no key of theirs acts behind it.
    addEventListener(
      'keydown',
      (event) => {
        if (!this.card) return;
        event.stopImmediatePropagation();
        const key = event.key.toLowerCase();
        if (event.repeat || (key !== 'e' && key !== 'f' && key !== 'escape')) return;
        event.preventDefault();
        if (key === 'escape') presses.close();
        else if (key === 'f' && this.search.finding !== null) presses.stop();
        else if (key === 'f' && this.search.canFind) presses.find();
        else if (key === 'e' && this.card.shut === null) presses.enter();
      },
      { capture: true },
    );
  }

  /** Shows the card, or builds it again where it stands, with Find a Company as `search` says. */
  show(card: EntranceCard, search: CardSearch = NO_SEARCH): void {
    const opening = this.card === null;
    const searching = (shown: CardSearch) => (shown.finding !== null ? STOP : shown.canFind ? FIND : null);
    if (!opening && searching(search) !== searching(this.search)) this.focusNext = searching(search) ?? CLOSE;
    [this.card, this.search] = [card, search];
    setGearScreenOpen(true);
    if (!opening) return;
    document.exitPointerLock();
    play('open');
    this.focusNext = card.shut === null ? ENTER : CLOSE;
  }

  hide(): void {
    if (!this.card) return;
    this.card = null;
    setGearScreenOpen(false);
    play('close');
  }

  get open(): boolean {
    return this.card !== null;
  }

  /** The card this frame over the dimmed world, its presses heard; nothing while it is shut. */
  readonly layer: Layer = (ui: Interface) => {
    if (!this.card) return null;
    if (ui.clicked(CLOSE)) this.presses.close();
    else if (ui.clicked(ENTER) && this.card.shut === null) this.presses.enter();
    else if (ui.clicked(FIND)) this.presses.find();
    else if (ui.clicked(STOP)) this.presses.stop();
    const { card, search } = this;
    if (!card) return null;
    if (this.focusNext && ui.boxOf(this.focusNext)) [this.focusNext] = [null, ui.focusOn(this.focusNext)];
    const view = ui.size;
    const line = (said: string, colour: string = INK.word): Node => ({ width: 'grow', text: { words: said, colour } });
    const finding = search.finding !== null;
    const body: Child[] = [
      line(card.tier, INK.brassLit),
      ...card.rules.map((rule) => line(rule)),
      ...card.modifiers.map((modifier): Node => ({
        width: 'grow',
        gap: 8,
        wrap: true,
        children: [
          words(modifier.name, 1, INK.word),
          { width: 'grow', text: { words: modifier.words, colour: INK.faint } },
        ],
      })),
      line(card.pays, INK.faint),
      card.shut !== null && line(card.shut, INK.loss),
      finding && line(search.finding ?? '', INK.gain),
      finding && line('A run starts with four, or with fewer after a minute.', INK.faint),
      !finding && search.said !== null && line(search.said, INK.loss),
    ];
    return {
      width: 'grow',
      height: 'grow',
      children: [
        {
          id: 'card-scrim',
          width: view.width,
          height: view.height,
          solid: true,
          fill: 'rgba(5,7,10,0.6)',
          float: { to: 'screen', z: 19 },
        },
        {
          id: 'entrance-card',
          role: 'window',
          label: card.name,
          solid: true,
          modal: true,
          direction: 'column',
          width: Math.min(WIDE, view.width - 32),
          padding: 2,
          opacity: motionReduced() ? 1 : Math.min(1, 0.25 + ui.age('entrance-card') * 4),
          float: { to: 'screen', anchor: [0.5, 0.5], at: [0.5, 0.5], z: 20 },
          children: [
            {
              width: 'grow',
              height: 48,
              alignX: 'center',
              alignY: 'center',
              children: [words(card.name.toUpperCase(), 2, INK.brassLit, { tracking: 3 })],
            },
            { width: 'grow', direction: 'column', gap: 10, padding: [10, 20, 14, 20], children: body },
            { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
            {
              width: 'grow',
              padding: [8, 16],
              gap: 8,
              alignX: 'end',
              wrap: true,
              children: [
                pressNode(ENTER, 'Enter', 'primary', 'E', 1, { disabled: card.shut !== null }),
                finding
                  ? pressNode(STOP, 'Stop finding', 'button', 'F')
                  : search.canFind && pressNode(FIND, 'Find a Company', 'button', 'F'),
                pressNode(CLOSE, 'Close', 'button', 'Esc'),
              ],
            },
          ],
        },
      ],
    };
  };
}

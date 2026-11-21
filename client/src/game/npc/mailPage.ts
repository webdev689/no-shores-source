// The Postmaster's letters, where a keeper's wares stand (npcScreen.ts): every letter the game wrote, oldest first,
// each a well holding the tile of what it holds (an item's picture, a module's or a Vestige's glyph, framed in its
// rarity, its card on hover or focus), its name and words (`letterWords`), and its Take press; Take all over them. A
// click or E takes one. Nothing here judges a rule: the room refuses what there is no room for, and the menu's footer says why.
import { make } from '../../editor/dom.ts';
import { ASKS, type GearAsk, type GearState, type GearVestige } from '../../network/gearMessages.ts';
import type { GearLetter } from '../../network/mailMessages.ts';
import { RARITIES, SLOTS } from '../../player/gear.ts';
import { ROLES } from '../../plus/kit.ts';
import type { PageContext } from '../characterPage.ts';
import { cardOf } from '../gearCards.ts';
import {
  type Hint,
  cardNode,
  glyphImage,
  hintLine,
  itemIcon,
  itemMarks,
  pressOf,
  rarityOf,
  tileLabel,
} from '../gearDom.ts';
import { gearName, moduleGlyph } from '../shipGear.ts';

/** How many letters a mailbox keeps (the gear crate's `MAIL_MOST`). */
export const MAIL_MOST = 50;
/** A tile's picture box, in pixels. */
const TILE_PX = 48;
const TAKE_HINTS: readonly Hint[] = [['Click / E', 'Take']];
/** Each source's words, by its number (the gear crate's `mail::Source`): where what a letter holds came from. */
const FROM_WORDS: readonly string[] = [
  'You left this lying where it fell. It was picked up before it was lost.',
  'You left before you picked this up, so it was sent on.',
  'Your reward for a first clear. Your ten Vestiges and the vault were full, so it came here.',
  'Found in flotsam you gathered. You carried ten Vestiges, so it came here.',
  'Salvage you took. Its slot carried nine, so it came here.',
];
/** What a letter that came to a full mailbox adds. */
const CROWDED = 'Your mailbox was full, so the oldest letter holding the least was let go.';

/** A letter's words: where what it holds came from (a source a later room adds, in general words), and whether a
 *  letter went to make room for it. */
export function letterWords(letter: GearLetter): string {
  const words = FROM_WORDS[letter.from] ?? 'This was sent on to you.';
  return letter.crowded ? `${words} ${CROWDED}` : words;
}

/** A letter as its row shows it: what it holds, named ("Rare Vestige", an item's own name, empty for nothing), its
 *  rarity, its words, and what taking it asks. */
export interface LetterRow {
  readonly letter: GearLetter;
  readonly holds: string;
  readonly words: string;
  readonly rarity: number | null;
  readonly take: GearAsk;
}

/** The letters waiting, oldest first, and what Take all asks while any waits. */
export function letterRows(gear: GearState): { readonly rows: readonly LetterRow[]; readonly takeAll: GearAsk | null } {
  const rows = (gear.mail ?? []).map((letter) => {
    const { item, vestige } = letter;
    const holds = item ? gearName(item) : vestige ? `${RARITIES[vestige.rarity]?.name ?? ''} Vestige` : '';
    return {
      letter,
      holds,
      words: letterWords(letter),
      rarity: item?.rarity ?? vestige?.rarity ?? null,
      take: { kind: ASKS.takeLetter, item: letter.id },
    };
  });
  return { rows, takeAll: rows.length > 0 ? { kind: ASKS.takeAllLetters } : null };
}

/** A Vestige's card: its name, and the slot and level of what it holds. */
function vestigeCard(holds: string, vestige: GearVestige): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(card, vestige.rarity);
  const head = make('div', '', 'gear-card-head');
  head.append(make('h3', holds));
  const body = make('div', '', 'gear-card-body');
  const words = `For the ${SLOTS[vestige.slot] ?? ''}, level ${vestige.level}. Open it at the Mage.`;
  body.append(make('p', words, 'gear-card-words'));
  card.append(head, body, hintLine(TAKE_HINTS, 'gear-card-hint'));
  return card;
}

/** The tile of what a letter holds, its card on hover or focus; a click takes the letter. */
function heldTile(context: PageContext, row: LetterRow): HTMLElement {
  const { item, vestige } = row.letter;
  const tile = make('button', '', `gear-cell ${ROLES.tile}`);
  rarityOf(tile, row.rarity);
  // A module is no figure's to wear: its glyph stands for it, as on the ship's tab.
  const module = item ? moduleGlyph(item.kind) : null;
  tile.append(
    item && !module
      ? itemIcon(context.picture(item), row.holds, TILE_PX)
      : glyphImage(module ?? 'vestige', row.rarity ?? 0),
  );
  if (item) itemMarks(tile, item);
  const pips = row.rarity === null ? '' : (RARITIES[row.rarity]?.pips ?? '');
  if (pips) tile.append(make('span', pips, 'gear-pips'));
  tile.dataset['key'] = `letter-${row.letter.id}`;
  tile.setAttribute('aria-label', tileLabel(row.holds, row.rarity, 'in the mail'));
  context.tip.over(tile, () => {
    if (item) return cardNode(cardOf(item), module ? null : context.picture(item), TAKE_HINTS);
    return vestige ? vestigeCard(row.holds, vestige) : make('div');
  });
  tile.addEventListener(
    'click',
    once(() => {
      context.tip.hide();
      context.ask(row.take);
    }),
  );
  return tile;
}

/** A letter's take asked once: the page is drawn anew as the gear changes, so a second click before then would ask
 *  for a letter already taken, and be refused. */
function once(run: () => void): () => void {
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    run();
  };
}

/** The Postmaster's letters: their count of the most kept, Take all, and each letter's row. */
export function mailPage(context: PageContext): HTMLElement {
  const { rows, takeAll } = letterRows(context.gear);
  const page = make('section', '', 'npc-row npc-mail');
  const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
  heading.append(make('span', 'Letters'), make('span', `${rows.length}/${MAIL_MOST}`));
  heading.setAttribute('aria-label', `Letters, ${rows.length} of ${MAIL_MOST} kept`);
  page.append(heading);
  if (takeAll) {
    const all = pressOf('Take all', () => context.ask(takeAll), 'primary');
    all.classList.add('npc-take-all');
    all.dataset['key'] = 'npc-take-all';
    page.append(all);
  } else page.append(make('p', 'No letters wait for you.', 'gear-hint npc-empty'));
  const letters = make('div', '', 'npc-letters');
  for (const [place, row] of rows.entries()) {
    const line = make('div', '', `npc-letter ${ROLES.well}`);
    if (row.holds) line.append(heldTile(context, row));
    const words = make('div', '', 'npc-letter-words');
    if (row.holds) {
      const name = make('b', row.holds);
      name.style.color = row.rarity === null ? '' : (RARITIES[row.rarity]?.colour ?? '');
      words.append(name);
    }
    words.append(make('p', row.words, 'gear-hint'));
    const take = pressOf(
      'Take',
      once(() => context.ask(row.take)),
      'button',
    );
    take.classList.add('npc-take');
    take.dataset['key'] = `npc-take-${row.letter.id}`;
    take.setAttribute('aria-label', `Take ${row.holds || 'the letter'}, ${place + 1} of ${rows.length}`);
    line.append(words, take);
    letters.append(line);
  }
  page.append(letters);
  // E takes the letter whose tile or Take press holds the focus, as at the bounty board.
  page.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'e' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const line = event.target instanceof Element ? event.target.closest('.npc-letter') : null;
    const press = line?.querySelector<HTMLButtonElement>('.npc-take');
    if (!press) return;
    event.preventDefault();
    press.click();
  });
  return page;
}

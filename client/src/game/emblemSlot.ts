import { make } from '../editor/dom.ts';
import { ASKS } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { EMBLEMS, type Emblem, emblemImage, emblemOf } from './emblemArt.ts';
import { cardNode, hintLine, rarityOf } from './gearDom.ts';

/** The Emblem slot's number among the character page's slots, past the seven of gear. */
export const EMBLEM_SLOT = 7;
/** An emblem's sign in the slot and in the flyout, at whole multiples of its 24 cells. */
const SLOT_SIGN_PX = 72;
const CELL_SIGN_PX = 48;

/** An emblem's rarity, by the gear's numbers. */
const rarityNumber = (emblem: Emblem) =>
  Math.max(
    0,
    RARITIES.findIndex((each) => each.name.toLowerCase() === emblem.rarity),
  );

/** An emblem's sign as an image of whole pixels. */
function signImage(emblem: Emblem, size: number): HTMLImageElement {
  const image = make('img', '', 'gear-emblem-sign');
  Object.assign(image, { src: emblemImage(emblem, 'sign'), width: size, height: size, alt: '' });
  return image;
}

/** An emblem's card: its name and rarity, its nameplate, and how it is had. */
export function emblemCard(emblem: Emblem, kept: boolean, worn: boolean): HTMLElement {
  const card = cardNode(
    {
      name: emblem.name,
      rarity: rarityNumber(emblem),
      kind: 'Emblem',
      big: null,
      rows: [],
      element: 0,
      traits: [],
      words: '',
      compare: null,
    },
    null,
    [],
  );
  const plate = make('img', '', 'gear-emblem-plate');
  Object.assign(plate, { src: emblemImage(emblem, 'plate'), width: 240, height: 48, alt: '' });
  card.querySelector('.gear-card-body')?.append(plate, make('p', emblem.words, 'gear-card-words'));
  if (worn) card.append(make('p', 'Worn.', 'gear-card-hint'));
  else if (kept) card.append(hintLine([['Click', 'Wear']], 'gear-card-hint'));
  return card;
}

/**
 * The Emblem slot, after Destiny 1's General items: the emblem worn, and a flyout of every emblem, those kept to be
 * worn with a click and the rest dim, each saying how it is had.
 */
export function emblemSlot(context: PageContext, open: boolean, choose: () => void): HTMLElement {
  const { gear, tip } = context;
  const worn = emblemOf(gear.emblem ?? 0);
  const kept = new Set(gear.emblems ?? []);
  const holder = make('div', '', 'gear-slot-holder');
  const tile = make('button', '', `gear-slot gear-emblem ${ROLES.tile}`);
  rarityOf(tile, rarityNumber(worn));
  tile.append(signImage(worn, SLOT_SIGN_PX));
  tile.dataset['key'] = 'slot-emblem';
  tile.classList.toggle('gear-open', open);
  tile.setAttribute('aria-expanded', String(open));
  tile.setAttribute('aria-label', `Emblem: ${worn.name}`);
  tile.addEventListener('click', choose);
  tip.over(tile, () => emblemCard(worn, true, true));
  const label = make('div', '', 'gear-slot-words');
  label.append(make('span', 'Emblem', 'gear-slot-name'), make('span', worn.name, 'gear-slot-item'));
  holder.append(tile, label);
  if (open) {
    const flyout = make('div', '', `gear-flyout ${ROLES.panel}`);
    flyout.append(make('div', `Emblems · ${kept.size} of ${EMBLEMS.length} kept`, 'gear-flyout-head'));
    const grid = make('div', '', 'gear-flyout-grid gear-emblem-grid');
    EMBLEMS.forEach((emblem, number) => {
      const has = kept.has(number);
      const cell = make('button', '', `gear-cell ${ROLES.tile}${has ? '' : ' gear-vacant'}`);
      rarityOf(cell, has ? rarityNumber(emblem) : null);
      cell.append(signImage(emblem, CELL_SIGN_PX));
      cell.dataset['key'] = `emblem-${emblem.id}`;
      cell.setAttribute('aria-label', `${emblem.name}${has ? '' : ', not kept'}`);
      if (has)
        cell.addEventListener('click', () => {
          tip.hide();
          context.ask({ kind: ASKS.wearEmblem, item: number });
        });
      else cell.setAttribute('aria-disabled', 'true');
      cell.classList.toggle('gear-open', emblem.id === worn.id);
      tip.over(cell, () => emblemCard(emblem, has, emblem.id === worn.id), flyout);
      grid.append(cell);
    });
    flyout.append(grid);
    holder.append(flyout);
  }
  return holder;
}

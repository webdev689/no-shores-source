import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { svgUrl, wardrobeSvg } from './appearance/appearanceMarks.ts';
import { rarityNumber } from './appearance/appearanceModel.ts';
import { type Emblem, emblemImage, emblemOf } from './emblemArt.ts';
import { cardNode, hintLine, rarityOf } from './gearDom.ts';

/** The wardrobe mark at three pixels a cell, and the emblem worn beside it at one. */
const MARK_PX = 48;
const SIGN_PX = 24;
/** A card with nothing on it yet. */
const emptyCard = {
  name: '',
  rarity: 0,
  kind: 'Emblem, Dye, Coat, Barding',
  big: null,
  rows: [],
  element: 0,
  traits: [],
  words: '',
  compare: null,
};

/** The key of the Appearance button, which takes the focus back once the screen closes. */
export const APPEARANCE_KEY = 'appearance';

/** An emblem's sign as an image of whole pixels. */
function signImage(emblem: Emblem, size: number): HTMLImageElement {
  const image = make('img', '', 'gear-emblem-sign');
  Object.assign(image, { src: emblemImage(emblem, 'sign'), width: size, height: size, alt: '' });
  return image;
}

/** An emblem's card: its name and rarity, its nameplate, and how it is had. */
export function emblemCard(emblem: Emblem, kept: boolean, worn: boolean): HTMLElement {
  const card = cardNode(
    { ...emptyCard, name: emblem.name, rarity: rarityNumber(emblem.rarity), kind: 'Emblem' },
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
 * The Appearance button, in the place the Emblem slot had: the wardrobe mark, with the emblem worn small in its corner.
 * Its card says what it opens; pressed, it opens the Appearance screen through the page's `appearance`, the focus on
 * the emblem worn.
 */
export function appearanceButton(context: PageContext): HTMLElement {
  const { gear, tip } = context;
  const worn = emblemOf(gear.emblem ?? 0);
  const holder = make('div', '', 'gear-slot-holder');
  const tile = make('button', '', `gear-slot appearance-button ${ROLES.tile}`);
  tile.type = 'button';
  rarityOf(tile, rarityNumber(worn.rarity));
  const mark = make('img', '', 'appearance-mark');
  Object.assign(mark, { src: svgUrl(wardrobeSvg()), width: MARK_PX, height: MARK_PX, alt: '' });
  const sign = signImage(worn, SIGN_PX);
  sign.classList.add('appearance-sign');
  tile.append(mark, sign);
  tile.dataset['key'] = APPEARANCE_KEY;
  tile.setAttribute('aria-label', `Appearance: ${worn.name}`);
  tile.addEventListener('click', () => {
    tip.hide();
    context.appearance?.();
    const found = () => document.querySelector<HTMLElement>(`[data-key="emblem-${CSS.escape(worn.id)}"]`);
    requestAnimationFrame(() => found()?.focus());
  });
  if (!context.appearance) tile.setAttribute('aria-disabled', 'true');
  tip.over(tile, () => {
    const card = cardNode(
      {
        ...emptyCard,
        name: 'Appearance',
        words: "Your emblem, the dye on your armour, and your horse's coat and barding.",
      },
      null,
      [['Click', 'Open']],
    );
    card.querySelector('.gear-card-body')?.append(make('p', `Emblem: ${worn.name}`, 'appearance-how'));
    return card;
  });
  const label = make('div', '', 'gear-slot-words');
  label.append(make('span', 'Appearance', 'gear-slot-name'), make('span', worn.name, 'gear-slot-item'));
  holder.append(tile, label);
  return holder;
}

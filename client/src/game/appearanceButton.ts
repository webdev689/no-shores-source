// The Appearance screen's shared parts: an emblem's card, and the key the Appearance button on the Character page
// (characterPage.ts) is found by, which takes the focus back once the screen closes.
import { make } from '../editor/dom.ts';
import { rarityNumber } from './appearance/appearanceModel.ts';
import { type Emblem, emblemImage } from './emblemArt.ts';
import { cardNode, hintLine } from './gearDom.ts';

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

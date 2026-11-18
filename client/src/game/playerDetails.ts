import { make } from '../editor/dom.ts';
import type { Details } from '../network/accounts.ts';
import { RARITIES, SLOTS, itemName } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import { emblemImage, emblemOf, plateEnd } from './emblemArt.ts';
import { elementGlyph, itemIcon, pressOf, rarityOf, tileLabel } from './gearDom.ts';
import { placeWords } from './rosterRows.ts';

/** How large a worn piece's tile stands, in pixels. */
const TILE_PX = 64;

const capital = (words: string) => `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;

/**
 * Another player's details, as Destiny's Inspect shows them: their nameplate, their guild, where they are (to their
 * friends, party and guild alone), their power, and each piece they wear in its rarity, with its element and gilding.
 */
export function detailsPage(found: Details, back: () => void): HTMLElement {
  const page = make('div', '', `roster-details ${ROLES.panel}`);
  const emblem = emblemOf(found.shown?.emblem ?? found.emblem);
  const plate = make('div', '', 'roster-plate');
  plate.style.backgroundImage = `url(${emblemImage(emblem, 'band')})`;
  plate.style.backgroundColor = plateEnd(emblem);
  const words = make('div', '', 'roster-plate-words');
  const name = make('h3', found.name, 'roster-plate-name');
  if (found.tag) name.append(make('span', ` [${found.tag}]`, 'roster-tag'));
  const level = found.shown?.level ?? found.level;
  words.append(
    name,
    make('span', level === null ? emblem.name : `Level ${level} · ${emblem.name}`, 'roster-plate-meta'),
  );
  plate.append(words);
  const facts = make('dl', '', 'roster-facts');
  const fact = (term: string, value: string) => facts.append(make('dt', term), make('dd', value));
  fact('Where', found.place !== null ? placeWords(found.place) : found.playing ? 'Playing' : 'Away');
  if (found.guild) fact('Guild', `[${found.guild.tag}] ${found.guild.name} · ${found.guild.rank}`);
  if (found.guild?.motto) fact('Motto', found.guild.motto);
  if (found.shown) {
    fact('Attack', String(found.shown.attack));
    fact('Defense', String(found.shown.defense));
  }
  const worn = make('div', '', 'roster-worn');
  for (const piece of found.shown?.worn ?? []) {
    const item = { named: piece.named ?? null, kind: piece.kind, rarity: piece.rarity, name: piece.name };
    const pieceName = itemName(item);
    const tile = make('div', '', `gear-cell ${ROLES.tile}`);
    rarityOf(tile, piece.rarity);
    tile.append(itemIcon(null, pieceName, TILE_PX));
    const element = elementGlyph(piece.element);
    if (element) tile.append(element);
    tile.classList.toggle('gear-gilded', piece.gilded);
    tile.setAttribute('aria-label', tileLabel(pieceName, piece.rarity));
    const label = make('div', '', 'roster-worn-words');
    const power = piece.attack ? `${piece.attack} Attack` : `${piece.defense} Defense`;
    label.append(
      make('span', capital(SLOTS[piece.slot] ?? ''), 'gear-slot-name'),
      make('b', pieceName),
      make('span', `${RARITIES[piece.rarity]?.name ?? ''} · ${power}`, 'gear-hint'),
    );
    const holder = make('div', '', 'roster-worn-piece');
    holder.append(tile, label);
    worn.append(holder);
  }
  if (!found.shown) worn.append(make('p', 'They have not played online yet.', 'gear-hint'));
  const leave = pressOf('Back', back, 'button', 'Esc');
  leave.dataset['key'] = 'details-back';
  page.append(plate, facts, make('h3', 'Worn', 'gear-heading'), worn, leave);
  return page;
}

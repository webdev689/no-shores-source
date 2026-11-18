// The screens a social space's counters open, as Destiny's vendors and vault open in the Tower: a vendor's stall of
// the day's wares, each held to buy; the Tailor's emblems of the day, as Destiny's Outfitter sold them; and the vault,
// its weapons, armour and Vestiges beside what the player carries, each a click to move across.

import { make } from '../editor/dom.ts';
import { ASKS } from '../network/gearMessages.ts';
import { RARITIES, WORN } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { emblemImage, emblemOf } from './emblemArt.ts';
import { emblemCard } from './emblemSlot.ts';
import { type VaultShelf, cardOf, vaultOf } from './gearCards.ts';
import { cardNode, glyphImage, heldPress, itemIcon, itemMarks, rarityOf } from './gearDom.ts';
import { vendorsOf } from './gearScreen.ts';
import { cellTile } from './inventoryPage.ts';

/** A ware's picture box, in pixels. */
const WARE_PX = 64;

/** A vendor's stall: their wares of the day, each held to buy, as Destiny's vendors sell. */
export function vendorPage(context: PageContext, vendor: number): HTMLElement {
  const page = make('div', '', 'gear-vendor');
  const stall = vendorsOf(context.gear)[vendor];
  if (!stall) return page;
  const half = context.gear.wares.length / 2;
  const wares = make('div', '', 'gear-wares');
  stall.wares.forEach((ware, place) => {
    const nth = vendor * half + place;
    const item = context.gear.wares[nth];
    // One the player cannot pay for says so, and cannot be held.
    const block = heldPress('', () => context.ask(ware.press.ask));
    block.classList.add('gear-ware');
    block.dataset['key'] = `buy-${nth}`;
    if (!ware.affordable) block.setAttribute('aria-disabled', 'true');
    const cell = make('div', '', `gear-cell ${ROLES.tile}`);
    rarityOf(cell, item?.rarity ?? null);
    cell.append(item ? itemIcon(context.picture(item), ware.tile.name, WARE_PX) : glyphImage('empty'));
    if (item) itemMarks(cell, item);
    const words = make('div', '', 'gear-ware-words');
    const name = make('b', ware.tile.name);
    name.style.color = ware.tile.colour;
    words.append(name, make('span', `${ware.kind} · level ${ware.level}`, 'gear-hint'));
    if (ware.tile.power) words.append(make('span', ware.tile.power, 'gear-ware-power'));
    const price = make('span', '', `gear-price${ware.affordable ? '' : ' gear-short'}`);
    price.append(glyphImage('aurem'), make('b', ware.price.toLocaleString()));
    if (!ware.affordable) price.append(make('span', 'Not enough Aurem', 'gear-hint'));
    words.append(price);
    block.append(cell, words);
    // Said as it reads: the kind already names its rarity.
    const said = [
      ware.tile.name,
      ware.kind,
      `level ${ware.level}`,
      ware.tile.power,
      `${ware.price.toLocaleString()} Aurem`,
    ];
    said.push(ware.affordable ? 'hold to buy' : 'not enough Aurem');
    block.setAttribute('aria-label', said.filter(Boolean).join(', '));
    if (item) {
      const worn = context.gear.items.find((each) => each.at === WORN + item.bucket) ?? null;
      context.tip.over(block, () => cardNode(cardOf(item, worn), context.picture(item), [['Hold', 'Buy']]));
    }
    wares.append(block);
  });
  page.append(wares);
  return page;
}

/** The Tailor's stall: the emblems sold today, each held to buy at its price, from the level it is sold at. */
export function tailorPage(context: PageContext): HTMLElement {
  const page = make('div', '', 'gear-vendor gear-tailor');
  const { gear } = context;
  const kept = new Set(gear.emblems ?? []);
  const wares = make('div', '', 'gear-wares');
  for (const number of gear.emblemsSold ?? []) {
    const emblem = emblemOf(number);
    const { aurem = 0, level = 1 } = emblem.source;
    const has = kept.has(number);
    const short = gear.aurem < aurem;
    const low = gear.level < level;
    const block = heldPress('', () => context.ask({ kind: ASKS.buyEmblem, item: number }));
    block.classList.add('gear-ware');
    block.dataset['key'] = `emblem-${emblem.id}`;
    if (has || short || low) block.setAttribute('aria-disabled', 'true');
    const plate = make('img', '', 'gear-emblem-plate');
    Object.assign(plate, { src: emblemImage(emblem, 'plate'), width: 240, height: 48, alt: '' });
    const words = make('div', '', 'gear-ware-words');
    const name = make('b', emblem.name);
    name.style.color = RARITIES.find((each) => each.name.toLowerCase() === emblem.rarity)?.colour ?? '';
    words.append(name, plate);
    const price = make('span', '', `gear-price${short && !has ? ' gear-short' : ''}`);
    price.append(glyphImage('aurem'), make('b', aurem.toLocaleString()));
    if (has) price.replaceChildren(make('span', 'Kept', 'gear-hint'));
    else if (low) price.append(make('span', `From level ${level}`, 'gear-hint'));
    else if (short) price.append(make('span', 'Not enough Aurem', 'gear-hint'));
    words.append(price);
    block.append(words);
    block.setAttribute('aria-label', `${emblem.name}, emblem, ${has ? 'kept' : `${aurem.toLocaleString()} Aurem`}`);
    context.tip.over(block, () => emblemCard(emblem, has, false));
    wares.append(block);
  }
  if ((gear.emblemsSold ?? []).length === 0)
    wares.append(make('p', 'The Tailor sells only in a social space.', 'gear-hint gear-empty'));
  page.append(wares);
  return page;
}

/** One shelf: its name and how full it is, then its cells, or a word that it is empty. */
function shelfNode(context: PageContext, shelf: VaultShelf, kept: boolean): HTMLElement {
  const node = make('section', '', 'gear-vault-shelf');
  const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
  heading.append(make('span', shelf.name), make('span', kept ? `${shelf.held} / ${shelf.most}` : String(shelf.held)));
  const grid = make('div', '', 'gear-grid');
  grid.append(...shelf.cells.map((cell) => cellTile(context, cell)));
  // Its empty places stand as vacant tiles, as every other shelf's do.
  for (let place = shelf.cells.length; place < shelf.most; place++)
    grid.append(make('div', '', `gear-cell ${ROLES.tile} gear-vacant`));
  node.append(heading, grid);
  return node;
}

/** The vault, after Destiny 1's: what it keeps on the left, what the player carries on the right. */
export function vaultPage(context: PageContext): HTMLElement {
  const vault = vaultOf(context.gear);
  const page = make('div', '', 'gear-vault');
  const side = (title: string, shelves: readonly VaultShelf[], kept: boolean) => {
    const column = make('div', '', `gear-vault-side ${ROLES.panel}`);
    column.append(make('h2', title, 'gear-vault-title'), ...shelves.map((shelf) => shelfNode(context, shelf, kept)));
    return column;
  };
  page.append(side('In the vault', vault.kept, true), side('Carried', vault.carried, false));
  return page;
}

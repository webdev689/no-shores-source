// The character page, after Destiny's: the player's own figure in the middle, their level and Prestige over it; the
// weapons and cloak in slots to its left and the armour to its right, each slot its item's own picture in a frame of
// its rarity. Hovering a slot shows its item's card; a click opens its flyout of the nine it carries beside it, each
// worn by a click; a right-click on any opens the item's page.

import { make } from '../editor/dom.ts';
import type { GearAsk, GearItem, GearState } from '../network/gearMessages.ts';
import { SLOTS, itemName } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { cardOf, flyoutOf, wearIn } from './gearCards.ts';
import { type HoverCard, cardNode, glyphImage, itemIcon, pictureCanvas, rarityOf } from './gearDom.ts';
import { characterOf } from './gearScreen.ts';

/** What a page of the gear screen draws from: the gear, the way to ask of it, the card, the pictures. */
export interface PageContext {
  readonly gear: GearState;
  readonly ask: (ask: GearAsk) => void;
  readonly tip: HoverCard;
  /** An item's own picture, null while it is drawn. */
  readonly picture: (item: GearItem) => Picture | null;
  /** The player's figure, null while it is drawn or with no forge. */
  readonly figure: Picture | null;
  /** Opens an item's page. */
  readonly inspect: (item: GearItem) => void;
}

/** The slots each side of the figure, by the gear's slot numbers. */
const WEAPONS = [0, 1, 6];
const ARMOUR = [2, 3, 4, 5];
/** A slot's picture box, and a flyout cell's, in pixels. */
const SLOT_PX = 64;
const CELL_PX = 48;
/** How tall the figure stands, in pixels. */
const FIGURE_PX = 360;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** A tile holding an item's picture (or an empty place's glyph), framed in its rarity. */
function tileFor(context: PageContext, item: GearItem | null, box: number, className: string): HTMLElement {
  const tile = make('button', '', `${className} ${ROLES.tile}`);
  rarityOf(tile, item?.rarity ?? null);
  tile.append(item ? itemIcon(context.picture(item), itemName(item), box) : glyphImage('empty'));
  if (item) {
    tile.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      context.tip.hide();
      context.inspect(item);
    });
  }
  return tile;
}

export function characterPage(
  context: PageContext,
  open: number | null,
  choose: (slot: number | null) => void,
): HTMLElement {
  const { gear, tip } = context;
  const character = characterOf(gear);
  const page = make('div', '', 'gear-character');
  const slot = (index: number): HTMLElement => {
    const { worn, cells } = flyoutOf(gear, index);
    const holder = make('div', '', 'gear-slot-holder');
    const tile = tileFor(context, worn, SLOT_PX, 'gear-slot');
    tile.classList.toggle('gear-open', open === index);
    tile.title = capital(SLOTS[index] ?? '');
    tile.addEventListener('click', () => choose(open === index ? null : index));
    if (worn)
      tip.over(tile, () => cardNode(cardOf(worn), context.picture(worn), 'Click: its nine · Right-click: inspect'));
    holder.append(tile, make('span', capital(SLOTS[index] ?? ''), 'gear-slot-name'));
    if (open === index) {
      const flyout = make('div', '', `gear-flyout ${ROLES.panel}`);
      const filled = cells.filter(Boolean).length;
      flyout.append(make('div', `${capital(SLOTS[index] ?? '')} · ${filled} of ${cells.length}`, 'gear-flyout-head'));
      const grid = make('div', '', 'gear-flyout-grid');
      for (const item of cells) {
        const cell = tileFor(context, item, CELL_PX, 'gear-cell');
        if (item) {
          const wear = wearIn(item, index);
          cell.addEventListener('click', () => {
            tip.hide();
            if (wear) context.ask(wear.ask);
          });
          tip.over(
            cell,
            () => cardNode(cardOf(item, worn), context.picture(item), 'Click: equip · Right-click: inspect'),
            flyout,
          );
        }
        grid.append(cell);
      }
      flyout.append(grid);
      holder.append(flyout);
    }
    return holder;
  };
  const side = (slots: readonly number[], label: string) => {
    const column = make('div', '', 'gear-side');
    column.append(make('div', label, `gear-heading ${ROLES.rule}`), ...slots.map(slot));
    return column;
  };
  const middle = make('div', '', 'gear-figure');
  const power = make('div', '', 'gear-power');
  power.append(
    make('span', 'Level', 'gear-power-label'),
    make('strong', String(character.level), 'gear-power-level'),
    make('span', `Prestige ${character.prestige} · Defense ${character.defense}`, 'gear-power-rest'),
  );
  const stand = make('div', '', 'gear-figure-stand');
  stand.append(context.figure ? pictureCanvas(context.figure, FIGURE_PX) : make('span', 'Drawing…', 'gear-hint'));
  const meter = make('div', '', `gear-meter ${ROLES.well}`);
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(character.toNext * 100)}%`;
  meter.append(fill);
  middle.append(power, stand, meter, make('div', character.toNextWords, 'gear-hint'));
  const attack = character.attack.map((value) => (value === null ? '—' : String(value))).join(' · ');
  middle.append(make('div', `Attack ${attack} · Fruit of Dagon ${character.fruit}`, 'gear-hint'));
  page.append(side(WEAPONS, 'Weapons'), middle, side(ARMOUR, 'Armour'));
  return page;
}

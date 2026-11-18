// The character page, after Destiny's: the player's own figure in the middle under their level and its meter, their
// power beneath it; the weapons and cloak in slots to its left and the armour to its right, each slot its item's own
// picture in a frame of its rarity. Hovering or focusing a slot shows its item's card; a click opens its flyout of the
// nine it carries, toward the figure, each worn by a click; a right-click on any opens the item's page.

import { make } from '../editor/dom.ts';
import type { GearAsk, GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, SLOTS, itemName } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { cardOf, flyoutOf, wearIn } from './gearCards.ts';
import { type HoverCard, cardNode, glyphImage, itemIcon, pictureCanvas, rarityOf, tileLabel } from './gearDom.ts';
import { characterOf } from './gearScreen.ts';

/** What a page of the gear screen draws from: the gear, the way to ask of it, the card, the pictures, and the height
 *  the screen gives it. */
export interface PageContext {
  readonly gear: GearState;
  readonly ask: (ask: GearAsk) => void;
  readonly tip: HoverCard;
  /** An item's own picture, null while it is drawn. */
  readonly picture: (item: GearItem) => Picture | null;
  /** The player's figure, null while it is drawn or with no forge. */
  readonly figure: Picture | null;
  /** The height of the screen's body, in pixels. */
  readonly room: number;
  /** Opens an item's page. */
  readonly inspect: (item: GearItem) => void;
}

/** The slots each side of the figure, by the gear's slot numbers. */
const WEAPONS = [0, 1, 6];
const ARMOUR = [2, 3, 4, 5];
/** A slot's picture box, and a flyout cell's, in pixels. */
const SLOT_PX = 64;
const CELL_PX = 48;
/** The figure's box: what the screen's body leaves it beside the level, the meter and the power, within these. */
const FIGURE_LEAST = 240;
const FIGURE_MOST = 560;
const FIGURE_AROUND = 230;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** A tile holding an item's picture, framed in its rarity, or an empty place. */
function tileFor(context: PageContext, item: GearItem | null, box: number, className: string): HTMLElement {
  const tile = make(item ? 'button' : 'div', '', `${className} ${ROLES.tile}`);
  rarityOf(tile, item?.rarity ?? null);
  tile.append(item ? itemIcon(context.picture(item), itemName(item), box) : glyphImage('empty'));
  if (item) {
    tile.dataset['key'] = `item-${item.id}`;
    tile.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      context.tip.hide();
      context.inspect(item);
    });
  } else tile.classList.add('gear-vacant');
  return tile;
}

/** A number of the player's power: its name over it. */
function stat(label: string, value: string): HTMLElement {
  const shown = make('div', '', 'gear-stat');
  shown.append(make('span', label, 'gear-stat-label'), make('b', value, 'gear-stat-value'));
  return shown;
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
    const name = capital(SLOTS[index] ?? '');
    const holder = make('div', '', 'gear-slot-holder');
    const tile = make('button', '', `gear-slot ${ROLES.tile}`);
    rarityOf(tile, worn?.rarity ?? null);
    tile.append(worn ? itemIcon(context.picture(worn), itemName(worn), SLOT_PX) : glyphImage('empty'));
    tile.dataset['key'] = `slot-${index}`;
    tile.classList.toggle('gear-open', open === index);
    tile.setAttribute('aria-expanded', String(open === index));
    tile.setAttribute('aria-label', `${name}: ${worn ? tileLabel(itemName(worn), worn.rarity) : 'empty'}`);
    tile.addEventListener('click', () => choose(open === index ? null : index));
    if (worn) {
      tile.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        tip.hide();
        context.inspect(worn);
      });
      tip.over(tile, () => cardNode(cardOf(worn), context.picture(worn), 'Click: its nine · Right-click: inspect'));
    }
    const label = make('div', '', 'gear-slot-words');
    label.append(make('span', name, 'gear-slot-name'));
    if (worn) {
      const named = make('span', itemName(worn), 'gear-slot-item');
      named.style.color = RARITIES[worn.rarity]?.colour ?? '';
      label.append(named);
    }
    holder.append(tile, label);
    if (open === index) {
      const flyout = make('div', '', `gear-flyout ${ROLES.panel}`);
      const filled = cells.filter(Boolean).length;
      flyout.append(make('div', `${name} · ${filled} of ${cells.length} carried`, 'gear-flyout-head'));
      const grid = make('div', '', 'gear-flyout-grid');
      for (const item of cells) {
        const cell = tileFor(context, item, CELL_PX, 'gear-cell');
        if (item) {
          const wear = wearIn(item, index);
          cell.setAttribute('aria-label', tileLabel(itemName(item), item.rarity));
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
      if (filled === 0) flyout.append(make('p', 'Nothing carried for this slot yet.', 'gear-hint'));
      flyout.append(grid);
      holder.append(flyout);
    }
    return holder;
  };
  const side = (slots: readonly number[], label: string) => {
    const column = make('div', '', 'gear-side');
    column.append(make('h2', label, `gear-heading ${ROLES.rule}`), ...slots.map(slot));
    return column;
  };
  const middle = make('div', '', 'gear-figure');
  const power = make('div', '', 'gear-power');
  const meter = make('div', '', `gear-meter ${ROLES.well}`);
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Toward the next level');
  meter.setAttribute('aria-valuenow', String(Math.round(character.toNext * 100)));
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(character.toNext * 100)}%`;
  meter.append(fill);
  power.append(
    make('span', 'Level', 'gear-power-label'),
    make('strong', String(character.level), 'gear-power-level'),
    meter,
    make('span', character.toNextWords, 'gear-hint gear-power-next'),
  );
  const stand = make('div', '', 'gear-figure-stand');
  const box = Math.min(FIGURE_MOST, Math.max(FIGURE_LEAST, context.room - FIGURE_AROUND));
  stand.style.height = `${box}px`;
  stand.append(context.figure ? pictureCanvas(context.figure, box) : make('span', 'Drawing…', 'gear-hint'));
  const stats = make('div', '', 'gear-stats');
  const [main, off] = character.attack;
  stats.append(
    stat('Attack', main === null || main === undefined ? '—' : String(main)),
    ...(off === null || off === undefined ? [] : [stat('Off hand', String(off))]),
    stat('Defense', String(character.defense)),
    stat('Prestige', String(character.prestige)),
    stat('Fruit of Dagon', String(character.fruit)),
  );
  middle.append(power, stand, stats);
  page.append(side(WEAPONS, 'Weapons'), middle, side(ARMOUR, 'Armour'));
  return page;
}

// What a page of the menu is given by the menu around it. A drawn page is a function of `MenuContext` answering its
// nodes each frame (`ui/`): it reads what was done to it through `ui`, asks the room through `ask`, shows the one
// hover card through `card` (the menu floats it beside what it describes, over everything, on the screen), says what
// X opens through `details`, holds through `holds`, and leaves the footer's hints and presses to the menu, which
// chooses them by the view; a page that needs no gear takes only its part of it (`PlainContext`).

import type { GearAsk, GearItem, GearState } from '../network/gearMessages.ts';
import type { Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import type { Picture } from '../player/picture.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { Holds } from './gearHold.ts';
import type { Sizes } from './gearNodes.ts';

/** What a drawn page of the menu draws from. */
export interface MenuContext {
  readonly ui: Interface;
  readonly gear: GearState;
  readonly ask: (ask: GearAsk) => void;
  /** An item's own picture, null while it is drawn. */
  readonly picture: (item: GearItem) => Picture | null;
  /** The player's figure, null while it is drawn or with no forge. */
  readonly figure: Picture | null;
  /** The room the menu's body gives a page, CSS pixels. */
  readonly room: { readonly width: number; readonly height: number };
  readonly sizes: Sizes;
  readonly holds: Holds;
  /** Shows `content` as the hover card beside `beside` (the press itself unless given) while the pointer is over
   *  press `id`, or the keys gave it the focus. */
  readonly card: (id: string, content: () => Node, beside?: string) => void;
  /** Opens an item's page; X on press `id` with the focus opens it too, as a right press does. */
  readonly inspect: (item: GearItem) => void;
  readonly details: (id: string, item: GearItem) => void;
  /** Whether the player stands at the vault's counter, where an item may be put in or taken out. */
  readonly atVault: boolean;
  /** Opens the worn Art's screen, where the menu has one. */
  readonly arts?: () => void;
  /** Opens the Appearance screen, where the menu has one. */
  readonly appearance?: () => void;
  /** The forge and the player's dress, for what draws the player or their horse; null while there is none. */
  readonly forge: Cards | null;
  readonly dress: Dress | null;
}

/** What a drawn page that needs no gear (Ship, Social, Settings, a page to come) draws from: the part of `MenuContext`
 *  the menu gives with or without gear. */
export type PlainContext = Pick<MenuContext, 'ui' | 'room' | 'sizes' | 'holds'>;

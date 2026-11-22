// The menu's frame as the game draws it, around whatever page it shows: the top line of tabs (or a station's name) with
// the account's mark at its right, the player's banner under it, the body, and the footer of the room's answer, what
// the keys do and what may be done; and the world behind it dimmed. The menu (gearWindow.ts) says what fills them.

import type { GearState } from '../network/gearMessages.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { type Emblem, SIGN_CELLS } from './emblemArt.ts';
import { type Hint, INK, emblemNode, focusRing, glyphNode, hintsNode, keycap, words, type Sizes } from './gearNodes.ts';
import { boundCap } from './controls.ts';
import { TABS, type Tab, characterOf } from './gearScreen.ts';
import { NEW_PIXELS, NEW_SVG } from './compendium/loreArt.ts';
import { pixelNode } from './journalIcons.ts';

/** Each tab's name, the control that opens it, and, for one still to come, what it will hold. */
export const TAB_PRESSES: Readonly<
  Record<Tab, { readonly label: string; readonly opens?: 'character' | 'inventory'; readonly later?: string }>
> = {
  character: { label: 'Character', opens: 'character' },
  inventory: { label: 'Inventory', opens: 'inventory' },
  journal: { label: 'Journal' },
  compendium: { label: 'Compendium' },
  ship: { label: 'Ship' },
  social: { label: 'Social' },
  guild: { label: 'Guild', later: 'Your guild will gather here.' },
  settings: { label: 'Settings' },
};
/** How many pixels each of the banner's cells takes: three, so its 24 cells stand 72 px tall. */
const BANNER_SCALE = 3;
/** The tabs' height, and the room the account's mark and the top line's gaps take beside them. */
const TAB_HEIGHT = 48;
/** How far the menu stands in from the screen's edges, and how long it takes to come in, seconds. */
const INSET: readonly [number, number] = [32, 24];
const OPENING_S = 0.16;
const DIMMING_S = 0.2;

/** The id of a tab's press. */
export const tabId = (tab: Tab): string => `tab-${tab}`;

/** The tabs filling the top, each a whole number of pixels wide; the chosen one a lit brass press, and one `marked`
 *  wearing Destiny's small diamond for what is new on it. Keycaps show where the menu is wide enough; narrower, a tab
 *  to come says so under its name, and narrower still its words step down. */
export function tabsNode(
  ui: Interface,
  chosen: string,
  width: number,
  view: { readonly width: number; readonly height: number },
  capSize = 1,
  marked: (tab: Tab) => boolean = () => false,
): Node {
  const each = Math.floor((width - 36) / TABS.length);
  const keys = view.width >= 1500 && !(view.width >= 2400 && view.height >= 1300);
  // The names step down together under 1100 px, or where one would not fit its tab.
  const fits = TABS.every((tab) => ui.renderer.measure(TAB_PRESSES[tab].label.toUpperCase(), 2) + 16 <= each);
  const size = view.width < 1100 || !fits ? 1 : 2;
  const step = TABS.length > 1 ? Math.floor((width - each * TABS.length) / (TABS.length - 1)) : 0;
  return {
    width: 'grow',
    gap: step,
    children: TABS.map((tab): Node => {
      const { label, opens, later } = TAB_PRESSES[tab];
      const key = opens ? boundCap(opens) : '';
      const id = tabId(tab);
      const picked = tab === chosen;
      const name = words(label.toUpperCase(), size, picked ? INK.brassLit : later ? INK.faint : undefined);
      const soon = later !== undefined && words('Later', 1, INK.brass);
      return {
        id,
        press: true,
        role: picked ? 'primary' : 'button',
        label: `${label}${later ? ', later' : ''}${marked(tab) ? ', new' : ''}`,
        keys: ['ArrowLeft', 'ArrowRight'],
        width: each,
        height: TAB_HEIGHT,
        padding: [0, 8],
        alignX: 'center',
        alignY: 'center',
        direction: keys ? 'row' : 'column',
        gap: keys ? 8 : 0,
        children: [
          name,
          keys && key !== '' && keycap(key, capSize),
          soon,
          picked && {
            width: 'grow',
            height: 2,
            fill: INK.brassLit,
            float: { to: 'parent', anchor: [0, 1], at: [0, 1], x: 0, y: -2 },
          },
          ui.focused(id) && ui.keyFocused && focusRing(each, TAB_HEIGHT),
          marked(tab) && {
            float: { to: 'parent', anchor: [1, 0], at: [1, 0], x: -6, y: 6 },
            children: [pixelNode('lore new', NEW_SVG, NEW_PIXELS, 10)],
          },
        ],
      };
    }),
  };
}

/** The player's banner, after Destiny's: their emblem drawn to its width at three times its cells, their name, level
 *  and power over it, and their Aurem at its end, left blank where the inventory shows it. */
export function bannerNode(
  ui: Interface,
  emblem: Emblem,
  named: string | null,
  known: GearState | null,
  gear: GearState | null,
  purse: boolean,
  sizes: Sizes,
): Node {
  const room = ui.boxOf('gear-banner')?.width ?? 0;
  const cells = Math.floor(room / BANNER_SCALE);
  const level = known ? `Level ${characterOf(known).level}` : '';
  const power = gear && `${named ? `${level} · ` : ''}Prestige ${gear.prestige} · Defense ${gear.defense}`;
  const shadow = { edge: 'shadow' as const };
  return {
    id: 'gear-banner',
    width: 'grow',
    height: 72,
    children: [
      {
        ...(cells >= SIGN_CELLS
          ? emblemNode(emblem, 'banner', cells, cells * BANNER_SCALE, 72)
          : { width: 'grow', height: 72 }),
        // The emblem fills the banner; its words stand clear of the emblem's sign.
        children: [
          {
            width: 'grow',
            height: 'grow',
            padding: [0, 40, 0, 102],
            alignY: 'center',
            children: [
              {
                width: 'grow',
                direction: 'column',
                gap: 4,
                children: [
                  words(named ?? level, 2, INK.word, shadow),
                  power ? words(power, sizes.label, 'rgba(242,239,230,0.8)', shadow) : null,
                ],
              },
              gear && {
                gap: 6,
                alignY: 'center',
                opacity: purse ? 1 : 0,
                children: [
                  glyphNode('aurem', 24),
                  words(gear.aurem.toLocaleString(), 2, INK.word, shadow),
                  words('Aurem', 1, INK.faint, shadow),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** The footer: the room's answer to the last press in its colour, what the presses and keys do, and at its right what
 *  may be done. */
export function footerNode(
  answer: string,
  colour: string,
  hints: readonly Hint[],
  actions: readonly Child[],
  sizes: Sizes,
): Node {
  return {
    id: 'gear-foot',
    width: 'grow',
    padding: [8, 16],
    gap: 16,
    alignY: 'center',
    children: [
      {
        width: 'grow',
        gap: 18,
        alignY: 'center',
        wrap: true,
        children: [answer !== '' && words(answer, 1, colour), hintsNode(hints, sizes.label)],
      },
      { gap: 8, alignY: 'center', children: actions },
    ],
  };
}

/** How far a thing `age` seconds old has come in over `seconds`, in four steps, as Enhanced Plus's sigils move. */
const stepped = (age: number, seconds: number, still: boolean) =>
  still ? 1 : Math.min(1, Math.floor((age / seconds) * 4 + 1e-9) / 4);

/** The world dimmed behind the menu, taking the pointer, and the menu's window over it, holding the keys: `head`,
 *  `body` and `foot`. */
export function screenNode(
  ui: Interface,
  view: { readonly width: number; readonly height: number },
  head: readonly Child[],
  body: Node,
  foot: Node,
  still: boolean,
): Node[] {
  const [across, down] = INSET;
  const shown = stepped(ui.age('gear-screen'), OPENING_S, still);
  return [
    {
      id: 'gear-scrim',
      width: view.width,
      height: view.height,
      solid: true,
      fill: `rgba(5,7,10,${0.6 * stepped(ui.age('gear-scrim'), DIMMING_S, still)})`,
      float: { to: 'screen', z: 19 },
    },
    {
      id: 'gear-screen',
      role: 'window',
      label: 'Menu',
      solid: true,
      // The keys and the pad are the menu's while it is open: nothing under it takes the focus or a press.
      modal: true,
      direction: 'column',
      width: view.width - 2 * across,
      height: view.height - 2 * down,
      padding: 2,
      opacity: shown,
      offset: [0, Math.round(8 * (1 - shown))],
      float: { to: 'screen', x: across, y: down, z: 20 },
      children: [
        { width: 'grow', direction: 'column', gap: 8, padding: [10, 0, 0, 0], children: head },
        body,
        { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
        foot,
      ],
    },
  ];
}

/** The top line: the tabs or a station's name, and the account's mark at its right. */
export function topNode(left: Node, mark: Node): Node {
  return { id: 'gear-top', width: 'grow', padding: [0, 18], gap: 12, alignY: 'center', children: [left, mark] };
}

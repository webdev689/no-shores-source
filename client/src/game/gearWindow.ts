import './gearScreen.css';
import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { RARITIES, answerText, itemName } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import { type PageContext, characterPage } from './characterPage.ts';
import { HoverCard, cardNode, glyphImage, itemIcon, pressOf, rarityOf } from './gearDom.ts';
import { cardOf } from './gearCards.ts';
import { type GearHere, characterOf, vendorsOf } from './gearScreen.ts';
import { inventoryPage } from './inventoryPage.ts';
import { itemPage } from './itemPage.ts';
import { ItemPictures } from './itemPictures.ts';

export type Tab = 'character' | 'inventory' | 'vendors' | 'account';

/** Each tab: its name and the key that opens it. */
const TABS: readonly (readonly [Tab, string, string])[] = [
  ['character', 'Character', 'I'],
  ['inventory', 'Inventory', 'O'],
  ['vendors', 'Vendors', ''],
  ['account', 'Account', ''],
];
/** The page event that opens the gear window at a tab, as a station's counter does. */
const OPEN_AT = 'overlook:gear';
/** How often the window looks for new gear while open, in milliseconds. */
const LOOK_MS = 100;
/** A ware's picture box, in pixels. */
const WARE_PX = 48;

/** Opens the gear window at a tab, wherever it was started. */
export function openGearWindow(tab: Tab): void {
  dispatchEvent(new CustomEvent<Tab>(OPEN_AT, { detail: tab }));
}

/**
 * The gear screen, after Destiny's, in the Enhanced Plus kit: Character (I), Inventory (O), Vendors and Account under a
 * header of tabs, and an item's page laid over them when one is inspected. While it is open the pointer is free and
 * the game's keys rest; Escape closes the item's page, then the screen. It shows the player's gear as their room last
 * sent it, each press an ask the room answers; where no room keeps gear it says so.
 */
export function startGearWindow(root: HTMLElement, link: AccountLink | null, here: () => GearHere | null): void {
  const screen = make('div', '', `gear-screen ${ROLES.window}`);
  screen.hidden = true;
  const header = make('div', '', `gear-head ${ROLES.header}`);
  const who = make('div', '', 'gear-who');
  const tabRow = make('div', '', 'gear-tabs-top');
  const purse = make('div', '', 'gear-purse');
  header.append(who, tabRow, purse);
  const answer = make('div', '', 'gear-answer');
  const body = make('div', '', 'gear-body');
  const footer = make('div', '', `gear-foot ${ROLES.footer}`);
  footer.append(make('span', 'Click: choose · Right-click: inspect · Esc: back', 'gear-hint'));
  screen.append(header, answer, body, footer);
  root.append(screen);
  const tip = new HoverCard(root);
  let tab: Tab | null = null;
  let slot: number | null = null;
  let shelf = 'consumables';
  let inspecting: number | null = null;
  let shown = '';
  let drawn = 0;
  let pressing = false;
  let account: HTMLElement | null = null;
  let pictures: ItemPictures | null = null;
  let figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  const redraw = () => drawn++;

  const close = () => {
    if (inspecting !== null) inspecting = null;
    else {
      tab = null;
      screen.hidden = true;
      tip.hide();
    }
  };
  const open = (wanted: Tab) => {
    if (tab === wanted) return close();
    [tab, slot, inspecting, account] = [wanted, null, null, null];
    screen.hidden = false;
    document.exitPointerLock();
    render();
  };
  const tabs = TABS.map(([name, label, key]) => {
    const node = pressOf(key ? `${label}  ${key}` : label, () => open(name));
    node.classList.add('gear-tab');
    node.dataset['tab'] = name;
    return node;
  });
  tabRow.append(...tabs);
  footer.append(pressOf('Close', () => ((inspecting = null), close())));

  const vendorsView = (context: PageContext): HTMLElement[] => {
    if (!context.gear.social)
      return [make('p', 'The vendors keep their stalls in a social space’s arcades.', 'gear-hint')];
    return vendorsOf(context.gear).flatMap((vendor) => [
      make('div', vendor.name, `gear-heading ${ROLES.rule}`),
      ...vendor.wares.map((ware, place) => {
        const row = make('div', '', 'gear-ware');
        const cell = make('div', '', `gear-cell ${ROLES.tile}`);
        const item = context.gear.wares[(vendor.name === 'The Armsmith' ? vendor.wares.length : 0) + place];
        rarityOf(cell, item?.rarity ?? null);
        cell.append(item ? itemIcon(context.picture(item), ware.tile.name, WARE_PX) : glyphImage('empty'));
        if (item) tip.over(cell, () => cardNode(cardOf(item), context.picture(item), ''));
        const words = make('div', '', 'gear-ware-words');
        const name = make('b', ware.tile.name);
        name.style.color = ware.tile.colour;
        words.append(name, make('span', `${ware.kind} · level ${ware.level} · ${ware.tile.power}`, 'gear-hint'));
        const buy = pressOf(ware.press.label, () => context.ask(ware.press.ask), ware.press.role);
        buy.disabled = !ware.affordable;
        row.append(cell, words, buy);
        return row;
      }),
    ]);
  };

  function render(): void {
    if (tab === null) return;
    for (const node of tabs) node.classList.toggle('gear-chosen', node.dataset['tab'] === tab);
    if (tab === 'account') {
      if (!account) {
        account = link ? accountPanel(link) : make('p', 'This page keeps no account: it plays alone.', 'gear-hint');
        answer.textContent = '';
        body.replaceChildren(account);
      }
      return;
    }
    account = null;
    const now = here();
    const gear = now?.gear ?? null;
    if (now?.forge && !pictures) pictures = new ItemPictures(now.forge);
    const dress = now?.dress ?? null;
    const figureKey = dress ? JSON.stringify(dress) : '';
    if (now?.forge && dress && figureKey !== figure.key) {
      figure = { key: figureKey, picture: null };
      void now.forge.picture(dress, 'idle', 0).then((picture) => {
        if (figure.key === figureKey) figure.picture = picture;
        redraw();
      });
    }
    const key = JSON.stringify([tab, slot, shelf, inspecting, drawn, gear?.answered, gear?.items.length, gear?.aurem]);
    if (pressing || (key === shown && gear)) return;
    shown = key;
    if (!now || !gear) {
      answer.textContent = '';
      const why = now ? 'Waiting for the room…' : 'Gear is kept by the rooms: it shows on foot in a room.';
      body.replaceChildren(make('p', why, 'gear-hint'));
      return;
    }
    who.replaceChildren(
      make('strong', `Level ${characterOf(gear).level}`),
      make('span', `Prestige ${gear.prestige} · Defense ${gear.defense}`, 'gear-hint'),
    );
    purse.replaceChildren(glyphImage('aurem'), make('b', gear.aurem.toLocaleString()));
    const opened = gear.items.find((each) => each.id === gear.identified);
    answer.textContent = opened ? `The Vestige opened: ${itemName(opened)}.` : answerText(gear.answer);
    answer.style.color = opened ? (RARITIES[opened.rarity]?.colour ?? '') : '';
    const picture = (item: GearItem) => (pictures && dress ? pictures.pictureOf(item, dress, redraw) : null);
    const context: PageContext = {
      gear,
      ask: (asked) => now.ask(asked),
      tip,
      picture,
      figure: figure.picture,
      inspect: (item) => {
        inspecting = item.id;
        render();
      },
    };
    const page =
      tab === 'character'
        ? [characterPage(context, slot, (chosen) => ((slot = chosen), render()))]
        : tab === 'inventory'
          ? [inventoryPage(context, shelf, (chosen) => ((shelf = chosen), render()))]
          : vendorsView(context);
    const inspected = gear.items.find((each) => each.id === inspecting);
    if (!inspected) inspecting = null;
    body.replaceChildren(
      ...page,
      ...(inspected ? [itemPage(context, inspected, () => ((inspecting = null), render()))] : []),
    );
  }

  // A press is never lost to a new build under it: none is made while one is held down.
  screen.addEventListener('pointerdown', () => (pressing = true));
  addEventListener('pointerup', () => {
    pressing = false;
    window.setTimeout(render, 0);
  });
  addEventListener(OPEN_AT, (event) => {
    const wanted = (event as CustomEvent<Tab>).detail;
    if (tab !== wanted) open(wanted);
  });
  // Typing in the screen's fields reaches no game key.
  screen.addEventListener('keydown', (event) => event.stopPropagation());
  addEventListener(
    'keydown',
    (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      const opens = key === 'i' || key === 'o';
      if (!opens && tab === null) return;
      // While the screen is open, the game's own keys rest.
      event.stopPropagation();
      if (!opens && key !== 'escape') return;
      event.preventDefault();
      if (key === 'escape') {
        close();
        render();
      } else if (!event.repeat) open(key === 'i' ? 'character' : 'inventory');
    },
    { capture: true },
  );
  window.setInterval(render, LOOK_MS);
}

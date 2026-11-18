import './gearScreen.css';
import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, WORN, answerText, itemName } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import { type PageContext, characterPage } from './characterPage.ts';
import { HoverCard, cardNode, glyphImage, heldPress, itemIcon, pressOf, rarityOf, tileLabel } from './gearDom.ts';
import { cardOf } from './gearCards.ts';
import { type GearHere, OPEN_AT, type Tab, characterOf, setGearScreenOpen, vendorsOf } from './gearScreen.ts';
import { inventoryPage } from './inventoryPage.ts';
import { itemPage } from './itemPage.ts';
import { ItemPictures } from './itemPictures.ts';

/** Each tab: its name and the key that opens it. */
const TABS: readonly (readonly [Tab, string, string])[] = [
  ['character', 'Character', 'I'],
  ['inventory', 'Inventory', 'O'],
  ['vendors', 'Vendors', ''],
  ['account', 'Account', ''],
];
/** How often the window looks for new gear while open, in milliseconds. */
const LOOK_MS = 100;
/** A ware's picture box, in pixels. */
const WARE_PX = 48;
/** What the footer says each tab's presses do. */
const HINTS: Readonly<Record<Tab, string>> = {
  character: 'Click a slot: its nine · Right-click: inspect · Esc: back',
  inventory: 'Click: use · Right-click: inspect or vault · Esc: back',
  vendors: 'Hold a price to buy · Esc: back',
  account: 'Esc: back',
};

/** A tab's press: its name, and the key that opens it on a keycap. */
function tabPress(label: string, key: string, open: () => void): HTMLButtonElement {
  const node = pressOf('', open);
  node.append(make('span', label));
  if (key) node.append(make('kbd', key, 'gear-key'));
  node.classList.add('gear-tab');
  return node;
}

/**
 * The gear screen, after Destiny's, in the Enhanced Plus kit: Character (I), Inventory (O), Vendors and Account under a
 * header of tabs, and an item's page laid over them when one is inspected. While it is open the world behind it is
 * dimmed, the pointer is free and the game's keys rest; Escape steps back: the item's page, then a slot's flyout, then
 * the screen. It shows the player's gear as their room last sent it, built again only when that changes or the
 * player moves within it, each press an ask the room answers; where no room keeps gear it says so.
 */
export function startGearWindow(root: HTMLElement, link: AccountLink | null, here: () => GearHere | null): void {
  const screen = make('div', '', `gear-screen ${ROLES.window}`);
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-label', 'Gear');
  const header = make('div', '', `gear-head ${ROLES.header}`);
  const who = make('div', '', 'gear-who');
  const tabRow = make('div', '', 'gear-tabs-top');
  tabRow.setAttribute('role', 'tablist');
  const purse = make('div', '', 'gear-purse');
  header.append(who, tabRow, purse);
  // The room's answer to the last press, in the footer beside what the presses do.
  const answer = make('div', '', 'gear-answer');
  answer.setAttribute('role', 'status');
  answer.setAttribute('aria-live', 'polite');
  const body = make('div', '', 'gear-body');
  const footer = make('div', '', `gear-foot ${ROLES.footer}`);
  const hint = make('span', '', 'gear-hint');
  const said = make('div', '', 'gear-said');
  said.append(answer, hint);
  footer.append(said);
  screen.append(header, body, footer);
  // The world behind the screen, dimmed and softened while it is open.
  const scrim = make('div', '', 'gear-scrim');
  scrim.hidden = true;
  root.append(scrim, screen);
  const tip = new HoverCard(root);
  let tab: Tab | null = null;
  let slot: number | null = null;
  let shelf = 'consumables';
  let inspecting: number | null = null;
  /** The gear and the state of the screen it was last built for. */
  let shownGear: GearState | null = null;
  let shownState = '';
  let drawn = 0;
  let pressing = false;
  let account: HTMLElement | null = null;
  let pictures: ItemPictures | null = null;
  let figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  const redraw = () => drawn++;

  const shut = () => {
    tab = null;
    screen.hidden = scrim.hidden = true;
    setGearScreenOpen(false);
    tip.hide();
  };
  /** Escape's one step back: the item's page, then the flyout, then the screen. */
  const back = () => {
    if (inspecting !== null) inspecting = null;
    else if (slot !== null) slot = null;
    else shut();
  };
  const open = (wanted: Tab) => {
    if (tab === wanted) return shut();
    [tab, slot, inspecting, account, shownGear] = [wanted, null, null, null, null];
    screen.hidden = scrim.hidden = false;
    setGearScreenOpen(true);
    document.exitPointerLock();
    render();
  };
  const tabs = TABS.map(([name, label, key]) => {
    const node = tabPress(label, key, () => open(name));
    node.dataset['tab'] = name;
    node.dataset['key'] = `tab-${name}`;
    node.setAttribute('role', 'tab');
    return node;
  });
  tabRow.append(...tabs);
  footer.append(pressOf('Close  Esc', shut));

  const vendorsView = (context: PageContext): HTMLElement[] => {
    if (!context.gear.social)
      return [make('p', 'The vendors keep their stalls in a social space’s arcades.', 'gear-hint gear-empty')];
    let place = 0;
    return vendorsOf(context.gear).map((vendor) => {
      const section = make('section', '', 'gear-vendor');
      section.append(make('h2', vendor.name, `gear-heading ${ROLES.rule}`));
      const wares = make('div', '', 'gear-wares');
      for (const ware of vendor.wares) {
        const nth = place++;
        const item = context.gear.wares[nth];
        const block = make('div', '', 'gear-ware');
        const cell = make('div', '', `gear-cell ${ROLES.tile}`);
        rarityOf(cell, item?.rarity ?? null);
        cell.append(item ? itemIcon(context.picture(item), ware.tile.name, WARE_PX) : glyphImage('empty'));
        if (item) {
          cell.tabIndex = 0;
          cell.dataset['key'] = `ware-${nth}`;
          cell.setAttribute('aria-label', tileLabel(ware.tile.name, item.rarity, ware.kind));
          const worn = context.gear.items.find((each) => each.at === WORN + item.bucket) ?? null;
          tip.over(cell, () => cardNode(cardOf(item, worn), context.picture(item), ''));
        }
        const words = make('div', '', 'gear-ware-words');
        const name = make('b', ware.tile.name);
        name.style.color = ware.tile.colour;
        words.append(name, make('span', `${ware.kind} · level ${ware.level}`, 'gear-hint'));
        if (ware.tile.power) words.append(make('span', ware.tile.power, 'gear-ware-power'));
        const buy = heldPress(ware.press.label, () => context.ask(ware.press.ask), ware.press.role);
        buy.dataset['key'] = `buy-${nth}`;
        buy.disabled = !ware.affordable;
        if (!ware.affordable) buy.title = 'Not enough Aurem';
        block.append(cell, words, buy);
        wares.append(block);
      }
      section.append(wares);
      return section;
    });
  };

  function render(): void {
    if (tab === null) return;
    for (const node of tabs) {
      const chosen = node.dataset['tab'] === tab;
      node.classList.toggle('gear-chosen', chosen);
      node.setAttribute('aria-selected', String(chosen));
    }
    hint.textContent = inspecting !== null ? 'Esc: back to the screen' : HINTS[tab];
    if (tab === 'account') {
      if (!account) {
        account = link ? accountPanel(link) : make('p', 'This page keeps no account: it plays alone.', 'gear-hint');
        answer.textContent = '';
        tip.hide();
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
      void now.forge
        .picture(dress, 'idle', 0)
        .catch(() => null)
        .then((picture) => {
          if (figure.key === figureKey) figure.picture = picture;
          redraw();
        });
    }
    // Built again only when the room's word on the gear is new, or the player moved within the screen.
    const state = JSON.stringify([tab, slot, shelf, inspecting, drawn, now === null]);
    if (pressing || (gear === shownGear && state === shownState)) {
      tip.keep();
      return;
    }
    [shownGear, shownState] = [gear, state];
    // The focused control is found again in the page built anew, by what it is.
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
    tip.hide();
    if (!now || !gear) {
      answer.textContent = '';
      who.replaceChildren();
      purse.replaceChildren();
      const why = now ? 'Waiting for the room…' : 'Gear is kept by the rooms: it shows on foot in a room.';
      body.replaceChildren(make('p', why, 'gear-hint gear-empty'));
      return;
    }
    const character = characterOf(gear);
    who.replaceChildren(
      make('strong', `Level ${character.level}`),
      make('span', `Prestige ${gear.prestige} · Defense ${gear.defense}`, 'gear-hint'),
    );
    // The character page shows the level itself; the header keeps its place, so the tabs stay centred.
    who.style.visibility = tab === 'character' ? 'hidden' : '';
    purse.replaceChildren(
      glyphImage('aurem'),
      make('b', gear.aurem.toLocaleString()),
      make('span', 'Aurem', 'gear-hint'),
    );
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
      room: body.clientHeight,
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
    const shown = inspected ? itemPage(context, inspected, () => ((inspecting = null), render())) : null;
    // Under an item's page, the screen is out of reach of the pointer, the keys and a screen reader.
    for (const under of page) under.inert = shown !== null;
    body.replaceChildren(...page, ...(shown ? [shown] : []));
    const again = focused ? body.querySelector<HTMLElement>(`[data-key="${CSS.escape(focused)}"]`) : null;
    if (shown && !shown.contains(document.activeElement)) shown.querySelector<HTMLElement>('button')?.focus();
    else again?.focus();
  }

  // A press is never lost to a new build under it: none is made while one is held down.
  screen.addEventListener('pointerdown', () => (pressing = true));
  const released = () => {
    pressing = false;
    window.setTimeout(render, 0);
  };
  for (const event of ['pointerup', 'pointercancel', 'blur']) addEventListener(event, released);
  addEventListener(OPEN_AT, (event) => {
    const wanted = (event as CustomEvent<Tab>).detail;
    if (tab !== wanted) open(wanted);
  });
  // A key on the screen's own controls goes to them and no further, so typing in its fields reaches no game key.
  screen.addEventListener('keydown', (event) => event.stopPropagation());
  addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toLowerCase();
      const typing = event.target instanceof HTMLInputElement;
      const opens = !typing && (key === 'i' || key === 'o');
      if (!opens && tab === null) return;
      // While the screen is open, a key meant for nothing on it never reaches the game.
      if (tab !== null && !(event.target instanceof Node && screen.contains(event.target))) event.stopPropagation();
      if (key === 'escape') {
        event.preventDefault();
        back();
        render();
      } else if (opens && !event.repeat) {
        event.preventDefault();
        open(key === 'i' ? 'character' : 'inventory');
      }
    },
    { capture: true },
  );
  window.setInterval(render, LOOK_MS);
}

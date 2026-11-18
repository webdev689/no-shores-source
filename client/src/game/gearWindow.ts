import './gearScreen.css';
import './menu.css';
import './roster.css';
import { make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, answerText, itemName } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { type PageContext, characterPage } from './characterPage.ts';
import { type Hint, HoverCard, glyphImage, hintLine, pressOf } from './gearDom.ts';
import {
  type GearHere,
  OPEN_AT,
  type Opening,
  type Station,
  TABS,
  type Tab,
  type View,
  characterOf,
  setGearScreenOpen,
} from './gearScreen.ts';
import { inventoryPage } from './inventoryPage.ts';
import { itemPage } from './itemPage.ts';
import { ItemPictures } from './itemPictures.ts';

export { gearScreenOpen } from './gearScreen.ts';
import { laterPage, settingsPage, shipPage } from './menuPages.ts';
import type { ShipPanel } from './shipPanel.ts';
import { rosterPage } from './rosterTab.ts';
import { tailorPage, vaultPage, vendorPage } from './stationPages.ts';
import { emblemImage, emblemOf, plateEnd } from './emblemArt.ts';
import { startPartyHud } from './partyHud.ts';

/** Each tab's name, the key that opens it, and, for one still to come, what it will hold. */
const TAB_PRESSES: Readonly<Record<Tab, { readonly label: string; readonly key: string; readonly later?: string }>> = {
  character: { label: 'Character', key: 'I' },
  inventory: { label: 'Inventory', key: 'O' },
  journal: { label: 'Journal', key: '', later: 'Your quests will be kept here.' },
  ship: { label: 'Ship', key: '' },
  social: { label: 'Social', key: '' },
  guild: { label: 'Guild', key: '', later: 'Your guild will gather here.' },
  settings: { label: 'Settings', key: '' },
};
/** Each station's screen's name. */
const STATIONS: Readonly<Record<Station, string>> = {
  vault: 'The Vault',
  quartermaster: 'The Quartermaster',
  armsmith: 'The Armsmith',
  tailor: 'The Tailor',
};
/** How often the menu looks for new gear while open, in milliseconds. */
const LOOK_MS = 100;
/** What the footer says each view's presses and keys do, and an item's page's. */
const HINTS: Readonly<Partial<Record<View | 'item', readonly Hint[]>>> = {
  character: [
    ['Click', 'Swap'],
    ['Right-click', 'Details'],
  ],
  inventory: [
    ['Click', 'Equip'],
    ['Right-click', 'Details'],
  ],
  social: [
    ['Click', 'Choose a player'],
    ['Esc', 'Close a panel'],
  ],
  vault: [
    ['Click', 'Put in or take out'],
    ['Right-click', 'Details'],
  ],
  quartermaster: [['Hold', 'Buy']],
  armsmith: [['Hold', 'Buy']],
  tailor: [['Hold', 'Buy']],
  item: [
    ['Hold', 'Buy a node'],
    ['Click', 'Choose one bought'],
  ],
};
/** What the inventory's shelves' presses do, where they differ from its gear's. */
const SHELF_HINTS: Readonly<Record<string, readonly Hint[]>> = {
  consumables: [['Hover', 'What it does']],
  materials: [['Hover', 'Where it is from']],
  vestiges: [['Click', 'Open']],
};

const isTab = (view: View): view is Tab => (TABS as readonly string[]).includes(view);
/** The views drawn from the player's gear; the rest need none. */
const ofGear = (view: View) => view === 'character' || view === 'inventory' || !isTab(view);

/** A tab's press: its name, the key that opens it on a keycap, and Later on one still to come. */
function tabPress(tab: Tab, open: () => void): HTMLButtonElement {
  const { label, key, later } = TAB_PRESSES[tab];
  const node = pressOf('', open, 'button', key);
  node.prepend(make('span', label));
  if (later) node.append(make('span', 'Later', 'gear-tab-later'));
  node.classList.add('gear-tab');
  node.classList.toggle('gear-tab-to-come', later !== undefined);
  return node;
}

/**
 * The menu, after Destiny's, in the Enhanced Plus kit: Character (I), Inventory (O), Journal, Ship, Social, Guild and
 * Settings under a header of tabs; a station's screen (the vault, a vendor's stall) in their place when its counter is
 * used; and an item's page laid over either when one is inspected. While it is open the world behind it is dimmed,
 * the pointer is free and the game's keys rest; Escape steps back: the item's page, then a slot's flyout, then the
 * menu. Gear shows as the player's room last sent it, built again only when that changes or the player moves within
 * it, each press an ask the room answers; where no room keeps gear it says so.
 */
export function startGearWindow(
  root: HTMLElement,
  link: AccountLink | null,
  here: () => GearHere | null,
  ship: () => ShipPanel | null,
  travel: (place: string) => string | null = () => null,
): void {
  const screen = make('div', '', `gear-screen ${ROLES.window}`);
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Menu');
  const header = make('div', '', `gear-head ${ROLES.header}`);
  const who = make('div', '', 'gear-who');
  const tabRow = make('div', '', 'gear-tabs-top');
  tabRow.setAttribute('role', 'tablist');
  const title = make('h2', '', 'gear-station-name');
  title.id = 'gear-station-name';
  const purse = make('div', '', 'gear-purse');
  header.append(who, tabRow, title, purse);
  // The room's answer to the last press, in the footer beside what the presses do.
  const answer = make('div', '', 'gear-answer');
  answer.setAttribute('role', 'status');
  answer.setAttribute('aria-live', 'polite');
  const body = make('div', '', 'gear-body');
  body.setAttribute('role', 'tabpanel');
  const footer = make('div', '', `gear-foot ${ROLES.footer}`);
  const said = make('div', '', 'gear-said');
  const actions = make('div', '', 'gear-actions');
  footer.append(said, actions);
  screen.append(header, body, footer);
  // The world behind the menu, dimmed and softened while it is open.
  const scrim = make('div', '', 'gear-scrim');
  scrim.hidden = true;
  root.append(scrim, screen);
  const tip = new HoverCard(root);
  let view: View | null = null;
  let slot: number | null = null;
  let shelf = 'gear';
  let inspecting: number | null = null;
  /** The gear and the state of the menu it was last built for. */
  let shownGear: GearState | null = null;
  let shownState = '';
  let drawn = 0;
  let pressing = false;
  /** How many asks the room had answered when the menu opened: only a newer answer is shown. */
  let heard: number | null = null;
  /** The tile to give the focus back to once an item's page closes. */
  let returnTo: string | null = null;
  /** A page that needs no gear, kept while its view and what it shows stay the same. */
  let plain: { key: string; page: HTMLElement } | null = null;
  let pictures: ItemPictures | null = null;
  let figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  const redraw = () => drawn++;

  /** The HUD's other parts, out of reach of the keys and a screen reader while the menu is open. */
  const beneath = (asleep: boolean) => {
    for (const part of root.children)
      if (part instanceof HTMLElement && part !== screen && part !== scrim && part !== tip.node) part.inert = asleep;
  };
  /** Lets go of every press held, so none acts once its page has gone. */
  const letGo = () => {
    for (const held of screen.querySelectorAll('.gear-holding')) held.dispatchEvent(new PointerEvent('pointercancel'));
  };
  const shut = () => {
    letGo();
    if (document.activeElement instanceof HTMLElement && screen.contains(document.activeElement))
      document.activeElement.blur();
    view = null;
    screen.hidden = scrim.hidden = true;
    setGearScreenOpen(false);
    beneath(false);
    tip.hide();
    // The pages go with the menu, so nothing on them, a list asked for again among them, runs while it is shut.
    body.replaceChildren();
    [plain, shownGear] = [null, null];
  };
  /** Escape's one step back: the item's page, then the flyout, then the menu. */
  const back = () => {
    letGo();
    if (inspecting !== null) inspecting = null;
    else if (slot !== null) slot = null;
    else shut();
  };
  const open = (wanted: View, onShelf?: string) => {
    if (view === wanted && onShelf === undefined) return shut();
    const opening = view === null;
    [view, slot, inspecting, plain, shownGear, returnTo] = [wanted, null, null, null, null, null];
    shelf = onShelf ?? 'gear';
    if (opening) heard = here()?.gear?.answered ?? null;
    screen.hidden = scrim.hidden = false;
    setGearScreenOpen(true);
    beneath(true);
    document.exitPointerLock();
    render();
    // Opened, or moved to a station while the focus was on a page now gone: the tab or the station's first press.
    if (opening || !screen.contains(document.activeElement))
      (tabs.find((node) => node.dataset['tab'] === wanted) ?? body.querySelector('button'))?.focus();
  };
  const tabs = TABS.map((name) => {
    // The tab already shown stays shown; Escape or Close shuts the menu.
    const node = tabPress(name, () => view !== name && open(name));
    node.id = `gear-tab-${name}`;
    node.dataset['tab'] = name;
    node.dataset['key'] = `tab-${name}`;
    node.setAttribute('role', 'tab');
    return node;
  });
  tabRow.append(...tabs);
  const close = pressOf('Close', shut, 'button', 'Esc');
  /** The player's name, for their nameplate, once the accounts give it. */
  let named: string | null = null;
  void link?.session().then((account) => (named = account?.username ?? null));
  startPartyHud(root, link);
  const stepBack = pressOf('Back', () => (back(), render()), 'button', 'Esc');

  /** The header's ends: the player's nameplate, after Destiny's, their emblem behind their name, level and power; and
   *  their Aurem; each hidden where its page shows it. */
  const ends = (gear: GearState | null) => {
    who.replaceChildren();
    purse.replaceChildren();
    who.style.backgroundImage = '';
    who.style.backgroundColor = '';
    if (!gear) return;
    const emblem = emblemOf(gear.emblem ?? 0);
    who.style.backgroundImage = `url(${emblemImage(emblem, 'band')})`;
    who.style.backgroundColor = plateEnd(emblem);
    who.append(
      make('strong', named ?? `Level ${characterOf(gear).level}`),
      make(
        'span',
        `${named ? `Level ${characterOf(gear).level} · ` : ''}Prestige ${gear.prestige} · Defense ${gear.defense}`,
        'gear-who-power',
      ),
    );
    purse.append(glyphImage('aurem'), make('b', gear.aurem.toLocaleString()), make('span', 'Aurem', 'gear-hint'));
    // The tabs keep the header's middle whichever end is hidden.
    who.style.visibility = view === 'character' ? 'hidden' : '';
    purse.style.visibility = view === 'inventory' ? 'hidden' : '';
  };

  /** A page that needs no gear, built again only when what it shows changes. */
  const plainPage = (shown: View): HTMLElement => {
    const panel = shown === 'ship' ? ship() : null;
    const key = JSON.stringify([shown, panel]);
    if (plain?.key === key) return plain.page;
    const later = isTab(shown) ? TAB_PRESSES[shown].later : undefined;
    const page =
      later !== undefined
        ? laterPage(TAB_PRESSES[shown as Tab].label, later)
        : shown === 'ship'
          ? shipPage(panel)
          : shown === 'social'
            ? rosterPage(link, travel)
            : settingsPage(link);
    plain = { key, page };
    return page;
  };

  function render(): void {
    if (view === null) return;
    for (const node of tabs) {
      const chosen = node.dataset['tab'] === view;
      node.classList.toggle('gear-chosen', chosen);
      node.setAttribute('aria-selected', String(chosen));
    }
    const station = isTab(view) ? null : STATIONS[view];
    tabRow.hidden = station !== null;
    title.hidden = station === null;
    title.textContent = station ?? '';
    const now = here();
    const gear = now?.gear ?? null;
    body.setAttribute('aria-labelledby', isTab(view) ? `gear-tab-${view}` : 'gear-station-name');
    if (!ofGear(view)) {
      const page = plainPage(view);
      if (gear !== shownGear) [shownGear] = [gear, ends(gear)];
      if (body.firstChild !== page) {
        tip.hide();
        answer.textContent = '';
        body.replaceChildren(page);
        said.replaceChildren(answer);
        actions.replaceChildren(close);
      }
      return;
    }
    plain = null;
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
    // Built again only when the room's word on the gear is new, or the player moved within the menu.
    const state = JSON.stringify([view, slot, shelf, inspecting, drawn, now === null]);
    // Nor while a press is held, by the pointer or a key: its page stays under it until it is let go.
    const holding = pressing || screen.querySelector('.gear-holding') !== null;
    if (holding || (gear === shownGear && state === shownState)) {
      tip.keep();
      return;
    }
    [shownGear, shownState] = [gear, state];
    // The focused control is found again in the page built anew, by what it is.
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
    tip.hide();
    ends(gear);
    if (!now || !gear) {
      answer.textContent = '';
      const why = now ? 'Loading…' : 'Your gear shows here on foot, when playing online.';
      body.replaceChildren(make('p', why, 'gear-hint gear-empty'));
      said.replaceChildren(answer);
      actions.replaceChildren(close);
      return;
    }
    const opened = gear.items.find((each) => each.id === gear.identified);
    const fresh = gear.answered !== heard;
    answer.textContent = !fresh ? '' : opened ? `The Vestige opened: ${itemName(opened)}.` : answerText(gear.answer);
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
        // Back to the tile it was asked from: a worn piece's slot or its tile in a list.
        const from = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['key'] : undefined;
        returnTo = from ?? `item-${item.id}`;
        render();
      },
      atVault: view === 'vault',
    };
    const page =
      view === 'character'
        ? characterPage(context, slot, (chosen) => ((slot = chosen), render()))
        : view === 'inventory'
          ? inventoryPage(context, shelf, (chosen) => ((shelf = chosen), render()))
          : view === 'vault'
            ? vaultPage(context)
            : view === 'tailor'
              ? tailorPage(context)
              : vendorPage(context, view === 'quartermaster' ? 0 : 1);
    const inspected = gear.items.find((each) => each.id === inspecting);
    if (!inspected) inspecting = null;
    const shown = inspected ? itemPage(context, inspected, () => ((inspecting = null), render())) : null;
    // Under an item's page, the menu is out of reach of the pointer, the keys and a screen reader.
    page.inert = shown !== null;
    body.replaceChildren(page, ...(shown ? [shown.page] : []));
    // One footer: what the presses and keys do here, the room's answer, and what may be done: an item's presses on its
    // page, else a step back while a flyout is open, else closing the menu.
    // A Vestige opens with a click only at the Reader's counter, so the footer offers it only there.
    const shelfHints = shelf === 'vestiges' && !gear.atReader ? [] : (SHELF_HINTS[shelf] ?? HINTS.inventory);
    const hints = shown ? HINTS.item : view === 'inventory' ? shelfHints : HINTS[view];
    said.replaceChildren(answer, hintLine(hints ?? []));
    actions.replaceChildren(...(shown ? [shown.presses] : slot !== null ? [stepBack] : [close]));
    // The focus is found again by what it held; on an item's page it stays on the page, and once the page closes it
    // goes back to the item's tile.
    const found = (key: string | null | undefined) =>
      key ? screen.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
    const again = found(focused);
    if (shown && !(again && shown.page.contains(again)))
      (shown.page.querySelector<HTMLElement>('button') ?? shown.presses.querySelector<HTMLElement>('button'))?.focus();
    else (again ?? found(returnTo))?.focus();
  }

  // A press is never lost to a new build under it: none is made while one is held down.
  screen.addEventListener('pointerdown', () => (pressing = true));
  const released = () => {
    pressing = false;
    window.setTimeout(render, 0);
  };
  for (const event of ['pointerup', 'pointercancel', 'blur']) addEventListener(event, released);
  addEventListener(OPEN_AT, (event) => {
    const { view: wanted, shelf: onShelf } = (event as CustomEvent<Opening>).detail;
    if (view !== wanted || onShelf !== undefined) open(wanted, onShelf);
  });
  // A key on the menu's own controls goes to them and no further, so typing in its fields reaches no game key.
  screen.addEventListener('keydown', (event) => {
    if (view !== null) event.stopPropagation();
  });
  addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toLowerCase();
      const typing = event.target instanceof HTMLInputElement;
      const opens = !typing && (key === 'i' || key === 'o');
      if (!opens && view === null) return;
      // While the menu is open, a key meant for nothing on it never reaches the game.
      if (view !== null && !(event.target instanceof Node && screen.contains(event.target))) event.stopPropagation();
      if (key === 'escape') {
        event.preventDefault();
        back();
        render();
      } else if (key === 'x' && !typing && document.activeElement instanceof HTMLElement) {
        // X shows the focused piece's details, as a right-click does.
        if (document.activeElement.dataset['details'] === undefined) return;
        event.preventDefault();
        document.activeElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      } else if (opens && !event.repeat) {
        event.preventDefault();
        open(key === 'i' ? 'character' : 'inventory');
      }
    },
    { capture: true },
  );
  window.setInterval(render, LOOK_MS);
}

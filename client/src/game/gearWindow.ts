import './gearScreen.css';
import './menu.css';
import './roster.css';
import { make } from '../editor/dom.ts';
import type { Account, AccountLink } from '../network/accounts.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, answerText, itemName } from '../player/gear.ts';
import type { Cards } from '../player/cards.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES } from '../plus/kit.ts';
import { ARTS_HINTS, ART_DIAMOND_KEY, type ArtsEntrance, artDiamond, artsPage } from './artsPage.ts';
import { coresOf, gearAskOf } from './artsCards.ts';
import { type PageContext, characterPage } from './characterPage.ts';
import { DISMANTLE_KEY, type Hint, HoverCard, glyphImage, hintLine, letGoHold, pressOf } from './gearDom.ts';
import {
  ACCOUNT_CHANGED,
  type GearHere,
  OPEN_AT,
  type Opening,
  type Station,
  TABS,
  type Tab,
  STEP_BACK,
  type View,
  characterOf,
  setGearScreenOpen,
} from './gearScreen.ts';
import { inventoryPage } from './inventoryPage.ts';
import { itemPage } from './itemPage.ts';
import { ItemPictures } from '../player/itemPictures.ts';

export { gearScreenOpen } from './gearScreen.ts';
import { laterPage, settingsPage, shipPage, thisWeekPage } from './menuPages.ts';
import type { ThisWeek } from './activityWords.ts';
import type { ShipPanel } from './shipPanel.ts';
import { rosterPage } from './rosterTab.ts';
import { tailorPage, vaultPage, vendorPage } from './stationPages.ts';
import { boardPage } from './bountyBoard.ts';
import { type Emblem, SIGN_CELLS, emblemImage, emblemOf } from './emblemArt.ts';
import { startCompanyHud } from './companyHud.ts';
import { accountMark } from './accountMark.ts';
import { startAcquiredFeed } from './acquiredFeed.ts';
import { chime, play } from './uiSounds.ts';

/** Each tab's name, the key that opens it, and, for one still to come, what it will hold. */
const TAB_PRESSES: Readonly<Record<Tab, { readonly label: string; readonly key: string; readonly later?: string }>> = {
  character: { label: 'Character', key: 'I' },
  inventory: { label: 'Inventory', key: 'O' },
  journal: { label: 'Journal', key: '' },
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
  board: 'The Bounty Board',
};
/** How many pixels each of the banner's cells takes: three, so its 24 cells stand 72 px tall. */
const BANNER_SCALE = 3;
/** How often the menu looks for new gear while open, in milliseconds. */
const LOOK_MS = 100;
/** What the footer says each view's presses and keys do, and an item's page's. */
const HINTS: Readonly<Partial<Record<View | 'item', readonly Hint[]>>> = {
  // A worn piece is not dismantled; a carried one's card in the flyout says how.
  character: [
    ['Click', 'Swap'],
    ['Right-click / X', 'Details'],
  ],
  social: [
    ['Click', 'Choose a player'],
    ['Esc', 'Close a panel'],
  ],
  vault: [
    ['Click', 'Put in or take out'],
    ['Right-click / X', 'Details'],
    [DISMANTLE_KEY, 'Hold to dismantle'],
  ],
  quartermaster: [['Hold', 'Buy']],
  armsmith: [['Hold', 'Buy']],
  tailor: [['Hold', 'Buy']],
  board: [['Click', 'Take or turn in']],
  item: [
    ['Hold', 'Buy a node'],
    ['Click', 'Choose one bought'],
  ],
};
/** What the inventory's shelves' cells show. */
const SHELF_HINTS: Readonly<Record<string, readonly Hint[]>> = {
  consumables: [['Hover', 'What it does']],
  materials: [['Hover', 'Where it is from']],
};
/** The inventory's shelf shown first. */
const FIRST_SHELF = 'consumables';

const isTab = (view: View): view is Tab => (TABS as readonly string[]).includes(view);
/** The views drawn from the player's gear; the rest need none. */
const ofGear = (view: View) => view === 'character' || view === 'inventory' || !isTab(view);

/** A tab's press: its name, the key that opens it on a keycap, and Later on one still to come. */
function tabPress(tab: Tab, open: () => void): HTMLButtonElement {
  const { label, key, later } = TAB_PRESSES[tab];
  const node = pressOf('', open, 'button', key);
  node.prepend(make('span', label));
  // The keycap is shown, and said as the tab's shortcut rather than as part of its name.
  node.querySelector('kbd')?.setAttribute('aria-hidden', 'true');
  if (key) node.setAttribute('aria-keyshortcuts', key);
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
 * it, each press an ask the room answers; where no room keeps gear it says so. While `resting` (the story plays) it
 * never opens, so its keys stay the story's.
 */
export function startGearWindow(
  root: HTMLElement,
  link: AccountLink | null,
  here: () => GearHere | null,
  ship: () => ShipPanel | null,
  travel: (place: string) => string | null = () => null,
  resting: () => boolean = () => false,
  week: () => ThisWeek | null = () => null,
): void {
  const screen = make('div', '', `gear-screen ${ROLES.window}`);
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Menu');
  const header = make('div', '', `gear-head ${ROLES.header}`);
  const tabRow = make('div', '', 'gear-tabs-top');
  tabRow.setAttribute('role', 'tablist');
  const title = make('h2', '', 'gear-station-name');
  title.id = 'gear-station-name';
  title.tabIndex = -1;
  // Under the tabs, the player's banner the whole width of the menu: their emblem, name and power, and their Aurem.
  const banner = make('div', '', 'gear-banner');
  const who = make('div', '', 'gear-who');
  const purse = make('div', '', 'gear-purse');
  banner.append(who, purse);
  // The top line: the tabs, or a station's name, and the account's mark at its right, as DFO's stands in its corner.
  const mark = accountMark(() => open('settings'));
  const top = make('div', '', 'gear-top');
  top.append(tabRow, title, mark.node);
  header.append(top, banner);
  // The room's answer to the last press, in the footer beside what the presses do.
  const answer = make('div', '', 'gear-answer');
  answer.setAttribute('role', 'status');
  answer.setAttribute('aria-live', 'polite');
  const body = make('div', '', 'gear-body');
  body.id = 'gear-body';
  body.setAttribute('role', 'tabpanel');
  const footer = make('div', '', `gear-foot ${ROLES.footer}`);
  const said = make('div', '', 'gear-said');
  const actions = make('div', '', 'gear-actions');
  footer.append(said, actions);
  // The answer stays where it is, so a screen reader hears it; only the hints beside it change.
  said.append(answer);
  const hinted = (hints: readonly Hint[]) => {
    while (said.lastChild && said.lastChild !== answer) said.lastChild.remove();
    said.append(hintLine(hints));
  };
  screen.append(header, body, footer);
  // The world behind the menu, dimmed and softened while it is open.
  const scrim = make('div', '', 'gear-scrim');
  scrim.hidden = true;
  root.append(scrim, screen);
  const tip = new HoverCard(root);
  // What the player gains shows at the right, in play and over the menu alike, its pieces drawn by the menu's forge.
  let pictures: ItemPictures | null = null;
  const picturesOf = (forge: Cards) => (pictures ??= new ItemPictures(forge));
  const feed = startAcquiredFeed(root, here, picturesOf);
  let view: View | null = null;
  let slot: number | null = null;
  /** Whether the Character page shows the worn Art's screen, and the Core slot whose flyout is open on it. */
  let arts = false;
  let artSlot: number | null = null;
  /** The Art and Core the Art's screen was last built with (null while it is not shown), and the Core slot whose ask
   *  waits on the room's word. */
  let artsBuilt: { readonly art: number; readonly core: readonly (number | null)[] } | null = null;
  let artPending: number | null = null;
  let shelf = FIRST_SHELF;
  let inspecting: number | null = null;
  /** The gear and the state of the menu it was last built for. */
  let shownGear: GearState | null = null;
  let shownState = '';
  let drawn = 0;
  let pressing = false;
  /** How many asks the room had answered when the menu opened: only a newer answer is shown. */
  let heard: number | null = null;
  /** The answer a refusal was last heard for. */
  let refusedAt: number | null = null;
  /** The tile to give the focus back to once an item's page closes. */
  let returnTo: string | null = null;
  /** The view the tabs and title were last written for. */
  let tabbed: View | null = null;
  /** A page that needs no gear, kept while its view and what it shows stay the same. */
  let plain: { key: string; page: HTMLElement } | null = null;
  let figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  const redraw = () => drawn++;

  /** The HUD's other parts, out of reach of the keys and a screen reader while the menu is open. */
  const beneath = (asleep: boolean) => {
    for (const part of root.children)
      if (part instanceof HTMLElement && ![screen, scrim, tip.node, feed].includes(part)) part.inert = asleep;
  };
  /** Lets go of every press held, so none acts once its page has gone. */
  const letGo = () => letGoHold();
  const shut = () => {
    tabbed = null;
    letGo();
    if (document.activeElement instanceof HTMLElement && screen.contains(document.activeElement))
      document.activeElement.blur();
    view = null;
    screen.hidden = scrim.hidden = true;
    play('close');
    setGearScreenOpen(false);
    beneath(false);
    tip.hide();
    // The pages go with the menu, so nothing on them, a list asked for again among them, runs while it is shut.
    body.replaceChildren();
    [plain, shownGear] = [null, null];
  };
  /** Escape's one step back: the item's page, then the flyout, then the Art's screen, then the menu. With no gear
   *  shown (the room lost), none of those stands on the page, so the menu closes at once. */
  const back = () => {
    letGo();
    if (!here()?.gear) [inspecting, slot, artSlot, arts] = [null, null, null, false];
    if (inspecting !== null) inspecting = null;
    else if (slot !== null) slot = null;
    else if (artSlot !== null) artSlot = null;
    else if (arts) [arts, returnTo] = [false, ART_DIAMOND_KEY];
    else return shut();
    play('back');
  };
  const open = (wanted: View, onShelf?: string) => {
    if (view === wanted && onShelf === undefined) return shut();
    // A hold under way on the page left behind does not act on it unseen.
    letGo();
    const opening = view === null;
    [view, slot, inspecting, plain, shownGear, returnTo] = [wanted, null, null, null, null, null];
    [arts, artSlot] = [false, null];
    shelf = onShelf ?? FIRST_SHELF;
    if (opening) heard = here()?.gear?.answered ?? null;
    play(opening ? 'open' : 'tab');
    screen.hidden = scrim.hidden = false;
    setGearScreenOpen(true);
    beneath(true);
    document.exitPointerLock();
    render();
    // Opened, or moved to a station while the focus was on a page now gone: the tab or the station's first press.
    if (opening || !screen.contains(document.activeElement))
      // A station is read from its name, so no ware's card opens over the stall unasked.
      (tabs.find((node) => node.dataset['tab'] === wanted) ?? (isTab(wanted) ? null : title))?.focus();
  };
  const tabs = TABS.map((name) => {
    // The tab already shown stays shown; Escape or Close shuts the menu.
    const node = tabPress(name, () => view !== name && open(name));
    node.id = `gear-tab-${name}`;
    node.dataset['tab'] = name;
    node.dataset['key'] = `tab-${name}`;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-controls', 'gear-body');
    return node;
  });
  tabRow.append(...tabs);
  // The arrows move between the tabs, each opened as it is reached.
  tabRow.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const from = tabs.findIndex((node) => node === document.activeElement);
    if (step === 0 || from < 0) return;
    event.preventDefault();
    const next = tabs[(from + step + tabs.length) % tabs.length];
    next?.focus();
    next?.click();
  });
  const close = pressOf('Close', shut, 'button', 'Esc');
  /** The player's name, for their nameplate, once the accounts give it. */
  let named: string | null = null;
  /** The account last heard of, for the mark. */
  let account: Account | null = null;
  const nameAgain = () =>
    void link?.session().then((found) => {
      account = found;
      named = found?.username ?? null;
      mark.show(account, figure.picture);
      if (view !== null) ends(here()?.gear ?? null);
    });
  nameAgain();
  addEventListener(ACCOUNT_CHANGED, nameAgain);
  startCompanyHud(root, link);
  const stepBack = pressOf('Back', () => (back(), render()), 'button', 'Esc');

  /** The banner's emblem, drawn again to the banner's width whenever that changes. */
  let bannered: Emblem | null = null;
  const paintBanner = () => {
    const cells = Math.floor(banner.clientWidth / BANNER_SCALE);
    if (!bannered || cells < SIGN_CELLS) return;
    banner.style.backgroundImage = `url(${emblemImage(bannered, 'banner', cells)})`;
    banner.style.backgroundSize = `${cells * BANNER_SCALE}px 100%`;
  };
  new ResizeObserver(paintBanner).observe(banner);

  /** The header's banner, after Destiny's: the player's emblem behind their name, level and power, and their Aurem
   *  at its end, hidden where the inventory's page shows it. */
  /** The gear the banner last showed: once the player's emblem is known it stays, though the room's word goes. */
  let bannerGear: GearState | null = null;
  const ends = (gear: GearState | null) => {
    who.replaceChildren();
    purse.replaceChildren();
    bannerGear = gear ?? bannerGear;
    const known = gear ?? bannerGear;
    // Shown from the first word of who they are on; without the room's word, only the numbers go.
    banner.hidden = !known && !named;
    const emblem = emblemOf(known?.emblem ?? 0);
    if (emblem !== bannered) {
      bannered = emblem;
      paintBanner();
    }
    const level = known ? `Level ${characterOf(known).level}` : '';
    who.append(make('strong', named ?? level));
    if (!gear) return;
    who.append(
      make(
        'span',
        `${named ? `${level} · ` : ''}Prestige ${gear.prestige} · Defense ${gear.defense}`,
        'gear-who-power',
      ),
    );
    purse.append(glyphImage('aurem'), make('b', gear.aurem.toLocaleString()), make('span', 'Aurem', 'gear-hint'));
    purse.style.visibility = view === 'inventory' ? 'hidden' : '';
  };

  /** A page that needs no gear, built again only when what it shows changes. */
  const plainPage = (shown: View): HTMLElement => {
    const panel = shown === 'ship' ? ship() : null;
    const board = shown === 'journal' ? week() : null;
    const key = JSON.stringify([shown, panel, board]);
    if (plain?.key === key) return plain.page;
    const later = isTab(shown) ? TAB_PRESSES[shown].later : undefined;
    const page =
      later !== undefined
        ? laterPage(TAB_PRESSES[shown as Tab].label, later)
        : shown === 'ship'
          ? shipPage(panel)
          : shown === 'journal'
            ? thisWeekPage(board)
            : shown === 'social'
              ? rosterPage(link, travel)
              : settingsPage(link);
    plain = { key, page };
    return page;
  };

  function render(): void {
    if (view === null) return;
    const station = isTab(view) ? null : STATIONS[view];
    // The tabs, title and labels change only with the view, so the menu writes nothing while it stands open.
    if (view !== tabbed) {
      tabbed = view;
      for (const node of tabs) {
        const chosen = node.dataset['tab'] === view;
        node.classList.toggle('gear-chosen', chosen);
        node.setAttribute('aria-selected', String(chosen));
        // One tab is a stop for Tab; the arrows move between them.
        node.tabIndex = chosen || (station !== null && node === tabs[0]) ? 0 : -1;
      }
      tabRow.hidden = station !== null;
      title.hidden = station === null;
      title.textContent = station ?? '';
      body.setAttribute('aria-labelledby', isTab(view) ? `gear-tab-${view}` : 'gear-station-name');
    }
    const now = here();
    const gear = now?.gear ?? null;
    if (!ofGear(view)) {
      const page = plainPage(view);
      if (gear !== shownGear) [shownGear] = [gear, ends(gear)];
      if (body.firstChild !== page) {
        tip.hide();
        answer.textContent = '';
        body.replaceChildren(page);
        hinted(HINTS[view] ?? []);
        actions.replaceChildren(close);
      }
      return;
    }
    plain = null;
    if (now?.forge) picturesOf(now.forge);
    const dress = now?.dress ?? null;
    const figureKey = dress ? JSON.stringify(dress) : '';
    if (now?.forge && dress && figureKey !== figure.key) {
      figure = { key: figureKey, picture: null };
      void now.forge
        .picture(dress, 'idle', 0)
        .catch(() => null)
        .then((picture) => {
          if (figure.key === figureKey) figure.picture = picture;
          mark.show(account, figure.picture);
          redraw();
        });
    }
    // Built again only when the room's word on the gear is new, or the player moved within the menu.
    const state = JSON.stringify([view, slot, arts, artSlot, artPending, shelf, inspecting, drawn, now === null]);
    // Nor while a press is held, by the pointer or a key: its page stays under it until it is let go.
    const holding = pressing || screen.querySelector('.gear-holding') !== null;
    if (holding || (gear === shownGear && state === shownState)) {
      tip.keep();
      return;
    }
    // The room's word has come, so no ask of the Art's screen waits any more.
    if (gear !== shownGear) artPending = null;
    [shownGear, shownState] = [gear, state];
    // The focused control is found again in the page built anew, by what it is; should it be gone (dismantled, opened),
    // the one beside it takes the focus, else the tab or station it is under.
    const held = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focused = held?.dataset['key'];
    const beside = [held?.nextElementSibling, held?.previousElementSibling]
      .map((node) => (node instanceof HTMLElement ? node.dataset['key'] : undefined))
      .find(Boolean);
    // A key's focus in a slot's grid goes back to its slot as the grid closes; a pointer's would open the slot's card.
    const slotted = held?.matches(':focus-visible')
      ? held.closest('.gear-slot-holder')?.querySelector<HTMLElement>('.gear-slot')?.dataset['key']
      : undefined;
    const within = held !== null && screen.contains(held);
    tip.hide();
    ends(gear);
    if (!now || !gear) {
      answer.textContent = '';
      // A room lost after the gear showed says so; with none yet, where gear is kept.
      const lost = bannerGear !== null ? 'The room was lost. Your gear shows again once you are back in one.' : null;
      const why = now ? 'Loading…' : (lost ?? 'Your gear shows here on foot, when playing online.');
      body.replaceChildren(make('p', why, 'gear-hint gear-empty'));
      hinted([]);
      actions.replaceChildren(close);
      return;
    }
    const opened = gear.items.find((each) => each.id === gear.identified);
    const fresh = gear.answered !== heard;
    // A refusal is heard once, when it comes.
    if (fresh && gear.answer !== 0 && gear.answered !== refusedAt) play('refused');
    if (fresh) refusedAt = gear.answered;
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
      ...(gear.arts && {
        art: artDiamond(gear.arts.art, () => ((arts = true), (artSlot = slot = null), render()), tip),
      }),
    };
    const worn = view === 'character' && arts ? gear.arts : undefined;
    const cores = worn ? coresOf(worn) : {};
    const core = worn ? (cores[worn.art] ?? []) : [];
    // The screen comes in once as it opens and again as another Art is worn; a slot the room has just set flares.
    const entrance: ArtsEntrance = !worn ? null : !artsBuilt ? 'open' : artsBuilt.art !== worn.art ? 'wear' : null;
    const before = worn && artsBuilt?.art === worn.art ? artsBuilt.core : null;
    const justSet = before
      ? core.findIndex((chosen, place) => chosen !== null && chosen !== (before[place] ?? null))
      : -1;
    if (justSet >= 0) chime(0);
    artsBuilt = worn ? { art: worn.art, core } : null;
    const page = worn
      ? artsPage(
          {
            worn: worn.art,
            cores,
            ask: (asked) => {
              if (asked.kind === 'setCore') artPending = asked.slot;
              now.ask(gearAskOf(asked));
            },
            tip,
            close: () => ((arts = false), (returnTo = ART_DIAMOND_KEY), render()),
            entrance,
            justSet: justSet >= 0 ? justSet : null,
            pending: artPending,
          },
          artSlot,
          (chosen) => ((artSlot = chosen), render()),
        )
      : view === 'character'
        ? characterPage(context, slot, (chosen) => ((slot = chosen), render()))
        : view === 'inventory'
          ? inventoryPage(context, shelf, (chosen) => ((shelf = chosen), render()))
          : view === 'board'
            ? boardPage(context)
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
    const opens: readonly Hint[] =
      gear.atReader && gear.vestiges.some((each) => !each.vaulted) ? [['Click', 'Open a Vestige']] : [];
    const shelfHints = [...opens, ...(SHELF_HINTS[shelf] ?? [])];
    const hints = shown ? HINTS.item : worn ? ARTS_HINTS : view === 'inventory' ? shelfHints : HINTS[view];
    hinted(hints ?? []);
    actions.replaceChildren(...(shown ? [shown.presses] : slot !== null || worn ? [stepBack] : [close]));
    // The focus is found again by what it held; on an item's page it stays on the page, and once the page closes it
    // goes back to the item's tile.
    const found = (key: string | null | undefined) =>
      key ? screen.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
    const again = found(focused);
    if (shown && !(again && shown.page.contains(again)))
      // The page is read from its name, so no card opens over it unasked.
      shown.page.querySelector<HTMLElement>('.gear-item-name')?.focus();
    else {
      const next = again ?? found(returnTo) ?? found(beside) ?? found(slotted);
      // Given back once, the tile to return to is forgotten, so it never takes the focus from a later choice.
      returnTo = null;
      if (next) next.focus();
      else if (within && !screen.contains(document.activeElement))
        (tabs.find((node) => node.classList.contains('gear-chosen')) ?? title).focus();
    }
  }

  // A press is never lost to a new build under it: none is made while one is held down.
  screen.addEventListener('pointerdown', () => (pressing = true));
  const released = () => {
    pressing = false;
    window.setTimeout(render, 0);
  };
  for (const event of ['pointerup', 'pointercancel', 'blur']) addEventListener(event, released);
  addEventListener(OPEN_AT, (event) => {
    if (resting()) return;
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
      const opens = !typing && !resting() && (key === 'i' || key === 'o');
      if (!opens && view === null) return;
      // While the menu is open, a key meant for nothing on it never reaches the game.
      if (view !== null && !(event.target instanceof Node && screen.contains(event.target))) event.stopPropagation();
      if (key === 'escape') {
        event.preventDefault();
        // The page shown takes the step first when it has one of its own (a panel, a player's details).
        const step = new Event(STEP_BACK, { cancelable: true });
        if (body.firstElementChild?.dispatchEvent(step) !== false) back();
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

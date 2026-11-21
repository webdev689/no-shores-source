import './gearScreen.css';
import './menu.css';
import type { Account, AccountLink } from '../network/accounts.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { RARITIES, answerText, itemName } from '../player/gear.ts';
import type { Cards } from '../player/cards.ts';
import type { Picture } from '../player/picture.ts';
import { ItemPictures } from '../player/itemPictures.ts';
import { motionReduced } from '../plus/kit.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { uiScale } from '../ui/uiRenderer.ts';
import { accountMark } from './accountMark.ts';
import { AccountPanel } from './accountTab.ts';
import { AcquiredFeed } from './acquiredFeed.ts';
import { APPEARANCE_HINTS, appearancePage } from './appearance/appearancePage.ts';
import { APPEARANCE_KEY } from './appearanceButton.ts';
import { artOf, gearAskOf } from './artsCards.ts';
import { ARTS_HINTS, ART_DIAMOND_KEY, artsPage } from './artsPage.ts';
import { spellKey } from './artsRows.ts';
import { characterPage } from './characterPage.ts';
import { CompanyHud } from './companyHud.ts';
import { emblemOf } from './emblemArt.ts';
import { DISMANTLE_KEY, Holds } from './gearHold.ts';
import { type Hint, INK, pressNode, sizesOf, words } from './gearNodes.ts';
import {
  ACCOUNT_CHANGED,
  type GearHere,
  OPEN_AT,
  type Opening,
  TABS,
  type Tab,
  type View,
  setGearScreenOpen,
} from './gearScreen.ts';
import { TAB_PRESSES, bannerNode, footerNode, screenNode, tabId, tabsNode, topNode } from './gearShell.ts';
import { inventoryPage } from './inventoryPage.ts';
import { ITEM_NAME, itemPage } from './itemPage.ts';
import { KEEPERS } from './keepers.ts';
import type { MenuContext, PlainContext } from './menuPage.ts';
import { laterPage, settingsPage, shipPage } from './menuPages.ts';
import { hush } from './npc/npcSpeech.ts';
import { isKeeperView, npcChoosing, npcHints, npcOpened, npcPage, npcStepBack } from './npc/npcScreen.ts';
import { RosterPage, socialPage } from './rosterTab.ts';
import type { ShipPanel } from './shipPanel.ts';
import { play } from './uiSounds.ts';

export { gearScreenOpen } from './gearScreen.ts';

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
/** The layer's own id, whose box is the view. */
const LAYER = 'gear-layer';

const isTab = (view: View): view is Tab => (TABS as readonly string[]).includes(view);
/** The views drawn from the player's gear; the rest need none. */
const ofGear = (view: View) => view === 'character' || view === 'inventory' || !isTab(view);

/**
 * The menu, after Destiny's, in the Enhanced Plus kit, drawn by the game: Character (I), Inventory (O), Journal, Ship,
 * Social, Guild and Settings under a header of tabs; a station's screen (the vault, a vendor's stall) in their place
 * when its counter is used; and an item's page laid over either when one is inspected. While it is open the world
 * behind it is dimmed, the pointer is free and the game's keys rest; Escape steps back: the item's page, then a slot's
 * flyout, then the menu. Gear shows as the player's room last sent it, each press an ask the room answers; where no
 * room keeps gear it says so. While `resting` (the story plays) it never opens, so its keys stay the story's. Answers
 * the layer that draws it, with the company and what the player gains, which show in play too.
 */
export function startGearWindow(
  root: HTMLElement,
  link: AccountLink | null,
  here: () => GearHere | null,
  ship: () => ShipPanel | null,
  travel: (place: string) => string | null = () => null,
  resting: () => boolean = () => false,
): Layer {
  // What the player gains shows at the right, in play and over the menu alike, its pieces drawn by the menu's forge.
  let pictures: ItemPictures | null = null;
  const picturesOf = (forge: Cards) => (pictures ??= new ItemPictures(forge));
  const feed = new AcquiredFeed(here, picturesOf);
  const company = new CompanyHud(link);
  const holds = new Holds();
  let view: View | null = null;
  let slot: number | null = null;
  /** Whether the Character page shows the worn Art's screen, and the Core slot whose flyout is open on it. */
  let arts = false;
  let artSlot: number | null = null;
  /** Whether the Character page shows the Appearance screen. */
  let appearance = false;
  /** The Core slot whose ask waits on the room's word. */
  let artPending: number | null = null;
  let shelf = FIRST_SHELF;
  let inspecting: number | null = null;
  /** How many asks the room had answered when the menu opened: only a newer answer is shown. */
  let heard: number | null = null;
  /** The answer a refusal was last heard for, and the words last said. */
  let refusedAt: number | null = null;
  let said = '';
  /** The press to give the focus to on the next frame: a tab as the menu opens, a tile as a page over it closes. */
  let focusNext: string | null = null;
  /** The tile to give the focus back to once an item's page closes. */
  let returnTo: string | null = null;
  /** The Roster and the account, asked of the accounts as Social or Settings opens and kept while it shows. */
  let roster: RosterPage | null = null;
  let accountPanel: AccountPanel | null = null;
  let figure: { key: string; picture: Picture | null } = { key: '', picture: null };
  /** The player's name and account, once the accounts give them; and the gear the banner last showed. */
  let named: string | null = null;
  let account: Account | null = null;
  let bannerGear: GearState | null = null;
  /** The interface last drawn with, and the presses X opens the details of, by their ids. */
  let ui: Interface | null = null;
  let details = new Map<string, GearItem>();
  /** Asked when a picture comes; the layer is drawn each frame, so it has nothing more to do. */
  const redraw = () => undefined;

  /** The HUD's other parts, out of reach of the keys and a screen reader while the menu is open, and out of sight:
   *  shortcut: they are elements over the canvas the menu is drawn on, so they would stand over it; they go once the
   *  HUD is drawn, under the menu's layer. */
  const beneath = (asleep: boolean) => {
    root.classList.toggle('gear-open', asleep);
    for (const part of root.children) if (part instanceof HTMLElement) part.inert = asleep;
  };
  const shut = () => {
    holds.letGo();
    view = null;
    // Its keeper falls silent with it.
    hush();
    play('close');
    setGearScreenOpen(false);
    beneath(false);
    // The pages go with the menu, so nothing on them, a list asked for again among them, runs while it is shut.
    [roster, accountPanel] = [null, null];
    ui?.focusOn(null);
  };
  /** Escape's one step back: the item's page, then the flyout, then the Art's screen, then the menu. With no gear
   *  shown (the room lost), none of those stands on the page, so the menu closes at once. */
  const back = () => {
    holds.letGo();
    if (!here()?.gear) {
      [inspecting, slot, artSlot, arts, appearance] = [null, null, null, false, false];
      npcStepBack();
    }
    if (inspecting !== null) [inspecting, focusNext] = [null, returnTo];
    else if (slot !== null) slot = null;
    else if (artSlot !== null) [artSlot, focusNext] = [null, `core-${artSlot}`];
    else if (npcStepBack()) return play('back');
    else if (arts) [arts, focusNext] = [false, ART_DIAMOND_KEY];
    else if (appearance) [appearance, focusNext] = [false, APPEARANCE_KEY];
    else return shut();
    play('back');
  };
  const open = (wanted: View, onShelf?: string) => {
    if (view === wanted && onShelf === undefined) return shut();
    // A hold under way on the page left behind does not act on it unseen, nor does its card stay.
    holds.letGo();
    const opening = view === null;
    [view, slot, inspecting, roster, accountPanel] = [wanted, null, null, null, null];
    [arts, artSlot, appearance] = [false, null, false];
    shelf = onShelf ?? FIRST_SHELF;
    if (opening) heard = here()?.gear?.answered ?? null;
    npcOpened(wanted);
    play(opening ? 'open' : 'tab');
    setGearScreenOpen(true);
    beneath(true);
    document.exitPointerLock();
    // Opened, or moved to a station: the tab, or the station's first press.
    focusNext = isTab(wanted) ? tabId(wanted) : null;
  };
  /** The page shown takes the step first when it has one of its own (a panel, a player's details, a keeper's choice);
   *  either way the hold under way is let go, so a step back never buys what was being held. */
  const stepOnce = () => {
    holds.letGo();
    if (inspecting === null && view === 'social' && roster?.back()) return play('back');
    back();
  };
  const nameAgain = () =>
    void link?.session().then((found) => {
      account = found;
      named = found?.username ?? null;
    });
  nameAgain();
  addEventListener(ACCOUNT_CHANGED, nameAgain);

  /** A page that needs no gear: a page to come, the Ship, Social or Settings. */
  const plainPage = (shown: View, plain: PlainContext): Node => {
    const later = isTab(shown) ? TAB_PRESSES[shown].later : undefined;
    if (later !== undefined) return laterPage(TAB_PRESSES[shown as Tab].label, later);
    if (shown === 'ship') return shipPage(ship(), plain.sizes);
    if (shown === 'social') return socialPage(plain, link ? (roster ??= new RosterPage({ link, travel })) : null);
    return settingsPage(plain, link ? (accountPanel ??= new AccountPanel(link)) : null);
  };

  /** The figure, drawn once a dress, for the Character page and the account's mark. */
  const figureOf = (now: GearHere | null): Picture | null => {
    const dress = now?.dress ?? null;
    const key = dress ? JSON.stringify(dress) : '';
    if (now?.forge && dress && key !== figure.key) {
      figure = { key, picture: null };
      void now.forge
        .picture(dress, 'idle', 0)
        .catch(() => null)
        .then((picture) => {
          if (figure.key === key) figure.picture = picture;
          redraw();
        });
    }
    return figure.picture;
  };

  /** The menu this frame: the scrim and the window, its page, its footer, and the hover card. */
  const menu = (frame: Interface, shown: View, layer: { width: number; height: number }): Child[] => {
    const sizes = sizesOf(layer.width, layer.height, uiScale(devicePixelRatio));
    const now = here();
    const gear = now?.gear ?? null;
    const station = isTab(shown) ? null : KEEPERS[shown].title;
    figureOf(now);
    if (now?.forge) picturesOf(now.forge);
    // The room's word has come, so no ask of the Art's screen waits any more.
    if (gear && gear !== bannerGear) artPending = null;
    bannerGear = gear ?? bannerGear;
    // Tabs, their arrows, and the presses of the frame.
    for (const tab of TABS) {
      const id = tabId(tab);
      if (frame.clicked(id) && view !== tab) open(tab);
      for (const key of frame.keysOn(id)) {
        const next = TABS[(TABS.indexOf(tab) + (key === 'arrowright' ? 1 : -1) + TABS.length) % TABS.length];
        if (next) open(next);
      }
    }
    if (view !== shown) return [];
    if (frame.clicked('press-close')) shut();
    if (frame.clicked('press-step')) stepOnce();
    if (view !== shown) return [];
    const body = frame.boxOf('gear-body');
    // The Art's and the Appearance screens stand to the body's edges; every other page inside its padding.
    const bleed = shown === 'character' && (appearance || (arts && Boolean(now?.gear?.arts))) && inspecting === null;
    const [aroundX, aroundY] = bleed ? [0, 0] : [40, 24];
    const room = {
      width: Math.max(0, (body?.width ?? 0) - aroundX),
      height: Math.max(0, (body?.height ?? 0) - aroundY),
    };
    let card: { beside: string; content: () => Node } | null = null;
    details = new Map();
    const dress = now?.dress ?? null;
    const picture = (item: GearItem) => (pictures && dress ? pictures.pictureOf(item, dress, redraw) : null);
    // Without gear, a station or the gear's pages say why; the plain pages need none.
    let page: Node | null = null;
    let item: ReturnType<typeof itemPage> | null = null;
    let aside: readonly Hint[] | null = null;
    let answer = '';
    let colour: string = INK.answer;
    if (!ofGear(shown)) page = plainPage(shown, { ui: frame, room, sizes, holds });
    else if (!now || !gear) {
      // A room lost after the gear showed says so; with none yet, where gear is kept.
      const lost = bannerGear !== null ? 'The room was lost. Your gear shows again once you are back in one.' : null;
      const why = now ? 'Loading…' : (lost ?? 'Your gear shows here on foot, when playing online.');
      page = {
        width: 'grow',
        alignX: 'center',
        padding: [48, 0],
        children: [{ maxWidth: 420, text: { words: why, size: sizes.name, colour: INK.faint, align: 'center' } }],
      };
    } else {
      const opened = gear.items.find((each) => each.id === gear.identified);
      const fresh = gear.answered !== heard;
      // A refusal is heard once, when it comes.
      if (fresh && gear.answer !== 0 && gear.answered !== refusedAt) play('refused');
      if (fresh) refusedAt = gear.answered;
      answer = !fresh ? '' : opened ? `The Vestige opened: ${itemName(opened)}.` : answerText(gear.answer);
      colour = opened ? (RARITIES[opened.rarity]?.colour ?? INK.answer) : INK.answer;
      const context: MenuContext = {
        ui: frame,
        gear,
        ask: (asked) => now.ask(asked),
        picture,
        figure: figure.picture,
        room,
        sizes,
        holds,
        card: (id, content, beside = id) => {
          if (frame.hovered(id) || (frame.focused(id) && frame.keyFocused)) card = { beside, content };
        },
        inspect: (inspected) => {
          inspecting = inspected.id;
          // The page is read from its name; once it closes, the focus goes back to the tile it was asked from.
          [returnTo, focusNext] = [frame.focusedId ?? `item-${inspected.id}`, ITEM_NAME];
        },
        details: (id, detailed) => details.set(id, detailed),
        atVault: shown === 'vault',
        forge: now.forge ?? null,
        dress,
        ...(gear.arts && {
          arts: () => {
            [arts, artSlot, slot] = [true, null, null];
            // The screen is read from its Anima.
            const worn = artOf(gear.arts?.art ?? 0);
            focusNext = worn ? spellKey(worn.anima) : null;
          },
        }),
        appearance: () => ((appearance = true), (slot = null)),
      };
      // Under an item's page the menu's own page is not laid, so neither the pointer nor the keys reach it.
      const inspected = gear.items.find((each) => each.id === inspecting);
      if (!inspected) inspecting = null;
      if (inspected) page = null;
      else if (shown === 'character' && arts && gear.arts) {
        page = artsPage(context, {
          open: artSlot,
          choose: (chosen) => (artSlot = chosen),
          pending: artPending,
          ask: (asked) => {
            if (asked.kind === 'setCore') artPending = asked.slot;
            now.ask(gearAskOf(asked));
          },
          focus: (id) => (focusNext = id),
        });
        aside = ARTS_HINTS;
      } else if (shown === 'character' && appearance) {
        page = appearancePage(context);
        aside = APPEARANCE_HINTS;
      } else if (shown === 'character') page = characterPage(context, slot, (chosen) => (slot = chosen));
      else if (shown === 'inventory') page = inventoryPage(context, shelf, (chosen) => (shelf = chosen));
      else if (isKeeperView(shown)) {
        page = npcPage(context, shown);
        if (npcChoosing()) aside = npcHints(shown);
      }
      item = inspected ? itemPage(context, inspected, back) : null;
    }
    if (answer !== said && answer) announce(answer);
    said = answer;
    // A Vestige opens with a click only at the Mage's counter, so the footer offers it only there.
    const opens: readonly Hint[] =
      gear?.atMage && gear.vestiges.some((each) => !each.vaulted) ? [['Click', 'Open a Vestige']] : [];
    const hints = !ofGear(shown)
      ? (HINTS[shown] ?? [])
      : !gear
        ? []
        : item
          ? HINTS.item
          : (aside ??
            (shown === 'inventory'
              ? [...opens, ...(SHELF_HINTS[shelf] ?? [])]
              : (HINTS[shown] ?? npcHints(shown) ?? [])));
    const actions: Child[] = item
      ? [...item.presses]
      : [
          slot !== null || aside
            ? pressNode('press-step', 'Back', 'button', 'Esc', sizes.label)
            : pressNode('press-close', 'Close', 'button', 'Esc', sizes.label),
        ];
    const head: Child[] = [
      topNode(
        station
          ? { width: 'grow', children: [words(station, 2, INK.word)] }
          : tabsNode(frame, shown, (frame.boxOf('gear-top')?.width ?? layer.width - 64) - 36 - 60, layer, sizes.label),
        accountMark(frame, account, figure.picture, () => open('settings'), sizes.ratio),
      ),
      // On a short screen an item's page takes the banner's height back for its nodes.
      (named !== null || bannerGear !== null) &&
        !(item && sizes.short) &&
        bannerNode(frame, emblemOf(bannerGear?.emblem ?? 0), named, bannerGear, gear, shown !== 'inventory', sizes),
    ];
    const bodyNode: Node = {
      id: 'gear-body',
      width: 'grow',
      height: 'grow',
      // A column, as only a column's children scroll up and down in it. The Art's screen and a keeper's are laid to
      // the body's height, a keeper's rows scrolling in it; the rest scroll.
      direction: 'column',
      scroll: item === null && !(bleed && !appearance) && !isKeeperView(shown),
      padding: bleed ? 0 : [10, 20, 14, 20],
      children: [page, item?.page],
    };
    const screen = screenNode(
      frame,
      layer,
      head,
      bodyNode,
      footerNode(answer, colour, hints ?? [], actions, sizes),
      motionReduced(),
    );
    const shownCard: { beside: string; content: () => Node } | null = card;
    return [...screen, shownCard && cardFloat(frame, shownCard, sizes.card, layer)];
  };

  /** The layer: the company, the menu while it is open, what the player gains, and where holds acted. */
  const layer: Layer = (frame) => {
    ui = frame;
    holds.frame(frame);
    const box = frame.boxOf(LAYER) ?? { width: innerWidth, height: innerHeight };
    if (focusNext && view !== null && frame.boxOf(focusNext)) [focusNext] = [null, frame.focusOn(focusNext)];
    // The company stands under the fight's vitals while they show, as game.ts marks them.
    const fighting = root.dataset['fight'] !== undefined;
    const sizes = sizesOf(box.width, box.height, uiScale(devicePixelRatio));
    const shown = view;
    const children: Child[] = [
      company.node(fighting),
      ...(shown !== null ? menu(frame, shown, box) : []),
      feed.node(sizes, box, view !== null),
      ...holds.burstNodes(),
    ];
    holds.end();
    return { id: LAYER, width: 'grow', height: 'grow', children };
  };

  addEventListener(OPEN_AT, (event) => {
    if (resting()) return;
    const { view: wanted, shelf: onShelf } = (event as CustomEvent<Opening>).detail;
    if (view !== wanted || onShelf !== undefined) open(wanted, onShelf);
  });
  addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toLowerCase();
      const typing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        Boolean(view !== null && ui?.typing);
      const opens = !typing && !resting() && (key === 'i' || key === 'o');
      if (!opens && view === null) return;
      // While the menu is open, a key meant for nothing on it never reaches the game; the drawn menu has heard it.
      if (view !== null) event.stopPropagation();
      if (key === 'escape') {
        event.preventDefault();
        stepOnce();
      } else if (key === 'x' && !typing) {
        // X shows the focused piece's details, as a right press does.
        const shown = ui?.focusedId ? details.get(ui.focusedId) : undefined;
        if (!shown) return;
        event.preventDefault();
        inspecting = shown.id;
        [returnTo, focusNext] = [ui?.focusedId ?? null, ITEM_NAME];
      } else if (opens && !event.repeat) {
        event.preventDefault();
        open(key === 'i' ? 'character' : 'inventory');
      } else if (key === 'tab') {
        // Tab walks the drawn menu, which has heard it, and never the page's elements behind it.
        event.preventDefault();
      } else if (!typing) {
        const chord = event.ctrlKey || event.metaKey || event.altKey;
        if (holds.key(event.key, true, event.repeat, chord)) event.preventDefault();
      }
    },
    { capture: true },
  );
  addEventListener('keyup', (event) => holds.key(event.key, false), true);
  // A window left mid-hold never hears its keys let go there, so leaving it lets go.
  addEventListener('blur', () => holds.blur());
  document.addEventListener('visibilitychange', () => holds.blur());
  return layer;
}

/** The hover card beside what it describes, kept on the screen and above the footer, whose keys stay readable. */
function cardFloat(
  ui: Interface,
  card: { readonly beside: string; readonly content: () => Node },
  width: number,
  view: { readonly width: number; readonly height: number },
): Node | null {
  const near = ui.boxOf(card.beside);
  if (!near) return null;
  const gap = 10;
  const height = ui.boxOf('gear-card')?.height ?? 0;
  const right = near.x + near.width + gap;
  const left = right + width + gap > view.width ? near.x - gap - width : right;
  const floor = ui.boxOf('gear-foot')?.y ?? view.height;
  const top = Math.min(Math.max(gap, near.y), floor - height - gap);
  return {
    id: 'gear-card',
    // Measured once laid, it shows from the next frame, where it fits.
    opacity: height > 0 ? 1 : 0,
    float: { to: 'screen', x: Math.max(gap, left), y: Math.max(gap, top), z: 40 },
    children: [card.content()],
  };
}

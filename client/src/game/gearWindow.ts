import { button, make } from '../editor/dom.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearState } from '../network/gearMessages.ts';
import { RARITIES, answerText, itemName } from '../player/gear.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import { accountPanel } from './accountTab.ts';
import {
  type GearHere,
  type Press,
  type Tile,
  characterOf,
  inventoryOf,
  itemDetailOf,
  slotChoices,
  vendorsOf,
} from './gearScreen.ts';

type Tab = 'character' | 'inventory' | 'vendors' | 'account';

/** Each tab: its name and the key that opens it. */
const TABS: readonly (readonly [Tab, string, string])[] = [
  ['character', 'Character', 'I'],
  ['inventory', 'Inventory', 'O'],
  ['vendors', 'Vendors', ''],
  ['account', 'Account', ''],
];
/** How long a held press is held before it asks, in milliseconds: a Fruit of Dagon is eaten, not tapped. */
const HOLD_MS = 800;
/** How often the window looks for new gear while open, in milliseconds. */
const LOOK_MS = 100;

function pressOf(text: string, run: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = button(text, run);
  node.classList.add(ROLES[role]);
  return node;
}

/** A press that asks only once held down for a moment. */
function heldPress(text: string, held: () => void): HTMLButtonElement {
  const node = pressOf(text, () => undefined);
  let timer = 0;
  const cancel = () => window.clearTimeout(timer);
  node.addEventListener('pointerdown', () => {
    cancel();
    timer = window.setTimeout(held, HOLD_MS);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(event, cancel);
  return node;
}

/** An item's tile: its name in its rarity's colour over its main number; or an empty slot's. */
function tileNode(tile: Tile | null, label: string, run: () => void): HTMLButtonElement {
  const node = pressOf('', run, 'tile');
  node.classList.add('gear-tile');
  const name = make('span', tile?.name ?? 'Empty', 'gear-tile-name');
  if (tile) name.style.color = tile.colour;
  node.append(make('span', label, 'gear-tile-label'), name, make('span', tile?.power ?? '', 'gear-tile-power'));
  return node;
}

/** A meter sunk into the window, filled to `share` of its width. */
function meter(share: number, words: string): HTMLElement {
  const well = make('div', '', `gear-meter ${ROLES.well}`);
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(share * 100)}%`;
  well.append(fill);
  const box = make('div', '', 'gear-meter-box');
  box.append(well, make('div', words, 'gear-hint'));
  return box;
}

const rows = (pairs: readonly (readonly [string, string])[]): HTMLElement[] =>
  pairs.map(([label, value]) => {
    const row = make('div', '', 'gear-row');
    row.append(make('span', label, 'gear-label'), make('span', value, 'gear-value'));
    return row;
  });

const heading = (text: string) => make('div', text, `gear-heading ${ROLES.rule}`);

/**
 * The gear window, in the Enhanced Plus kit: Character (I), Inventory (O), Vendors and Account. While it is open the pointer is
 * free and the game's keys rest; Escape closes it. It shows the player's gear as their room last sent it, and each
 * press asks the room, whose answer comes back with their gear. Where no room keeps gear it says so.
 */
export function startGearWindow(root: HTMLElement, link: AccountLink | null, here: () => GearHere | null): void {
  const box = make('div', '', `gear-window ${ROLES.window}`);
  box.hidden = true;
  const tabRow = make('div', '', `gear-tabs ${ROLES.header}`);
  const answer = make('div', '', 'gear-answer');
  const body = make('div', '', 'gear-body');
  const footer = make('div', '', `gear-footer ${ROLES.footer}`);
  box.append(tabRow, answer, body, footer);
  root.append(box);
  let tab: Tab | null = null;
  let slot: number | null = null;
  let item: number | null = null;
  let shownGear: GearState | null | undefined;
  let shownUi = '';
  let pressing = false;
  let account: HTMLElement | null = null;

  const close = () => {
    tab = null;
    box.hidden = true;
  };
  const open = (wanted: Tab) => {
    if (tab === wanted) return close();
    [tab, slot, item, account] = [wanted, null, null, null];
    box.hidden = false;
    document.exitPointerLock();
    render();
  };
  const tabs = TABS.map(([name, label, key]) => {
    const node = pressOf(key ? `${label}  ${key}` : label, () => open(name));
    node.dataset['tab'] = name;
    return node;
  });
  tabRow.append(...tabs);
  footer.append(pressOf('Close  Esc', close));

  const presses = (all: readonly Press[], ask: GearHere['ask']): HTMLElement => {
    const row = make('div', '', 'gear-presses');
    for (const press of all) {
      const run = () => ask(press.ask);
      row.append(press.held ? heldPress(press.label, run) : pressOf(press.label, run, press.role));
    }
    return row;
  };

  const itemView = (gear: GearState, ask: GearHere['ask']): HTMLElement[] => {
    const found = gear.items.find((each) => each.id === item);
    if (!found) {
      item = null;
      return [];
    }
    const detail = itemDetailOf(found, gear);
    const name = make('div', detail.name, 'gear-item-name');
    name.style.color = detail.colour;
    const columns = make('div', '', 'gear-columns');
    for (const column of detail.columns) {
      const stack = make('div', '', `gear-column ${ROLES.panel}`);
      stack.append(make('div', column.heading, 'gear-hint'));
      for (const node of column.nodes) {
        const pressed = pressOf(node.label, () => node.ask && ask(node.ask), node.chosen ? 'primary' : 'tile');
        pressed.disabled = node.ask === null;
        pressed.title = `${node.words} ${node.cost}`;
        stack.append(pressed);
      }
      columns.append(stack);
    }
    return [
      pressOf('◂ Back', () => (item = null)),
      name,
      make('div', detail.kind, 'gear-hint'),
      ...rows(detail.numbers),
      ...(detail.xpWords ? [meter(detail.xp, detail.xpWords)] : []),
      ...(detail.words ? [make('p', detail.words, 'gear-words')] : []),
      ...(detail.columns.length > 0 ? [heading('Nodes'), columns] : []),
      presses(detail.presses, ask),
    ];
  };

  const characterView = (gear: GearState): HTMLElement[] => {
    const character = characterOf(gear);
    const slotTile = (index: number) => {
      const shown = character.slots[index];
      const node = tileNode(shown?.worn ?? null, shown?.name ?? '', () => (slot = slot === index ? null : index));
      if (slot === index) node.classList.add('gear-chosen');
      return node;
    };
    const [weapons, armour, summary] = [make('div', '', 'gear-side'), make('div', '', 'gear-side'), make('div')];
    weapons.append(heading('Weapons'), slotTile(0), slotTile(1), heading('Cloak'), slotTile(6));
    armour.append(heading('Armour'), slotTile(2), slotTile(3), slotTile(4), slotTile(5));
    summary.className = 'gear-summary';
    const attack = character.attack.map((value) => (value === null ? '—' : String(value))).join(' · ');
    summary.append(
      make('div', `Level ${character.level}`, `gear-level ${ROLES.chip}`),
      meter(character.toNext, character.toNextWords),
      ...rows([
        ['Prestige', String(character.prestige)],
        ['Defense', String(character.defense)],
        ['Attack, each hand', attack],
        ['Fruit of Dagon', String(character.fruit)],
      ]),
      ...(character.fruitGrown === null ? [] : [meter(character.fruitGrown, 'The next Fruit of Dagon grows')]),
    );
    const grid = make('div', '', 'gear-character');
    grid.append(weapons, summary, armour);
    if (slot === null) return [grid];
    const choices = slotChoices(gear, slot);
    const list = make('div', '', 'gear-list');
    const pick = (tile: Tile | null, label: string) => tileNode(tile, label, () => tile && (item = tile.id));
    list.append(pick(choices.worn, 'Worn'), ...choices.carried.map((tile) => pick(tile, 'Carried')));
    const name = character.slots[slot]?.name ?? '';
    return [grid, heading(`${name}: worn and carried (${choices.carried.length} of 9)`), list];
  };

  const inventoryView = (gear: GearState, ask: GearHere['ask']): HTMLElement[] => {
    const inventory = inventoryOf(gear);
    const vestige = (shown: (typeof inventory.vestiges)[number]) => {
      const row = make('div', '', 'gear-row');
      const label = make('span', shown.label);
      label.style.color = shown.colour;
      row.append(label, presses(shown.presses, ask));
      return row;
    };
    const vault = inventory.social
      ? [
          heading(`The vault (${inventory.vaulted.length} items)`),
          ...inventory.vaulted.map((tile) => tileNode(tile, 'In the vault', () => (item = tile.id))),
          ...inventory.vaultedVestiges.map(vestige),
        ]
      : [make('p', 'Vestiges open, and the vault is kept, in a social space.', 'gear-hint')];
    const lying = inventory.lying > 0 ? ` · ${inventory.lying} lying for you` : '';
    return [
      heading('Materials'),
      ...rows(inventory.materials),
      heading(`Vestiges (${inventory.vestiges.length} of 10${lying})`),
      ...inventory.vestiges.map(vestige),
      ...vault,
    ];
  };

  const vendorsView = (gear: GearState, ask: GearHere['ask']): HTMLElement[] => {
    if (!gear.social) return [make('p', 'The vendors keep their stalls in a social space’s arcades.', 'gear-hint')];
    return vendorsOf(gear).flatMap((vendor) => [
      heading(vendor.name),
      ...vendor.wares.map((ware) => {
        const row = make('div', '', 'gear-row');
        const tile = tileNode(ware.tile, `${ware.kind} · level ${ware.level}`, () => undefined);
        const buy = pressOf(ware.press.label, () => ask(ware.press.ask), ware.press.role);
        buy.disabled = !ware.affordable;
        row.append(tile, buy);
        return row;
      }),
    ]);
  };

  function render(): void {
    if (tab === null) return;
    for (const node of tabs) node.classList.toggle(ROLES.primary, node.dataset['tab'] === tab);
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
    const ui = JSON.stringify([tab, slot, item]);
    if (pressing || (gear === shownGear && ui === shownUi)) return;
    [shownGear, shownUi] = [gear, ui];
    if (!now || !gear) {
      answer.textContent = '';
      const why = now ? 'Waiting for the room…' : 'Gear is kept by the rooms: it shows on foot in a room.';
      body.replaceChildren(make('p', why, 'gear-hint'));
      return;
    }
    const opened = gear.items.find((each) => each.id === gear.identified);
    answer.textContent = opened ? `The Vestige opened: ${itemName(opened)}.` : answerText(gear.answer);
    answer.style.color = opened ? (RARITIES[opened.rarity]?.colour ?? '') : '';
    const ask = (asked: Parameters<GearHere['ask']>[0]) => now.ask(asked);
    const itemNodes = item === null ? [] : itemView(gear, ask);
    const tabNodes = () =>
      tab === 'character' ? characterView(gear) : tab === 'vendors' ? vendorsView(gear, ask) : inventoryView(gear, ask);
    body.replaceChildren(...(itemNodes.length > 0 ? itemNodes : tabNodes()));
  }

  // A press is never lost to a new build under it: none is made while one is held down.
  box.addEventListener('pointerdown', () => (pressing = true));
  addEventListener('pointerup', () => {
    pressing = false;
    // A press that chose a slot or an item, or went back, builds the window at once.
    window.setTimeout(render, 0);
  });
  // Typing in the window's fields reaches no game key.
  box.addEventListener('keydown', (event) => event.stopPropagation());
  addEventListener(
    'keydown',
    (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      const opens = key === 'i' || key === 'o';
      if (!opens && tab === null) return;
      // While the window is open, the game's own keys rest.
      event.stopPropagation();
      if (!opens && key !== 'escape') return;
      event.preventDefault();
      if (key === 'escape') close();
      else if (!event.repeat) open(key === 'i' ? 'character' : 'inventory');
    },
    { capture: true },
  );
  window.setInterval(render, LOOK_MS);
}

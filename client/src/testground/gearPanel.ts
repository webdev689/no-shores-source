import { button, make } from '../editor/dom.ts';
import { ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
import {
  CARRIED,
  COLUMNS,
  KINDS,
  NAMED,
  RARITIES,
  RESOURCE_COUNT,
  SLOTS,
  STOCK_NAMES,
  VAULTED,
  WORN,
  answerText,
  itemName,
  itemNumbers,
  itemWords,
  kindName,
  nodeShown,
  resourceName,
  wearAsks,
} from '../player/gear.ts';
import { choice, labelled } from './dressPanel.ts';

/** What the gear panel shows: the player's gear as the room last sent it, whether they stand at the stall, and the
 *  course's resource nodes within their reach and not yet spent. */
export interface GearView {
  readonly gear: GearState | null;
  readonly atStall: boolean;
  readonly nodesInReach: readonly { readonly node: number; readonly resource: number }[];
}

/** How long a Fruit of Dagon is held before it is eaten, in milliseconds. */
const HOLD_MS = 800;

/** An item's name in its rarity's colour. */
function named(item: GearItem): HTMLElement {
  const name = make('span', itemName(item));
  name.style.color = RARITIES[item.rarity]?.colour ?? '';
  name.title = itemWords(item);
  return name;
}

/** A column's node: bought, chosen, unlocked or locked, and what it costs. */
function nodeButton(item: GearItem, column: number, node: number, ask: (ask: GearAsk) => void): HTMLElement {
  const shown = nodeShown(item, column, node);
  if (!shown) return make('span');
  const pressed = button(shown.label, () => {
    if (shown.ask) ask(shown.ask);
  });
  if (shown.chosen) pressed.classList.add('active');
  pressed.disabled = !shown.unlocked || (shown.bought && shown.ask === null && shown.chosen);
  pressed.title = `${shown.words} ${shown.cost}`;
  return pressed;
}

/** A button that asks only once held down for a moment. */
function holdButton(label: string, held: () => void): HTMLElement {
  const pressed = button(label, () => undefined);
  let timer = 0;
  const cancel = () => window.clearTimeout(timer);
  pressed.addEventListener('pointerdown', () => {
    cancel();
    timer = window.setTimeout(held, HOLD_MS);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) pressed.addEventListener(event, cancel);
  return pressed;
}

/** The Test Ground's gear panel: the player's level, Prestige and materials, what they wear and carry with each item's
 *  nodes, their Vestiges and vault, the stall and resource nodes within reach, and gear handed out to try the loop. */
export function startGearPanel(root: HTMLElement, ask: (ask: GearAsk) => void): (view: GearView) => void {
  let shown = '';
  let open: number | null = null;
  const grant = { slot: 0, kind: 2, rarity: 0, level: 1, named: NAMED[0]?.id ?? '' };
  const answer = make('p', '', 'status');
  const body = make('div');
  root.append(make('h1', 'Gear'), answer, body);

  const itemRow = (item: GearItem, gear: GearState, view: GearView): HTMLElement => {
    const row = make('div', '', 'row');
    const actions: HTMLElement[] = [];
    if (item.at >= WORN) actions.push(button('Take off', () => ask({ kind: ASKS.takeOff, slot: item.at - WORN })));
    if (item.at === CARRIED) {
      for (const wear of wearAsks(item)) actions.push(button(wear.label, () => ask(wear.ask)));
      actions.push(button('Dismantle', () => ask({ kind: ASKS.dismantle, item: item.id })));
      if (view.atStall || gear.atReader) actions.push(button('Vault', () => ask({ kind: ASKS.store, item: item.id })));
    }
    if (item.at === VAULTED) actions.push(button('Take out', () => ask({ kind: ASKS.withdraw, item: item.id })));
    if (item.columns.length > 0)
      actions.push(
        button(open === item.id ? 'Nodes ▾' : 'Nodes ▸', () => {
          open = open === item.id ? null : item.id;
          shown = '';
        }),
      );
    row.append(...actions);
    const card = make('div', '', 'kit-item');
    card.append(named(item), make('div', itemNumbers(item), 'hint'), row);
    if (open !== item.id) return card;
    const grid = make('div', '', 'gear');
    item.columns.forEach((column, index) => {
      const nodes = Math.max(1, column.traits.length);
      const heading = `${COLUMNS[column.kind] ?? ''} · ${column.xp.toLocaleString()} XP`;
      grid.append(
        make('div', heading, 'hint'),
        ...Array.from({ length: nodes }, (unused, node) => nodeButton(item, index, node, ask)),
      );
    });
    grid.append(holdButton('Hold to feed a Fruit of Dagon', () => ask({ kind: ASKS.feed, item: item.id })));
    card.append(grid);
    return card;
  };

  const grants = (): HTMLElement[] => {
    const level = make('input');
    Object.assign(level, { type: 'number', min: '1', max: '20', value: String(grant.level) });
    level.addEventListener('change', () => {
      grant.level = Math.min(20, Math.max(1, Number(level.value) || 1));
    });
    const slots = SLOTS.slice(0, 6).map((slot, index) => [String(index), slot] as const);
    const kinds = KINDS.map((kind, index) => [String(index), kindName(index)] as const).filter(
      ([number, name]) => name && number !== String(KINDS.indexOf('cloak')),
    );
    const lesser = RARITIES.slice(0, 3).map((rarity, index) => [String(index), rarity.name] as const);
    return [
      make('h2', 'Hand out'),
      labelled('Level', level),
      labelled(
        'Slot',
        choice(slots, String(grant.slot), (value) => (grant.slot = Number(value))),
      ),
      ...RARITIES.map((rarity, index) =>
        button(`${rarity.name} Vestige`, () =>
          ask({ kind: ASKS.grantVestige, rarity: index, slot: grant.slot, level: grant.level }),
        ),
      ),
      labelled(
        'Kind',
        choice(kinds, String(grant.kind), (value) => (grant.kind = Number(value))),
      ),
      labelled(
        'Rarity',
        choice(lesser, String(grant.rarity), (value) => (grant.rarity = Number(value))),
      ),
      button('Hand out that item', () =>
        ask({ kind: ASKS.grantItem, itemKind: grant.kind, rarity: grant.rarity, level: grant.level }),
      ),
      labelled(
        'Named',
        choice(
          NAMED.map((each) => [each.id, `${each.name} (${each.rarity})`] as const),
          grant.named,
          (value) => (grant.named = value),
        ),
      ),
      button('Hand out the named item', () => ask({ kind: ASKS.grantNamed, named: grant.named })),
      button('50 of every material', () => ask({ kind: ASKS.grantMaterials, count: 50 })),
      button('10,000 XP', () => ask({ kind: ASKS.grantXp, count: 10_000 })),
      button('XP to level 20', () => ask({ kind: ASKS.grantXp, count: 190_000 })),
    ];
  };

  return (view: GearView) => {
    const { gear } = view;
    const key = JSON.stringify([
      gear?.answered,
      gear?.items.length,
      gear?.drops.length,
      view.atStall,
      view.nodesInReach,
    ]);
    if (key === shown && gear) return;
    shown = key;
    if (!gear) {
      body.replaceChildren(make('p', 'Waiting for the room…', 'hint'));
      return;
    }
    answer.textContent = answerText(gear.answer);
    const opened = gear.items.find((item) => item.id === gear.identified);
    const level = `Level ${gear.level} · Prestige ${gear.prestige} · Defense ${gear.defense} · XP ${gear.xp.toLocaleString()}`;
    const stocks = STOCK_NAMES.map((name, index) => `${name} ${gear.stocks[index] ?? 0}`);
    const islands = Array.from({ length: RESOURCE_COUNT }, (unused, index) => index)
      .filter((index) => (gear.resources[index] ?? 0) > 0)
      .map((index) => `${resourceName(index)} ${gear.resources[index] ?? 0}`);
    const wornItems = SLOTS.map((unused, slot) => gear.items.find((item) => item.at === WORN + slot)).filter(
      (item): item is GearItem => item !== undefined,
    );
    const carried = gear.items.filter((item) => item.at === CARRIED).sort((one, two) => one.bucket - two.bucket);
    const vaulted = gear.items.filter((item) => item.at === VAULTED);
    const vestiges = gear.vestiges.map((vestige) => {
      const row = make('div', '', 'row');
      const name = make(
        'span',
        `${RARITIES[vestige.rarity]?.name ?? ''} Vestige: ${SLOTS[vestige.slot] ?? ''}, level ${vestige.level}`,
      );
      name.style.color = RARITIES[vestige.rarity]?.colour ?? '';
      row.append(name);
      if (vestige.vaulted) row.append(button('Take out', () => ask({ kind: ASKS.withdrawVestige, item: vestige.id })));
      else {
        row.append(button('Identify', () => ask({ kind: ASKS.identify, item: vestige.id })));
        if (view.atStall || gear.atReader)
          row.append(button('Vault', () => ask({ kind: ASKS.storeVestige, item: vestige.id })));
      }
      return row;
    });
    const nodes = view.nodesInReach.map(({ node, resource }) =>
      button(`Gather ${resourceName(resource)}`, () => ask({ kind: ASKS.gather, node })),
    );
    body.replaceChildren(
      make('p', level),
      make('p', `${gear.aurem.toLocaleString()} Aurem · ${stocks.join(' · ')}`, 'hint'),
      ...(islands.length > 0 ? [make('p', islands.join(' · '), 'hint')] : []),
      ...(opened && opened.at === CARRIED ? [make('p', `The Vestige opened: ${itemName(opened)}.`)] : []),
      make(
        'p',
        view.atStall || gear.atReader
          ? 'At the stall: Vestiges open, and the vault is here.'
          : 'The stall is south-east of the start.',
        'hint',
      ),
      ...nodes,
      make('h2', 'Worn'),
      ...wornItems.map((item) => itemRow(item, gear, view)),
      make('h2', `Carried`),
      ...carried.map((item) => itemRow(item, gear, view)),
      make('h2', `Vestiges${gear.drops.length > 0 ? ` (${gear.drops.length} lying for you)` : ''}`),
      ...vestiges,
      ...(vaulted.length > 0 ? [make('h2', 'In the vault'), ...vaulted.map((item) => itemRow(item, gear, view))] : []),
      ...grants(),
    );
  };
}

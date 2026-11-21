import { AMMO_FULL, ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
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
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { LOOK, field, presses, heading, hint, labelled, line, numberIn, pick, press, title } from './panelKit.ts';

/** What the gear panel shows: the player's gear as the room last sent it, whether they stand at the stall, and the
 *  course's resource nodes within their reach and not yet spent. */
export interface GearView {
  readonly gear: GearState | null;
  readonly atStall: boolean;
  readonly nodesInReach: readonly { readonly node: number; readonly resource: number }[];
}

/** How long a Fruit of Dagon is held before it is eaten, in milliseconds. */
const HOLD_MS = 800;

/** Words shown under `id` while the pointer is over it or the keys' focus is on it, as a page's `title` shows. */
function tip(ui: Interface, id: string, words: string): Node | false {
  return (
    (ui.hovered(id) || (ui.keyFocused && ui.focused(id))) && {
      float: { at: [0, 1], y: 2, z: 20 },
      fill: '#000000',
      outline: { width: 1, colour: LOOK.pressLine },
      padding: [3, 5],
      maxWidth: 260,
      children: [{ text: { words } }],
    }
  );
}

/** An item's name in its rarity's colour, its words shown over it. */
function named(ui: Interface, id: string, item: GearItem): Node {
  const words = itemWords(item);
  return {
    id,
    focusable: true,
    label: `${itemName(item)}: ${words}`,
    children: [
      { text: { words: itemName(item), colour: RARITIES[item.rarity]?.colour ?? LOOK.words } },
      tip(ui, id, words),
    ],
  };
}

/** A small triangle, pointing right; turned down for what is open. */
const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6"><path d="M1 0 6 3 1 6Z" fill="#e8e8e8"/></svg>`;

/** The press that opens an item's nodes, its words followed by an arrow, right while shut and down while open (the
 *  face draws no ▸ or ▾). */
function opener(made: Node, open: boolean): Node {
  return {
    ...made,
    label: `Nodes: ${open ? 'open' : 'shut'}`,
    gap: 4,
    alignY: 'center',
    children: [
      ...(made.children ?? []),
      { width: 6, height: 6, picture: { key: 'tg:arrow', source: { svg: ARROW }, turn: open ? 90 : 0 } },
    ],
  };
}

/** A column's node: bought, chosen, unlocked or locked, and what it costs. */
function nodeButton(ui: Interface, item: GearItem, column: number, node: number, ask: (ask: GearAsk) => void): Node {
  const shown = nodeShown(item, column, node);
  if (!shown) return {};
  const id = `tg:gear:${item.id}:node:${column}:${node}`;
  const made = press(ui, id, shown.label, () => shown.ask && ask(shown.ask), {
    active: shown.chosen,
    disabled: !shown.unlocked || (shown.bought && shown.ask === null && shown.chosen),
  });
  return {
    children: [
      { ...made, label: `${shown.label}: ${shown.words} ${shown.cost}` },
      tip(ui, id, `${shown.words} ${shown.cost}`),
    ],
  };
}

/** What the player holds besides their gear, as the inventory shows it: Aurem, the one currency, then each stack they
 *  hold any of. */
export function heldLine(gear: Pick<GearState, 'aurem' | 'stocks' | 'resources'>): string {
  const stacks = [
    ...STOCK_NAMES.map((name, index) => [name, gear.stocks[index] ?? 0] as const),
    ...Array.from(
      { length: RESOURCE_COUNT },
      (unused, index) => [resourceName(index), gear.resources[index] ?? 0] as const,
    ),
  ];
  const held = stacks.filter(([, count]) => count > 0).map(([name, count]) => `${name} ${count}`);
  return [`${gear.aurem.toLocaleString()} Aurem`, ...held].join(' · ');
}

/** The ammunition and Ammo crates held: the shots left in the Ranged loadout worn, or with none worn the share of a
 *  full load kept for one, so a grant of ammunition shows either way. */
export function ammoLine(gear: Pick<GearState, 'ammo' | 'ammoMost' | 'ammoShare' | 'crates'>): string {
  const ammo = gear.ammoMost
    ? `Ammo ${gear.ammo ?? 0} of ${gear.ammoMost}`
    : `No Ranged weapon worn: its ammo at ${Math.round((gear.ammoShare ?? 0) * 100)}%`;
  return `${ammo} · ${gear.crates ?? 0} Ammo crates`;
}

/** The Test Ground's gear panel: the player's level, Prestige and materials, what they wear and carry with each item's
 *  nodes, their Vestiges and vault, the stall and resource nodes within reach, and gear handed out to try the loop. */
export class GearPanel {
  private readonly ask: (ask: GearAsk) => void;
  /** The item whose nodes are open. */
  open: number | null = null;
  private readonly grant = { slot: 0, kind: 2, rarity: 0, named: NAMED[0]?.id ?? '' };
  /** The Fruit of Dagon's press held: which, how long, and whether this hold has fed it. */
  private holding = { id: '', seconds: 0, fed: false };
  private answered = '';

  constructor(ask: (ask: GearAsk) => void) {
    this.ask = ask;
  }

  /** A press that asks only once held down on it for a moment: let go or left, it starts again. */
  private hold(ui: Interface, id: string, words: string, seconds: number, held: () => void): Node {
    if (ui.pressing(id) && ui.hovered(id)) {
      if (this.holding.id !== id) this.holding = { id, seconds: 0, fed: false };
      this.holding.seconds += seconds;
      if (!this.holding.fed && this.holding.seconds * 1000 >= HOLD_MS) {
        this.holding.fed = true;
        held();
      }
    } else if (this.holding.id === id) this.holding = { id: '', seconds: 0, fed: false };
    return press(ui, id, words, () => undefined);
  }

  private itemRow(ui: Interface, item: GearItem, gear: GearState, view: GearView, seconds: number): Node {
    const { ask } = this;
    const id = `tg:gear:${item.id}`;
    const actions: Node[] = [];
    if (item.at >= WORN)
      actions.push(press(ui, `${id}:off`, 'Take off', () => ask({ kind: ASKS.takeOff, slot: item.at - WORN })));
    if (item.at === CARRIED) {
      wearAsks(item).forEach((wear, place) =>
        actions.push(press(ui, `${id}:wear${place}`, wear.label, () => ask(wear.ask))),
      );
      actions.push(press(ui, `${id}:dismantle`, 'Dismantle', () => ask({ kind: ASKS.dismantle, item: item.id })));
      if (view.atStall || gear.atMage)
        actions.push(press(ui, `${id}:vault`, 'Vault', () => ask({ kind: ASKS.store, item: item.id })));
    }
    if (item.at === VAULTED)
      actions.push(press(ui, `${id}:out`, 'Take out', () => ask({ kind: ASKS.withdraw, item: item.id })));
    if (item.columns.length > 0)
      actions.push(
        opener(
          press(ui, `${id}:nodes`, 'Nodes', () => {
            this.open = this.open === item.id ? null : item.id;
          }),
          this.open === item.id,
        ),
      );
    const grid: Node | false = this.open === item.id && {
      id: `${id}:grid`,
      direction: 'column',
      width: 'grow',
      maxHeight: 320,
      scroll: true,
      padding: [2, 6],
      gap: 2,
      outline: { width: 1, colour: LOOK.line },
      children: [
        ...item.columns.flatMap((column, index) => [
          line(`${COLUMNS[column.kind] ?? ''} · ${column.xp.toLocaleString()} XP`, LOOK.dim),
          presses(
            Array.from({ length: Math.max(1, column.traits.length) }, (unused, node) =>
              nodeButton(ui, item, index, node, ask),
            ),
          ),
        ]),
        {
          children: [
            this.hold(ui, `${id}:feed`, 'Hold to feed a Fruit of Dagon', seconds, () =>
              ask({ kind: ASKS.feed, item: item.id }),
            ),
          ],
        },
      ],
    };
    return {
      direction: 'column',
      width: 'grow',
      gap: 2,
      padding: [6, 0, 2, 0],
      children: [
        itemName(item) !== '' && named(ui, `${id}:name`, item),
        line(itemNumbers(item), LOOK.dim),
        { gap: 8, wrap: true, width: 'grow', padding: [2, 0, 4, 0], children: actions },
        grid,
        { width: 'grow', height: 1, fill: LOOK.rule, minHeight: 1 },
      ],
    };
  }

  /** Gear handed out, to try the loop without playing it through. */
  private grants(ui: Interface): Node[] {
    const { ask, grant } = this;
    const level = Math.round(numberIn(ui, 'tg:grant:level', 1, 1, 20, 1));
    const slots = SLOTS.slice(0, 6).map((slot, index) => [String(index), slot] as const);
    const kinds = KINDS.map((kind, index) => [String(index), kindName(index)] as const).filter(
      ([number, name]) => name && number !== String(KINDS.indexOf('cloak')),
    );
    const lesser = RARITIES.slice(0, 3).map((rarity, index) => [String(index), rarity.name] as const);
    return [
      heading('Hand out'),
      labelled('Level', field('tg:grant:level', 'Level', { width: 60 })),
      labelled(
        'Slot',
        pick(ui, 'tg:grant:slot', slots, String(grant.slot), (value) => (grant.slot = Number(value))),
      ),
      presses(
        RARITIES.map((rarity, index) =>
          press(ui, `tg:grant:vestige${index}`, `${rarity.name} Vestige`, () =>
            ask({ kind: ASKS.grantVestige, rarity: index, slot: grant.slot, level }),
          ),
        ),
      ),
      labelled(
        'Kind',
        pick(ui, 'tg:grant:kind', kinds, String(grant.kind), (value) => (grant.kind = Number(value))),
      ),
      labelled(
        'Rarity',
        pick(ui, 'tg:grant:rarity', lesser, String(grant.rarity), (value) => (grant.rarity = Number(value))),
      ),
      presses([
        press(ui, 'tg:grant:item', 'Hand out that item', () =>
          ask({ kind: ASKS.grantItem, itemKind: grant.kind, rarity: grant.rarity, level }),
        ),
      ]),
      labelled(
        'Named',
        pick(
          ui,
          'tg:grant:named',
          NAMED.map((each) => [each.id, `${each.name} (${each.rarity})`] as const),
          grant.named,
          (value) => (grant.named = value),
        ),
      ),
      presses([
        press(ui, 'tg:grant:namedItem', 'Hand out the named item', () =>
          ask({ kind: ASKS.grantNamed, named: grant.named }),
        ),
        press(ui, 'tg:grant:materials', '50 of every material', () => ask({ kind: ASKS.grantMaterials, count: 50 })),
        press(ui, 'tg:grant:xp', '10,000 XP', () => ask({ kind: ASKS.grantXp, count: 10_000 })),
        press(ui, 'tg:grant:xp20', 'XP to level 20', () => ask({ kind: ASKS.grantXp, count: 190_000 })),
        press(ui, 'tg:grant:ammo', 'Full ammo', () => ask({ kind: ASKS.grantAmmo, count: AMMO_FULL })),
        press(ui, 'tg:grant:noAmmo', 'No ammo', () => ask({ kind: ASKS.grantAmmo, count: 0 })),
        press(ui, 'tg:grant:crates', '5 Ammo crates', () => ask({ kind: ASKS.grantCrates, count: 5 })),
        press(ui, 'tg:grant:useCrate', 'Use an Ammo crate', () => ask({ kind: ASKS.useCrate })),
      ]),
    ];
  }

  /** The panel as `view` has it, `seconds` after the last frame. */
  node(ui: Interface, view: GearView, seconds: number): Node[] {
    const { gear } = view;
    const { ask } = this;
    if (!gear) return [title('Gear'), hint('Waiting for the room…')];
    const answer = answerText(gear.answer);
    // The room's answer is said as it changes, a refusal with why.
    if (answer !== this.answered) {
      this.answered = answer;
      if (answer) ui.speak(answer);
    }
    const opened = gear.items.find((item) => item.id === gear.identified);
    const level = `Level ${gear.level} · Prestige ${gear.prestige} · Defense ${gear.defense} · XP ${gear.xp.toLocaleString()}`;
    const wornItems = SLOTS.map((unused, slot) => gear.items.find((item) => item.at === WORN + slot)).filter(
      (item): item is GearItem => item !== undefined,
    );
    const carried = gear.items.filter((item) => item.at === CARRIED).sort((one, two) => one.bucket - two.bucket);
    const vaulted = gear.items.filter((item) => item.at === VAULTED);
    const row = (item: GearItem) => this.itemRow(ui, item, gear, view, seconds);
    const vestiges = gear.vestiges.map((vestige): Node => {
      const id = `tg:vestige:${vestige.id}`;
      const words = `${RARITIES[vestige.rarity]?.name ?? ''} Vestige: ${SLOTS[vestige.slot] ?? ''}, level ${vestige.level}`;
      const presses = vestige.vaulted
        ? [press(ui, `${id}:out`, 'Take out', () => ask({ kind: ASKS.withdrawVestige, item: vestige.id }))]
        : [
            press(ui, `${id}:identify`, 'Identify', () => ask({ kind: ASKS.identify, item: vestige.id })),
            (view.atStall || gear.atMage) &&
              press(ui, `${id}:vault`, 'Vault', () => ask({ kind: ASKS.storeVestige, item: vestige.id })),
          ];
      return {
        gap: 6,
        width: 'grow',
        alignY: 'center',
        children: [
          { width: 'grow', text: { words, colour: RARITIES[vestige.rarity]?.colour ?? LOOK.words } },
          ...presses,
        ],
      };
    });
    const nodes = view.nodesInReach.map(({ node, resource }) => ({
      children: [
        press(ui, `tg:gather:${node}`, `Gather ${resourceName(resource)}`, () => ask({ kind: ASKS.gather, node })),
      ],
    }));
    return [
      title('Gear'),
      answer && hint(answer),
      hint(level, LOOK.words),
      hint(heldLine(gear)),
      hint(ammoLine(gear)),
      opened && opened.at === CARRIED && hint(`The Vestige opened: ${itemName(opened)}.`, LOOK.words),
      hint(
        view.atStall || gear.atMage
          ? 'At the stall: Vestiges open, and the vault is here.'
          : 'The stall is south-east of the start.',
      ),
      ...nodes,
      heading('Worn'),
      ...wornItems.map(row),
      heading('Carried'),
      ...carried.map(row),
      heading(`Vestiges${gear.drops.length > 0 ? ` (${gear.drops.length} lying for you)` : ''}`),
      ...vestiges,
      ...(vaulted.length > 0 ? [heading('In the vault'), ...vaulted.map(row)] : []),
      ...this.grants(ui),
    ].filter((child): child is Node => Boolean(child));
  }
}

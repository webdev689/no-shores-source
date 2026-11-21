// The inventory page, after Destiny's: Aurem and Shapes, the currencies, along its head, each named under its count;
// then the Vestiges carried, ten places in two rows of five as Destiny 2's engrams stand, an empty place a dark
// Vestige; then shelves to switch between the consumables and the materials, each counting what it holds and dimmed
// while it holds nothing. The gear itself is on the Character page. Each shelf is a grid as Destiny's is: what is held
// first (the materials' fragments and Essence, then the islands' resources), a stack of none not shown, then empty
// places to the end of its row of ten. A cell is its glyph in a well of its rarity, its count at its foot and its pips
// beside it, as Enhanced Plus's cells are. Hovering or focusing a cell shows its card; a click does what it is for (a
// Vestige opened at the Mage), a held one when held; a right press its other use.

import { ASKS } from '../network/gearMessages.ts';
import { CARRIED, RARITIES } from '../player/gear.ts';
import type { Child, Node } from '../ui/node.ts';
import { cardFrame, cardName, cardNode, rarityTone } from './gearCard.ts';
import { type Cell, cardOf, inventoryPageOf } from './gearCards.ts';
import { DISMANTLE_KEY, fillNode, quiver, washNode } from './gearHold.ts';
import {
  type Hint,
  INK,
  focusRing,
  glyphNode,
  itemIconNode,
  itemMarks,
  label,
  rarityRgb,
  svgNode,
  tileLabel,
  tileNode,
  words,
} from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';
import { shapesSvg } from './npc/npcMarks.ts';

/** A cell's tile and its picture box, in pixels, and a shelf's tiles a row. */
const CELL_TILE = 64;
const CELL_PX = 48;
const SHELF_ROW = 10;

/** Whether a cell holds anything: an item, or a count above none. */
const holds = (cell: Cell): boolean => cell.item !== null || cell.glyph === 'vestige' || (cell.count ?? 0) > 0;

/** What a cell's presses do, in keycaps. */
function hintsOf(cell: Cell): Hint[] {
  return [
    ...(cell.press ? [[cell.press.held ? 'Press' : 'Click', cell.press.label] as const] : []),
    ...(cell.other ? [['Right-click', cell.other.label] as const] : []),
  ];
}

/** A cell's plain card: its name, how many are held, its words and what its presses do. */
function cellCard(context: MenuContext, cell: Cell): Node {
  const { sizes } = context;
  const rarity = cell.glyph === 'vestige' ? cell.rarity : null;
  const meta = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  return cardFrame(
    sizes,
    rarityTone(rarity),
    [cardName(cell.name, rarity), words(meta, sizes.label, INK.word)],
    [{ width: 'grow', text: { words: cell.words, size: sizes.label, colour: INK.faint } }],
    hintsOf(cell),
  );
}

/** An empty place, vacant: a Vestige's a dark Vestige, a shelf's bare. */
export function vacantNode(vestige = false): Node {
  return tileNode(CELL_TILE, null, 'rest', vestige ? [{ ...glyphNode('vestige'), opacity: 0.35 }] : [], {
    faded: vestige ? 1 : 0.55,
  });
}

/** A cell's tile: its picture in a well of its rarity, its count and pips, its card, and its presses. */
export function cellNode(context: MenuContext, cell: Cell): Node {
  const { ui, holds: held, sizes } = context;
  if (cell.glyph === 'empty') return vacantNode();
  const id = `cell-${cell.key}`;
  const item = cell.item;
  const rarity = cell.glyph === 'vestige' || item ? cell.rarity : null;
  const rgb = rarityRgb(rarity);
  // A piece carried is dismantled by holding F over it, wherever its tile stands.
  const carried = item?.at === CARRIED;
  const press = cell.press;
  let charged = 0;
  if (item && carried)
    charged = held.dismantle(ui, id, item.rarity, rgb, () => context.ask({ kind: ASKS.dismantle, item: item.id }));
  if (press?.held)
    charged = Math.max(
      charged,
      held.press(ui, id, () => context.ask(press.ask), { burst: press.burst ?? null, rgb }),
    );
  else if (press && ui.clicked(id)) context.ask(press.ask);
  if (ui.rightClicked(id)) {
    if (item) context.inspect(item);
    else if (cell.other) context.ask(cell.other.ask);
  }
  if (item) context.details(id, item);
  const hints: Hint[] = [
    ...(press ? [[press.held ? 'Press' : 'Click', press.label] as const] : []),
    ['Right-click / X', 'Details'],
    ...(carried ? [[DISMANTLE_KEY, 'Hold to dismantle'] as const] : []),
  ];
  context.card(id, () =>
    item ? cardNode(cardOf(item), context.picture(item), hints, sizes) : cellCard(context, cell),
  );
  const icon = item
    ? itemIconNode(context.picture(item), cell.name, CELL_PX, sizes, cell.rarity)
    : glyphNode(cell.glyph === 'item' ? 'empty' : cell.glyph, 36, cell.rarity, cell.tint);
  const shaken = quiver(charged);
  const { marks, gilded } = item ? itemMarks(item) : { marks: [], gilded: false };
  const pips = rarity !== null ? (RARITIES[rarity]?.pips ?? '') : '';
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  const corner = (anchor: readonly [number, number], x: number): Node['float'] => ({
    to: 'parent',
    clipped: true,
    anchor,
    at: anchor,
    x,
    y: -5,
  });
  const extra: Child[] = [
    ...marks,
    cell.count !== null && {
      text: { words: cell.count.toLocaleString(), colour: INK.word, edge: 'halo', edgeColour: INK.outline },
      float: corner([1, 1], -4),
    },
    pips !== '' && {
      text: { words: pips, colour: RARITIES[rarity ?? 0]?.colour ?? INK.word, edge: 'shadow' },
      float: corner([0, 1], 4),
    },
    washNode(charged, rgb),
    press?.held ? fillNode(held.share(id)) : null,
    ui.focused(id) && ui.keyFocused && focusRing(CELL_TILE, CELL_TILE),
  ];
  const what = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  return tileNode(CELL_TILE, rarity, lit ? 'lit' : 'rest', [shaken ? { ...icon, offset: shaken } : icon], {
    id,
    // A cell a press does nothing to (a stack, a Vestige away from the Mage) still takes the focus for its card.
    ...(press || cell.other || item ? { press: true } : { focusable: true }),
    label: tileLabel(cell.name, item ? cell.rarity : null, what),
    gilded,
    marks: extra,
    faded: holds(cell) ? 1 : 0.6,
  });
}

/** A grid of tiles `across` a row, `gap` apart. */
function gridNode(tiles: readonly Node[], across: number): Node {
  const rows: Node[] = [];
  for (let start = 0; start < tiles.length; start += across)
    rows.push({ gap: 6, children: tiles.slice(start, start + across) });
  return { direction: 'column', gap: 6, children: rows };
}

/** A heading with its count at its end, over a rule. */
function countedHeading(said: string, count: string, size: number, width: number): Node {
  return {
    width,
    direction: 'column',
    gap: 4,
    padding: [4, 0, 6, 0],
    children: [
      { width: 'grow', children: [{ width: 'grow', children: [label(said, size)] }, words(count, size, INK.faint)] },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
    ],
  };
}

/** A currency's chip: its glyph, its count, and its name under it. */
function currencyNode(glyph: Node, count: number, name: string, size: number): Node {
  return {
    role: 'chip',
    padding: [5, 12, 5, 8],
    gap: 8,
    alignY: 'center',
    children: [
      glyph,
      {
        direction: 'column',
        gap: 2,
        children: [words(count.toLocaleString(), size, INK.word), words(name, 1, INK.faint)],
      },
    ],
  };
}

/** The inventory page, `shelf` the one shown; `choose` shows another. */
export function inventoryPage(context: MenuContext, shelf: string, choose: (shelf: string) => void): Node {
  const { ui, gear, sizes } = context;
  const inventory = inventoryPageOf(gear);
  const currencies: Node[] = [
    ...inventory.currencies.map((each) =>
      currencyNode(glyphNode(each.glyph === 'item' ? 'empty' : each.glyph, 24), each.count, each.name, sizes.name),
    ),
    // Shapes, Shape's own currency, gathered all week and spent only while he is here.
    currencyNode(svgNode('shapes', shapesSvg(), 24), gear.shapes ?? 0, 'Shapes', sizes.name),
  ];
  const vestiges = inventory.vestiges;
  const shelves = inventory.tabs.map((each) => ({ ...each, held: each.cells.filter(holds).length }));
  const tabs: Node = {
    role: 'well',
    padding: [2, 6],
    gap: 2,
    wrap: true,
    children: shelves.map((each): Node => {
      const id = `shelf-${each.id}`;
      if (ui.clicked(id)) choose(each.id);
      const chosen = each.id === shelf;
      const lit = chosen || ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
      const colour = lit ? INK.brassLit : each.held === 0 ? INK.faint : INK.word;
      const big = sizes.name > 1;
      return {
        id,
        press: true,
        // Its name and count are read apart, not run together as one word.
        label: `${each.name}, ${each.held}`,
        padding: big ? [11, 22] : [7, 12],
        gap: 8,
        alignY: 'center',
        children: [
          words(each.name.toUpperCase(), big ? 2 : 1, colour),
          words(String(each.held), sizes.label, INK.faint),
          chosen && {
            width: 'grow',
            height: 2,
            fill: INK.brassLit,
            float: { to: 'parent', clipped: true, anchor: [0, 1], at: [0, 1] },
          },
        ],
      };
    }),
  };
  const cells = shelves.find((each) => each.id === shelf)?.cells ?? [];
  const places = Math.max(SHELF_ROW, Math.ceil(cells.length / SHELF_ROW) * SHELF_ROW);
  const shown = [
    ...cells.map((cell) => cellNode(context, cell)),
    ...Array.from({ length: places - cells.length }, () => vacantNode()),
  ];
  return {
    width: 'grow',
    direction: 'column',
    gap: 14,
    children: [
      { gap: 8, wrap: true, children: currencies },
      {
        direction: 'column',
        children: [
          countedHeading('Vestiges', `${vestiges.held}/${vestiges.most}`, sizes.name, 344),
          gridNode(
            vestiges.cells.map((cell) => (cell.glyph === 'empty' ? vacantNode(true) : cellNode(context, cell))),
            5,
          ),
        ],
      },
      tabs,
      gridNode(shown, SHELF_ROW),
    ],
  };
}

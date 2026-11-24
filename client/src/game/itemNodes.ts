// An item's node grid as its page lays it, after Destiny 1's: column by column, each node its kind's glyph in a square
// tile, never a circle: brass when chosen, lit when bought, edged in its rarity when it can be bought now, sunk while
// locked, a square round its edge filling as the item grows toward it. A node is bought by holding it, as Destiny holds
// an upgrade; one bought is chosen by a click. Its card says what it does and, as Destiny's does, what it costs beside
// what the player has, each material short of it in the loss's red.

import { edged } from '../combat/barDraw.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { type NodeShown, RARITIES } from '../player/gear.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { cardFrame, cardName, rarityTone } from './gearCard.ts';
import type { Glyph } from './gearCards.ts';
import { fillNode } from './gearHold.ts';
import { INK, focusRing, glyphNode, growthNode, label, nodeGlyphNode, rarityRgb, rgba, words } from './gearNodes.ts';
import type { itemDetailOf } from './gearScreen.ts';
import type { MenuContext } from './menuPage.ts';

/** A node's tile, in pixels, on most screens and on a wide and tall one; and the room between its columns. */
const NODE_TILE = 44;
const NODE_TILE_LARGE = 56;
const COLUMN_GAP = 12;

/** One thing a node costs: its glyph, its name, how many it asks and how many the player has. */
export interface Cost {
  readonly glyph: Exclude<Glyph, 'item'>;
  readonly tint: number;
  readonly name: string;
  readonly need: number;
  readonly have: number;
}

/** The columns as the page shows them. */
type Columns = ReturnType<typeof itemDetailOf>['columns'];

/** A node's press's id. */
export const nodeId = (column: number, node: number): string => `node-${column}-${node}`;

/** The node under the pointer or the keys' focus, if one is. */
export function nodeAimed(ui: Interface, columns: Columns): { readonly column: number; readonly node: number } | null {
  for (const [column, { nodes }] of columns.entries())
    for (const node of nodes.keys()) {
      const id = nodeId(column, node);
      if (ui.hovered(id) || (ui.focused(id) && ui.keyFocused)) return { column, node };
    }
  return null;
}

/** A meter sunk into the page, filled to `share`; with `value`, its label and value beside it. */
export function bar(context: Pick<MenuContext, 'sizes'>, said: string, share: number, value = ''): Node {
  const size = context.sizes.label;
  const well: Node = {
    width: 'grow',
    height: 10,
    padding: 2,
    role: 'well',
    label: said,
    children: [{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`, height: 'grow', fill: '#d9d0ae' }],
  };
  if (!value) return { width: 'grow', padding: [4, 0], children: [well] };
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    padding: [4, 0],
    children: [
      { width: size > 1 ? 110 : 76, children: [words(said, size, INK.faint)] },
      well,
      { width: 64, alignX: 'end', children: [words(value, size, INK.word)] },
    ],
  };
}

/** What a node's state says, and the press it waits for. */
function stateOf(node: NodeShown): string {
  if (node.chosen) return 'Chosen';
  if (node.bought) return 'Bought: click to choose';
  return node.unlocked ? 'Hold to buy' : 'Locked';
}

/** A cost's line: its glyph and name, and what the player has over what it asks, short in the loss's red. */
function costNode(cost: Cost, size: number): Node {
  const short = cost.have < cost.need;
  return {
    width: 'grow',
    gap: 8,
    alignY: 'center',
    children: [
      glyphNode(cost.glyph, 24, 0, cost.tint),
      { width: 'grow', children: [words(cost.name, size, INK.word)] },
      {
        text: {
          words: [
            { words: cost.have.toLocaleString(), colour: short ? INK.loss : INK.word },
            { words: ` / ${cost.need.toLocaleString()}`, colour: INK.faint },
          ],
          size,
          wrap: false,
        },
      },
    ],
  };
}

/** A node's card, as Destiny's: its name, its state, its words and, until it is bought, what it costs beside what the
 *  player has; a locked one says its square fills as the item is used. */
function nodeCard(context: MenuContext, node: NodeShown, costs: readonly Cost[] | null): Node {
  const size = context.sizes.label;
  const state = stateOf(node);
  const priced = !node.bought && costs !== null && costs.length > 0;
  const foot: Child[] = [
    !node.unlocked && words('Its square fills as the item is used.', size, INK.faint),
    priced && label('Costs', size),
    ...(priced ? costs.map((cost) => costNode(cost, size)) : []),
    // A ship's module or an officer prices its nodes in words of its own.
    !node.bought && costs === null && { width: 'grow', text: { words: node.cost, size, colour: INK.faint } },
  ];
  return cardFrame(
    context.sizes,
    rarityTone(null),
    [cardName(node.label, null), words(state, size, node.chosen ? INK.brassLit : INK.word)],
    [{ width: 'grow', text: { words: node.words, size, colour: INK.faint } }],
    [],
    foot.some(Boolean) && {
      width: 'grow',
      direction: 'column',
      gap: 5,
      padding: [8, 12, 10, 12],
      fill: 'rgba(0,0,0,0.25)',
      children: foot,
    },
  );
}

/** A node's colours by its state: its bevel's four edges, its ground and its glyph's. */
function toneOf(state: string, rarity: number): [[string, string, string, string], string, string] {
  const found = RARITIES[rarity];
  const [lit, shade] = [found?.lit ?? INK.brassLit, found?.shade ?? INK.brass];
  if (state === 'locked') return [[INK.stoneLo, INK.stoneHi, INK.stoneHi, INK.stoneLo], '#0b0c0f', '#6a6458'];
  if (state === 'chosen') return [['#f6dca4', '#8a5f17', '#8a5f17', '#f6dca4'], '#c99a4e', '#1a120a'];
  if (state === 'open') return [[lit, shade, shade, lit], INK.well, lit];
  return [[INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi], '#16181d', INK.brassLit];
}

/** One node's press: held to buy, clicked to choose, and otherwise reachable but doing nothing, so its card says why;
 *  locked, its square grown `share` of the way to it. */
function nodePress(
  context: MenuContext,
  item: Pick<GearItem, 'rarity'>,
  node: NodeShown,
  [kind, share]: readonly [number, number],
  id: string,
  costs: readonly Cost[] | null,
): Node {
  const { ui, holds, sizes } = context;
  const tile = sizes.label > 1 ? NODE_TILE_LARGE : NODE_TILE;
  const state = node.chosen ? 'chosen' : node.bought ? 'bought' : node.unlocked ? 'open' : 'locked';
  const run = () => {
    if (node.ask) context.ask(node.ask);
  };
  const held = !node.bought && node.ask !== null;
  const charged = held ? holds.press(ui, id, run) : 0;
  // Asked every frame, so a hold let go off its press is forgotten.
  const justHeld = holds.heldDown(ui, id);
  if (!held && ui.clicked(id) && !justHeld) run();
  context.card(id, () => nodeCard(context, node, costs), 'nodes');
  const hover = ui.hovered(id) && node.ask !== null;
  const [bevel, ground, glyph] = toneOf(state, item.rarity);
  const lit: [string, string, string, string] = [INK.brassLit, INK.brassLit, INK.brassLit, INK.brassLit];
  return {
    id,
    press: true,
    disabled: node.ask === null && !node.bought,
    label: `${node.label}, ${stateOf(node)}: ${node.cost}`,
    width: tile,
    height: tile,
    alignX: 'center',
    alignY: 'center',
    fill: ground,
    draw: edged(hover && state !== 'chosen' ? lit : bevel, 2, state === 'chosen' ? INK.outline : null),
    children: [
      state === 'open' && {
        width: 'grow',
        height: 'grow',
        float: { to: 'parent', clipped: true },
        outline: { width: 2, colour: rgba(rarityRgb(item.rarity), 0.35) },
      },
      state === 'locked' && {
        ...growthNode(share, INK.brassLit, '#2a2620', tile - 4),
        float: { to: 'parent', clipped: true, x: 2, y: 2 },
      },
      nodeGlyphNode(kind, glyph, sizes.label > 1 ? 30 : 24),
      held ? fillNode(charged) : null,
      ui.focused(id) && ui.keyFocused && focusRing(tile, tile),
    ],
  };
}

/** The node grid: each column's nodes, their squares grown as far as the item has from the column before's; an
 *  officer's too, their service as its XP and their grade as its rarity. `costs` gives a column's costs beside what the
 *  player has, where its nodes are priced in the gear's own materials. */
export function nodeGrid(
  context: MenuContext,
  item: Pick<GearItem, 'columns' | 'xp' | 'rarity'>,
  columns: Columns,
  costs: ((column: number) => readonly Cost[]) | null = null,
): Node {
  const tile = context.sizes.label > 1 ? NODE_TILE_LARGE : NODE_TILE;
  return {
    id: 'nodes',
    gap: COLUMN_GAP,
    children: columns.map((column, index): Node => {
      const kind = item.columns[index]?.kind ?? 3;
      const unlocks = item.columns[index]?.xp ?? 0;
      const after = index === 0 ? 0 : (item.columns[index - 1]?.xp ?? 0);
      const share = Math.min(1, Math.max(0, unlocks <= after ? 1 : (item.xp - after) / (unlocks - after)));
      return {
        width: tile + 4,
        direction: 'column',
        alignX: 'center',
        gap: 8,
        children: column.nodes.map((node, nth) =>
          nodePress(context, item, node, [kind, share], nodeId(index, nth), costs ? costs(index) : null),
        ),
      };
    }),
  };
}

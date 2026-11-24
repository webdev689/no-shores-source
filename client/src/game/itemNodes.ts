// An item's node grid as its page lays it, after Destiny 1's: column by column, each node its kind's glyph in a square
// tile, never a circle: brass when chosen, lit when bought, edged in brass when it can be bought now, dim where the
// player has too little to buy it, sunk while locked, a square round its edge filling as the item grows toward it. A
// node is bought by holding it, as Destiny holds an upgrade; one bought is chosen by a click. Its card, beside it, says
// what it does, what it replaces and, as Destiny's does, what it costs beside what the player has, enough in the
// gain's green and short in the loss's red.

import { edged } from '../combat/barDraw.ts';
import type { GearItem } from '../network/gearMessages.ts';
import type { NodeShown } from '../player/gear.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { cardFrame, cardName, rarityTone } from './gearCard.ts';
import type { Glyph } from './gearCards.ts';
import { fillNode } from './gearHold.ts';
import { INK, focusRing, glyphNode, growthNode, label, nodeGlyphNode, words } from './gearNodes.ts';
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

/** The node the keys' focus is on while the keys moved it, else the one under the pointer, if one is: the node whose
 *  card shows, which the bars preview. */
export function nodeAimed(ui: Interface, columns: Columns): { readonly column: number; readonly node: number } | null {
  let pointed: { readonly column: number; readonly node: number } | null = null;
  for (const [column, { nodes }] of columns.entries())
    for (const node of nodes.keys()) {
      const id = nodeId(column, node);
      if (ui.focused(id) && ui.keyFocused) return { column, node };
      if (ui.hovered(id)) pointed = { column, node };
    }
  return pointed;
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

/** What a node's state says, and the press it waits for; `short`, the costs the player has too little of. */
function stateOf(node: NodeShown, short: readonly Cost[] = []): string {
  if (node.chosen) return 'Chosen';
  if (node.bought) return 'Bought: click to choose';
  if (!node.unlocked) return 'Locked';
  return short.length > 0 ? `Not enough ${short.map((cost) => cost.name).join(', ')}` : 'Hold to buy';
}

/** A cost's line: its glyph and name, and what the player has over what it asks, enough in green, short in red. */
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
            { words: cost.have.toLocaleString(), colour: short ? INK.loss : INK.gain },
            { words: ` / ${cost.need.toLocaleString()}`, colour: INK.faint },
          ],
          size,
          wrap: false,
        },
      },
    ],
  };
}

/** A node's card, as Destiny's: its name and state, its words, the perk it would set aside, and until it is bought
 *  what it costs beside what the player has; a locked one says, in its own words, how it fills. */
function nodeCard(context: MenuContext, node: NodeShown, costs: readonly Cost[] | null, replaces: string | null): Node {
  const size = context.sizes.label;
  const short = costs?.filter((cost) => cost.have < cost.need) ?? [];
  const state = stateOf(node, node.unlocked ? short : []);
  const priced = !node.bought && costs !== null && costs.length > 0;
  const foot: Child[] = [
    !node.unlocked && words(node.cost, size, INK.faint),
    priced && label('Costs', size),
    ...(priced ? costs.map((cost) => costNode(cost, size)) : []),
    // A ship's module or an officer prices its nodes in words of its own.
    !node.bought &&
      node.unlocked &&
      costs === null && { width: 'grow', text: { words: node.cost, size, colour: INK.faint } },
  ];
  return cardFrame(
    context.sizes,
    rarityTone(null),
    [
      cardName(node.label, null),
      words(state, size, node.chosen ? INK.brassLit : short.length > 0 && node.unlocked ? INK.loss : INK.word),
    ],
    [
      { width: 'grow', text: { words: node.words, size, colour: INK.faint } },
      replaces !== null && words(`Replaces ${replaces}`, size, INK.word),
    ],
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

/** A node's colours by its state: its bevel's four edges, its ground and its glyph's. Its rarity is the item's band's
 *  and frame's, never a node's, whose red would read as the loss's. */
function toneOf(state: string): [[string, string, string, string], string, string] {
  if (state === 'locked') return [[INK.stoneLo, INK.stoneHi, INK.stoneHi, INK.stoneLo], '#0b0c0f', '#6a6458'];
  if (state === 'chosen') return [['#f6dca4', '#8a5f17', '#8a5f17', '#f6dca4'], '#c99a4e', '#1a120a'];
  if (state === 'open') return [[INK.brassLit, INK.brass, INK.brass, INK.brassLit], INK.well, INK.word];
  if (state === 'short') return [[INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi], INK.well, INK.faint];
  return [[INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi], '#16181d', INK.brassLit];
}

/** One node's press: held to buy, clicked to choose, and otherwise reachable but doing nothing, so its card says why;
 *  locked, its square grown `share` of the way to it. One the player has too little to buy is not held, so no ask the
 *  room would refuse is made. */
function nodePress(
  context: MenuContext,
  node: NodeShown,
  [kind, share]: readonly [number, number],
  id: string,
  [costs, replaces]: readonly [readonly Cost[] | null, string | null],
): Node {
  const { ui, holds, sizes } = context;
  const tile = sizes.label > 1 ? NODE_TILE_LARGE : NODE_TILE;
  const afford = costs?.every((cost) => cost.have >= cost.need) ?? true;
  const state = node.chosen ? 'chosen' : node.bought ? 'bought' : !node.unlocked ? 'locked' : afford ? 'open' : 'short';
  const run = () => {
    if (node.ask) context.ask(node.ask);
  };
  const held = !node.bought && node.ask !== null && afford;
  const charged = held ? holds.press(ui, id, run) : 0;
  // Asked every frame, so a hold let go off its press is forgotten.
  const justHeld = holds.heldDown(ui, id);
  if (!held && node.bought && ui.clicked(id) && !justHeld) run();
  context.card(id, () => nodeCard(context, node, costs, replaces));
  const hover = ui.hovered(id) && held;
  const [bevel, ground, glyph] = toneOf(state);
  const lit: [string, string, string, string] = [INK.brassLit, INK.brassLit, INK.brassLit, INK.brassLit];
  return {
    id,
    press: true,
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
        outline: { width: 1, colour: 'rgba(243,207,134,0.45)' },
      },
      state === 'locked' && {
        ...growthNode(share, INK.brassLit, '#3d362b', tile - 4),
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
  item: Pick<GearItem, 'columns' | 'xp'> & Partial<Pick<GearItem, 'chosen'>>,
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
        children: column.nodes.map((node, nth) => {
          // A trait not chosen beside one that is sets that one aside, as choosing it would.
          const chosen = item.chosen?.[index];
          const aside = chosen !== undefined && chosen !== nth ? item.columns[index]?.traits[chosen] : undefined;
          const replaces = aside && !node.chosen ? (columns[index]?.nodes[chosen ?? 0]?.label ?? null) : null;
          return nodePress(context, node, [kind, share], nodeId(index, nth), [costs ? costs(index) : null, replaces]);
        }),
      };
    }),
  };
}

// An item's page, laid over the menu as Destiny 1's weapon page is: its name on a band of its rarity, its kind,
// level and words, its main number large over a meter of it, what it changes over the piece worn, the perks it gives,
// each beside its column's glyph, and its node grid, column by column, each node its kind's glyph in a tile: brass
// when chosen, lit when bought, glowing when it can be bought now, sunk while locked, a ring inside it filling as the
// item grows toward it, its card on hover or focus. A node is bought by holding it, as Destiny holds an upgrade; one
// bought is chosen by a click. To the right, the item itself drawn large on a lit floor; what may be done with it goes
// to the menu's footer.

import { make } from '../editor/dom.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { CARRIED, ELEMENTS, RARITIES, type NodeShown, WORN } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { cardOf, traitsShown } from './gearCards.ts';
import {
  HOLD_MS,
  compareNode,
  dismantleMs,
  elementGlyph,
  heldPress,
  nodeGlyph,
  nodeRing,
  glyphImage,
  pictureCanvas,
  pressOf,
  rarityOf,
  traitNode,
} from './gearDom.ts';
import { itemDetailOf } from './gearScreen.ts';
import { LARGE_CAP } from '../player/iconFit.ts';
import { moduleGlyph } from './shipGear.ts';

/** The art's box: what the page's height leaves it, within these, in pixels. */
const ART_LEAST = 200;
const ART_MOST = 560;
const ART_AROUND = 110;
/** The most an item's Attack and Prestige reach, for their meters. */
const ATTACK_MOST = 300;
const PRESTIGE_MOST = 30;

/** A meter sunk into the page, filled to `share`; with `value`, its label and value beside it. */
export function bar(label: string, share: number, value = ''): HTMLElement {
  const row = make('div', '', value ? 'gear-bar' : 'gear-bar gear-bar-bare');
  const well = make('div', '', `gear-meter ${ROLES.well}`);
  well.setAttribute('role', 'meter');
  well.setAttribute('aria-label', label);
  well.setAttribute('aria-valuenow', String(Math.round(Math.min(1, Math.max(0, share)) * 100)));
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
  well.append(fill);
  if (value) row.append(make('span', label, 'gear-bar-label'), well, make('span', value, 'gear-bar-value'));
  else row.append(well);
  return row;
}

/** A node's card: its name and words, and whether it is chosen or bought, what it costs, or when it unlocks. */
function nodeCard(node: NodeShown): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  const head = make('div', '', 'gear-card-head');
  const state = node.chosen
    ? 'Chosen'
    : node.bought
      ? 'Bought: click to choose'
      : node.unlocked
        ? 'Hold to buy'
        : 'Locked';
  head.append(make('h3', node.label), make('p', state, 'gear-card-meta'));
  const body = make('div', '', 'gear-card-body');
  body.append(make('p', node.words, 'gear-card-words'));
  card.append(head, body, make('p', node.cost, 'gear-card-hint'));
  return card;
}

/** One node's press: held to buy, clicked to choose, and otherwise reachable but doing nothing, so its card says why;
 *  locked, its ring grown `share` of the way to it. */
function nodePress(
  context: PageContext,
  node: NodeShown,
  [kind, share]: readonly [number, number],
  key: string,
  grid: HTMLElement,
): HTMLElement {
  const state = node.chosen ? 'chosen' : node.bought ? 'bought' : node.unlocked ? 'open' : 'locked';
  const run = () => {
    context.tip.hide();
    if (node.ask) context.ask(node.ask);
  };
  const press = !node.bought && node.ask ? heldPress('', run) : pressOf('', run);
  press.classList.add('gear-node', `gear-node-${state}`, ROLES.tile);
  if (state === 'locked') press.append(nodeRing(share));
  press.append(nodeGlyph(kind));
  press.dataset['key'] = key;
  press.setAttribute('aria-label', `${node.label}, ${state}: ${node.cost}`);
  press.setAttribute('aria-pressed', String(node.chosen));
  if (node.ask === null) press.setAttribute('aria-disabled', 'true');
  context.tip.over(press, () => nodeCard(node), grid);
  return press;
}

/** The node grid: each column's nodes, their rings grown as far as the item has from the column before's; an
 *  officer's too, their service as its XP. */
export function nodeGrid(
  context: PageContext,
  item: Pick<GearItem, 'columns' | 'xp'>,
  columns: ReturnType<typeof itemDetailOf>['columns'],
): HTMLElement {
  const grid = make('div', '', 'gear-nodes');
  columns.forEach((column, index) => {
    const kind = item.columns[index]?.kind ?? 3;
    const unlocks = item.columns[index]?.xp ?? 0;
    const after = index === 0 ? 0 : (item.columns[index - 1]?.xp ?? 0);
    const stack = make('div', '', 'gear-node-column');
    const share = Math.min(1, Math.max(0, unlocks <= after ? 1 : (item.xp - after) / (unlocks - after)));
    column.nodes.forEach((node, nth) =>
      stack.append(nodePress(context, node, [kind, share], `node-${index}-${nth}`, grid)),
    );
    grid.append(stack);
  });
  return grid;
}

/** The item's page, and its presses for the screen's footer. */
export function itemPage(
  context: PageContext,
  item: GearItem,
  back: () => void,
): { readonly page: HTMLElement; readonly presses: HTMLElement } {
  const detail = itemDetailOf(item, context.gear, context.atVault);
  const page = make('div', '', `gear-item-page ${ROLES.panel}`);
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', detail.name);
  rarityOf(page, item.rarity);
  const head = make('div', '', 'gear-card-head gear-item-head');
  const kind = make('p', '', 'gear-item-kind');
  kind.append(make('span', detail.kind), make('span', `Level ${item.level}`, 'gear-chip'));
  const pips = RARITIES[item.rarity]?.pips ?? '';
  if (pips) kind.append(make('span', pips, 'gear-card-pips'));
  const element = elementGlyph(item.element, 'gear-element-inline');
  if (element) {
    const named = make('span', ELEMENTS[item.element]?.name ?? '', 'gear-element-name');
    named.style.color = ELEMENTS[item.element]?.colour ?? '';
    kind.append(element, named);
  }
  const name = make('h2', detail.name, 'gear-item-name');
  name.tabIndex = -1;
  head.append(name, kind);
  const left = make('div', '', 'gear-item-left');
  if (detail.words) left.append(make('p', detail.words, 'gear-card-words'));
  const main = item.attack
    ? { label: 'Attack', value: item.attack, most: ATTACK_MOST }
    : item.defense
      ? { label: 'Defense', value: item.defense, most: 0 }
      : null;
  if (main) {
    const big = make('div', '', 'gear-item-big');
    big.append(make('strong', String(main.value)), make('span', main.label));
    left.append(big);
    if (main.most) left.append(bar(main.label, main.value / main.most));
  }
  if (item.prestige) left.append(bar('Prestige', item.prestige / PRESTIGE_MOST, String(item.prestige)));
  const worn = item.at === CARRIED ? context.gear.items.find((each) => each.at === WORN + item.bucket) : undefined;
  const compare = worn ? cardOf(item, worn).compare : null;
  if (compare) left.append(compareNode(compare));
  const traits = traitsShown(item);
  if (traits.length > 0)
    left.append(make('h3', 'Perks', `gear-heading ${ROLES.rule}`), ...traits.map((trait) => traitNode(trait)));
  if (detail.columns.length > 0)
    left.append(make('h3', 'Nodes', `gear-heading ${ROLES.rule}`), nodeGrid(context, item, detail.columns));
  const art = make('div', '', 'gear-item-art');
  const picture = context.picture(item);
  const box = Math.min(ART_MOST, Math.max(ART_LEAST, context.room - ART_AROUND));
  // A module's glyph stands for its picture, drawn large.
  const glyph = moduleGlyph(item.kind);
  const drawn = picture ? pictureCanvas(picture, box, LARGE_CAP) : make('span', 'Drawing…', 'gear-hint');
  art.append(glyph ? glyphImage(glyph) : drawn);
  if (glyph) art.classList.add('gear-item-art-glyph');
  const presses = make('div', '', 'gear-item-presses');
  const leave = pressOf('Back', back, 'button', 'Esc');
  leave.dataset['key'] = 'press-back';
  presses.append(leave);
  for (const press of detail.presses) {
    const run = () => context.ask(press.ask);
    // Dismantling or feeding, the item's own picture charges as the press is held.
    // A piece is held to dismantle as long as its rarity asks.
    const hold = press.burst
      ? {
          charges: () => art,
          burst: press.burst,
          holdMs: press.burst === 'shatter' ? dismantleMs(item.rarity) : HOLD_MS,
        }
      : {};
    const shown = press.held ? heldPress(press.label, run, press.role, hold) : pressOf(press.label, run, press.role);
    shown.dataset['key'] = `press-${press.label}`;
    presses.append(shown);
  }
  const body = make('div', '', 'gear-item-body');
  body.append(left, art);
  page.append(head, body);
  return { page, presses };
}

// An item's page, laid over the gear screen as Destiny 1's weapon page is: its name in its rarity's colour, its kind,
// level and words, its main number large over a meter of it, the perks it gives, and its node grid under one track of
// its XP, column by column, each node its kind's glyph: brass when chosen, lit when bought, glowing when it can be
// bought now, dim while locked, its card on hover or focus and bought or chosen by a click. To the right, the item
// itself drawn large on a lit floor; along the foot, what may be done with it where it is.

import { make } from '../editor/dom.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { RARITIES, type NodeShown, traitOf } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { chosenTraits } from './gearCards.ts';
import { heldPress, nodeGlyph, pictureCanvas, pressOf, rarityOf } from './gearDom.ts';
import { itemDetailOf } from './gearScreen.ts';

/** The art's box: what the page's height leaves it, within these, in pixels. */
const ART_LEAST = 200;
const ART_MOST = 440;
const ART_AROUND = 110;
/** The most an item's Attack and Prestige reach, for their meters. */
const ATTACK_MOST = 300;
const PRESTIGE_MOST = 30;

/** A meter sunk into the page, filled to `share`, its label and value beside it. */
function bar(label: string, value: string, share: number): HTMLElement {
  const row = make('div', '', 'gear-bar');
  const well = make('div', '', `gear-meter ${ROLES.well}`);
  well.setAttribute('role', 'meter');
  well.setAttribute('aria-label', label);
  well.setAttribute('aria-valuetext', value);
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
  well.append(fill);
  row.append(make('span', label, 'gear-bar-label'), well, make('span', value, 'gear-bar-value'));
  return row;
}

/** A node's card: its name and words, and whether it is chosen or bought, what it costs, or when it unlocks. */
function nodeCard(node: NodeShown): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  const head = make('div', '', 'gear-card-head');
  const state = node.chosen ? 'Chosen' : node.bought ? 'Bought: click to choose' : node.unlocked ? 'Open' : 'Locked';
  head.append(make('h3', node.label), make('p', state, 'gear-card-meta'));
  const body = make('div', '', 'gear-card-body');
  body.append(make('p', node.words, 'gear-card-words'));
  card.append(head, body, make('p', node.cost, 'gear-card-hint'));
  return card;
}

/** The node grid under one track of the item's XP, each column at its own XP. */
function nodeGrid(
  context: PageContext,
  item: GearItem,
  columns: ReturnType<typeof itemDetailOf>['columns'],
): HTMLElement {
  const grid = make('div', '', 'gear-nodes');
  const most = item.xpMost || 1;
  const track = make('div', '', `gear-node-track ${ROLES.well}`);
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(Math.min(1, item.xp / most) * 100)}%`;
  track.append(fill);
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'XP toward the last column');
  track.setAttribute('aria-valuenow', String(Math.round(Math.min(1, item.xp / most) * 100)));
  const row = make('div', '', 'gear-node-columns');
  columns.forEach((column, index) => {
    const kind = item.columns[index]?.kind ?? 3;
    const unlocks = item.columns[index]?.xp ?? 0;
    const stack = make('div', '', 'gear-node-column');
    stack.classList.toggle('gear-node-reached', item.xp >= unlocks);
    stack.append(make('span', unlocks === 0 ? 'Start' : unlocks.toLocaleString(), 'gear-node-xp'));
    column.nodes.forEach((node, nth) => {
      const state = node.chosen ? 'chosen' : node.bought ? 'bought' : node.unlocked ? 'open' : 'locked';
      const press = make('button', '', `gear-node gear-node-${state}`);
      press.append(nodeGlyph(kind));
      press.dataset['key'] = `node-${index}-${nth}`;
      press.setAttribute('aria-label', `${node.label}, ${state}: ${node.cost}`);
      press.setAttribute('aria-pressed', String(node.chosen));
      press.disabled = node.ask === null;
      press.addEventListener('click', () => {
        context.tip.hide();
        if (node.ask) context.ask(node.ask);
      });
      context.tip.over(press, () => nodeCard(node));
      stack.append(press);
    });
    row.append(stack);
  });
  grid.append(track, row);
  return grid;
}

export function itemPage(context: PageContext, item: GearItem, back: () => void): HTMLElement {
  const detail = itemDetailOf(item, context.gear);
  const page = make('div', '', `gear-item-page ${ROLES.window}`);
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', detail.name);
  rarityOf(page, item.rarity);
  const left = make('div', '', 'gear-item-left');
  const kind = make('p', '', 'gear-item-kind');
  const pips = RARITIES[item.rarity]?.pips ?? '';
  kind.append(make('span', detail.kind), make('span', `Level ${item.level}`, 'gear-chip'));
  if (pips) kind.append(make('span', pips, 'gear-item-pips'));
  left.append(make('h2', detail.name, 'gear-item-name'), kind);
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
    if (main.most) left.append(bar(main.label, String(main.value), main.value / main.most));
  }
  if (item.prestige) left.append(bar('Prestige', String(item.prestige), item.prestige / PRESTIGE_MOST));
  const traits = chosenTraits(item).map(traitOf);
  if (traits.length > 0) {
    const perks = make('ul', '', 'gear-item-perks');
    for (const trait of traits) {
      const line = make('li', '', 'gear-card-trait');
      line.append(make('b', trait.name), make('span', trait.words));
      perks.append(line);
    }
    left.append(make('h3', 'Perks', `gear-heading ${ROLES.rule}`), perks);
  }
  if (detail.columns.length > 0) {
    const heading = make('h3', '', `gear-heading gear-nodes-heading ${ROLES.rule}`);
    heading.append(make('span', 'Nodes'), make('span', detail.xpWords, 'gear-nodes-xp'));
    left.append(heading, nodeGrid(context, item, detail.columns));
  }
  const art = make('div', '', 'gear-item-art');
  const picture = context.picture(item);
  const box = Math.min(ART_MOST, Math.max(ART_LEAST, context.room - ART_AROUND));
  art.append(picture ? pictureCanvas(picture, box) : make('span', 'Drawing…', 'gear-hint'));
  const footer = make('div', '', `gear-item-footer ${ROLES.footer}`);
  for (const press of detail.presses) {
    const run = () => context.ask(press.ask);
    const shown = press.held ? heldPress(press.label, run, press.role) : pressOf(press.label, run, press.role);
    shown.dataset['key'] = `press-${press.label}`;
    footer.append(shown);
  }
  const leave = pressOf('Back  Esc', back);
  leave.dataset['key'] = 'press-back';
  footer.prepend(leave);
  const body = make('div', '', 'gear-item-body');
  body.append(left, art);
  page.append(body, footer);
  return page;
}

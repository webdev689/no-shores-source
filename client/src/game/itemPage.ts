// An item's page, laid over the gear screen as Destiny 1's weapon page is: its name in its rarity's colour, its kind
// and words, its main number large, meters of its level and XP, and its node grid, column by column, each node round,
// lit when bought and brass when chosen, its card on hover and bought or chosen by a click; to the right the item
// itself drawn large; and below, what may be done with it where it is.

import { make } from '../editor/dom.ts';
import type { GearItem } from '../network/gearMessages.ts';
import type { NodeShown } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { cardOf } from './gearCards.ts';
import { heldPress, pictureCanvas, pressOf, rarityOf } from './gearDom.ts';
import { itemDetailOf } from './gearScreen.ts';

/** How large the item is drawn, in pixels. */
const ART_PX = 320;
/** The highest level an item reaches, and the highest Attack one has. */
const LEVEL_MOST = 20;
const ATTACK_MOST = 300;
/** Each kind of column's glyph on its nodes. */
const NODE_GLYPHS: Readonly<Record<string, string>> = {
  Upgrade: '▲',
  Handling: '✥',
  Finish: '◈',
  Perk: '✦',
  'Its own': '✸',
};

/** A meter sunk into the page, filled to `share`, its label and value beside it. */
function bar(label: string, value: string, share: number): HTMLElement {
  const row = make('div', '', 'gear-bar');
  const well = make('div', '', `gear-meter ${ROLES.well}`);
  const fill = make('div', '', 'gear-meter-fill');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
  well.append(fill);
  row.append(make('span', label, 'gear-bar-label'), well, make('span', value, 'gear-bar-value'));
  return row;
}

/** A node's card: its name and words, and whether it is bought, what it costs, or when it unlocks. */
function nodeCard(node: NodeShown): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  const head = make('div', '', 'gear-card-head');
  head.append(
    make('h3', node.label),
    make('p', node.chosen ? 'Chosen' : node.bought ? 'Bought' : '', 'gear-card-meta'),
  );
  card.append(head, make('p', node.words, 'gear-card-words'), make('p', node.cost, 'gear-card-hint'));
  return card;
}

export function itemPage(context: PageContext, item: GearItem, back: () => void): HTMLElement {
  const detail = itemDetailOf(item, context.gear);
  const card = cardOf(item);
  const page = make('div', '', `gear-item-page ${ROLES.window}`);
  rarityOf(page, item.rarity);
  const left = make('div', '', 'gear-item-left');
  const name = make('h2', detail.name, 'gear-item-name');
  left.append(name, make('p', detail.kind, 'gear-card-meta'));
  if (detail.words) left.append(make('p', detail.words, 'gear-card-words'));
  if (card.big) {
    const big = make('div', '', 'gear-item-big');
    big.append(make('strong', String(card.big.value)), make('span', card.big.label));
    left.append(big);
  }
  if (item.attack) left.append(bar('Attack', String(item.attack), item.attack / ATTACK_MOST));
  if (item.prestige) left.append(bar('Prestige', String(item.prestige), item.prestige / 30));
  left.append(bar('Level', String(item.level), item.level / LEVEL_MOST));
  if (detail.xpWords) left.append(bar('XP', detail.xpWords.replace('XP ', ''), detail.xp));
  if (detail.columns.length > 0) {
    left.append(make('div', 'Nodes', `gear-heading ${ROLES.rule}`));
    const grid = make('div', '', 'gear-nodes');
    for (const column of detail.columns) {
      const stack = make('div', '', 'gear-node-column');
      const kind = column.heading.split(' · ')[0] ?? '';
      stack.append(make('div', column.heading.split(' · ')[1] ?? '', 'gear-node-xp'));
      for (const node of column.nodes) {
        const state = node.chosen ? 'chosen' : node.bought ? 'bought' : node.unlocked ? 'open' : 'locked';
        const press = make('button', NODE_GLYPHS[kind] ?? '●', `gear-node gear-node-${state}`);
        press.setAttribute('aria-label', `${node.label}: ${node.cost}`);
        press.disabled = node.ask === null;
        press.addEventListener('click', () => {
          context.tip.hide();
          if (node.ask) context.ask(node.ask);
        });
        context.tip.over(press, () => nodeCard(node));
        stack.append(press);
      }
      grid.append(stack);
    }
    left.append(grid);
  }
  const art = make('div', '', 'gear-item-art');
  const picture = context.picture(item);
  art.append(picture ? pictureCanvas(picture, ART_PX) : make('span', 'Drawing…', 'gear-hint'));
  const footer = make('div', '', `gear-item-footer ${ROLES.footer}`);
  for (const press of detail.presses) {
    const run = () => context.ask(press.ask);
    footer.append(press.held ? heldPress(press.label, run) : pressOf(press.label, run, press.role));
  }
  footer.append(pressOf('Back  Esc', back));
  const body = make('div', '', 'gear-item-body');
  body.append(left, art);
  page.append(body, footer);
  return page;
}

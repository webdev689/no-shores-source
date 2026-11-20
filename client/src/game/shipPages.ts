// The ship's tab of the menu and the harbourmaster's counter, in the Enhanced Plus kit. Manage: its papers (what the
// naval rules say it is), its power with a meter to its next level, its four modules and those carried, each a tile
// opening the module's page with its node grid, its materials and its hands. Crew: each officer by name, post and
// grade, their level's meter, their duty and the presses that change it, paying them off, and their node grid on a
// page of their own. The harbourmaster's counter: the Shipwright's wares. The muster of the officers of the day
// stands on the screen of the faction pledged to's keeper, whose counter signs them on.

import './shipScreen.css';
import { make } from '../editor/dom.ts';
import type { GearItem, GearOfficer } from '../network/gearMessages.ts';
import { WORN } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { cardOf, traitsShown } from './gearCards.ts';
import {
  cardNode,
  glyphImage,
  heldPress,
  itemIcon,
  itemMarks,
  pressOf,
  rarityOf,
  tileLabel,
  traitNode,
} from './gearDom.ts';
import { WARES, tileOf, vendorsOf } from './gearScreen.ts';
import { bar, nodeGrid } from './itemPage.ts';
import { shipPage } from './menuPages.ts';
import {
  NO_OFFERS,
  type OfficerShown,
  SHIP_MATERIALS,
  carriedModules,
  fittedOf,
  moduleGlyph,
  musterOf,
  officerAsItem,
  officerColumns,
  officerShown,
  shipPowerOf,
} from './shipGear.ts';
import type { ShipPanel } from './shipPanel.ts';

/** The Shipwright's number among the vendors (`Vendor::ALL`), and a ware's picture box in pixels. */
const SHIPWRIGHT = 2;
const WARE_PX = 64;

/** The ship tab's parts, as the inventory's shelves are chosen. */
export const SHIP_PARTS = [
  { id: 'manage', name: 'Manage' },
  { id: 'crew', name: 'Crew' },
] as const;

const heading = (words: string) => make('h3', words, `gear-heading ${ROLES.rule}`);

/** A module's tile: its glyph framed in its rarity, its name and main number; a click opens its page. */
function moduleTile(context: PageContext, item: GearItem): HTMLElement {
  const tile = tileOf(item);
  const press = pressOf('', () => context.inspect(item));
  press.classList.add('ship-module');
  press.dataset['key'] = `item-${item.id}`;
  const cell = make('div', '', `gear-cell ${ROLES.tile}`);
  rarityOf(cell, item.rarity);
  const glyph = glyphImage(moduleGlyph(item.kind) ?? 'empty');
  glyph.classList.add('ship-glyph');
  cell.append(glyph);
  const name = make('b', tile.name);
  name.style.color = tile.colour;
  press.append(cell, name, make('span', `Level ${item.level}`, 'gear-hint'), make('span', tile.power, 'gear-hint'));
  press.setAttribute('aria-label', tileLabel(tile.name, item.rarity, `level ${item.level} ${tile.power}`.trim()));
  return press;
}

/** A slot with nothing fitted: its glyph sunk in a vacant tile. */
function emptySlot(name: string, glyph: Parameters<typeof glyphImage>[0]): HTMLElement {
  const slot = make('div', '', 'ship-module ship-module-empty');
  const cell = make('div', '', `gear-cell ${ROLES.tile} gear-vacant`);
  cell.append(glyphImage(glyph));
  slot.append(cell, make('b', name), make('span', 'None fitted', 'gear-hint'));
  return slot;
}

/** Manage: its papers beside its power, its modules, its materials and its hands. */
function managePart(context: PageContext, panel: ShipPanel | null): HTMLElement {
  const part = make('div', '', 'ship-manage');
  const papers = shipPage(panel);
  const ship = context.gear.ship;
  if (!ship) {
    part.append(papers);
    return part;
  }
  // Its stores beside its papers: its materials and its hands.
  const materials = make('div', '', 'gear-currencies ship-materials');
  SHIP_MATERIALS.forEach(({ name, glyph }, index) => {
    const shown = make('div', '', `gear-currency ${ROLES.chip}`);
    const words = make('div', '', 'gear-currency-words');
    words.append(make('b', (ship.stocks[index] ?? 0).toLocaleString()), make('span', name, 'gear-currency-name'));
    shown.append(glyphImage(glyph), words);
    materials.append(shown);
  });
  const hands = make('div', '', 'gear-ship-row');
  hands.append(make('span', 'Hands aboard', 'gear-hint'), make('b', `${ship.hands} / ${ship.handsMost}`));
  papers.append(heading('Materials'), materials, heading('Crew'), hands);
  // Its power over its modules: its level with its meter, and its numbers beside it.
  const side = make('div', '', `ship-power ${ROLES.panel}`);
  const power = shipPowerOf(ship);
  const level = make('div', '', 'ship-level');
  level.append(make('span', 'Ship level', 'gear-power-label'), make('strong', String(power.level), 'gear-power-level'));
  const numbers = make('div', '', 'ship-numbers');
  for (const [label, value] of [
    ['Attack', power.attack],
    ['Defense', power.defense],
    ['Prestige', power.prestige],
  ] as const)
    numbers.append(make('span', label, 'gear-hint'), make('b', String(value)));
  const progress = make('div', '', 'ship-progress');
  progress.append(bar('Toward the next level', power.toNext), make('span', power.toNextWords, 'gear-hint'));
  const head = make('div', '', 'ship-power-head');
  head.append(level, numbers, progress);
  const fitted = make('div', '', 'ship-modules');
  for (const slot of fittedOf(context.gear))
    fitted.append(slot.item ? moduleTile(context, slot.item) : emptySlot(slot.name, slot.key));
  const carried = carriedModules(context.gear);
  const spare = make('div', '', 'ship-modules');
  spare.append(...carried.map((item) => moduleTile(context, item)));
  if (carried.length === 0) spare.append(make('p', 'None carried. The Shipwright sells them.', 'gear-hint'));
  side.append(head, heading('Fitted'), fitted, heading('Carried'), spare);
  part.append(papers, side);
  return part;
}

/** An officer's post's emblem framed in their grade, beside their name in its colour and what they are: post,
 *  grade and level. */
function officerHead(shown: OfficerShown, duty = ''): HTMLElement {
  const head = make('div', '', 'ship-officer-head');
  const emblem = make('div', '', `gear-cell ship-emblem ${ROLES.tile}`);
  rarityOf(emblem, shown.rarity);
  emblem.append(glyphImage(shown.glyph));
  const words = make('div', '', 'ship-officer-words');
  const name = make('b', shown.name, 'ship-officer-name');
  name.style.color = shown.colour;
  const what = [shown.post, shown.grade, `level ${shown.level}`, duty.toLowerCase()].filter(Boolean).join(' · ');
  words.append(name, make('span', what, 'gear-hint'));
  head.append(emblem, words);
  return head;
}

/** One officer's row on the roster: who they are, their level's meter, their duty, and its presses. */
function officerRow(context: PageContext, officer: GearOfficer, open: (id: number) => void): HTMLElement {
  const shown = officerShown(officer);
  const row = make('div', '', `ship-officer ${ROLES.panel}`);
  row.setAttribute('role', 'listitem');
  const duties = make('div', '', 'ship-duties');
  duties.setAttribute('role', 'group');
  duties.setAttribute('aria-label', `${shown.name}'s duty`);
  for (const duty of shown.duties) {
    const press = pressOf(duty.label, () => context.ask(duty.ask), duty.chosen ? 'primary' : 'button');
    press.classList.toggle('gear-chosen', duty.chosen);
    press.dataset['key'] = `duty-${officer.id}-${duty.ask.slot ?? 0}`;
    press.setAttribute('aria-pressed', String(duty.chosen));
    duties.append(press);
  }
  const nodes = pressOf('Nodes', () => open(officer.id));
  nodes.dataset['key'] = `officer-${officer.id}`;
  // Paying off is held, as dismantling is: an officer paid off is gone, and nothing is given back.
  const payOff = heldPress('Hold to pay off', () => context.ask(shown.dismiss), 'warn');
  payOff.dataset['key'] = `dismiss-${officer.id}`;
  payOff.setAttribute('aria-label', `Hold to pay off ${shown.name}: they leave, and nothing is given back`);
  const actions = make('div', '', 'ship-officer-actions');
  actions.append(nodes, payOff);
  row.append(officerHead(shown, shown.duty), bar('Toward their next level', shown.toNext), duties, actions);
  return row;
}

/** One officer's page: who they are, and their node grid, trained and chosen as an item's nodes are. */
function officerPage(context: PageContext, officer: GearOfficer): HTMLElement {
  const page = make('div', '', `ship-officer-page ${ROLES.panel}`);
  rarityOf(page, officer.grade);
  page.append(officerHead(officerShown(officer)));
  const perks = traitsShown(officer);
  if (perks.length > 0) page.append(heading('Perks'), ...perks.map((perk) => traitNode(perk)));
  page.append(heading('Nodes'), nodeGrid(context, officerAsItem(officer), officerColumns(officer)));
  return page;
}

/** Crew: the roster, or one officer's page. */
function crewPart(context: PageContext, officer: number | null, open: (id: number | null) => void): HTMLElement {
  const officers = context.gear.ship?.officers ?? [];
  const chosen = officers.find((each) => each.id === officer);
  if (chosen) return officerPage(context, chosen);
  const roster = make('div', '', 'ship-roster');
  roster.setAttribute('role', 'list');
  roster.append(...officers.map((each) => officerRow(context, each, open)));
  if (officers.length === 0)
    roster.append(make('p', "No officers yet. Sign them on at your faction's counter.", 'gear-hint gear-empty'));
  return roster;
}

/** The ship tab: Manage or Crew, chosen as the inventory's shelves are, and on Crew the officer whose page is open;
 *  `choose` moves to another part, or another officer's page. */
export function shipTab(
  context: PageContext,
  panel: ShipPanel | null,
  [part, officer]: readonly [string, number | null],
  choose: (part: string, officer: number | null) => void,
): HTMLElement {
  const open = (id: number | null) => choose('crew', id);
  const page = make('div', '', 'ship-tab');
  const parts = make('div', '', `gear-shelves ${ROLES.well}`);
  parts.setAttribute('role', 'tablist');
  const shown = part === 'crew' ? 'crew' : 'manage';
  for (const each of SHIP_PARTS) {
    const press = make('button', '', 'gear-shelf');
    press.dataset['key'] = `ship-${each.id}`;
    press.setAttribute('role', 'tab');
    press.setAttribute('aria-selected', String(each.id === shown));
    press.classList.toggle('gear-chosen', each.id === shown);
    press.append(make('span', each.name));
    press.addEventListener('click', () => choose(each.id, null));
    parts.append(press);
  }
  page.append(parts, shown === 'crew' ? crewPart(context, officer, open) : managePart(context, panel));
  return page;
}

/** The officers of the day, each held to sign on, on the screen of the keeper of `faction`'s counter: none but at the
 *  faction pledged to's. */
export function musterAt(context: PageContext, faction: number | undefined): HTMLElement[] {
  const pledge = context.gear.standing?.pledge ?? 0;
  if (pledge === 0 || faction !== pledge) return [];
  const muster = make('section', '', `ship-muster ${ROLES.panel}`);
  muster.append(heading('The muster'));
  const offered = musterOf(context.gear, pledge);
  for (const offer of offered) {
    const row = make('div', '', 'ship-offer');
    const sign = heldPress('Hold to sign on', () => context.ask(offer.ask));
    sign.setAttribute('aria-label', `Hold to sign on ${offer.officer.name} for ${offer.wage.toLocaleString()} Aurem`);
    sign.dataset['key'] = `recruit-${offer.ask.node ?? 0}`;
    if (!offer.affordable) sign.setAttribute('aria-disabled', 'true');
    const price = make('span', '', `gear-price${offer.affordable ? '' : ' gear-short'}`);
    price.append(glyphImage('aurem'), make('b', offer.wage.toLocaleString()));
    if (!offer.affordable) price.append(make('span', 'Not enough Aurem', 'gear-hint'));
    row.append(officerHead(offer.officer), price, sign);
    muster.append(row);
  }
  if (offered.length === 0) muster.append(make('p', NO_OFFERS, 'gear-hint'));
  return [muster];
}

/** The Harbourmaster's counter: the Shipwright's modules of the day, each held to buy, as Destiny's vendors sell. */
export function harbourPage(context: PageContext): HTMLElement {
  const page = make('div', '', 'ship-harbour gear-vendor');
  const stall = vendorsOf(context.gear)[SHIPWRIGHT];
  if (!stall) return page;
  const wares = make('div', '', 'gear-wares');
  stall.wares.forEach((ware, place) => {
    const nth = SHIPWRIGHT * WARES + place;
    const item = context.gear.wares[nth];
    // One the player cannot pay for says so, and cannot be held; its picture charges as it is held.
    const block = heldPress('', () => context.ask(ware.press.ask), 'button', { charges: () => cell });
    block.classList.add('gear-ware');
    block.dataset['key'] = `buy-${nth}`;
    if (!ware.affordable) block.setAttribute('aria-disabled', 'true');
    const cell = make('div', '', `gear-cell ${ROLES.tile}`);
    rarityOf(cell, item?.rarity ?? null);
    // A module's glyph stands for its picture.
    const glyph = item ? moduleGlyph(item.kind) : null;
    const drawn = glyph ? glyphImage(glyph) : null;
    drawn?.classList.add('ship-glyph');
    cell.append(drawn ?? (item ? itemIcon(context.picture(item), ware.tile.name, WARE_PX) : glyphImage('empty')));
    if (item) itemMarks(cell, item);
    const words = make('div', '', 'gear-ware-words');
    const name = make('b', ware.tile.name);
    name.style.color = ware.tile.colour;
    words.append(name, make('span', `${ware.kind} · level ${ware.level}`, 'gear-hint'));
    if (ware.tile.power) words.append(make('span', ware.tile.power, 'gear-ware-power'));
    const price = make('span', '', `gear-price${ware.affordable ? '' : ' gear-short'}`);
    price.append(glyphImage('aurem'), make('b', ware.price.toLocaleString()));
    if (!ware.affordable) price.append(make('span', 'Not enough Aurem', 'gear-hint'));
    words.append(price);
    block.append(cell, words);
    // Said as it reads: the kind already names its rarity.
    const said = [
      ware.tile.name,
      ware.kind,
      `level ${ware.level}`,
      ware.tile.power,
      `${ware.price.toLocaleString()} Aurem`,
    ];
    said.push(ware.affordable ? 'hold to buy' : 'not enough Aurem');
    block.setAttribute('aria-label', said.filter(Boolean).join(', '));
    if (item) {
      const worn = context.gear.items.find((each) => each.at === WORN + item.bucket) ?? null;
      context.tip.over(block, () => cardNode(cardOf(item, worn), context.picture(item), [['Hold', 'Buy']]));
    }
    wares.append(block);
  });
  page.append(wares);
  return page;
}

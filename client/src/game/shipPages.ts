// The ship's tab of the menu, drawn by the game. Manage: its papers (what the naval rules say a ship of its hull is),
// its power with a meter to its next level, its four modules and those carried, each a tile opening the module's
// page with its node grid, its materials and its hands. Crew: each officer by name, post and grade, their level's
// meter, their duty and the presses that change it, paying them off, and their node grid on a page of their own. Then
// the Shipwright's wares, part of the Harbourmaster's counter (harbour/harbourPage.ts); and the muster of the
// officers of the day, on the screen of the faction pledged to's keeper, whose counter signs them on.

import type { GearItem, GearOfficer } from '../network/gearMessages.ts';
import { WORN } from '../player/gear.ts';
import type { Child, Drawing, Node } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import { cardNode, traitNode } from './gearCard.ts';
import { cardOf, traitsShown } from './gearCards.ts';
import { fillNode, quiver, washNode } from './gearHold.ts';
import {
  INK,
  focusRing,
  glyphNode,
  itemIconNode,
  itemMarks,
  label,
  rarityRgb,
  tileLabel,
  tileNode,
  words,
} from './gearNodes.ts';
import { tileOf, vendorsOf } from './gearScreen.ts';
import { shelvesNode } from './inventoryPage.ts';
import { bar, nodeGrid } from './itemPage.ts';
import type { MenuContext } from './menuPage.ts';
import { headingNode, hintNode, shipPage } from './menuPages.ts';
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

/** What the Ship tab says before the player keeps a ship. */
export const NO_SHIP_YET = "You have no ship yet. The Harbourmaster in Overlook's market has one for you.";
/** The Shipwright's number among the vendors (`Vendor::ALL`). */
const SHIPWRIGHT = 2;
/** A tile and the glyph or picture in it, a module's press, and an officer's emblem small and on their page, in
 *  pixels; the narrowest an officer's panel stands, and the gaps between the roster's panels and Manage's columns. */
const TILE = 64;
const TILE_PX = 48;
const MODULE_WIDTH = 143;
const EMBLEM = 56;
const EMBLEM_LARGE = 108;
const OFFICER_LEAST = 374;
const ROSTER_GAP = 10;
const MANAGE_GAP = 18;
/** The papers' share of Manage's width against its power's 1.4. */
const PAPERS_SHARE = 1 / 2.4;

/** The ship tab's parts, as the inventory's shelves are chosen. */
export const SHIP_PARTS = [
  { id: 'manage', name: 'Manage' },
  { id: 'crew', name: 'Crew' },
] as const;

/** A heading over its rule, 4 px clear above and 10 px below, unless `padding` says. */
const heading = (said: string, padding: readonly [number, number, number, number] = [4, 0, 10, 0]): Node => ({
  width: 'grow',
  padding,
  children: [headingNode(said)],
});

/** A press's padding here, as the kit's presses stand. */
const PRESS = [9, 14] as const;

/** What the kit's press leaves of itself on a module's press, which wears no ground or bevel: its 1 px outline and its
 *  hard drop to the right and below. */
const pressShade: Drawing = (renderer, { x, y, width, height }, scale, clip, shown) => {
  const drop = [0, 0, 0, 0.45 * shown] as const;
  renderer.quads.add({ x: x + width, y: y + scale, width: 3 * scale, height: height + 2 * scale }, drop, clip);
  renderer.quads.add({ x: x + scale, y: y + height, width: width - scale, height: 3 * scale }, drop, clip);
  const [red, green, blue] = colourOf(INK.outline);
  const ring = [red, green, blue, shown] as const;
  for (const line of [
    { x: x - scale, y: y - scale, width: width + 2 * scale, height: scale },
    { x: x - scale, y: y + height, width: width + 2 * scale, height: scale },
    { x: x - scale, y, width: scale, height },
    { x: x + width, y, width: scale, height },
  ])
    renderer.quads.add(line, ring, clip);
};

/** Whether the pointer is over press `id`, or the keys gave it the focus. */
const litOf = ({ ui }: MenuContext, id: string): boolean => ui.hovered(id) || (ui.focused(id) && ui.keyFocused);

/** A module's tile: its glyph framed in its rarity, its name and main number; a click opens its page. */
function moduleTile(context: MenuContext, item: GearItem): Node {
  const { ui } = context;
  const tile = tileOf(item);
  const id = `item-${item.id}`;
  if (ui.clicked(id)) context.inspect(item);
  context.details(id, item);
  const { marks, gilded } = itemMarks(item);
  return {
    id,
    press: true,
    label: tileLabel(tile.name, item.rarity, `level ${item.level} ${tile.power}`.trim()),
    width: MODULE_WIDTH,
    direction: 'column',
    alignX: 'center',
    gap: 2,
    padding: 4,
    draw: pressShade,
    children: [
      tileNode(TILE, item.rarity, litOf(context, id) ? 'lit' : 'rest', [glyphNode(moduleGlyph(item.kind) ?? 'empty')], {
        gilded,
        marks: [...marks, ui.focused(id) && ui.keyFocused && focusRing(TILE, TILE)],
      }),
      words(tile.name, 1, tile.colour),
      words(`Level ${item.level}`, 1, INK.faint),
      words(tile.power, 1, INK.faint),
    ],
  };
}

/** A slot with nothing fitted: its glyph sunk in a vacant tile. */
function emptySlot(name: string, glyph: Parameters<typeof glyphNode>[0]): Node {
  return {
    width: MODULE_WIDTH,
    direction: 'column',
    alignX: 'center',
    gap: 2,
    padding: 4,
    children: [
      tileNode(TILE, null, 'rest', [{ ...glyphNode(glyph), opacity: 0.35 }], { faded: 0.55 }),
      words(name, 1, INK.faint),
      words('None fitted', 1, INK.faint),
    ],
  };
}

/** Its four materials in one row, each glyph at twice its cells so its grain and rings read, its count and name under
 *  it; then its hands of its complement. */
function storesOf(ship: NonNullable<MenuContext['gear']['ship']>, width: number, size: number): Child[] {
  const chip = Math.floor((width - 3 * 6) / 4);
  return [
    heading('Materials'),
    {
      width: 'grow',
      gap: 6,
      padding: [0, 0, 6, 0],
      children: SHIP_MATERIALS.map(({ name, glyph }, index): Node => {
        const count = (ship.stocks[index] ?? 0).toLocaleString('en');
        return {
          role: 'chip',
          width: chip,
          direction: 'column',
          alignX: 'center',
          gap: 2,
          padding: [6, 6, 8, 6],
          label: `${count} ${name}`,
          children: [
            glyphNode(glyph),
            { gap: 5, alignY: 'end', children: [words(count, size, INK.word), words(name, 1, INK.faint)] },
          ],
        };
      }),
    },
    heading('Crew'),
    {
      width: 'grow',
      padding: [3, 0],
      children: [
        { width: 'grow', ...words('Hands aboard', 1, INK.faint) },
        words(`${ship.hands} / ${ship.handsMost}`, 1, INK.word),
      ],
    },
  ];
}

/** Its power: its level with its meter, its numbers beside it; then its modules fitted and carried. */
function powerPanel(context: MenuContext, ship: NonNullable<MenuContext['gear']['ship']>): Node {
  const power = shipPowerOf(ship);
  const numbers: readonly (readonly [string, number])[] = [
    ['Attack', power.attack],
    ['Defense', power.defense],
    ['Prestige', power.prestige],
  ];
  const carried = carriedModules(context.gear);
  const modules = (children: readonly Child[]): Node => ({
    width: 'grow',
    gap: 10,
    wrap: true,
    padding: [0, 0, 6, 0],
    children,
  });
  return {
    role: 'panel',
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [6, 20, 13, 20],
    children: [
      {
        width: 'grow',
        gap: 22,
        alignY: 'center',
        children: [
          {
            direction: 'column',
            alignX: 'center',
            children: [label('Ship level', 1), words(String(power.level), 5, INK.brassLit)],
          },
          {
            gap: 33,
            children: numbers.map(([said, value]): Node => ({
              direction: 'column',
              gap: 2,
              children: [words(said, 1, INK.faint), words(String(value), 2, INK.word)],
            })),
          },
          {
            width: 'grow',
            direction: 'column',
            gap: 4,
            children: [
              bar(context, 'Toward the next level', power.toNext),
              { width: 'grow', text: { words: power.toNextWords, colour: INK.faint } },
            ],
          },
        ],
      },
      heading('Fitted', [4, 0, 4, 0]),
      modules(
        fittedOf(context.gear).map((slot) =>
          slot.item ? moduleTile(context, slot.item) : emptySlot(slot.name, slot.key),
        ),
      ),
      heading('Carried', [4, 0, 4, 0]),
      modules(
        carried.length > 0
          ? carried.map((item) => moduleTile(context, item))
          : [hintNode('None carried. The Shipwright sells them.')],
      ),
    ],
  };
}

/** Manage: its papers, with its materials and hands, beside its power. Without the room's word on the ship, its papers
 *  alone in their column. */
function managePart(context: MenuContext, panel: ShipPanel | null): Node {
  const { gear, sizes, room } = context;
  const left = Math.floor((room.width - MANAGE_GAP) * PAPERS_SHARE);
  const ship = gear.ship;
  // The papers' panel leaves its own frame and padding round what it holds.
  const stores = ship ? storesOf(ship, left - 48, sizes.name) : [];
  return {
    width: 'grow',
    gap: MANAGE_GAP,
    children: [{ width: left, children: [shipPage(panel, sizes, stores, true)] }, ship && powerPanel(context, ship)],
  };
}

/** An officer's post's emblem framed in their grade, beside their name in its colour at the names' `size` and what
 *  they are at `hint`'s: post, grade and level, and with `duty` their duty; on their own page (`large`) at four times
 *  its cells. */
function officerHead(shown: OfficerShown, size: number, duty = '', large = false, hint = 1): Node {
  const what = [shown.post, shown.grade, `level ${shown.level}`, duty.toLowerCase()].filter(Boolean).join(' · ');
  const side = large ? EMBLEM_LARGE : EMBLEM;
  return {
    width: 'grow',
    gap: 12,
    alignY: 'center',
    children: [
      tileNode(side, shown.rarity, 'rest', [glyphNode(shown.glyph, large ? 96 : TILE_PX)]),
      {
        width: 'grow',
        direction: 'column',
        gap: 2,
        children: [
          words(shown.name, large ? 2 : size, shown.colour),
          { width: 'grow', text: { words: what, size: hint, colour: INK.faint } },
        ],
      },
    ],
  };
}

/** A press that acts once held, in `role`, its fill showing how long is left; flat, and never acting, while it cannot
 *  be had (`short`). */
function heldPress(
  context: MenuContext,
  id: string,
  said: string,
  act: () => void,
  more: Partial<Node> = {},
  size = 1,
): Node {
  const { ui, holds } = context;
  const short = more.state === 'disabled';
  const charged = short ? 0 : holds.press(ui, id, act);
  return {
    id,
    press: true,
    role: 'button',
    label: said,
    padding: PRESS,
    alignX: 'center',
    alignY: 'center',
    ...more,
    children: [words(said, size, INK.word), fillNode(charged, more.role === 'warn')],
  };
}

/** One officer's panel on the roster: who they are, their level's meter, their duty, and its presses. */
function officerRow(context: MenuContext, officer: GearOfficer, open: (id: number) => void, width: number): Node {
  const { ui } = context;
  const shown = officerShown(officer);
  const inner = width - 32;
  const nodes = `officer-${officer.id}`;
  if (ui.clicked(nodes)) open(officer.id);
  const duties = shown.duties.map((duty): Node => {
    const id = `duty-${officer.id}-${duty.ask.slot ?? 0}`;
    if (ui.clicked(id)) context.ask(duty.ask);
    return {
      id,
      press: true,
      role: duty.chosen ? 'primary' : 'button',
      label: duty.chosen ? `${duty.label}, chosen` : duty.label,
      width: Math.floor((inner - 12) / 3),
      padding: PRESS,
      alignX: 'center',
      alignY: 'center',
      children: [
        words(duty.label, 1, duty.chosen ? INK.brassLit : INK.word),
        // The duty they hold is lit, as a chosen shelf is.
        duty.chosen && {
          width: 'grow',
          height: 2,
          fill: INK.brassLit,
          float: { to: 'parent', clipped: true, anchor: [0, 1], at: [0, 1], y: -2 },
        },
      ],
    };
  });
  return {
    role: 'panel',
    width,
    direction: 'column',
    gap: 8,
    padding: [14, 16],
    children: [
      officerHead(shown, context.sizes.name, shown.duty),
      bar(context, 'Toward their next level', shown.toNext),
      { width: 'grow', gap: 6, children: duties },
      {
        width: 'grow',
        gap: 6,
        children: [
          {
            id: nodes,
            press: true,
            role: 'button',
            label: 'Nodes',
            padding: PRESS,
            children: [words('Nodes')],
          },
          // Paying off is held, as dismantling is: an officer paid off is gone, and nothing is given back.
          heldPress(context, `dismiss-${officer.id}`, 'Hold to pay off', () => context.ask(shown.dismiss), {
            role: 'warn',
            width: 'grow',
            label: `Hold to pay off ${shown.name}: they leave, and nothing is given back`,
          }),
        ],
      },
    ],
  };
}

/** One officer's page: who they are, the perks they give, and their node grid, trained and chosen as an item's nodes
 *  are. */
function officerPage(context: MenuContext, officer: GearOfficer): Node {
  const size = context.sizes.label;
  const perks = traitsShown(officer);
  return {
    role: 'panel',
    width: 'grow',
    direction: 'column',
    gap: 8,
    padding: [14, 16],
    children: [
      officerHead(officerShown(officer), context.sizes.name, '', true),
      ...(perks.length > 0 ? [heading('Perks'), ...perks.map((perk) => traitNode(perk, size))] : []),
      heading('Nodes'),
      nodeGrid(context, { ...officerAsItem(officer), rarity: officer.grade }, officerColumns(officer)),
    ],
  };
}

/** Crew: the roster, as many panels a row as fit 374 px wide, or one officer's page. */
function crewPart(context: MenuContext, officer: number | null, open: (id: number | null) => void): Node {
  const officers = context.gear.ship?.officers ?? [];
  const chosen = officers.find((each) => each.id === officer);
  if (chosen) return officerPage(context, chosen);
  const width = context.room.width;
  const across = Math.max(1, Math.floor((width + ROSTER_GAP) / (OFFICER_LEAST + ROSTER_GAP)));
  const each = Math.floor((width - (across - 1) * ROSTER_GAP) / across);
  // With none, the words stand where the first officer's panel would, in the middle of its column.
  if (officers.length === 0)
    return {
      width: Math.min(each, 420),
      padding: [48, 0],
      children: [
        {
          width: 'grow',
          text: {
            words: "No officers yet. Sign them on at your faction's counter.",
            size: context.sizes.name,
            colour: INK.faint,
            align: 'center',
          },
        },
      ],
    };
  const rows: Node[] = [];
  for (let start = 0; start < officers.length; start += across)
    rows.push({
      gap: ROSTER_GAP,
      children: officers.slice(start, start + across).map((one) => officerRow(context, one, open, each)),
    });
  return { width: 'grow', direction: 'column', gap: ROSTER_GAP, children: rows };
}

/** The ship tab: Manage or Crew, chosen as the inventory's shelves are, and on Crew the officer whose page is open;
 *  `choose` moves to another part, or another officer's page. */
export function shipTab(
  context: MenuContext,
  panel: ShipPanel | null,
  [part, officer]: readonly [string, number | null],
  choose: (part: string, officer: number | null) => void,
): Node {
  const shown = part === 'crew' ? 'crew' : 'manage';
  // A new player keeps no ship until the Harbourmaster hands over the first; a room that sends no ship's part is
  // taken as one that keeps it.
  if (context.gear.ship?.fleet.length === 0) return hintNode(NO_SHIP_YET);
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      { children: [shelvesNode(context, SHIP_PARTS, shown, (chosen) => choose(chosen, null), 'ship')] },
      shown === 'crew' ? crewPart(context, officer, (id) => choose('crew', id)) : managePart(context, panel),
    ],
  };
}

/** A price in Aurem: its glyph and amount, and when it cannot be met, saying so, its words at `size`. */
function priceNode(amount: number, affordable: boolean, size = 1): Node {
  return {
    gap: 4,
    alignY: 'end',
    children: [
      glyphNode('aurem', 36),
      words(amount.toLocaleString('en'), size, INK.word),
      !affordable && words('Not enough Aurem', size, INK.loss),
    ],
  };
}

/** The officers of the day, each held to sign on, on the screen of the keeper of `faction`'s counter: none but at the
 *  faction pledged to's. */
export function musterAt(context: MenuContext, faction: number | undefined): Node[] {
  const pledge = context.gear.ship?.pledge ?? 0;
  if (pledge === 0 || faction !== pledge) return [];
  const offered = musterOf(context.gear, pledge);
  // Its words stand at the keeper's screen's size, as the rest of its side does.
  const size = context.sizes.label;
  const rows = offered.map((offer): Node => ({
    width: 'grow',
    gap: 12,
    alignY: 'center',
    padding: [6, 0],
    children: [
      officerHead(offer.officer, context.sizes.name, '', false, size),
      priceNode(offer.wage, offer.affordable, size),
      heldPress(
        context,
        `recruit-${offer.ask.node ?? 0}`,
        'Hold to sign on',
        () => context.ask(offer.ask),
        {
          label: `Hold to sign on ${offer.officer.name} for ${offer.wage.toLocaleString('en')} Aurem`,
          ...(!offer.affordable && { state: 'disabled' }),
        },
        size,
      ),
    ],
  }));
  return [
    {
      width: 'grow',
      padding: [0, 18, 14, 18],
      children: [
        {
          role: 'panel',
          width: 'grow',
          direction: 'column',
          padding: [14, 20],
          children: [
            { width: 'grow', padding: [4, 0, 10, 0], children: [headingNode('The muster', null, size)] },
            ...(rows.length > 0
              ? rows
              : [{ width: 'grow', text: { words: NO_OFFERS, size, colour: INK.faint } } satisfies Node]),
          ],
        },
      ],
    },
  ];
}

/** The Shipwright's part of the Harbourmaster's counter: its modules of the day, each held to buy, as Destiny's
 *  vendors sell. */
export function shipwrightPart(context: MenuContext): Node {
  const { ui, holds, gear, sizes } = context;
  const stall = vendorsOf(gear)[SHIPWRIGHT];
  const wares = (stall?.wares ?? []).map((ware, place): Node => {
    const item = ware.item;
    const id = `buy-${SHIPWRIGHT}-${place}`;
    const rgb = rarityRgb(item?.rarity ?? null);
    // One the player cannot pay for says so, and cannot be held; its picture charges as it is held.
    const charged = ware.affordable ? holds.press(ui, id, () => context.ask(ware.press.ask), { rgb }) : 0;
    if (item) {
      const worn = gear.items.find((each) => each.at === WORN + item.bucket) ?? null;
      context.card(id, () => cardNode(cardOf(item, worn), context.picture(item), [['Hold', 'Buy']], sizes));
    }
    // A module's glyph stands for its picture.
    const glyph = item ? moduleGlyph(item.kind) : null;
    const icon = glyph
      ? glyphNode(glyph)
      : item
        ? itemIconNode(context.picture(item), ware.tile.name, TILE_PX, sizes, item.rarity)
        : glyphNode('empty');
    const shaken = quiver(charged);
    const { marks, gilded } = item ? itemMarks(item) : { marks: [], gilded: false };
    // Said as it reads: the kind already names its rarity.
    const said = [ware.tile.name, ware.kind, `level ${ware.level}`, ware.tile.power];
    said.push(`${ware.price.toLocaleString('en')} Aurem`, ware.affordable ? 'hold to buy' : 'not enough Aurem');
    return {
      id,
      press: true,
      role: 'button',
      ...(!ware.affordable && { state: 'disabled' as const }),
      label: said.filter(Boolean).join(', '),
      // The tile, and under it a line of its words, as the stall stood them.
      padding: [8, 14],
      direction: 'column',
      gap: 8,
      children: [
        tileNode(
          TILE,
          item?.rarity ?? null,
          litOf(context, id) ? 'lit' : 'rest',
          [shaken ? { ...icon, offset: shaken } : icon],
          { gilded, marks: [...marks, washNode(charged, rgb)] },
        ),
        {
          gap: 6,
          alignY: 'end',
          children: [
            words(ware.tile.name, 1, ware.tile.colour),
            words(`${ware.kind} · level ${ware.level}`, 1, INK.faint),
            ware.tile.power !== '' && words(ware.tile.power, 1, INK.word),
            priceNode(ware.price, ware.affordable),
          ],
        },
        fillNode(charged),
      ],
    };
  });
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    children: [{ width: 'grow', wrap: true, children: wares }],
  };
}

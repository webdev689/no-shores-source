// The character page, after Destiny's: the player's own figure in the middle under their level and its meter, their
// power beneath it; the worn Art's diamond, the Melee and Ranged loadouts (the Ranged with its shots left), the cloak
// and the Appearance button in rows to its left, level with the armour's rows to its right, each slot its item's own
// picture in a frame of its rarity. Hovering or focusing a slot shows its item's card; a click opens its flyout of the
// nine it carries, toward the figure, each worn by a click and dismantled by holding F; a right press (or X) on any
// opens the item's page.

import { ASKS, type GearItem, type GearState } from '../network/gearMessages.ts';
import { ELEMENTS, RANGED_SLOT, RARITIES, SLOTS, capital, itemName } from '../player/gear.ts';
import { LARGE_CAP } from '../player/iconFit.ts';
import type { Child, Node } from '../ui/node.ts';
import { rarityNumber } from './appearance/appearanceModel.ts';
import { wardrobeSvg } from './appearance/appearanceMarks.ts';
import { levelOf } from './artLevels.ts';
import { artCard, artOf, emblemSvg } from './artsCards.ts';
import { ART_DIAMOND_KEY } from './artsPage.ts';
import { APPEARANCE_KEY } from './appearanceButton.ts';
import { emblemOf } from './emblemArt.ts';
import { cardFrame, cardName, cardNode, elementTone, rarityTone } from './gearCard.ts';
import { cardOf, flyoutOf, wearIn } from './gearCards.ts';
import { DISMANTLE_KEY, quiver, washNode } from './gearHold.ts';
import {
  type Hint,
  INK,
  emblemNode,
  focusRing,
  glyphNode,
  itemIconNode,
  itemMarks,
  label,
  pictureNode,
  rarityRgb,
  svgNode,
  tileLabel,
  tileNode,
  words,
} from './gearNodes.ts';
import { characterOf } from './gearScreen.ts';
import type { MenuContext } from './menuPage.ts';

/** The slots each side of the figure, by the gear's slot numbers. */
const WEAPONS = [0, 1, 6];
const ARMOUR = [2, 3, 4, 5];
/** A slot's tile and picture box, a flyout cell's, in pixels; a slot's a step less on a short screen. */
const SLOT_TILE = 88;
const SLOT_TILE_SHORT = 77;
const SLOT_PX = 72;
const CELL_TILE = 64;
const CELL_PX = 48;
/** The figure's box: what the screen's body leaves it beside the level, the meter and the power, within these. */
const FIGURE_LEAST = 240;
const FIGURE_MOST = 720;
const FIGURE_AROUND = 264;

/** What a worn slot's presses do, and a carried piece's. */
const SLOT_HINTS: readonly Hint[] = [
  ['Click', 'Swap'],
  ['Right-click / X', 'Details'],
];
const CELL_HINTS: readonly Hint[] = [
  ['Click', 'Equip'],
  ['Right-click / X', 'Details'],
  [DISMANTLE_KEY, 'Hold to dismantle'],
];

/** The ammunition left in the Ranged loadout worn, of its capacity, or none; null with none worn. */
export function ammoLine(gear: GearState): { readonly words: string; readonly none: boolean } | null {
  const [left, most] = [gear.ammo ?? 0, gear.ammoMost ?? 0];
  if (most === 0) return null;
  return left > 0 ? { words: `Ammo ${left} of ${most}`, none: false } : { words: 'No ammo', none: true };
}

/** Whether `id` stands lit: under the pointer, or given the focus by the keys. */
const litOf = (context: MenuContext, id: string) =>
  context.ui.hovered(id) || (context.ui.focused(id) && context.ui.keyFocused);

/** A slot's words: its name, the item's in its rarity's colour, and the Ranged loadout's shots. */
function slotWords(
  context: MenuContext,
  name: string,
  item: string | null,
  colour: string,
  extra: Child,
  end: boolean,
): Node {
  const { sizes } = context;
  const most = sizes.name > 1 ? 280 : 180;
  return {
    direction: 'column',
    gap: 2,
    maxWidth: most,
    alignX: end ? 'end' : 'start',
    children: [
      label(name, sizes.label),
      item !== null && { maxWidth: most, text: { words: item, size: sizes.name, colour, ellipsis: true, wrap: false } },
      extra,
    ],
  };
}

/** A press's tile in the page's flow, its words beside it, toward the figure. */
function holder(id: string, tile: Node, said: Node, end: boolean, flyout: Child = null): Node {
  return { id, gap: 12, alignY: 'center', children: end ? [said, tile, flyout] : [tile, said, flyout] };
}

/** A carried piece's cell in a slot's flyout: worn by a click, dismantled by holding F, its card beside the flyout. */
function cellNode(context: MenuContext, item: GearItem | null, worn: GearItem | null): Node {
  const { ui, holds, sizes } = context;
  if (!item) return tileNode(CELL_TILE, null, 'rest', [glyphNode('empty', 24)], { faded: 0.55 });
  const id = `item-${item.id}`;
  const rgb = rarityRgb(item.rarity);
  const charged = holds.dismantle(ui, id, item.rarity, rgb, () => context.ask({ kind: ASKS.dismantle, item: item.id }));
  if (ui.clicked(id)) {
    const wear = wearIn(item);
    if (wear) context.ask(wear.ask);
  }
  if (ui.rightClicked(id)) context.inspect(item);
  context.details(id, item);
  context.card(id, () => cardNode(cardOf(item, worn), context.picture(item), CELL_HINTS, sizes), 'flyout');
  const icon = itemIconNode(context.picture(item), itemName(item), CELL_PX, sizes, item.rarity);
  const { marks, gilded } = itemMarks(item);
  const shaken = quiver(charged);
  return tileNode(
    CELL_TILE,
    item.rarity,
    litOf(context, id) ? 'lit' : 'rest',
    [shaken ? { ...icon, offset: shaken } : icon],
    {
      id,
      press: true,
      label: tileLabel(itemName(item), item.rarity),
      gilded,
      marks: [...marks, washNode(charged, rgb), ui.focused(id) && ui.keyFocused && focusRing(CELL_TILE, CELL_TILE)],
    },
  );
}

/** A slot's flyout: its name and how many of the nine it carries, then the nine, toward the figure. */
function flyoutNode(context: MenuContext, slot: number, end: boolean, low: boolean): Node {
  const { worn, cells } = flyoutOf(context.gear, slot);
  const filled = cells.filter(Boolean).length;
  const name = capital(SLOTS[slot] ?? '');
  return {
    id: 'flyout',
    role: 'panel',
    padding: 10,
    direction: 'column',
    gap: 8,
    solid: true,
    float: {
      to: 'parent',
      anchor: [end ? 0 : 1, low ? 1 : 0],
      at: [end ? 1 : 0, low ? 1 : 0],
      x: end ? 10 : -10,
      y: low ? 8 : -8,
      z: 26,
    },
    children: [
      label(`${name} · ${filled} of ${cells.length} carried`, context.sizes.label),
      filled === 0 && words('Nothing carried for this slot yet.', 1, INK.faint),
      {
        direction: 'column',
        gap: 6,
        children: [0, 1, 2].map((row) => ({
          gap: 6,
          children: cells.slice(row * 3, row * 3 + 3).map((item) => cellNode(context, item, worn)),
        })),
      },
    ],
  };
}

/** Closes an open slot's flyout once a pointer that was over the slot, the flyout or the strip between them leaves
 *  them; one the keys opened while the pointer rests elsewhere stays, and a click or Escape closes it as any does. */
function closedOffHover(context: MenuContext, slot: number): boolean {
  const pointer = context.ui.pointerAt;
  const [tile, grid] = [context.ui.boxOf(`slot-${slot}`), context.ui.boxOf('flyout')];
  if (!pointer || !tile || !grid) return false;
  // Only a pointer that was over them leaves them.
  const was = context.ui.store.get(FLYOUT_HELD) === slot;
  const inside = (box: { x: number; y: number; width: number; height: number }) =>
    pointer.x >= box.x && pointer.y >= box.y && pointer.x < box.x + box.width && pointer.y < box.y + box.height;
  const [left, right] = grid.x > tile.x ? [tile.x + tile.width, grid.x] : [grid.x + grid.width, tile.x];
  const strip = { x: left, y: grid.y, width: right - left, height: grid.height };
  const over = inside(tile) || inside(grid) || inside(strip);
  context.ui.store.set(FLYOUT_HELD, over ? slot : null);
  return was && !over;
}

/** Where the menu keeps which slot's flyout the pointer is over, between frames. */
const FLYOUT_HELD = 'flyout-hovered';

/** A worn slot: its item's picture in a tile of its rarity, its words beside it, and its flyout while open. */
function slotNode(
  context: MenuContext,
  slot: number,
  open: number | null,
  choose: (slot: number | null) => void,
  end: boolean,
  low: boolean,
): Node {
  const { ui, sizes, gear } = context;
  const { worn } = flyoutOf(gear, slot);
  const id = `slot-${slot}`;
  const name = capital(SLOTS[slot] ?? '');
  const size = sizes.short ? SLOT_TILE_SHORT : SLOT_TILE;
  if (ui.clicked(id)) choose(open === slot ? null : slot);
  else if (open === slot && closedOffHover(context, slot)) choose(null);
  if (worn) {
    if (ui.rightClicked(id)) context.inspect(worn);
    context.details(id, worn);
    // An open slot's flyout stands where its card would, so the card waits until it closes.
    if (open !== slot) context.card(id, () => cardNode(cardOf(worn), context.picture(worn), SLOT_HINTS, sizes));
  }
  const { marks, gilded } = worn ? itemMarks(worn) : { marks: [], gilded: false };
  const tile = tileNode(
    size,
    worn?.rarity ?? null,
    open === slot ? 'open' : litOf(context, id) ? 'lit' : 'rest',
    [worn ? itemIconNode(context.picture(worn), itemName(worn), SLOT_PX, sizes, worn.rarity) : glyphNode('empty')],
    {
      id,
      press: true,
      label: `${name}: ${worn ? tileLabel(itemName(worn), worn.rarity) : 'empty'}`,
      gilded,
      marks: [...marks, ui.focused(id) && ui.keyFocused && focusRing(size, size)],
    },
  );
  const ammo = slot === RANGED_SLOT && worn ? ammoLine(gear) : null;
  const said = slotWords(
    context,
    name,
    worn ? itemName(worn) : null,
    worn ? (RARITIES[worn.rarity]?.colour ?? INK.word) : INK.word,
    ammo && words(ammo.words, sizes.label, ammo.none ? INK.loss : INK.faint),
    end,
  );
  return holder(`holder-${slot}`, tile, said, end, open === slot && flyoutNode(context, slot, end, low));
}

/** An Art's level as five pips, lit up to it in its element. */
function pipsSvg(level: number, element: number): string {
  const found = ELEMENTS[element];
  const [lit, fill] = [found?.palette[2] ?? INK.brassLit, found?.colour ?? INK.brass];
  const pips = Array.from({ length: 5 }, (_unused, pip) => {
    const x = pip * 8 + 4;
    const shines = pip < level;
    return `<path d="M${x} 0.8 L${x + 3.2} 4 L${x} 7.2 L${x - 3.2} 4Z" fill="${shines ? fill : '#0b0d12'}" stroke="${shines ? lit : fill}" stroke-width="0.8"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 8">${pips.join('')}</svg>`;
}

/** The worn Art's diamond, which opens its screen, its name in its element and its level's pips beside it. */
function artNode(context: MenuContext): Node | null {
  const { gear, ui, sizes } = context;
  const art = gear.arts ? (artOf(gear.arts.art) ?? null) : null;
  if (!art || !context.arts) return null;
  const level = levelOf(gear.standing, art.id).level;
  if (ui.clicked(ART_DIAMOND_KEY)) context.arts();
  context.card(ART_DIAMOND_KEY, () =>
    cardNode(artCard(art, false, level), null, [['Click', 'Open its screen']], sizes, {
      tone: elementTone(art.element),
      icon: svgNode(`art ${art.id}`, emblemSvg(art), 96),
    }),
  );
  const diamond: Node = {
    id: ART_DIAMOND_KEY,
    press: true,
    label: `Art: ${art.name}, level ${level}`,
    width: 96,
    height: 96,
    picture: { key: `art ${art.id}`, source: { svg: emblemSvg(art) } },
    children: [ui.focused(ART_DIAMOND_KEY) && ui.keyFocused && focusRing(96, 96)],
  };
  const said = slotWords(
    context,
    'Art',
    art.name,
    ELEMENTS[art.element]?.colour ?? INK.word,
    svgNode(`pips ${level} ${art.element}`, pipsSvg(level, art.element), 37, 7),
    true,
  );
  return holder('art-holder', diamond, said, true);
}

/** The Appearance button: the wardrobe mark, with the emblem worn small in its corner; pressed, it opens the
 *  Appearance screen. Its card says what it opens. */
function appearanceNode(context: MenuContext): Node {
  const { gear, ui, sizes } = context;
  const worn = emblemOf(gear.emblem ?? 0);
  const rarity = rarityNumber(worn.rarity);
  const size = sizes.short ? SLOT_TILE_SHORT : SLOT_TILE;
  if (ui.clicked(APPEARANCE_KEY)) context.appearance?.();
  context.card(APPEARANCE_KEY, () =>
    cardFrame(
      sizes,
      rarityTone(0),
      [cardName('Appearance', 0), words('Emblem, Dye, Coat, Barding', sizes.label, INK.word)],
      [
        {
          width: 'grow',
          text: {
            words: "Your emblem, the dye on your armour, and your horse's coat and barding.",
            size: sizes.label,
            colour: INK.faint,
          },
        },
        words(`Emblem: ${worn.name}`, sizes.label, INK.word),
      ],
      [['Click', 'Open']],
    ),
  );
  const tile = tileNode(
    size,
    rarity,
    litOf(context, APPEARANCE_KEY) ? 'lit' : 'rest',
    [svgNode('wardrobe', wardrobeSvg(), 48)],
    {
      id: APPEARANCE_KEY,
      press: true,
      disabled: !context.appearance,
      label: `Appearance: ${worn.name}`,
      marks: [
        { ...emblemNode(worn, 'sign', 24, 24, 24), float: { to: 'parent', anchor: [1, 1], at: [1, 1], x: -4, y: -4 } },
        ui.focused(APPEARANCE_KEY) && ui.keyFocused && focusRing(size, size),
      ],
    },
  );
  return holder('appearance-holder', tile, slotWords(context, 'Appearance', worn.name, INK.word, null, true), true);
}

/** A side's heading over a rule, at its side's edge. */
function heading(said: string, size: number, end: boolean): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [4, 0, 10, 0],
    children: [
      { width: 'grow', alignX: end ? 'end' : 'start', children: [label(said, size)] },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
    ],
  };
}

/** The level, the meter to the next and what it takes, the figure on its lit floor, and the power beneath. */
function middleNode(context: MenuContext, width: number, hidden: boolean): Node {
  const { gear, sizes, figure } = context;
  const character = characterOf(gear);
  const box = Math.min(FIGURE_MOST, Math.max(FIGURE_LEAST, context.room.height - FIGURE_AROUND));
  const [melee, ranged] = character.attack;
  const shown = (value: number | null | undefined) => (value === null || value === undefined ? '—' : String(value));
  const stats: [string, string][] = [
    ['Melee', shown(melee)],
    ['Ranged', shown(ranged)],
    ['Defense', String(character.defense)],
    ['Prestige', String(character.prestige)],
    ['Fruit of Dagon', String(character.fruit)],
  ];
  const tall = sizes.label > 1;
  return {
    width,
    direction: 'column',
    alignX: 'center',
    gap: 10,
    children: [
      {
        width: Math.min(width, tall ? 480 : 300),
        direction: 'column',
        alignX: 'center',
        gap: 4,
        opacity: hidden ? 0 : 1,
        children: [
          label('Level', sizes.label),
          words(String(character.level), 5, INK.brassLit),
          {
            width: 'grow',
            height: 10,
            padding: 2,
            role: 'well',
            label: 'Toward the next level',
            children: [{ width: `${Math.round(character.toNext * 100)}%`, height: 'grow', fill: '#d9d0ae' }],
          },
          words(character.toNextWords, sizes.label, INK.faint),
        ],
      },
      {
        width: 'grow',
        height: box,
        alignX: 'center',
        alignY: 'end',
        picture: {
          key: 'figure floor',
          source: {
            draw: (drawing, across, down) => {
              // A floor of light: an ellipse 34% by 9% of the stand at its foot, drawn round and scaled flat.
              const [wide, tall] = [across * 0.34, down * 0.09];
              drawing.translate(across / 2, down * 0.97);
              drawing.scale(1, tall / wide);
              const floor = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
              floor.addColorStop(0, 'rgba(192,138,62,0.32)');
              floor.addColorStop(1, 'rgba(192,138,62,0)');
              drawing.fillStyle = floor;
              drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
            },
          },
        },
        children: [figure ? pictureNode(figure, box, sizes.ratio, LARGE_CAP) : words('Drawing…', 1, INK.faint)],
      },
      {
        wrap: true,
        alignX: 'center',
        children: stats.flatMap(([name, value], place): Node[] => [
          ...(place > 0 ? [{ width: 1, height: 'grow' as const, fill: 'rgba(255,255,255,0.08)' }] : []),
          {
            direction: 'column',
            alignX: 'center',
            padding: [2, 8],
            children: [tall ? words(name, 2, INK.faint) : label(name, 1), words(value, tall ? 3 : 2, INK.word)],
          },
        ]),
      },
    ],
  };
}

/** The Character page, `open` the slot whose flyout is open; `choose` opens or closes one. */
export function characterPage(context: MenuContext, open: number | null, choose: (slot: number | null) => void): Node {
  const { sizes, room } = context;
  // Three columns share the room between their gaps 1, 1.6 and 1, the figure's widest, each at least so wide.
  const share = (room.width - 48) / 3.6;
  const [side, middle] = [Math.max(220, Math.floor(share)), Math.max(300, Math.floor(share * 1.6))];
  const gap = sizes.short ? 10 : 14;
  const art = artNode(context);
  const left: Node = {
    width: side,
    direction: 'column',
    alignX: 'end',
    gap,
    children: [
      heading('Weapons', sizes.label, true),
      { height: sizes.short ? SLOT_TILE_SHORT : SLOT_TILE, alignY: 'center', children: [art] },
      ...WEAPONS.map((slot, place) => slotNode(context, slot, open, choose, true, place >= WEAPONS.length - 1)),
      appearanceNode(context),
    ],
  };
  const right: Node = {
    width: side,
    direction: 'column',
    gap,
    children: [
      heading('Armour', sizes.label, false),
      ...ARMOUR.map((slot, place) => slotNode(context, slot, open, choose, false, place >= ARMOUR.length - 2)),
    ],
  };
  return {
    width: 'grow',
    minHeight: room.height,
    direction: 'column',
    // The three columns stand from their tops, together in the middle of the room.
    alignY: 'center',
    children: [{ gap: 24, children: [left, middleNode(context, middle, open !== null), right] }],
  };
}

// An item's page, laid over the menu as Destiny 1's weapon page is. At its head the item's tile, its name and its
// kind, rarity, element and level on a band of its rarity. Down the left, its words; its main number large beside its
// fight numbers as bars; its node grid; and the perks it gives, an Atheric's two first. To the right, the item drawn
// large on a lit floor, and with Compare the piece worn in its slot over it. Hovering a node not chosen shows on the
// bars what choosing it would change; comparing, what this piece changes over the one worn. What may be done with it
// goes to the menu's footer.

import type { GearItem, GearState } from '../network/gearMessages.ts';
import { HORSE, RARITIES, STOCK_NAMES, WORN, isModule, isWeapon, resourceName } from '../player/gear.ts';
import { LARGE_CAP } from '../player/iconFit.ts';
import type { Child, Node } from '../ui/node.ts';
import { cardNode, flavourNode, kindLine, traitNode } from './gearCard.ts';
import { ATHERIC_OWN, cardOf, intrinsicOf, ownOf, traitsShown } from './gearCards.ts';
import { HOLD_MS, dismantleMs, fillNode, quiver } from './gearHold.ts';
import { HINTS } from './gearHints.ts';
import {
  type Hint,
  INK,
  boundKey,
  boxWithin,
  elementNode,
  glyphNode,
  hintsNode,
  itemIconNode,
  itemMarks,
  label,
  pictureNode,
  pressNode,
  rarityRgb,
  rgba,
  tileNode,
  words,
} from './gearNodes.ts';
import { itemDetailOf } from './gearScreen.ts';
import { type Cost, nodeAimed, nodeGrid } from './itemNodes.ts';
import { givenTraits, sheetOf, statsOf } from './itemStats.ts';
import type { MenuContext } from './menuPage.ts';
import { moduleGlyph } from './shipGear.ts';
import { play } from './uiSounds.ts';
import { powerNode, statSheetNode } from './statBars.ts';

/** The art's box: the most it takes, and before its place is known, what the page's height leaves it within the
 *  least and the most; and the least height its place keeps. */
const ART_LEAST = 200;
const ART_MOST = 760;
const ART_AROUND = 110;
const ART_LEAST_SHOWN = 140;
/** A module's glyph on its page, in pixels: its 24 cells at eleven times. */
const GLYPH_PX = 264;
/** The item's tile at the page's head, in pixels. */
const HEAD_TILE = 64;
/** The words' column, in pixels: the least it takes, and the most at the first words' size and at the larger, half the
 *  page across between those; then the page's edge, the body's padding across and the gap before the art; and the
 *  fade at the column's foot, which says it scrolls. */
const WORDS_LEAST = 460;
const WORDS_MOST = 600;
const WORDS_MOST_LARGE = 780;
const PAGE_EDGE = 2;
const BODY_ACROSS = 24;
const ART_GAP = 32;
const FADE = 24;
/** The least the bars take across beside the main number, at each size, so a bar keeps its length. */
const SHEET_LEAST = 340;
const SHEET_LEAST_LARGE = 480;
/** The id of the item's art, which charges as a hold on its page is held. */
export const ITEM_ART = 'item-art';
/** The id of the item's name, which takes the focus as its page opens, so the page is read from it. */
export const ITEM_NAME = 'item-name';
/** The id of the page's Compare press. */
export const COMPARE = 'press-compare';

/** Whether an item's page sets the piece worn in its slot beside it: kept from one page to the next until the menu
 *  shuts, so pieces are looked through against what is worn. */
export class Comparing {
  shown = false;

  /** Sets the worn piece beside the page shown in `gear`, or takes it away; nothing where none is worn beside it. */
  toggle(gear: GearState | null, shown: number | null): void {
    const item = gear?.items.find((each) => each.id === shown);
    if (!gear || !item || !wornBeside(gear, item)) return;
    this.shown = !this.shown;
    play('tab');
  }
}

/** A heading over a rule, naming a part of the page; with `hints`, what its presses do at its right. */
function heading(said: string, size: number, hints: readonly Hint[] = []): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [16, 0, 10, 0],
    children: [
      {
        width: 'grow',
        alignY: 'end',
        children: [{ width: 'grow', children: [label(said, size)] }, hints.length > 0 && hintsNode(hints, size, 12)],
      },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
    ],
  };
}

/** What each of a column's nodes costs beside what the player has, in the gear's own materials: Aurem, the item's
 *  fragments and Essence, and its island's resource. */
function costsOf(context: MenuContext, item: GearItem): (column: number) => readonly Cost[] {
  const { gear } = context;
  const [fragments, essence] = isWeapon(item.kind) ? [0, 2] : [1, 3];
  const glyphs = isWeapon(item.kind)
    ? (['weapon-fragments', 'weapon-essence'] as const)
    : (['armor-fragments', 'armor-essence'] as const);
  return (column) => {
    const asks = item.columns[column];
    if (!asks) return [];
    const resource = item.resource;
    const costs: (Cost | null)[] = [
      asks.aurem > 0 ? { glyph: 'aurem', tint: 0, name: 'Aurem', need: asks.aurem, have: gear.aurem } : null,
      asks.fragments > 0
        ? {
            glyph: glyphs[0],
            tint: 0,
            name: STOCK_NAMES[fragments] ?? '',
            need: asks.fragments,
            have: gear.stocks[fragments] ?? 0,
          }
        : null,
      asks.essence > 0
        ? {
            glyph: glyphs[1],
            tint: 0,
            name: STOCK_NAMES[essence] ?? '',
            need: asks.essence,
            have: gear.stocks[essence] ?? 0,
          }
        : null,
      asks.resource > 0 && resource !== null
        ? {
            glyph: 'resource',
            tint: resource,
            name: resourceName(resource),
            need: asks.resource,
            have: gear.resources[resource] ?? 0,
          }
        : null,
    ];
    return costs.filter((cost) => cost !== null);
  };
}

/** The page's head: the item's tile, its name, and its kind, rarity, element and level, on its rarity's band. */
function headNode(context: MenuContext, item: GearItem, detail: ReturnType<typeof itemDetailOf>): Node {
  const { sizes } = context;
  const rgb = rarityRgb(item.rarity);
  const found = RARITIES[item.rarity];
  const { marks, gilded } = itemMarks(item);
  const glyph = moduleGlyph(item.kind);
  const icon = glyph
    ? glyphNode(glyph, 48)
    : itemIconNode(context.picture(item), detail.name, HEAD_TILE - 8, sizes, item.rarity);
  return {
    width: 'grow',
    padding: [14, 24, 14, 24],
    gap: 18,
    alignY: 'center',
    fill: '#15171c',
    picture: {
      key: `item band ${rgb}`,
      source: {
        draw: (drawing, across, down) => {
          const band = drawing.createLinearGradient(0, 0, across, 0);
          band.addColorStop(0, rgba(rgb, 0.36));
          band.addColorStop(0.55, rgba(rgb, 0.14));
          band.addColorStop(1, rgba(rgb, 0.04));
          drawing.fillStyle = band;
          drawing.fillRect(0, 0, across, down);
        },
      },
    },
    children: [
      tileNode(HEAD_TILE, item.rarity, 'rest', [icon], { marks, gilded }),
      {
        width: 'grow',
        direction: 'column',
        gap: 6,
        children: [
          {
            id: ITEM_NAME,
            focusable: true,
            label: detail.name,
            text: {
              words: detail.name,
              size: 3,
              colour: (item.rarity === 0 ? found?.colour : found?.lit) ?? INK.word,
              wrap: false,
              edge: 'shadow',
              edgeColour: 'rgba(0,0,0,0.55)',
            },
          },
          // A horse has no level, as its card says none: it has no stats.
          kindLine(
            detail.kind,
            item.rarity,
            item.element,
            sizes.label,
            item.kind === HORSE
              ? []
              : [{ role: 'chip', padding: [1, 8], children: [words(`Level ${item.level}`, sizes.label, INK.word)] }],
          ),
        ],
      },
    ],
  };
}

/** The main number large beside the fight numbers: Destiny's Attack over its stat bars. Its Prestige stands under the
 *  number, each with its change where the page compares or a node is tried. */
function statsNode(
  context: MenuContext,
  item: GearItem,
  against: GearItem | null,
  [sheet, across]: readonly [ReturnType<typeof sheetOf>, number],
): Node | null {
  const { sizes } = context;
  const size = sizes.label;
  const power = size > 1 ? 220 : 170;
  // The bars stand beside the number where they keep their least across, as Destiny's do; else under it.
  const beside = across - power - 24 >= (size > 1 ? SHEET_LEAST_LARGE : SHEET_LEAST);
  const main = item.attack
    ? { label: 'Attack', value: item.attack, was: against?.attack }
    : item.defense
      ? { label: 'Defense', value: item.defense, was: against?.defense }
      : null;
  if (!main && !sheet) return null;
  const prestige = item.prestige - (against?.prestige ?? item.prestige);
  return {
    width: 'grow',
    gap: 24,
    padding: [12, 0, 4, 0],
    // The number stands level with the middle of its bars.
    alignY: 'center',
    direction: beside ? 'row' : 'column',
    children: [
      main && {
        width: power,
        direction: 'column',
        gap: 10,
        children: [
          {
            gap: 10,
            alignY: 'center',
            // Its element's glyph beside its Attack, as Destiny sets a weapon's damage type beside its number.
            children: [
              elementNode(item.element, size > 1 ? 36 : 28),
              powerNode(main, main.was === undefined ? null : main.value - main.was, 5, size),
            ],
          },
          item.prestige > 0 && {
            gap: 8,
            alignY: 'center',
            children: [
              words(String(item.prestige), 2, INK.word),
              label('Prestige', size),
              prestige !== 0 &&
                words(`${prestige > 0 ? '+' : '−'}${Math.abs(prestige)}`, size, prestige > 0 ? INK.gain : INK.loss),
            ],
          },
        ],
      },
      sheet && {
        width: 'grow',
        padding: [6, 0, 0, 0],
        children: [statSheetNode(sheet, size, true)],
      },
    ],
  };
}

/** The piece worn in the item's slot, which Compare sets beside it, where one is and it is not this one. */
export function wornBeside(gear: GearState, item: GearItem): GearItem | null {
  if (item.at >= WORN || isModule(item.kind)) return null;
  return gear.items.find((each) => each.at === WORN + item.bucket) ?? null;
}

/** The page's own light, in the item's rarity, about where the art stands. */
function glowDrawing(rgb: string): NonNullable<Node['picture']>['source'] {
  return {
    draw: (drawing, across, down) => {
      const [wide, tall] = [across * 0.5, down * 0.6];
      drawing.translate(across * 0.76, down * 0.46);
      drawing.scale(1, tall / wide);
      const glow = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
      glow.addColorStop(0, rgba(rgb, 0.1));
      glow.addColorStop(1, rgba(rgb, 0));
      drawing.fillStyle = glow;
      drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
    },
  };
}

/** The words' column's foot fading into the page, so words that run past it read as more below. */
function fadeDrawing(): NonNullable<Node['picture']>['source'] {
  return {
    draw: (drawing, across, down) => {
      const fade = drawing.createLinearGradient(0, 0, 0, down);
      fade.addColorStop(0, 'rgba(14,16,19,0)');
      fade.addColorStop(1, INK.ground);
      drawing.fillStyle = fade;
      drawing.fillRect(0, 0, across, down);
    },
  };
}

/** A faint rule across what holds it. */
const rule = (): Node => ({ width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' });

/** The art's floor and its light, in the item's rarity. */
function floorDrawing(rgb: string): NonNullable<Node['picture']>['source'] {
  return {
    draw: (drawing, across, down) => {
      const [wide, tall] = [across * 0.36, down * 0.07];
      drawing.save();
      drawing.translate(across / 2, down * 0.92);
      drawing.scale(1, tall / wide);
      const floor = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
      floor.addColorStop(0, rgba(rgb, 0.4));
      floor.addColorStop(1, rgba(rgb, 0));
      drawing.fillStyle = floor;
      drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
      drawing.restore();
      const light = drawing.createRadialGradient(
        across / 2,
        down * 0.55,
        0,
        across / 2,
        down * 0.55,
        Math.hypot(across, down) * 0.29,
      );
      light.addColorStop(0, rgba(rgb, 0.14));
      light.addColorStop(1, rgba(rgb, 0));
      drawing.fillStyle = light;
      drawing.fillRect(0, 0, across, down);
    },
  };
}

/** The item's page, laid over the menu's body, and its presses for the menu's footer. */
export function itemPage(
  context: MenuContext,
  item: GearItem,
  back: () => void,
  comparing: Comparing = new Comparing(),
): { readonly page: Node; readonly presses: readonly Node[] } {
  const { ui, holds, sizes, room } = context;
  const detail = itemDetailOf(item, context.gear, context.atVault);
  const rgb = rarityRgb(item.rarity);
  const size = sizes.label;
  const worn = wornBeside(context.gear, item);
  const compared = comparing.shown && worn ? worn : null;
  // A node tried shows what choosing it would change; else, comparing, what this piece changes over the one worn.
  const aimed = nodeAimed(ui, detail.columns);
  const tried =
    aimed && item.columns[aimed.column]?.traits[aimed.node] !== undefined && item.chosen[aimed.column] !== aimed.node
      ? aimed
      : null;
  const own = givenTraits(item);
  const sheet = tried
    ? sheetOf(item, statsOf(item.kind, own), givenTraits(item, tried))
    : sheetOf(item, compared ? statsOf(compared.kind, givenTraits(compared)) : null, own);
  const traits = traitsShown(item).filter((trait) => trait.kind !== ATHERIC_OWN);
  // An Atheric's two perks of its own head its perks together, its own node's shown even before it is chosen.
  const atheric = [intrinsicOf(item), ownOf(item)].filter((trait) => trait !== null);
  const across = (ui.boxOf('gear-body')?.width ?? 0) - 2 * (PAGE_EDGE + BODY_ACROSS);
  const wordsWidth = Math.round(
    Math.min(size > 1 ? WORDS_MOST_LARGE : WORDS_MOST, Math.max(WORDS_LEAST, across * 0.5)),
  );
  const perks = [...atheric, ...traits];
  const left: Child[] = [
    detail.words !== '' && { width: 'grow', padding: [2, 0, 10, 0], children: [flavourNode(detail.words, size)] },
    rule(),
    statsNode(context, item, tried ? null : compared, [sheet, wordsWidth]),
    detail.columns.length > 0 && heading('Nodes', size, HINTS.item),
    detail.columns.length > 0 &&
      nodeGrid(context, item, detail.columns, isModule(item.kind) ? null : costsOf(context, item)),
    perks.length > 0 && heading('Perks', size),
    ...perks.map((trait) => traitNode(trait, size)),
  ];
  // The art as large as its box lets it stand whole, a tenth of its width off the floor's light.
  const region = ui.boxOf(ITEM_ART);
  const lift = Math.round((region?.width ?? 0) * 0.1);
  const picture = context.picture(item);
  const box =
    region && picture
      ? Math.min(ART_MOST, boxWithin(picture, region.width - 16, region.height - lift - 8))
      : Math.min(ART_MOST, Math.max(ART_LEAST, room.height - ART_AROUND));
  // A module's glyph stands for its picture, drawn large at eleven times its cells, in the middle of the art's box.
  const glyph = moduleGlyph(item.kind);
  const drawn = glyph
    ? glyphNode(glyph, GLYPH_PX)
    : picture
      ? pictureNode(picture, box, sizes.ratio, LARGE_CAP)
      : words('Drawing…', 1, INK.faint);
  const shaken = quiver(holds.share(ITEM_ART));
  const art: Node = {
    id: ITEM_ART,
    width: 'grow',
    height: 'grow',
    minHeight: ART_LEAST_SHOWN,
    alignX: 'center',
    alignY: glyph ? 'center' : 'end',
    clip: true,
    picture: { key: `item floor ${rgb}`, source: floorDrawing(rgb) },
    // While the piece worn stands in its place the art is not drawn, but its place stays, which a hold charges.
    children: [
      !compared && { padding: [0, 0, glyph ? 0 : lift, 0], children: [shaken ? { ...drawn, offset: shaken } : drawn] },
    ],
  };
  const page: Node = {
    id: 'item-page',
    width: 'grow',
    height: 'grow',
    direction: 'column',
    fill: INK.ground,
    solid: true,
    padding: PAGE_EDGE,
    float: { to: 'parent', z: 25 },
    picture: { key: `item glow ${rgb}`, source: glowDrawing(rgb) },
    children: [
      headNode(context, item, detail),
      { width: 'grow', height: 1, fill: rgba(rgb, 0.5) },
      {
        id: 'item-body',
        width: 'grow',
        height: 'grow',
        padding: [10, BODY_ACROSS, 0, BODY_ACROSS],
        gap: ART_GAP,
        children: [
          // A column, as only a column's children scroll: on a short screen the words scroll and the art stays.
          {
            id: 'item-words',
            width: wordsWidth,
            height: 'grow',
            direction: 'column',
            scroll: true,
            padding: [0, 0, FADE, 0],
            children: [
              ...left,
              {
                width: 'grow',
                height: FADE,
                // A float stands one over what holds it unless told; a number would be the screen's own.
                float: { to: 'parent', anchor: [0, 1], at: [0, 1] },
                picture: { key: 'item words fade', source: fadeDrawing() },
              },
            ],
          },
          {
            ...art,
            children: [
              ...(art.children ?? []),
              compared && {
                float: { to: 'parent', anchor: [0.5, 0], at: [0.5, 0] },
                height: 'grow',
                direction: 'column',
                scroll: true,
                gap: 6,
                padding: [0, 0, 12, 0],
                children: [
                  label('Worn', size, INK.brassLit),
                  cardNode(cardOf(compared), context.picture(compared), [], sizes),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  if (ui.clicked('press-back')) back();
  if (ui.clicked(COMPARE)) comparing.toggle(context.gear, item.id);
  const presses: Node[] = [pressNode('press-back', 'Back', 'button', 'Esc', sizes.label)];
  if (worn)
    presses.push(
      pressNode(COMPARE, comparing.shown ? 'Compare: on' : 'Compare', 'button', boundKey('compare'), sizes.label),
    );
  // What wears the piece stands last, at the footer's right, as Destiny's main press does.
  const ordered = [...detail.presses.entries()].sort(([, one], [, other]) =>
    one.role === 'primary' ? (other.role === 'primary' ? 0 : 1) : other.role === 'primary' ? -1 : 0,
  );
  for (const [place, press] of ordered) {
    // Two like modules to infuse share a name; an id is the frame's own (ui/node.ts), so the second takes its place.
    const named = `press-${press.label}`;
    const id = presses.some((each) => each.id === named) ? `${named} ${place}` : named;
    const run = () => context.ask(press.ask);
    let charged = 0;
    if (press.held)
      // Dismantling or feeding, the item's own picture charges as the press is held, a piece as long as its rarity asks.
      charged = holds.press(ui, id, run, {
        charges: press.burst ? ITEM_ART : id,
        burst: press.burst ?? null,
        ms: press.burst === 'shatter' ? dismantleMs(item.rarity) : HOLD_MS,
        rgb,
      });
    else if (ui.clicked(id)) run();
    presses.push(
      pressNode(id, press.label, press.role, '', sizes.label, {
        children: [press.held ? fillNode(charged, press.role === 'warn') : null],
      }),
    );
  }
  return { page, presses };
}

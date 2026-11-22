// A keeper's wares drawn as Destiny 1's vendors draw theirs: a row of tiles under an engraved heading ruled across,
// each tile the ware's picture in a frame of its rarity with its price beneath, red with "Not enough" when short, and
// its card beside it on hover or focus. A ware is held to buy (gearHold.ts), so a stray click buys nothing.
import type { GearItem } from '../../network/gearMessages.ts';
import { WORN } from '../../player/gear.ts';
import type { Child, Node } from '../../ui/node.ts';
import { bardingPicture } from '../appearance/bardingTile.ts';
import { ARTS, emblemSvg, fragmentSvg } from '../artsCards.ts';
import { emblemOf } from '../emblemArt.ts';
import { cardFrame, cardName, cardNode, rarityTone } from '../gearCard.ts';
import { fillNode, quiver, washNode } from '../gearHold.ts';
import {
  type Hint,
  INK,
  emblemNode,
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
} from '../gearNodes.ts';
import type { MenuContext } from '../menuPage.ts';
import { shapesSvg } from './npcMarks.ts';
import { type Price, type Row, type Ware, type WarePicture, priceWord, wareCard } from './npcWares.ts';

/** A tile's picture box, in pixels: the menu's cell's; and its tile and holder, a step larger where the menu is wide. */
const TILE_PX = 48;
const TILE = 64;
const TILE_WIDE = 88;
/** The most wares a row stands beside another with. */
const SHORT_ROW = 3;
/** What a tile's press does, for its card and the footer. */
const HOLD_HINT: readonly Hint[] = [['Hold', 'Buy']];

/** How the keeper's screen stands: its colour, whether it is wide, and its words' step. */
export interface KeeperLook {
  readonly glow: string;
  readonly wide: boolean;
  readonly text: number;
}

/** A dye's or a coat's colours as a swatch: a band of each, darkest first. */
function swatch(colours: readonly string[], size: number): Node {
  return {
    width: size,
    height: size,
    outline: { width: 1, colour: INK.outline },
    // The ramp's colours come as CSS's spaced rgb(), which the interface reads with commas.
    children: colours.map((colour): Node => ({
      width: `${100 / colours.length}%`,
      height: 'grow',
      fill: colour.replace(/\s+/g, ','),
    })),
  };
}

/** A ware's picture in its tile. */
function pictureOf(context: MenuContext, picture: WarePicture, name: string, look: KeeperLook): Node {
  const size = look.wide ? 72 : TILE_PX;
  const initials = () => itemIconNode(null, name, TILE_PX, context.sizes, 0);
  switch (picture.kind) {
    case 'item':
      return itemIconNode(context.picture(picture.item), name, TILE_PX, context.sizes, picture.item.rarity);
    case 'vestige':
      return glyphNode('vestige', 36, picture.rarity);
    case 'package':
      return glyphNode('vestige', 36, 2);
    case 'crate':
      return glyphNode('ammo-crate');
    case 'swatch':
      return swatch(picture.colours, look.wide ? 66 : 44);
    case 'emblem':
      return emblemNode(emblemOf(picture.emblem), 'sign', 24, size, size);
    case 'art': {
      const art = ARTS.find((each) => each.id === picture.art);
      return art ? svgNode(`art ${art.id}`, emblemSvg(art), size) : initials();
    }
    case 'fragment': {
      const art = ARTS.find((each) => each.id === picture.art);
      const fragment = art?.core[picture.fragment];
      return art && fragment
        ? svgNode(`fragment ${art.key} ${fragment.key}`, fragmentSvg(art, fragment), size)
        : initials();
    }
    case 'barding': {
      // The barding on the player's horse, as the Appearance screen draws it.
      const drawn = bardingPicture(context.forge, context.dress, picture.barding);
      return { width: TILE_PX, height: TILE_PX, ...(drawn && { picture: drawn }) };
    }
    default:
      // A cape not yet held stands as its initials, as Enhanced Plus shows a piece without art.
      return initials();
  }
}

/** A price's glyph: Aurem's, or Shapes'. */
export function coinGlyph(currency: Price['currency']): Node {
  return currency === 'shapes' ? svgNode('shapes', shapesSvg(), 24, 22) : glyphNode('aurem', 22);
}

/** The words under a tile: its price, the word in its place, or "Not enough". */
function priceLine(ware: Ware, look: KeeperLook): Node {
  const { words: said, short } = priceWord(ware);
  return {
    width: 'grow',
    gap: 4,
    wrap: true,
    alignX: 'center',
    alignY: 'center',
    children: [
      ware.price && coinGlyph(ware.price.currency),
      ware.price && words(ware.price.amount.toLocaleString('en'), look.text, short ? INK.loss : INK.brassLit),
      said !== '' && {
        maxWidth: look.wide ? 121 : 77,
        text: { words: said, size: look.text, colour: short ? INK.loss : INK.faint, align: 'center', balance: true },
      },
    ],
  };
}

/** A ware's plain card: its name in its rarity, what it is, its words, what it costs and what holding it does. */
function plainCard(context: MenuContext, ware: Ware, hints: readonly Hint[]): Node {
  const { sizes } = context;
  const said = (text: string): Node => ({ width: 'grow', text: { words: text, size: sizes.label, colour: INK.faint } });
  return cardFrame(
    sizes,
    rarityTone(ware.rarity),
    [cardName(ware.name, ware.rarity), words(ware.about, sizes.label, INK.word)],
    [ware.words !== '' && said(ware.words), ware.price?.more !== undefined && said(`Also ${ware.price.more}.`)].filter(
      (each): each is Node => Boolean(each),
    ),
    hints,
  );
}

/** One ware's tile and its price; `act` runs a ware's ask once held, and `open` a press that opens a choice. */
export function wareTile(
  context: MenuContext,
  ware: Ware,
  look: KeeperLook,
  act: (ware: Ware) => void,
  open: () => void,
): Node {
  const { ui, holds, sizes, gear } = context;
  const id = `npc-${ware.key}`;
  const pressed = ware.ask !== null || ware.opens !== undefined;
  const item: GearItem | null = ware.picture.kind === 'item' ? ware.picture.item : null;
  const rgb = rarityRgb(ware.rarity);
  const hints: readonly Hint[] = ware.opens ? [['Click', 'Choose a fragment']] : pressed ? HOLD_HINT : [];
  let charged = 0;
  if (ware.opens) {
    if (ui.clicked(id)) open();
  } else if (ware.ask) charged = holds.press(ui, id, () => act(ware), { rgb });
  if (item) {
    const worn = gear.items.find((each) => each.at === WORN + item.bucket && each.id !== item.id) ?? null;
    context.card(id, () =>
      cardNode(wareCard(ware, item, item.at >= WORN ? null : worn), context.picture(item), hints, sizes),
    );
  } else context.card(id, () => plainCard(context, ware, hints));
  const cost = ware.price
    ? `${ware.price.amount.toLocaleString('en')} ${ware.price.currency === 'shapes' ? 'Shapes' : 'Aurem'}`
    : '';
  const said = priceWord(ware);
  const state = said.short ? 'not enough' : said.words || (ware.opens ? 'press to choose' : pressed ? 'hold' : '');
  const size = look.wide ? TILE_WIDE : TILE;
  const picture = pictureOf(context, ware.picture, ware.name, look);
  // A tile not had rests grey and dim; its count stays.
  const shown: Node = ware.dim
    ? {
        ...picture,
        opacity: 0.45,
        ...(picture.picture && { picture: { ...picture.picture, tint: 'rgb(110,110,110)' } }),
      }
    : picture;
  const shaken = quiver(charged);
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  const { marks, gilded } = item ? itemMarks(item) : { marks: [], gilded: false };
  const tile = tileNode(size, ware.rarity, lit ? 'lit' : 'rest', [shaken ? { ...shown, offset: shaken } : shown], {
    id,
    // A ware that cannot be had still takes the focus for its card.
    ...(pressed ? { press: true } : { focusable: true }),
    label: tileLabel(ware.name, ware.rarity, [cost, state].filter(Boolean).join(', ')),
    gilded,
    marks: [
      ...marks,
      washNode(charged, rgb),
      ware.ask && !ware.opens ? fillNode(holds.share(id), said.short) : null,
      ui.focused(id) && ui.keyFocused && focusRing(size, size),
    ],
  });
  return {
    width: look.wide ? 121 : 77,
    direction: 'column',
    alignX: 'center',
    gap: 4,
    children: [tile, priceLine(ware, look)],
  };
}

/** A bar sunk into the surface, filled to `share` in `colour`, with its words beside it. */
export function meter(share: number, said: string, colour: string, look: KeeperLook): Node {
  return {
    gap: 11,
    alignY: 'center',
    children: [
      {
        role: 'track',
        width: look.wide ? 132 : 110,
        height: 11,
        // A hairline's edge, the fill standing inside it.
        bevel: 1,
        padding: 1,
        label: said,
        // Kept within its track, however far past full the share runs; one that is no number (a bar of no length) full.
        children: [
          {
            width: `${Number.isFinite(share) ? Math.round(Math.min(1, Math.max(0, share)) * 100) : 100}%`,
            height: 'grow',
            fill: colour,
          },
        ],
      },
      words(said, look.text, INK.faint),
    ],
  };
}

/** An Art's level as five pips in the keeper's colour, and its bar toward the next level. */
function artLine(art: NonNullable<Row['art']>, look: KeeperLook): Node {
  const pips = Array.from({ length: 5 }, (_unused, place) => {
    const lit = place < art.level;
    // A square turned on its corner, three quarters its size.
    return `<polygon points="${7.5 + place * 15},1.5 ${13.5 + place * 15},7.5 ${7.5 + place * 15},13.5 ${1.5 + place * 15},7.5" fill="${lit ? look.glow : INK.well}" stroke="${lit ? look.glow : INK.stoneHi}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 75 15">${pips.join('')}</svg>`;
  return {
    gap: 11,
    alignY: 'center',
    padding: [0, 0, 8, 0],
    children: [
      { ...svgNode(`npc pips ${art.level} ${look.glow}`, svg, 75, 15), label: `Level ${art.level} of 5` },
      meter(art.toNext, art.words, look.glow, look),
    ],
  };
}

/** A heading as the menu engraves one: its words over a rule across. */
function headingNode(said: string, size: number): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [0, 0, 8, 0],
    children: [label(said, size), { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' }],
  };
}

/** A row of wares under its heading ruled across, or the words for why it holds none. */
function rowNode(
  context: MenuContext,
  row: Row,
  look: KeeperLook,
  act: (ware: Ware) => void,
  open: () => void,
  short: boolean,
): Node {
  return {
    width: short ? 'fit' : 'grow',
    direction: 'column',
    children: [
      headingNode(row.heading, look.text),
      row.art && artLine(row.art, look),
      row.wares.length > 0
        ? {
            width: 'grow',
            gap: 11,
            wrap: true,
            children: row.wares.map((ware) => wareTile(context, ware, look, act, open)),
          }
        : row.empty !== undefined && words(row.empty, look.text, INK.faint, { wrap: true }),
    ],
  };
}

/** The rows of wares: a row of a few stands beside the next such, as the references' short rows would with room to
 *  spare; any other takes the column's width. */
export function rowsNode(
  context: MenuContext,
  rows: readonly Row[],
  look: KeeperLook,
  act: (ware: Ware) => void,
  open: () => void,
): Child[] {
  const out: Child[] = [];
  let beside: Node[] = [];
  const flush = () => {
    if (beside.length > 0) out.push({ width: 'grow', gap: 22, wrap: true, children: beside });
    beside = [];
  };
  for (const row of rows) {
    if (row.wares.length <= SHORT_ROW) beside.push(rowNode(context, row, look, act, open, true));
    else {
      flush();
      out.push(rowNode(context, row, look, act, open, false));
    }
  }
  flush();
  return out;
}

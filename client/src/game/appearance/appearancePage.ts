// The Appearance screen, after Destiny's: the display at the left (the player's figure turning in the dye worn, and
// their horse in its coat and barding), and at the right rows under engraved headings: EMBLEM five a row, then DYE,
// COAT and BARDING, every piece of each, those kept lit and worn with a click, the rest dim, the one worn set in
// brass. Hovering a piece, or reaching it with the keys, shows its card and previews it on the display. The arrows move
// between the pieces, Enter wears one, Escape goes back to the Character page with the focus on its button.

import { cosmeticRamp } from '../../forge/cosmetics.ts';
import { ASKS } from '../../network/gearMessages.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { Child, Node } from '../../ui/node.ts';
import { emblemCard } from '../appearanceButton.ts';
import { EMBLEMS } from '../emblemArt.ts';
import { cardNode } from '../gearCard.ts';
import { type Hint, INK, emblemNode, focusRing, label, svgNode, tileLabel, tileNode, words } from '../gearNodes.ts';
import type { MenuContext } from '../menuPage.ts';
import { displayNode } from './appearanceDisplay.ts';
import { coatSvg, dyeSvg } from './appearanceMarks.ts';
import { type AppearanceTile, appearanceRows, previewDress, previewedTile } from './appearanceModel.ts';
import { bardingPicture } from './bardingTile.ts';
import { GAME_PALETTE } from './gamePalette.ts';

/** What the footer says the screen's presses and keys do. */
export const APPEARANCE_HINTS: readonly Hint[] = [
  ['Click', 'Wear'],
  ['Arrows', 'Move'],
  ['Enter', 'Wear'],
  ['Esc', 'Back'],
];
/** A tile's picture, in pixels: a whole multiple of every mark's (emblem signs 24, dyes 16, coats 12, the horse 1). */
const TILE_PX = 48;
/** A tile, and on a short screen as small as its picture allows, so every row shows without scrolling. */
const TILE = 64;
const TILE_SHORT = 52;
/** The display's width beside the rows, and what the screen's body keeps clear of its height. */
const DISPLAY_WIDTH = 360;
const DISPLAY_AROUND = 24;

/** Each dye's and coat's picture, written once: the screen is drawn every frame. */
const swatches = new Map<string, string>();

/** A tile's picture: an emblem's sign, a dye over a cuirass, a coat's swatch, or the horse in a barding. */
function markOf(context: MenuContext, tile: AppearanceTile): Node {
  const emblem = EMBLEMS[tile.number];
  if (tile.kind === 'emblem' && emblem) return emblemNode(emblem, 'sign', 24, TILE_PX, TILE_PX);
  if (tile.kind === 'dye' || tile.kind === 'coat') {
    const key = `${tile.kind} ${tile.id}`;
    let svg = swatches.get(key);
    if (svg === undefined) {
      const ramp = cosmeticRamp(tile.id, GAME_PALETTE);
      swatches.set(key, (svg = tile.kind === 'dye' ? dyeSvg(ramp) : coatSvg(ramp)));
    }
    return svgNode(key, svg, TILE_PX);
  }
  const picture = bardingPicture(context.forge, context.dress, tile.id);
  return { width: TILE_PX, height: TILE_PX, ...(picture && { picture }) };
}

/** A cosmetic's card in the gear's style: its name on its rarity's band, its kind, its picture, its words, how it is
 *  had, and what a click does. */
function cosmeticCard(context: MenuContext, tile: AppearanceTile): Node {
  const hints: readonly Hint[] = tile.kept && !tile.worn ? [['Click', 'Wear']] : [];
  const how = tile.worn ? 'Worn.' : tile.kept ? 'Kept.' : tile.how;
  return cardNode(
    {
      name: tile.name,
      rarity: tile.rarity,
      kind: tile.label,
      big: null,
      rows: [],
      element: 0,
      traits: [],
      words: tile.words,
      compare: null,
    },
    null,
    hints,
    context.sizes,
    {
      icon: markOf(context, tile),
      after: [
        { width: 'grow', padding: [6, 0, 0, 0], text: { words: how, size: context.sizes.label, colour: INK.brassLit } },
      ],
    },
  );
}

/** A tile's id, by its kind and what it is. */
const idOf = (tile: AppearanceTile): string => `${tile.kind}-${tile.id}`;

/** A piece's tile: lit and worn with a click when kept, dim with how it is had when not, set in brass with a brass
 *  corner when worn, so it never reads as a rarity's frame (Rare's is yellow too). */
function tileOf(context: MenuContext, tile: AppearanceTile, size: number): Node {
  const { ui, sizes } = context;
  const id = idOf(tile);
  if (ui.clicked(id) && tile.kept && !tile.worn)
    context.ask({ kind: tile.kind === 'emblem' ? ASKS.wearEmblem : ASKS.wearCosmetic, item: tile.number });
  const emblem = EMBLEMS[tile.number];
  context.card(id, () =>
    tile.kind === 'emblem' && emblem ? emblemCard(emblem, tile.kept, tile.worn, sizes) : cosmeticCard(context, tile),
  );
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  const state = tile.worn ? 'open' : lit ? 'lit' : 'rest';
  const said = tile.worn ? 'worn' : tile.kept ? '' : 'not kept';
  return tileNode(size, tile.kept ? tile.rarity : null, state, [markOf(context, tile)], {
    id,
    press: true,
    label: [tileLabel(tile.name, tile.rarity, tile.label), said].filter(Boolean).join(', '),
    faded: tile.kept ? 1 : 0.55,
    marks: [
      tile.worn && {
        ...svgNode(
          'worn corner',
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M0 0H12L0 12Z" fill="${INK.brassLit}"/></svg>`,
          12,
        ),
        float: { to: 'parent', clipped: true },
      },
      ui.focused(id) && ui.keyFocused && focusRing(size, size),
    ],
  });
}

/** A row's heading over its rule, with how many of its pieces are kept at its end. */
function heading(said: string, count: string, size: number): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [4, 0, 8, 0],
    children: [
      { width: 'grow', gap: 12, children: [{ width: 'grow', children: [label(said, size)] }, label(count, size)] },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
    ],
  };
}

/** A row of the screen: its heading and its tiles, `across` a line. */
function rowNode(context: MenuContext, row: ReturnType<typeof appearanceRows>[number], across: number): Node {
  const size = context.sizes.short ? TILE_SHORT : TILE;
  const gap = context.sizes.short ? 4 : 6;
  const tiles = row.tiles.map((tile) => tileOf(context, tile, size));
  const lines: Child[] = [];
  for (let start = 0; start < tiles.length; start += across)
    lines.push({ gap, children: tiles.slice(start, start + across) });
  const kept = row.tiles.filter((tile) => tile.kept).length;
  return {
    width: across * size + (across - 1) * gap,
    direction: 'column',
    children: [
      heading(row.heading, `${kept} of ${row.tiles.length}`, 1),
      { direction: 'column', gap, children: lines },
    ],
  };
}

/** The ground: dark, lit softly behind the display, darkened top and foot. */
const GROUND: Node['picture'] = {
  key: 'appearance ground',
  source: {
    draw: (drawing, width, height) => {
      drawing.save();
      drawing.translate(width * 0.18, height * 0.5);
      drawing.scale(1, (0.8 * height) / (0.4 * width));
      const light = drawing.createRadialGradient(0, 0, 0, 0, 0, 0.4 * width);
      light.addColorStop(0, 'rgba(243,207,134,0.1)');
      light.addColorStop(0.7, 'rgba(243,207,134,0)');
      drawing.fillStyle = light;
      drawing.fillRect(-0.4 * width, -0.4 * width, 0.8 * width, 0.8 * width);
      drawing.restore();
      const band = drawing.createLinearGradient(0, 0, 0, height);
      band.addColorStop(0, 'rgba(5,6,8,0.6)');
      band.addColorStop(0.22, 'rgba(5,6,8,0)');
      band.addColorStop(0.78, 'rgba(5,6,8,0)');
      band.addColorStop(1, 'rgba(5,6,8,0.6)');
      drawing.fillStyle = band;
      drawing.fillRect(0, 0, width, height);
    },
  },
};

/** The Appearance screen for the gear the room last sent. */
export function appearancePage(context: MenuContext): Node {
  const { ui, gear, room, dress, forge } = context;
  const rows = appearanceRows(gear);
  // The display shows the piece under the pointer, else the one the keys hold focused, else the player as they are.
  const tiles = rows.flatMap((row) => row.tiles);
  const previewed = previewedTile(
    tiles,
    (tile) => ui.hovered(idOf(tile)),
    (tile) => ui.focused(idOf(tile)) && ui.keyFocused,
  );
  const shown = dress && previewDress(dress, previewed);
  const height = Math.max(240, room.height - DISPLAY_AROUND);
  const display = displayNode(forge, shown, DISPLAY_WIDTH, height, performance.now(), motionReduced());
  const [emblems, ...looks] = rows;
  return {
    id: 'appearance-page',
    width: room.width,
    minHeight: room.height,
    fill: INK.ground,
    picture: GROUND,
    label: 'Appearance',
    // The ground fills the screen; its display and rows stand inside its padding.
    children: [
      {
        width: 'grow',
        padding: [12, 32],
        gap: 24,
        children: [
          {
            role: 'panel',
            width: DISPLAY_WIDTH,
            alignX: 'center',
            alignY: 'center',
            children: [
              display ?? {
                width: DISPLAY_WIDTH,
                height,
                alignX: 'center',
                alignY: 'center',
                children: [words('Drawing…', 1, INK.faint)],
              },
            ],
          },
          {
            gap: 24,
            children: [
              emblems && rowNode(context, emblems, 5),
              { direction: 'column', gap: 12, children: looks.map((row) => rowNode(context, row, 8)) },
            ],
          },
        ],
      },
    ],
  };
}

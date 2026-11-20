// The Appearance screen, after Destiny's: the display at the left (the player's figure turning in the dye worn, and
// their horse in its coat and barding), and at the right rows under engraved headings: EMBLEM five a row, then DYE,
// COAT and BARDING, every piece of each, those kept lit and worn with a click, the rest dim, the one worn set in
// brass. Hovering or focusing a piece shows its card and previews it on the display. The arrows move between the
// pieces, Enter wears one, Escape goes back to the Character page with the focus on its button.

import './appearance.css';
import { make } from '../../editor/dom.ts';
import { cosmeticRamp } from '../../forge/cosmetics.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import { ROLES } from '../../plus/kit.ts';
import { EMBLEMS, emblemImage } from '../emblemArt.ts';
import { emblemCard } from '../emblemSlot.ts';
import { type Hint, type HoverCard, cardNode, rarityOf, tileLabel } from '../gearDom.ts';
import { STEP_BACK } from '../gearScreen.ts';
import { appearanceDisplay, horseOf } from './appearanceDisplay.ts';
import { coatSvg, dyeSvg, svgUrl } from './appearanceMarks.ts';
import { type AppearanceTile, appearanceRows, previewDress } from './appearanceModel.ts';

/** What the screen draws from: the gear the room last sent and the way to ask of it, the menu's hover card, the way
 *  back to the Character page, the forge and the player's dress (null while there is none), and the body's height. */
export interface AppearanceContext {
  readonly gear: GearState;
  readonly ask: (ask: GearAsk) => void;
  readonly tip: HoverCard;
  readonly close: () => void;
  readonly forge: Cards | null;
  readonly dress: Dress | null;
  readonly room: number;
}

/** What the footer says the screen's presses and keys do. */
export const APPEARANCE_HINTS: readonly Hint[] = [
  ['Click', 'Wear'],
  ['Arrows', 'Move'],
  ['Enter', 'Wear'],
  ['Esc', 'Back'],
];
/** A tile's picture, in pixels: a whole multiple of every mark's (emblem signs 24, dyes 16, coats 12, the horse 1). */
const TILE_PX = 48;
/** The display's width beside the rows, and what the screen's body keeps clear of its height. */
const DISPLAY_WIDTH = 360;
const DISPLAY_AROUND = 24;
/** Each arrow key's way across the screen. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The tile nearest `from` the way an arrow points, favouring those straight on; null if none lies that way. */
function nearest(from: HTMLElement, among: readonly HTMLElement[], [right, down]: readonly [number, number]) {
  const centre = (node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2] as const;
  };
  const [fromX, fromY] = centre(from);
  let best: { node: HTMLElement; score: number } | null = null;
  for (const node of among) {
    const [nodeX, nodeY] = centre(node);
    const along = (nodeX - fromX) * right + (nodeY - fromY) * down;
    const across = Math.abs((nodeX - fromX) * down - (nodeY - fromY) * right);
    const score = along + across * 2;
    if (node !== from && along > 1 && (!best || score < best.score)) best = { node, score };
  }
  return best?.node ?? null;
}

/** Each tile's preview, for the display to go back to the tile the focus is on once the pointer leaves another. */
const PREVIEWS = new WeakMap<HTMLElement, () => void>();

/** An image of whole pixels, never read aloud: its tile names it. */
function imageOf(src: string, size: number): HTMLImageElement {
  const image = make('img', '', 'appearance-mark');
  Object.assign(image, { src, width: size, height: size, alt: '' });
  return image;
}

/** A barding's tile: the horse's head and chest from the side, at one texel a pixel, centred on its ears. */
function horseTile(forge: Cards | null, dress: Dress | null, tile: AppearanceTile): HTMLCanvasElement {
  const canvas = make('canvas', '', 'appearance-mark');
  [canvas.width, canvas.height] = [TILE_PX, TILE_PX];
  if (!forge || !dress) return canvas;
  void horseOf(forge, previewDress(dress, tile)).then((picture: Picture | null) => {
    if (!picture) return;
    // The ears stand highest: the tile is cut round them, down the head and over the chest.
    const top = picture.pixels.findIndex((_value, byte) => byte % 4 === 3 && picture.pixels[byte] !== 0);
    if (top < 0) return;
    const [column, row] = [(top >> 2) % picture.width, Math.floor((top >> 2) / picture.width)];
    const own = document.createElement('canvas');
    [own.width, own.height] = [picture.width, picture.height];
    own.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.pixels), picture.width), 0, 0);
    const left = Math.max(0, Math.min(picture.width - TILE_PX, column - TILE_PX / 2));
    canvas.getContext('2d')?.drawImage(own, left, row, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  });
  return canvas;
}

/** A tile's picture: an emblem's sign, a dye over a cuirass, a coat's swatch, or the horse in a barding. */
function markOf(context: AppearanceContext, tile: AppearanceTile): HTMLElement {
  const emblem = EMBLEMS[tile.number];
  if (tile.kind === 'emblem' && emblem) return imageOf(emblemImage(emblem, 'sign'), TILE_PX);
  if (tile.kind === 'dye') return imageOf(svgUrl(dyeSvg(cosmeticRamp(tile.id))), TILE_PX);
  if (tile.kind === 'coat') return imageOf(svgUrl(coatSvg(cosmeticRamp(tile.id))), TILE_PX);
  return horseTile(context.forge, context.dress, tile);
}

/** A cosmetic's card in the gear's style: its name on its rarity's band, its kind, its picture, its words, how it is
 *  had, and what a click does. */
function cosmeticCard(context: AppearanceContext, tile: AppearanceTile): HTMLElement {
  const hints: readonly Hint[] = tile.kept && !tile.worn ? [['Click', 'Wear']] : [];
  const card = cardNode(
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
  );
  const icon = make('div', '', 'gear-card-icon');
  icon.append(markOf(context, tile));
  const body = card.querySelector('.gear-card-body');
  body?.prepend(icon);
  body?.append(make('p', tile.worn ? 'Worn.' : tile.kept ? 'Kept.' : tile.how, 'appearance-how'));
  return card;
}

/** A piece's tile: lit and worn with a click when kept, dim with how it is had when not, set in brass when worn. */
function tileOf(context: AppearanceContext, tile: AppearanceTile, display: { show(dress: Dress | null): void }) {
  const node = make('button', '', `gear-cell appearance-tile ${ROLES.tile}${tile.kept ? '' : ' gear-vacant'}`);
  node.type = 'button';
  rarityOf(node, tile.kept ? tile.rarity : null);
  node.append(markOf(context, tile));
  node.dataset['key'] = `${tile.kind}-${tile.id}`;
  node.dataset['nav'] = '';
  node.classList.toggle('appearance-worn', tile.worn);
  node.setAttribute('aria-pressed', String(tile.worn));
  const state = tile.worn ? 'worn' : tile.kept ? '' : 'not kept';
  node.setAttribute('aria-label', [tileLabel(tile.name, tile.rarity, tile.label), state].filter(Boolean).join(', '));
  if (!tile.kept) node.setAttribute('aria-disabled', 'true');
  node.addEventListener('click', () => {
    if (!tile.kept || tile.worn) return;
    context.tip.hide();
    context.ask({ kind: tile.kind === 'emblem' ? ASKS.wearEmblem : ASKS.wearCosmetic, item: tile.number });
  });
  const emblem = EMBLEMS[tile.number];
  context.tip.over(node, () =>
    tile.kind === 'emblem' && emblem ? emblemCard(emblem, tile.kept, tile.worn) : cosmeticCard(context, tile),
  );
  // A piece previews on the display while the pointer or the focus is on it.
  const preview = () => display.show(context.dress && previewDress(context.dress, tile));
  // The pointer gone, the display shows the piece the focus is on, if any, else the player as they are.
  const back = () => {
    const held = document.activeElement;
    const focused = held instanceof HTMLElement && held !== node ? PREVIEWS.get(held) : undefined;
    if (focused) focused();
    else display.show(context.dress);
  };
  PREVIEWS.set(node, preview);
  node.addEventListener('pointerenter', preview);
  node.addEventListener('focus', preview);
  node.addEventListener('pointerleave', back);
  node.addEventListener('blur', back);
  return node;
}

/** The Appearance screen for the gear the room last sent. */
export function appearancePage(context: AppearanceContext): HTMLElement {
  const page = make('div', '', 'appearance-page');
  page.setAttribute('role', 'region');
  page.setAttribute('aria-label', 'Appearance');
  const height = Math.max(240, context.room - DISPLAY_AROUND);
  const display = appearanceDisplay(context.forge, context.dress, DISPLAY_WIDTH, height);
  const stand = make('div', '', `appearance-stand ${ROLES.panel}`);
  stand.append(display.node);
  if (!context.forge || !context.dress) stand.append(make('span', 'Drawing…', 'gear-hint'));
  const [emblems, ...cosmetics] = appearanceRows(context.gear).map((row) => {
    const section = make('section', '', `appearance-row appearance-${row.kind}`);
    const kept = row.tiles.filter((tile) => tile.kept).length;
    const heading = make('h3', row.heading, `gear-heading ${ROLES.rule}`);
    heading.append(make('span', `${kept} of ${row.tiles.length}`, 'appearance-count'));
    const grid = make('div', '', 'appearance-grid');
    grid.append(...row.tiles.map((tile) => tileOf(context, tile, display)));
    section.append(heading, grid);
    return section;
  });
  // The emblems in a column of their own, five a row; the dye, the coat and the barding stacked beside them.
  const rows = make('div', '', 'appearance-rows');
  const looks = make('div', '', 'appearance-looks');
  looks.append(...cosmetics);
  rows.append(...(emblems ? [emblems] : []), looks);
  page.append(stand, rows);
  page.addEventListener('keydown', (event) => {
    const way = ARROWS[event.key];
    const from = document.activeElement;
    if (!way || !(from instanceof HTMLElement) || !page.contains(from)) return;
    const next = nearest(from, [...page.querySelectorAll<HTMLElement>('[data-nav]')], way);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  // Escape goes back to the Character page, before the menu steps back.
  page.addEventListener(STEP_BACK, (event) => {
    event.preventDefault();
    context.tip.hide();
    context.close();
  });
  return page;
}

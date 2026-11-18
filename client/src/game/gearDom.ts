// The gear screens' shared parts, in the Enhanced Plus kit: a press in its role, a press held a moment, a picture drawn
// crisp into a canvas, a cell's icon (an item's own picture or a glyph), and the hover card beside what it describes,
// its top edge in the item's rarity, as Enhanced Plus's card is.

import { button, make } from '../editor/dom.ts';
import { RARITIES } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import type { Card, Glyph } from './gearCards.ts';
import { glyphSvg } from './gearGlyphs.ts';

/** How long a held press is held before it acts, in milliseconds: a Fruit of Dagon is eaten, not tapped. */
const HOLD_MS = 800;
/** How far the hover card stands from what it describes, and from the screen's edge. */
const TIP_GAP = 10;

export function pressOf(text: string, run: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = button(text, run);
  node.classList.add(ROLES[role]);
  return node;
}

/** A press that acts only once held down for a moment. */
export function heldPress(text: string, held: () => void): HTMLButtonElement {
  const node = pressOf(text, () => undefined);
  let timer = 0;
  const cancel = () => window.clearTimeout(timer);
  node.addEventListener('pointerdown', () => {
    cancel();
    timer = window.setTimeout(held, HOLD_MS);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(event, cancel);
  return node;
}

/** A canvas showing a picture at a whole multiple of its size that fits `box` pixels, its pixels kept square. */
export function pictureCanvas(picture: Picture, box: number): HTMLCanvasElement {
  const canvas = make('canvas', '', 'gear-picture');
  canvas.width = picture.width;
  canvas.height = picture.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.pixels), picture.width), 0, 0);
  const scale = Math.max(1, Math.floor(box / Math.max(picture.width, picture.height)));
  canvas.style.width = `${picture.width * scale}px`;
  canvas.style.height = `${picture.height * scale}px`;
  return canvas;
}

/** An item drawn small: its own picture, or, while it is drawn or where the forge draws nothing of it, its name's
 *  initials, as Enhanced Plus shows a piece without art. */
export function itemIcon(picture: Picture | null, name: string, box: number): HTMLElement {
  if (picture) return pictureCanvas(picture, box);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
  return make('span', initials.toUpperCase(), 'gear-initials');
}

/** A glyph as an image. */
export function glyphImage(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0): HTMLImageElement {
  const image = make('img', '', 'gear-glyph');
  image.src = `data:image/svg+xml,${encodeURIComponent(glyphSvg(glyph, rarity, tint))}`;
  image.alt = '';
  return image;
}

/** Marks a surface with a rarity, which its frame and glow take their colours from. */
export function rarityOf(node: HTMLElement, rarity: number | null): void {
  const found = rarity === null ? undefined : RARITIES[rarity];
  if (!found) return node.removeAttribute('data-rarity');
  node.dataset['rarity'] = found.name.toLowerCase();
  node.style.setProperty('--rar', found.colour);
  node.style.setProperty('--rar-hi', found.lit);
  node.style.setProperty('--rar-lo', found.shade);
}

/** An item's hover card: its picture large, its name in its rarity's colour, its kind and pips, its main number, its
 *  rows, its traits and words, and what it changes over the piece it would replace. */
export function cardNode(card: Card, picture: Picture | null, hint: string): HTMLElement {
  const node = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(node, card.rarity);
  const head = make('div', '', 'gear-card-head');
  const name = make('h3', card.name);
  head.append(name, make('p', `${card.kind}  ${RARITIES[card.rarity]?.pips ?? ''}`, 'gear-card-meta'));
  node.append(head);
  const body = make('div', '', 'gear-card-body');
  if (picture) {
    const icon = make('div', '', 'gear-card-icon');
    icon.append(pictureCanvas(picture, 96));
    body.append(icon);
  }
  if (card.big) {
    const big = make('div', '', 'gear-card-big');
    big.append(make('strong', String(card.big.value)), make('span', card.big.label));
    body.append(big);
  }
  const stats = make('dl', '', 'gear-card-stats');
  for (const [label, value] of card.rows) stats.append(make('dt', label), make('dd', value));
  body.append(stats);
  for (const trait of card.traits) {
    const line = make('div', '', 'gear-card-trait');
    line.append(make('b', trait.name), make('span', trait.words));
    body.append(line);
  }
  if (card.words) body.append(make('p', card.words, 'gear-card-words'));
  if (card.compare) {
    const compare = make('div', '', 'gear-card-compare');
    compare.append(make('p', `Replaces ${card.compare.replaces}`, 'gear-card-meta'));
    for (const row of card.compare.rows) {
      const change = row.to - row.from;
      const line = make('div', '', `gear-card-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'same'}`);
      line.append(make('span', row.label), make('span', `${row.from} → ${row.to}  ${change > 0 ? '+' : ''}${change}`));
      compare.append(line);
    }
    body.append(compare);
  }
  node.append(body, make('p', hint, 'gear-card-hint'));
  return node;
}

/** The one hover card of a page, shown beside what it describes and kept on the screen. */
export class HoverCard {
  private readonly tip: HTMLElement;

  constructor(root: HTMLElement) {
    this.tip = make('div', '', 'gear-tip');
    this.tip.setAttribute('role', 'tooltip');
    this.tip.hidden = true;
    root.append(this.tip);
  }

  show(anchor: HTMLElement, content: HTMLElement): void {
    this.tip.replaceChildren(content);
    this.tip.hidden = false;
    const near = anchor.getBoundingClientRect();
    const size = this.tip.getBoundingClientRect();
    const right = near.right + TIP_GAP;
    const left = right + size.width + TIP_GAP > innerWidth ? near.left - TIP_GAP - size.width : right;
    const top = Math.min(Math.max(TIP_GAP, near.top), innerHeight - size.height - TIP_GAP);
    this.tip.style.left = `${Math.max(TIP_GAP, left)}px`;
    this.tip.style.top = `${Math.max(TIP_GAP, top)}px`;
  }

  hide(): void {
    this.tip.hidden = true;
  }

  /** Shows `content()` while the pointer is over `anchor`, beside `beside` (the anchor itself unless given). */
  over(anchor: HTMLElement, content: () => HTMLElement, beside = anchor): void {
    anchor.addEventListener('pointerenter', () => this.show(beside, content()));
    anchor.addEventListener('pointerleave', () => this.hide());
  }
}

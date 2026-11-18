// The gear screens' shared parts, in the Enhanced Plus kit: a press in its role, a press held a moment, a picture drawn
// crisp into a canvas, a cell's icon (an item's own picture or a glyph), and the hover card beside what it describes,
// its head in the item's rarity, as Enhanced Plus's card is.

import { button, make } from '../editor/dom.ts';
import { RARITIES } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import type { Card, Glyph } from './gearCards.ts';
import { glyphSvg, nodeGlyphSvg } from './gearGlyphs.ts';

/** How long a held press is held before it acts, in milliseconds: what cannot be undone is held, not tapped. */
export const HOLD_MS = 800;
/** How far the hover card stands from what it describes, and from the screen's edge. */
const TIP_GAP = 10;

export function pressOf(text: string, run: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = button(text, run);
  node.classList.add(ROLES[role]);
  return node;
}

/** A press that acts only once held down for a moment, by the pointer or by Enter or Space, its fill showing how long
 *  is left; let go early, nothing happens. */
export function heldPress(text: string, held: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = pressOf(text, () => undefined, role);
  node.classList.add('gear-held');
  node.style.setProperty('--hold', `${HOLD_MS}ms`);
  let timer = 0;
  const cancel = () => {
    window.clearTimeout(timer);
    node.classList.remove('gear-holding');
  };
  const begin = () => {
    cancel();
    // Restarts the fill's transition from empty.
    void node.offsetWidth;
    node.classList.add('gear-holding');
    timer = window.setTimeout(() => {
      node.classList.remove('gear-holding');
      held();
    }, HOLD_MS);
  };
  node.addEventListener('pointerdown', begin);
  for (const event of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) node.addEventListener(event, cancel);
  node.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      begin();
    }
  });
  node.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ') cancel();
  });
  return node;
}

/** A canvas showing a picture in a box of `box` pixels: at a whole multiple of its size, its pixels kept square, or,
 *  where it is larger than the box, scaled down to fit it. */
export function pictureCanvas(picture: Picture, box: number): HTMLCanvasElement {
  const canvas = make('canvas', '', 'gear-picture');
  canvas.width = picture.width;
  canvas.height = picture.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.pixels), picture.width), 0, 0);
  const largest = Math.max(picture.width, picture.height);
  const scale = largest > box ? box / largest : Math.floor(box / largest);
  if (largest > box) canvas.classList.add('gear-picture-fitted');
  canvas.style.width = `${Math.round(picture.width * scale)}px`;
  canvas.style.height = `${Math.round(picture.height * scale)}px`;
  canvas.setAttribute('aria-hidden', 'true');
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
  const shown = make('span', initials.toUpperCase(), 'gear-initials');
  shown.setAttribute('aria-hidden', 'true');
  return shown;
}

/** A glyph as an image. */
export function glyphImage(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0): HTMLImageElement {
  const image = make('img', '', 'gear-glyph');
  image.src = `data:image/svg+xml,${encodeURIComponent(glyphSvg(glyph, rarity, tint))}`;
  image.alt = '';
  return image;
}

/** A node's kind's glyph, in the colour of the text around it. */
export function nodeGlyph(kind: number): HTMLElement {
  const glyph = make('span', '', 'gear-node-glyph');
  glyph.innerHTML = nodeGlyphSvg(kind);
  return glyph;
}

/** Marks a surface with a rarity, which its frame and glow take their colours from. */
export function rarityOf(node: HTMLElement, rarity: number | null): void {
  const found = rarity === null ? undefined : RARITIES[rarity];
  if (!found) {
    node.removeAttribute('data-rarity');
    return;
  }
  node.dataset['rarity'] = found.name.toLowerCase();
  node.style.setProperty('--rar', found.colour);
  node.style.setProperty('--rar-hi', found.lit);
  node.style.setProperty('--rar-lo', found.shade);
  node.style.setProperty('--rar-rgb', found.rgb);
}

/** What a tile is called aloud: its name, then its rarity and what it is. */
export function tileLabel(name: string, rarity: number | null, what = ''): string {
  const tier = rarity === null ? '' : (RARITIES[rarity]?.name ?? '');
  const said = [tier, what].filter(Boolean).join(' ');
  return said ? `${name}, ${said}` : name;
}

/** An item's hover card: its name on a band of its rarity, its kind and pips, its picture large, its main number, its
 *  rows, its traits and words, what it changes over the piece it would replace, and what may be done with it. */
export function cardNode(card: Card, picture: Picture | null, hint: string): HTMLElement {
  const node = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(node, card.rarity);
  const head = make('div', '', 'gear-card-head');
  const pips = RARITIES[card.rarity]?.pips ?? '';
  head.append(make('h3', card.name), make('p', `${card.kind}${pips ? `  ${pips}` : ''}`, 'gear-card-meta'));
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
      const sign = change > 0 ? '+' : change < 0 ? '−' : '';
      line.append(make('span', row.label), make('span', `${row.from} → ${row.to}  ${sign}${Math.abs(change)}`));
      compare.append(line);
    }
    body.append(compare);
  }
  node.append(body);
  if (hint) node.append(make('p', hint, 'gear-card-hint'));
  return node;
}

/** The one hover card of a page, shown beside what it describes and kept on the screen; on pointer hover and on
 *  keyboard focus alike. */
export class HoverCard {
  private readonly tip: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.tip = make('div', '', 'gear-tip');
    this.tip.setAttribute('role', 'tooltip');
    this.tip.id = 'gear-tip';
    this.tip.hidden = true;
    root.append(this.tip);
  }

  show(anchor: HTMLElement, content: HTMLElement): void {
    this.anchor = anchor;
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
    this.anchor = null;
    this.tip.hidden = true;
  }

  /** Hides the card once what it describes has left the page, as a page built again leaves it. */
  keep(): void {
    if (this.anchor && !this.anchor.isConnected) this.hide();
  }

  /** Shows `content()` while the pointer is over `anchor` or it holds the focus, beside `beside` (the anchor itself
   *  unless given). */
  over(anchor: HTMLElement, content: () => HTMLElement, beside = anchor): void {
    const show = () => this.show(beside, content());
    anchor.setAttribute('aria-describedby', 'gear-tip');
    anchor.addEventListener('pointerenter', show);
    anchor.addEventListener('pointerleave', () => this.hide());
    anchor.addEventListener('focus', show);
    anchor.addEventListener('blur', () => this.hide());
  }
}

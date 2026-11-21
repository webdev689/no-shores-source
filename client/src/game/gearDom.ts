// The gear screens' shared parts, in the Enhanced Plus kit: a press in its role, a press held a moment, a picture drawn
// crisp into a canvas, a cell's icon (an item's own picture or a glyph) and what it shows of the item's growth, a
// node's ring, and the hover card beside what it describes, its head in the item's rarity, as Enhanced Plus's card is.

import { button, make } from '../editor/dom.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { ELEMENTS, RARITIES, fullyUpgraded, upgraded } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import type { Card, Glyph, Trait } from './gearCards.ts';
import { fineGlyph, glyphSvg, nodeGlyphSvg, ringSvg } from './gearGlyphs.ts';
import { elementSvg } from './elementGlyphs.ts';
import { diagonalFit, drawnBounds, fitIcon } from '../player/iconFit.ts';
import { charge, play } from './uiSounds.ts';

/** How long a held press is held before it acts, in milliseconds: what cannot be undone is held, not tapped. */
export const HOLD_MS = 800;
/** How long a piece is held to dismantle it, by its rarity: the rarer the longer, as Destiny's are, so the rarest is
 *  never lost to a slip. */
const DISMANTLE_MS = [600, 700, 900, 1200, 1800];
export const dismantleMs = (rarity: number): number => DISMANTLE_MS[rarity] ?? HOLD_MS;
/** How far the hover card stands from what it describes, and from the screen's edge. */
const TIP_GAP = 10;

/** What a press or a key does, as a line of keycaps shows it: the key, then its words. */
export type Hint = readonly [key: string, words: string];

/** How much CSS zooms an element where it stands: 2 for the menu on a screen past 1440p, else 1. */
export function cssZoom(node: Element): number {
  return (node as Element & { readonly currentCSSZoom?: number }).currentCSSZoom ?? 1;
}

/** A press in its role; with `key`, the key that does it too, on a keycap. */
export function pressOf(text: string, run: () => void, role: Role = 'button', key = ''): HTMLButtonElement {
  const node = button(text, run);
  node.classList.add(ROLES[role]);
  if (key) node.append(make('kbd', key, 'gear-key'));
  return node;
}

/** A line of what the presses and keys do, each key on a keycap. */
export function hintLine(hints: readonly Hint[], className = 'gear-hints'): HTMLElement {
  const line = make('p', '', className);
  for (const [key, words] of hints) {
    const hint = make('span', '', 'gear-hint-pair');
    // Keys that do the same are joined by a slash, each on its own keycap.
    for (const one of key.split(' / ')) hint.append(make('kbd', one, 'gear-key'));
    hint.append(make('span', words));
    line.append(hint);
  }
  return line;
}

/** How a hold ends once it acts: the item breaking apart, the item taking something in, or nothing more. */
export type Burst = 'shatter' | 'pulse' | null;
/** A hold's parts beside the press: what charges as it is held, how it ends, and how long it is held. */
interface Hold {
  readonly charges?: HTMLElement | null;
  readonly burst?: Burst;
  readonly holdMs?: number;
}

/** The hold under way: what is held, what charges with it, and how to let it go. */
let holding: { readonly node: HTMLElement; readonly letGo: () => void } | null = null;

/** Lets go of the hold under way on `node`, or any with none named. */
export function letGoHold(node?: HTMLElement): void {
  if (holding && (!node || holding.node === node)) holding.letGo();
}

/**
 * Holds `node` for a moment before `held` runs, `charges` (the item's picture, or `node` itself) charging as it is
 * held: a wash rising through it, brightening, quivering at the end, as Destiny's dismantle does; let go early,
 * nothing happens. Once it acts, `burst` plays where `charges` stood, though the page under it is built anew.
 */
export function holdOn(
  node: HTMLElement,
  held: () => void,
  { charges = null, burst = null, holdMs = HOLD_MS }: Hold = {},
) {
  letGoHold();
  // A press that can do nothing does not fill, so it never seems about to act.
  if (node.getAttribute('aria-disabled') === 'true') return;
  const shown = charges ?? node;
  node.style.setProperty('--hold', `${holdMs}ms`);
  shown.style.setProperty('--hold', `${holdMs}ms`);
  // Restarts the fill's transition and the charge from empty.
  void node.offsetWidth;
  node.classList.add('gear-holding');
  shown.classList.add('gear-charging');
  const quiet = charge(holdMs);
  const end = () => {
    window.clearTimeout(timer);
    node.classList.remove('gear-holding');
    shown.classList.remove('gear-charging');
    holding = null;
  };
  const timer = window.setTimeout(() => {
    end();
    // A press built over while it was held is gone, and does nothing: its page shows the gear anew.
    if (!node.isConnected || node.getAttribute('aria-disabled') === 'true') return quiet();
    if (burst) burstAt(shown, burst);
    held();
  }, holdMs);
  holding = { node, letGo: () => (end(), quiet()) };
}

/** Pieces the burst breaks into, and how far they fly, in the item's own widths. */
const SHARDS = 14;
const SHARD_REACH = 0.9;

/** Where a hold acted, after its page is gone: the item breaking into shards of its rarity with a flash, or a ring
 *  of its rarity swelling out of it. */
export function burstAt(target: HTMLElement, burst: Exclude<Burst, null>): void {
  const box = target.getBoundingClientRect();
  const hud = target.closest('#hud') ?? document.body;
  const shown = make('div', '', `gear-burst gear-burst-${burst}`);
  shown.setAttribute('aria-hidden', 'true');
  Object.assign(shown.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  shown.style.setProperty('--rar-rgb', getComputedStyle(target).getPropertyValue('--rar-rgb') || '243, 207, 134');
  const side = Math.max(4, Math.round(Math.min(box.width, box.height) / 9));
  if (burst === 'shatter')
    for (let shard = 0; shard < SHARDS; shard++) {
      const piece = make('span', '', 'gear-shard');
      const angle = (shard / SHARDS) * Math.PI * 2 + (shard % 3) * 0.35;
      const reach = box.width * SHARD_REACH * (0.6 + ((shard * 7) % 5) / 10);
      piece.style.setProperty('--dx', `${Math.round(Math.cos(angle) * reach)}px`);
      piece.style.setProperty('--dy', `${Math.round(Math.sin(angle) * reach)}px`);
      piece.style.width = piece.style.height = `${side}px`;
      piece.classList.toggle('gear-shard-lit', shard % 2 === 0);
      shown.append(piece);
    }
  hud.append(shown);
  play(burst === 'shatter' ? 'dismantle' : 'feed');
  // A shatter's flash ends long before its shards land, so only its own fade takes it away; a pulse is its ring.
  shown.addEventListener(
    'animationend',
    (event) => event.target === shown && (burst === 'pulse' || !event.pseudoElement) && shown.remove(),
  );
  // Gone even where no animation runs.
  window.setTimeout(() => shown.remove(), 900);
}

/** A press that acts only once held down for a moment, by the pointer or by Enter or Space, its fill showing how long
 *  is left and `charges` charging with it; let go early, nothing happens. */
export function heldPress(
  text: string,
  held: () => void,
  role: Role = 'button',
  { charges, ...hold }: Omit<Hold, 'charges'> & { readonly charges?: () => HTMLElement | null } = {},
): HTMLButtonElement {
  const node = pressOf(text, () => undefined, role);
  holdToAct(node, held, { ...hold, charges });
  return node;
}

/** Makes `node` act only once held down for a moment, by the pointer or by Enter or Space, `charges` charging with
 *  it; let go early, nothing happens. */
export function holdToAct(
  node: HTMLElement,
  held: () => void,
  { charges, ...hold }: Omit<Hold, 'charges'> & { readonly charges?: (() => HTMLElement | null) | undefined } = {},
): void {
  node.classList.add('gear-held');
  node.style.setProperty('--hold', `${hold.holdMs ?? HOLD_MS}ms`);
  const begin = () => holdOn(node, held, { ...hold, charges: charges?.() ?? null });
  const cancel = () => letGoHold(node);
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
}

/** The key held on a carried piece's tile to dismantle it, as Destiny's is on a computer. */
export const DISMANTLE_KEY = 'F';
/** Each tile F dismantles, and what dismantling it asks. */
const dismantles = new WeakMap<HTMLElement, { readonly rarity: number; readonly run: () => void }>();
/** The tile last pointed at or focused, which F dismantles: whichever the player turned to last. */
let aimed: HTMLElement | null = null;
/** The tile whose hold F began, which only F's release lets go. */
let keyHeld: HTMLElement | null = null;
let listening = false;

/** Closes an open slot's grid once the mouse is off the slot and the grid, at the owner's word; a touch has no hover
 *  to leave, so a touch, a click and Escape close it as they close any grid. */
export function closeOffHover(holder: HTMLElement, close: () => void): void {
  holder.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') close();
  });
}

/** Lets `tile`, a carried piece's, be dismantled by holding F while the pointer is over it or it has the focus, as
 *  long as its rarity asks, its picture charging and breaking apart once it acts. */
export function dismantleOnHold(tile: HTMLElement, rarity: number, dismantle: () => void): void {
  dismantles.set(tile, { rarity, run: dismantle });
  tile.setAttribute('aria-keyshortcuts', DISMANTLE_KEY);
  const aim = () => (aimed = tile);
  tile.addEventListener('pointerenter', aim);
  tile.addEventListener('focus', aim);
  // The pointer moved off: what F held there is let go, as Destiny's is.
  tile.addEventListener('pointerleave', () => {
    if (aimed === tile) aimed = null;
    if (keyHeld === tile) letGoHold(tile);
  });
  tile.addEventListener('pointercancel', () => letGoHold(tile));
  if (listening) return;
  listening = true;
  const isKey = (event: KeyboardEvent) => event.key.toUpperCase() === DISMANTLE_KEY;
  // Heard before the menu keeps its keys to itself; a key typed into a field is the field's, and Ctrl, Cmd or Alt with
  // F is the browser's or the system's, whose release may never be heard.
  addEventListener(
    'keydown',
    (event) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const chord = event.ctrlKey || event.metaKey || event.altKey;
      if (!isKey(event) || event.repeat || typing || chord) return;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const tile = aimed?.isConnected ? aimed : focused && dismantles.has(focused) ? focused : null;
      const found = tile ? dismantles.get(tile) : undefined;
      if (!tile || !found) return;
      event.preventDefault();
      keyHeld = tile;
      holdOn(tile, found.run, { charges: tile, burst: 'shatter', holdMs: dismantleMs(found.rarity) });
    },
    true,
  );
  const release = () => {
    if (keyHeld) letGoHold(keyHeld);
    keyHeld = null;
  };
  addEventListener('keyup', (event) => isKey(event) && release(), true);
  // A window left mid-hold never hears F let go there, so leaving it lets go.
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
}

/** A canvas showing a picture in a box of `box` CSS pixels, its clear margin trimmed, fitted as Enhanced Plus fits
 *  its icons (`fitIcon`) and drawn at the screen's own pixel ratio. */
export function pictureCanvas(picture: Picture, box: number, cap?: number): HTMLCanvasElement {
  const canvas = make('canvas', '', 'gear-picture');
  canvas.setAttribute('aria-hidden', 'true');
  const whole = [0, 0, picture.width, picture.height] as const;
  const [west, north, width, height] = drawnBounds(picture.width, picture.height, picture.pixels) ?? whole;
  const fit = fitIcon(width, height, box, devicePixelRatio, cap);
  if (!fit) return canvas;
  const own = document.createElement('canvas');
  [own.width, own.height] = [width, height];
  const image = new ImageData(new Uint8ClampedArray(picture.pixels), picture.width);
  own.getContext('2d')?.putImageData(image, -west, -north, west, north, width, height);
  // An icon long and thin is laid on its tile's diagonal, so a weapon reads at the tile's size; a large picture stands.
  const laid = cap === undefined ? diagonalFit(width, height, box, devicePixelRatio) : null;
  if (laid) return diagonalCanvas(canvas, own, laid, box);
  // Grown by whole pixels first, so the one smooth step down never blurs a pixel into its neighbour.
  const grown = document.createElement('canvas');
  [grown.width, grown.height] = [width * fit.grown, height * fit.grown];
  const growing = grown.getContext('2d');
  if (growing) {
    growing.imageSmoothingEnabled = false;
    growing.drawImage(own, 0, 0, grown.width, grown.height);
  }
  [canvas.width, canvas.height] = [fit.width, fit.height];
  const drawing = canvas.getContext('2d');
  if (drawing) {
    drawing.imageSmoothingEnabled = fit.smooth;
    drawing.imageSmoothingQuality = 'high';
    drawing.drawImage(grown, 0, 0, fit.width, fit.height);
  }
  canvas.classList.toggle('gear-picture-fitted', fit.smooth);
  canvas.style.width = `${fit.shownWidth}px`;
  canvas.style.height = `${fit.shownHeight}px`;
  return canvas;
}

/** A long thin picture grown by whole pixels, then turned onto the diagonal of a square box and smoothed once. */
function diagonalCanvas(
  canvas: HTMLCanvasElement,
  own: HTMLCanvasElement,
  laid: NonNullable<ReturnType<typeof diagonalFit>>,
  box: number,
): HTMLCanvasElement {
  const grown = document.createElement('canvas');
  [grown.width, grown.height] = [own.width * laid.grown, own.height * laid.grown];
  const growing = grown.getContext('2d');
  if (growing) {
    growing.imageSmoothingEnabled = false;
    growing.drawImage(own, 0, 0, grown.width, grown.height);
  }
  [canvas.width, canvas.height] = [laid.room, laid.room];
  const drawing = canvas.getContext('2d');
  if (drawing) {
    const [across, down] = [own.width * laid.scale, own.height * laid.scale];
    drawing.imageSmoothingEnabled = true;
    drawing.imageSmoothingQuality = 'high';
    drawing.translate(laid.room / 2, laid.room / 2);
    drawing.rotate(laid.turn);
    drawing.drawImage(grown, -across / 2, -down / 2, across, down);
  }
  canvas.classList.add('gear-picture-fitted');
  canvas.style.width = canvas.style.height = `${box}px`;
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
  const image = make('img', '', fineGlyph(glyph) ? 'gear-glyph gear-glyph-fine' : 'gear-glyph');
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

/** The dark of a ring's part still to grow. */
const RING_DARK = '#2a2620';

/** A locked node's ring, grown `share` of the way to it. */
export function nodeRing(share: number): HTMLElement {
  const ring = make('span', '', 'gear-node-ring');
  ring.innerHTML = ringSvg(share, RING_DARK);
  return ring;
}

/** An element's glyph, named for a screen reader; nothing for none. */
export function elementGlyph(element: number, className = 'gear-element'): HTMLElement | null {
  const found = ELEMENTS[element];
  if (!found) return null;
  const glyph = make('span', '', className);
  glyph.innerHTML = elementSvg(element);
  glyph.setAttribute('role', 'img');
  glyph.setAttribute('aria-label', found.name);
  return glyph;
}

/** What an item's icon shows of it beyond its picture: a weapon's element as a glyph in its corner; and, after
 *  Destiny 1, a gauge along its foot that fills as its nodes are bought, until, fully upgraded, its frame is gilded
 *  and the gauge goes. */
export function itemMarks(tile: HTMLElement, item: GearItem): void {
  const element = elementGlyph(item.element);
  if (element) tile.append(element);
  const share = upgraded(item);
  const gilded = fullyUpgraded(item);
  tile.classList.toggle('gear-gilded', gilded);
  if (share === null || gilded) return;
  const gauge = make('span', '', 'gear-gauge');
  gauge.setAttribute('aria-hidden', 'true');
  const fill = make('span', '', 'gear-gauge-fill');
  fill.style.width = `${Math.round(share * 100)}%`;
  gauge.append(fill);
  tile.append(gauge);
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

/** How far each number's meter reaches, for what a piece changes over the one it would replace. */
const MOST: Readonly<Record<string, number>> = { Attack: 300, Defense: 450, Prestige: 30 };

/** What a piece changes over the one it would replace, as Destiny's card shows it: each number's meter at the lesser
 *  of the two, the rest of the greater a segment gained or lost, and the new number with the change beside it. */
export function compareNode(compare: NonNullable<Card['compare']>): HTMLElement {
  const block = make('div', '', 'gear-compare');
  block.append(make('p', `Replaces ${compare.replaces}`, 'gear-card-meta'));
  for (const row of compare.rows) {
    const change = row.to - row.from;
    const most = Math.max(MOST[row.label] ?? 0, row.from, row.to, 1);
    const line = make('div', '', `gear-compare-row ${change > 0 ? 'up' : change < 0 ? 'down' : 'same'}`);
    const well = make('div', '', `gear-compare-well ${ROLES.well}`);
    const kept = make('div', '', 'gear-compare-kept');
    kept.style.width = `${(Math.min(row.from, row.to) / most) * 100}%`;
    const moved = make('div', '', 'gear-compare-moved');
    moved.style.width = `${(Math.abs(change) / most) * 100}%`;
    well.append(kept, moved);
    const sign = change > 0 ? '+' : change < 0 ? '−' : '';
    const value = make('span', String(row.to), 'gear-compare-value');
    if (change !== 0) value.append(make('small', ` ${sign}${Math.abs(change)}`));
    line.append(make('span', row.label, 'gear-compare-label'), well, value);
    block.append(line);
  }
  return block;
}

/** A trait as a card or a page lists it: its column's glyph, its name and its words. */
export function traitNode(trait: Trait): HTMLElement {
  const line = make('div', '', 'gear-card-trait');
  const words = make('div', '', 'gear-trait-words');
  words.append(make('b', trait.name), make('span', trait.words));
  line.append(nodeGlyph(trait.kind), words);
  return line;
}

/** An item's hover card: its name on a band of its rarity, its kind and pips, its picture large, its main number, its
 *  rows, its traits and words, what it changes over the piece it would replace, and what may be done with it. */
export function cardNode(card: Card, picture: Picture | null, hints: readonly Hint[]): HTMLElement {
  const node = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(node, card.rarity);
  const head = make('div', '', 'gear-card-head');
  const meta = make('p', card.kind, 'gear-card-meta');
  const pips = RARITIES[card.rarity]?.pips ?? '';
  if (pips) meta.append(make('span', pips, 'gear-card-pips'));
  const element = elementGlyph(card.element, 'gear-element-inline');
  if (element) {
    const named = make('span', ELEMENTS[card.element]?.name ?? '', 'gear-element-name');
    named.style.color = ELEMENTS[card.element]?.colour ?? '';
    meta.append(element, named);
  }
  head.append(make('h3', card.name), meta);
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
  body.append(stats, ...card.traits.map(traitNode));
  if (card.words) body.append(make('p', card.words, 'gear-card-words'));
  if (card.compare) body.append(compareNode(card.compare));
  node.append(body);
  if (hints.length > 0) node.append(hintLine(hints, 'gear-card-hint'));
  return node;
}

/** The one hover card of a page, shown beside what it describes and kept on the screen; on pointer hover and on
 *  keyboard focus alike. */
export class HoverCard {
  private readonly tip: HTMLElement;
  /** The card's own element, which stays in reach while the screen it serves is open. */
  get node(): HTMLElement {
    return this.tip;
  }
  private anchor: HTMLElement | null = null;
  /** What the pointer or the focus showed the card for, which may stand beside another (its row, its flyout). */
  private source: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.tip = make('div', '', 'gear-tip');
    this.tip.setAttribute('role', 'tooltip');
    this.tip.id = 'gear-tip';
    this.tip.hidden = true;
    root.append(this.tip);
  }

  show(anchor: HTMLElement, content: HTMLElement, source: HTMLElement = anchor): void {
    this.anchor = anchor;
    this.source = source;
    this.tip.replaceChildren(content);
    this.tip.hidden = false;
    const near = anchor.getBoundingClientRect();
    const size = this.tip.getBoundingClientRect();
    const right = near.right + TIP_GAP;
    const left = right + size.width + TIP_GAP > innerWidth ? near.left - TIP_GAP - size.width : right;
    // It stands above the menu's footer, whose keys and presses stay readable under it.
    const foot = this.tip.parentElement
      ?.querySelector('.gear-screen:not([hidden]) .gear-foot')
      ?.getBoundingClientRect();
    const floor = foot ? foot.top : innerHeight;
    const top = Math.min(Math.max(TIP_GAP, near.top), floor - size.height - TIP_GAP);
    // Measured on the screen, placed in the card's own pixels, which a zoomed menu doubles.
    const zoom = cssZoom(this.tip);
    this.tip.style.left = `${Math.max(TIP_GAP, left) / zoom}px`;
    this.tip.style.top = `${Math.max(TIP_GAP, top) / zoom}px`;
  }

  hide(): void {
    this.anchor = null;
    this.source = null;
    this.tip.hidden = true;
  }

  /** Hides the card once what it describes has left the page, as a page built again leaves it. */
  keep(): void {
    if (this.anchor && !this.anchor.isConnected) this.hide();
  }

  /** Shows `content()` while the pointer is over `anchor` or it holds the focus, beside `beside` (the anchor itself
   *  unless given). */
  over(anchor: HTMLElement, content: () => HTMLElement, beside = anchor): void {
    // An open slot's flyout stands where its card would, so the card waits until it closes.
    const show = () => anchor.getAttribute('aria-expanded') !== 'true' && this.show(beside, content(), anchor);
    anchor.setAttribute('aria-describedby', 'gear-tip');
    // Only a pointer that moves shows it: a page built anew under a resting pointer opens no card over the focus.
    anchor.addEventListener('pointermove', () => this.source !== anchor && show());
    anchor.addEventListener('pointerleave', () => this.hide());
    // A focus the keys moved shows it; one a click or a page built anew left there does not.
    anchor.addEventListener('focus', () => anchor.matches(':focus-visible') && show());
    anchor.addEventListener('blur', () => this.hide());
  }
}

// shortcut: the parts of elements the menu's pages still made of them share (the Social and Settings tabs, a player's
// details, the story's creation); the drawn menu's are gearNodes.ts, gearCard.ts and gearHold.ts. It goes once those
// pages are drawn.
// The gear screens' shared parts, in the Enhanced Plus kit: a press in its role, a press held a moment, a picture drawn
// crisp into a canvas, an item's icon, an element's glyph, and a surface marked with a rarity.

import { button, make } from '../editor/dom.ts';
import { ELEMENTS, RARITIES } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import { ROLES, type Role } from '../plus/kit.ts';
import { elementSvg } from './elementGlyphs.ts';
import { diagonalFit, drawnBounds, fitIcon } from '../player/iconFit.ts';
import { charge, play } from './uiSounds.ts';

/** How long a held press is held before it acts, in milliseconds: what cannot be undone is held, not tapped. */
export const HOLD_MS = 800;
export type { Hint } from './gearNodes.ts';

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
function letGoHold(node?: HTMLElement): void {
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

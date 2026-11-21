// The weapons at the bottom left, beside the Art's abilities, as Destiny shows them: a long thin rule over them, the
// weapon in hand drawn as its own picture, a Ranged one's shots left large over its capacity ("18 / 24", a 0 and "No
// ammo" at none) and a Melee one's name in its rarity's colour; under it the other loadout's weapon, smaller, with its
// key and its own shots. A swap trades the two rows over the swap's time, a reload fills a line under the count, a draw
// flashes the weapon and one put away dims. The pictures are the forge's, as the gear screens draw them.
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Dress } from '../player/dressing.ts';
import { itemName, KINDS, kindName, MELEE, RANGED_SLOT, RARITIES, worn } from '../player/gear.ts';
import type { ItemPictures } from '../player/itemPictures.ts';
import type { Picture } from '../player/picture.ts';
import { motionReduced } from '../plus/kit.ts';
import { TONES } from '../plus/tones.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import type { FighterView } from '../rules/fighters.ts';
import { ammoWords } from './ammoCounter.ts';
import { baselineOf, lineHeight } from '../ui/text.ts';
import { keycapNode, mix, paintBox, type Pen, ring } from './barDraw.ts';
import { weaponFit } from './weaponPicture.ts';

/** How long a swap between loadouts takes, in seconds (crates/combat/src/tuning.rs SWAP_TICKS, at 60 a second). */
export const SWAP_SECONDS = 24 / 60;
/** How long a weapon drawn flashes, in seconds. */
const DRAW_SECONDS = 0.3;
/** The keys that draw each loadout. */
export const LOADOUT_KEYS = ['1', '2'] as const;
/** Each row's picture box, in CSS pixels, at each step: the weapon in hand's, then the other's. */
export const PICTURE_BOXES = {
  base: { hand: [116, 36], next: [80, 22] },
  wide: { hand: [164, 52], next: [112, 32] },
} as const;

/** What the weapons are shown from: the gear worn, the loadout in hand (or the one a draw takes up while the arms are
 *  put away), whether it is drawn, and the figure the forge draws the pictures on. */
export interface ArmsShown {
  readonly gear: GearState | null;
  readonly loadout: number;
  readonly drawn: boolean;
  readonly dress: Dress | null;
}

/** A loadout as its row shows it: its slot, its item, name and rarity, the key that draws it, and for a Ranged one
 *  its shots left (or "No ammo"), its capacity, and whether few or none are left. */
export interface WeaponShown {
  readonly slot: number;
  readonly item: GearItem;
  readonly name: string;
  readonly rarity: number;
  readonly key: string;
  readonly shots: string | null;
  readonly most: number | null;
  readonly low: boolean;
  readonly empty: boolean;
}

/** The two rows: the loadout in hand and the other, each null where no weapon is worn in it, from `arms` and the
 *  shots left `ammo` (the player's own fighter's count, which a shot takes from at once). */
export function weaponsOf(
  arms: ArmsShown,
  ammo: number | null,
): { readonly hand: WeaponShown | null; readonly next: WeaponShown | null } {
  const row = (slot: number): WeaponShown | null => {
    const item = arms.gear ? worn(arms.gear, slot) : undefined;
    if (!item) return null;
    const most = arms.gear?.ammoMost ?? 0;
    const said = slot === RANGED_SLOT ? ammoWords(ammo ?? arms.gear?.ammo ?? 0, most > 0 ? most : null) : null;
    return {
      slot,
      item,
      name: itemName(item) === KINDS[item.kind] ? kindName(item.kind) : itemName(item),
      rarity: item.rarity,
      key: LOADOUT_KEYS[slot] ?? '',
      shots: said?.words ?? null,
      most: said && !said.empty && most > 0 ? most : null,
      low: said?.low ?? false,
      empty: said?.empty ?? false,
    };
  };
  const inHand = arms.loadout === RANGED_SLOT ? RANGED_SLOT : MELEE;
  return { hand: row(inHand), next: row(inHand === MELEE ? RANGED_SLOT : MELEE) };
}

/** What a screen reader says of a row. */
export function weaponWords(shown: WeaponShown, inHand: boolean, drawn: boolean): string {
  const most = shown.most === null ? '' : ` of ${shown.most}`;
  const shots = shown.empty ? ', no ammo' : shown.shots ? `, ${shown.shots}${most} shots` : '';
  const where = inHand ? (drawn ? 'In hand' : 'Put away') : `Press ${shown.key} to draw`;
  return `${where}: ${shown.name}${shots}`;
}

/** The weapons' rows on the HUD, kept each frame and drawn from what they last kept. */
export class WeaponRows {
  private readonly pictures: ItemPictures | null;
  private wide = false;
  private zoom = 1;
  private loadout: number | null = null;
  private drawn: boolean | null = null;
  private swapping = 0;
  private drawing = 0;
  private reloadMost = 0;
  private reload = 0;
  private arms: ArmsShown | null = null;
  private rows: { readonly hand: WeaponShown | null; readonly next: WeaponShown | null } = { hand: null, next: null };
  /** A number for each of the forge's pictures, by which the interface keeps it. */
  private readonly keys = new WeakMap<Picture, number>();

  constructor(pictures: ItemPictures | null) {
    this.pictures = pictures;
  }

  /** Lays the rows at the display's step and zoom. */
  lay(wide: boolean, zoom = 1): void {
    [this.wide, this.zoom] = [wide, zoom];
  }

  /** Shows `arms` for the player's fighter `own`, `seconds` on. */
  update(asked: ArmsShown, own: FighterView | null, seconds: number): void {
    // The rules take up another loadout, or put one away, only at rest: while the fighter is busy (a swing, a guard,
    // a draw, a reload) the rows keep what the hands still hold.
    const resting = !own || own.action.kind === 'idle' || own.action.kind === 'dead';
    const takenUp = resting || this.loadout === null || this.drawn === null;
    const arms = takenUp
      ? asked
      : { ...asked, loadout: this.loadout ?? asked.loadout, drawn: this.drawn ?? asked.drawn };
    this.rows = weaponsOf(arms, own?.ammo ?? null);
    this.arms = arms;
    if (this.loadout !== null && arms.loadout !== this.loadout) this.swapping = SWAP_SECONDS;
    else this.swapping = Math.max(0, this.swapping - seconds);
    if (this.drawn === false && arms.drawn) this.drawing = DRAW_SECONDS;
    else this.drawing = Math.max(0, this.drawing - seconds);
    [this.loadout, this.drawn] = [arms.loadout, arms.drawn];
    const hand = this.rows.hand;
    this.reload = own?.action.kind === 'reload' && hand?.slot === RANGED_SLOT ? own.action.left : 0;
    this.reloadMost = this.reload > 0 ? Math.max(this.reloadMost, this.reload) : 0;
  }

  /** What the rows show: the loadout in hand (its slot), whether a swap is trading them, whether the hand's weapon is
   *  put away, and how far a reload has filled its line (null while none runs). */
  get shown(): {
    readonly inHand: number | null;
    readonly swapping: boolean;
    readonly away: boolean;
    readonly reload: number | null;
  } {
    return {
      inHand: this.rows.hand?.slot ?? null,
      swapping: this.swapping > 0,
      away: !(this.arms?.drawn ?? true),
      reload: this.reload > 0 ? 1 - this.reload / this.reloadMost : null,
    };
  }

  /** What a screen reader says of each row shown. */
  words(): readonly string[] {
    const { hand, next } = this.rows;
    const drawn = this.arms?.drawn ?? false;
    return [hand && weaponWords(hand, true, drawn), next && weaponWords(next, false, drawn)].filter(
      (said): said is string => !!said,
    );
  }

  /** The rows under a long brass rule: the weapon in hand, then the other loadout's; none with no weapon worn. */
  node(): Node | null {
    const { hand, next } = this.rows;
    if (!hand && !next) return null;
    const wide = this.wide;
    const zoom = this.zoom;
    const rule = (ui: UiRenderer, box: Box, scale: number, clip: Box, fade: number) => {
      const pen = { ui, box, scale: scale * zoom, clip, fade };
      const line = { ...box, width: box.width + 24 * pen.scale, height: 2 * pen.scale };
      paintBox(pen, { ...line, y: line.y - pen.scale, height: pen.scale }, TONES.outline);
      paintBox(pen, { ...line, y: line.y + line.height, height: pen.scale }, TONES.outline);
      gradient(pen, line, [
        [0, TONES.brassHi],
        [0.6, TONES.brass],
        [1, 'rgba(192,138,62,0)'],
      ]);
    };
    return {
      label: 'Your weapons',
      direction: 'column',
      gap: (wide ? 6 : 4) * zoom,
      padding: [(wide ? 9 : 6) * zoom, 0, 0, 0],
      draw: rule,
      children: [hand && this.row(hand, true), next && this.row(next, false)],
    };
  }

  private row(shown: WeaponShown, inHand: boolean): Node {
    const wide = this.wide;
    const zoom = this.zoom;
    const still = motionReduced();
    const arms = this.arms;
    const away = inHand && !(arms?.drawn ?? true);
    const ranged = shown.slot === RANGED_SLOT;
    const [large, middle, small] = wide ? [4, 3, 2] : [3, 2, 1];
    // A picture the forge is still drawing shows on the first frame after it is done.
    const drawnPicture = arms?.dress
      ? (this.pictures?.pictureOf(shown.item, arms.dress, () => undefined) ?? null)
      : null;
    const ratio = Math.max(1, Math.round(globalThis.devicePixelRatio || 1)) * zoom;
    const [boxWidth, boxHeight] = (wide ? PICTURE_BOXES.wide : PICTURE_BOXES.base)[inHand ? 'hand' : 'next'];
    const fit = drawnPicture && weaponFit(drawnPicture, boxWidth, boxHeight, ratio);
    // With no picture (still drawing, or none to be had) the row says the weapon's name instead.
    const bare = !fit;
    const swap = this.swapping > 0 && !still ? Math.floor(((SWAP_SECONDS - this.swapping) / SWAP_SECONDS) * 4) / 4 : 1;
    const flash =
      inHand && this.drawing > 0 && !still
        ? 2.4 - (1.4 * Math.floor(((DRAW_SECONDS - this.drawing) / DRAW_SECONDS) * 3)) / 3
        : 1;
    const words = (text: string, size: number, colour: string): Node => ({
      text: { words: text, size: size * zoom, colour, edge: 'halo', wrap: false },
    });
    const counted = (inHand ? large : middle) * zoom;
    // The count's line is as tall as its letters (lifted by half what the face's own line adds); the small words
    // beside it stand on its baseline.
    const lift = Math.round((lineHeight(counted) - counted * 11) / 2);
    const onCount = (size: number) => counted * 11 - lineHeight(size) + baselineOf(size) - (baselineOf(counted) - lift);
    const shotsColour = shown.empty ? '#e8968a' : shown.low ? '#f1c04f' : TONES.word;
    const count: Child = ranged && {
      direction: 'row',
      gap: 4 * zoom,
      alignY: 'end',
      ...(inHand && this.reload > 0 ? { opacity: 0.5 } : {}),
      children: [
        // None left reads as a large 0, as a count does, its words small where the capacity stands.
        // Its line as tall as its letters, as the sheet set it, so the row is no taller than they are.
        {
          ...words(shown.empty ? '0' : (shown.shots ?? ''), inHand ? large : middle, shotsColour),
          height: counted * 11,
          offset: [0, -lift] as const,
        },
        inHand &&
          (shown.empty || shown.most !== null) && {
            ...words(
              shown.empty ? (shown.shots ?? '') : `/ ${shown.most}`,
              small,
              shown.empty ? '#e8968a' : TONES.wordDim,
            ),
            offset: [0, -onCount(small * zoom)] as const,
          },
      ],
    };
    const nameShown = bare || (!inHand ? false : !ranged);
    const name: Child = nameShown && {
      ...(ranged ? { offset: [0, -onCount(small * zoom)] as const } : {}),
      text: {
        words: shown.name,
        size: small * zoom,
        colour: RARITIES[shown.rarity]?.colour ?? TONES.word,
        edge: 'halo',
        ellipsis: true,
      },
    };
    const lead: Node = {
      direction: 'row',
      gap: 6 * zoom,
      alignY: 'end',
      width: (wide ? 128 : 88) * zoom,
      clip: true,
      ...(away ? { opacity: 0.6 } : {}),
      children: [!inHand && keycapNode(shown.key, small, wide ? 28 : 18, wide ? 27 : 17, zoom), count, name],
    };
    const pictureNode: Child = fit &&
      drawnPicture && {
        width: fit.width * zoom,
        height: fit.height * zoom,
        ...(away ? { opacity: 0.6 } : {}),
        ...(this.swapping > 0 && still && inHand ? { outline: { width: 1, colour: TONES.brassHi } } : {}),
        picture: {
          key: `weapon ${this.keyOf(drawnPicture)} ${away ? 'away' : flash}`,
          source: {
            draw: (context, width, height) => {
              context.filter = away ? 'grayscale(0.7)' : flash > 1 ? `brightness(${flash})` : 'none';
              fit.draw(context, width, height);
            },
          },
        },
      };
    const reload: Child = inHand &&
      this.reload > 0 && {
        width: `${Math.round((1 - this.reload / this.reloadMost) * 100)}%`,
        height: 2 * zoom,
        fill: TONES.word,
        float: { at: [0, 1], anchor: [0, 1], x: 6 * zoom, z: 1 },
        draw: (ui, box, scale, clip, fade) => ring({ ui, box, scale, clip, fade }, box, TONES.outline),
      };
    // The row's height, for a swap's slide: its picture's or its words', and its padding.
    const height = Math.max(fit ? fit.height * zoom : 0, ranged ? counted * 11 : lineHeight(small * zoom)) + 6 * zoom;
    const from = inHand ? 0.7 : -0.9;
    return {
      direction: 'row',
      alignY: 'center',
      gap: (wide ? 12 : 8) * zoom,
      padding: [3 * zoom, 28 * zoom, 3 * zoom, 6 * zoom],
      label: weaponWords(shown, inHand, arms?.drawn ?? false),
      opacity: (inHand ? 1 : 0.82) * (0.3 + 0.7 * swap),
      offset: [0, Math.round(from * height * (1 - swap))],
      draw: (ui, box, scale, clip, fade) =>
        gradient({ ui, box, scale, clip, fade }, box, [
          [0, 'rgba(12,14,18,0.62)'],
          [0.7, 'rgba(12,14,18,0.38)'],
          [1, 'rgba(12,14,18,0)'],
        ]),
      children: [lead, bare ? null : pictureNode, reload],
    };
  }

  private keyOf(picture: Picture): number {
    let key = this.keys.get(picture);
    if (key === undefined) {
      key = nextKey++;
      this.keys.set(picture, key);
    }
    return key;
  }
}

let nextKey = 0;

/** A strip across `box` going through `stops` (shares of its width and the colour there), drawn in steps of two
 *  device pixels. */
function gradient(pen: Pen, box: Box, stops: readonly (readonly [number, string])[]): void {
  const step = 2;
  for (let x = 0; x < box.width; x += step) {
    const along = (x + step / 2) / box.width;
    const after = stops.findIndex(([share]) => share >= along);
    const [toShare, to] = stops[Math.max(0, after)] ?? [1, 'transparent'];
    const [fromShare, from] = stops[Math.max(0, after - 1)] ?? [0, to];
    const share = toShare > fromShare ? (along - fromShare) / (toShare - fromShare) : 0;
    paintBox(
      pen,
      { x: box.x + x, y: box.y, width: Math.min(step, box.width - x), height: box.height },
      mix(from, to, share),
    );
  }
}

// The weapons at the bottom left, beside the Art's abilities, as Destiny shows them: a long thin rule over them, the
// weapon in hand drawn as its own picture, a Ranged one's shots left large over its capacity ("18 / 24", "No ammo" at
// none) and a Melee one's name in its rarity's colour; under it the other loadout's weapon, smaller, with its key and
// its own shots. A swap trades the two rows over the swap's time, a reload fills a line under the count, a draw flashes
// the weapon and one put away dims. The pictures are the forge's, as the gear screens draw them.
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Dress } from '../player/dressing.ts';
import { itemName, KINDS, kindName, MELEE, RANGED_SLOT, RARITIES, worn } from '../player/gear.ts';
import type { ItemPictures } from '../player/itemPictures.ts';
import type { Picture } from '../player/picture.ts';
import { HALO, TONES } from '../plus/tones.ts';
import type { FighterView } from '../rules/fighters.ts';
import { ammoWords } from './ammoCounter.ts';
import { EDGE } from './hudLayout.ts';
import { element } from './meter.ts';
import { weaponCanvas } from './weaponPicture.ts';

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

/** One row's parts, and the item and picture it last drew. */
interface Row {
  readonly root: HTMLElement;
  readonly key: HTMLElement;
  readonly shots: HTMLElement;
  readonly most: HTMLElement;
  readonly name: HTMLElement;
  readonly picture: HTMLElement;
  readonly reload: HTMLElement;
  item: GearItem | null;
  drawn: Picture | null;
}

/** The weapons' rows on the HUD, written each frame; only what changed reaches the page. */
export class WeaponRows {
  readonly root: HTMLElement;
  private readonly rows: readonly [Row, Row];
  private readonly pictures: ItemPictures | null;
  private wide = false;
  private zoom = 1;
  private loadout: number | null = null;
  private drawn: boolean | null = null;
  private swapping = 0;
  private drawing = 0;
  private reloadMost = 0;

  constructor(parent: HTMLElement, pictures: ItemPictures | null) {
    this.pictures = pictures;
    this.root = element('div', 'weapons', parent);
    this.root.role = 'group';
    this.root.ariaLabel = 'Your weapons';
    this.root.hidden = true;
    element('i', 'rule', this.root);
    const row = (where: string): Row => {
      const root = element('div', `weapon ${where}`, this.root);
      root.role = 'img';
      // What leads the row (its key, its shots or its name), then its picture, as Destiny's rows read.
      const lead = element('span', 'lead', root);
      const key = element('kbd', '', lead);
      const count = element('span', 'count', lead);
      const shots = element('b', 'shots', count);
      const most = element('span', 'most', count);
      const name = element('span', 'name', lead);
      const picture = element('span', 'picture', root);
      const reload = element('i', 'reload', root);
      return { root, key, shots, most, name, picture, reload, item: null, drawn: null };
    };
    this.rows = [row('hand'), row('next')];
  }

  /** Lays the rows at the display's step and zoom: their pictures are drawn again at that size. */
  lay(wide: boolean, zoom = 1): void {
    if (wide === this.wide && zoom === this.zoom) return;
    [this.wide, this.zoom] = [wide, zoom];
    for (const row of this.rows) row.item = null;
  }

  /** Shows `arms` for the player's fighter `own`, `seconds` on. */
  update(arms: ArmsShown, own: FighterView | null, seconds: number): void {
    const { hand, next } = weaponsOf(arms, own?.ammo ?? null);
    this.root.hidden = !hand && !next;
    if (this.root.hidden) return;
    if (this.loadout !== null && arms.loadout !== this.loadout) this.swapping = SWAP_SECONDS;
    if (this.drawn === false && arms.drawn) this.drawing = DRAW_SECONDS;
    [this.loadout, this.drawn] = [arms.loadout, arms.drawn];
    this.swapping = Math.max(0, this.swapping - seconds);
    this.drawing = Math.max(0, this.drawing - seconds);
    this.root.classList.toggle('swapping', this.swapping > 0);
    this.root.classList.toggle('drawing', this.drawing > 0);
    this.root.classList.toggle('away', !arms.drawn);
    const reload = own?.action.kind === 'reload' && hand?.slot === RANGED_SLOT ? own.action.left : 0;
    this.reloadMost = reload > 0 ? Math.max(this.reloadMost, reload) : 0;
    const [handRow, nextRow] = this.rows;
    this.show(handRow, hand, arms, true);
    this.show(nextRow, next, arms, false);
    handRow.root.classList.toggle('reloading', reload > 0);
    if (reload > 0) handRow.reload.style.width = `${Math.round((1 - reload / this.reloadMost) * 100)}%`;
  }

  private show(row: Row, shown: WeaponShown | null, arms: ArmsShown, inHand: boolean): void {
    row.root.hidden = !shown;
    if (!shown) return;
    const ranged = shown.slot === RANGED_SLOT;
    row.root.classList.toggle('ranged', ranged);
    row.root.classList.toggle('low', shown.low);
    row.root.classList.toggle('empty', shown.empty);
    const write = (node: HTMLElement, text: string) => node.textContent !== text && (node.textContent = text);
    write(row.key, shown.key);
    write(row.shots, shown.shots ?? '');
    write(row.most, shown.most === null ? '' : `/ ${shown.most}`);
    write(row.name, shown.name);
    const colour = RARITIES[shown.rarity]?.colour ?? '';
    if (row.name.style.color !== colour) row.name.style.color = colour;
    const said = weaponWords(shown, inHand, arms.drawn);
    if (row.root.ariaLabel !== said) row.root.ariaLabel = said;
    // A picture the forge is still drawing shows on the first frame after it is done.
    const picture = arms.dress ? (this.pictures?.pictureOf(shown.item, arms.dress, () => undefined) ?? null) : null;
    if (shown.item === row.item && picture === row.drawn) return;
    [row.item, row.drawn] = [shown.item, picture];
    const [width, height] = (this.wide ? PICTURE_BOXES.wide : PICTURE_BOXES.base)[inHand ? 'hand' : 'next'];
    row.picture.replaceChildren(
      ...(picture ? [weaponCanvas(picture, width, height, devicePixelRatio * this.zoom)] : []),
    );
  }
}

/** One step of the rows: the lead's width, the counts' sizes and the pictures' boxes. */
function weaponStepCss(scope: string, wide: boolean): string {
  const boxes = wide ? PICTURE_BOXES.wide : PICTURE_BOXES.base;
  const [large, middle, small] = wide ? [44, 33, 22] : [33, 22, 11];
  return `
${scope} .weapons { gap: ${wide ? 6 : 4}px; padding-top: ${wide ? 9 : 6}px; }
${scope} .weapon { grid-template-columns: ${wide ? 112 : 78}px auto; column-gap: ${wide ? 12 : 8}px; }
${scope} .weapon.hand .shots { font-size: ${large}px; line-height: ${large}px; }
${scope} .weapon.next .shots { font-size: ${middle}px; line-height: ${middle}px; }
${scope} .weapon.empty .shots, ${scope} .weapon .most, ${scope} .weapon .name, ${scope} .weapon kbd {
  font-size: ${small}px; }
${scope} .weapon kbd { min-width: ${wide ? 28 : 18}px; line-height: ${wide ? 24 : 14}px; }
${scope} .weapon.hand .picture { width: ${boxes.hand[0]}px; height: ${boxes.hand[1]}px; }
${scope} .weapon.next .picture { width: ${boxes.next[0]}px; height: ${boxes.next[1]}px; }`;
}

/** The rows' sheet: a brass rule over two rows, each its lead and its picture; few shots in brass and none in the loss
 *  colour, as the crosshair's counter says them; a swap trading the rows in four steps, a draw's flash, a reload's
 *  line, and the weapon put away dimmed. */
export function weaponsCss(): string {
  return `
.fight-hud .arms { position: absolute; left: ${EDGE.side}px; bottom: ${EDGE.foot}px; display: flex;
  align-items: flex-end; gap: 14px; pointer-events: none; }
.fight-hud.wide .arms { gap: 20px; }
.fight-hud.double .arms { zoom: 2; }
.fight-hud .weapons { position: relative; display: grid; color: ${TONES.word}; text-shadow: ${HALO}; }
.fight-hud .weapons .rule { position: absolute; left: 0; right: -24px; top: 0; height: 2px;
  background: linear-gradient(90deg, ${TONES.brassHi}, ${TONES.brass} 60%, transparent);
  box-shadow: 0 1px 0 ${TONES.outline}, 0 -1px 0 ${TONES.outline}; }
.fight-hud .weapon { position: relative; display: grid; align-items: center; padding: 3px 28px 3px 6px;
  background: linear-gradient(90deg, rgba(12,14,18,0.62), rgba(12,14,18,0.38) 70%, rgba(12,14,18,0)); }
.fight-hud .weapon .lead { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.fight-hud .weapon .count { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.fight-hud .weapon .shots { font-weight: 500; font-variant-numeric: tabular-nums; }
.fight-hud .weapon .most { color: ${TONES.wordDim}; letter-spacing: 0.06em; }
.fight-hud .weapon .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: 0.06em; }
.fight-hud .weapon.hand kbd, .fight-hud .weapon.hand.ranged .name, .fight-hud .weapon:not(.ranged) .count,
.fight-hud .weapon.next .name, .fight-hud .weapon.next .most, .fight-hud .weapon:not(.reloading) .reload {
  display: none; }
.fight-hud .weapon kbd { align-self: center; box-sizing: border-box; padding: 0 4px; border: 1px solid;
  border-color: ${TONES.stoneLit} ${TONES.stoneDark} ${TONES.stoneDark} ${TONES.stoneLit}; border-bottom-width: 2px;
  background: #16181d; font: inherit; text-align: center; text-shadow: none; box-shadow: 0 0 0 1px ${TONES.outline}; }
.fight-hud .weapon.low .shots { color: #f1c04f; }
.fight-hud .weapon.empty .shots { color: #e8968a; letter-spacing: 0.06em; }
.fight-hud .weapon .picture { display: flex; align-items: center; }
.fight-hud .weapon .picture canvas { display: block; image-rendering: pixelated;
  filter: drop-shadow(1px 0 0 ${TONES.outline}) drop-shadow(-1px 0 0 ${TONES.outline})
    drop-shadow(0 1px 0 ${TONES.outline}) drop-shadow(0 -1px 0 ${TONES.outline}); }
.fight-hud .weapon.next { opacity: 0.82; }
.fight-hud .weapon .reload { position: absolute; left: 6px; bottom: 0; height: 2px; background: ${TONES.word};
  box-shadow: 0 0 0 1px ${TONES.outline}; }
.fight-hud .weapon.reloading .shots { opacity: 0.5; }
.fight-hud .weapons.away .weapon.hand { opacity: 0.55; }
.fight-hud .weapons.away .weapon.hand .picture { filter: grayscale(0.7); }
${weaponStepCss('.fight-hud', false)}
${weaponStepCss('.fight-hud.wide', true)}
@media (prefers-reduced-motion: no-preference) {
  .fight-hud .weapons.swapping .weapon.hand { animation: weapon-up ${SWAP_SECONDS}s steps(4, end); }
  .fight-hud .weapons.swapping .weapon.next { animation: weapon-down ${SWAP_SECONDS}s steps(4, end); }
  .fight-hud .weapons.drawing .weapon.hand .picture { animation: weapon-drawn ${DRAW_SECONDS}s steps(3, end); }
}
@media (prefers-reduced-motion: reduce) {
  .fight-hud .weapons.swapping .weapon.hand .picture { outline: 1px solid ${TONES.brassHi}; }
}
@keyframes weapon-up { from { translate: 0 70%; opacity: 0.3; } }
@keyframes weapon-down { from { translate: 0 -90%; opacity: 0.3; } }
@keyframes weapon-drawn { from { filter: brightness(2.4) drop-shadow(0 0 4px #fff); } }
`;
}

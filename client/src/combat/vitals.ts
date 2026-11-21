// The player's vitals at the top left, after a souls-like display: long thin bars with pointed ends in a fine frame,
// health over stamina over poise, each as long as what it holds. Their losses read as DFO's Enhanced HUD read them (a
// strip holds and drains, a bite breaks off and falls); health's frame flashes blood when it runs low and stamina's
// white when a swing or a dodge is asked of it with none; poise fills toward a break and says Iron, Staggered or Open
// beside it. Under them the healing charges stand as three diamonds, the next filling as the player's blows fill it,
// then the player's buffs in a row. Whole and untouched, with no buff and no foe on the target plate, the bars rest
// out of sight, and the first point lost or spent brings them back at once.
import { ROLES } from '../plus/kit.ts';
import type { FighterView } from '../rules/fighters.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { poiseTrackOf, type PoiseState } from './foePlate.ts';
import { VITAL_SIZES } from '../plus/barFrame.ts';
import { barLength } from './hudLayout.ts';
import { element, LOW_SHARE, lowShare, Meter, setStyle } from '../plus/meter.ts';
import { ownBuffs, StatusRow } from './statusIcons.ts';

/** Health at or under this share of the whole warns (the kit's low law, which a ship's hull keeps too). */
export const LOW_HEALTH = LOW_SHARE;

export type VitalName = 'health' | 'stamina' | 'poise';
const VITALS: readonly [VitalName, string][] = [
  ['health', 'Health'],
  ['stamina', 'Stamina'],
  ['poise', 'Poise'],
];
/** The stamina a fighter has in all, and the healing charges a player holds at most (crates/combat/src/tuning.rs). */
const STAMINA_WHOLE = 100;
export const CHARGES_MOST = 3;

/** A vital as its bar shows it: its share of the whole, and what a screen reader says of it, rounded as a player
 *  reads it, never 0% while anything is left and never more than 100%. */
export function vitalOf(now: number, whole: number): { share: number; text: string } {
  const share = Math.max(0, Math.min(1, now / Math.max(1, whole)));
  const shown = now > 0 ? Math.max(1, Math.round(share * 100)) : 0;
  return { share, text: `${shown}%` };
}

/** The player's three vitals; with no fighter yet, full health and stamina and no poise taken. */
export function vitalsOf(own: FighterView | null): Record<VitalName, { share: number; text: string }> {
  return {
    health: own ? vitalOf(own.health, own.healthMax) : vitalOf(1, 1),
    stamina: own ? vitalOf(own.stamina, STAMINA_WHOLE) : vitalOf(1, 1),
    poise: own ? vitalOf(own.poise, own.poiseMax) : vitalOf(0, 1),
  };
}

/** The healing charges as their diamonds show them: each one's fill (a charge held whole, the next filling by the
 *  meter, the rest empty), how many are held, and what a screen reader says of them. With no fighter yet, all three. */
export function chargesShown(own: FighterView | null): { fills: number[]; held: number; text: string } {
  const held = Math.max(0, Math.min(CHARGES_MOST, Math.floor(own?.charges ?? CHARGES_MOST)));
  const meter = held < CHARGES_MOST ? Math.max(0, Math.min(1, own?.meter ?? 0)) : 0;
  const fills = Array.from({ length: CHARGES_MOST }, (unused, index) =>
    index < held ? 1 : index === held ? meter : 0,
  );
  const next = held < CHARGES_MOST ? `, the next ${Math.floor(meter * 100)}% filled` : '';
  return { fills, held, text: `${held} of ${CHARGES_MOST}${next}` };
}

/** Each vital's most: health's and poise's the fighter's own, stamina's the rules' whole. */
export function vitalMost(own: FighterView | null): Record<VitalName, number> {
  return { health: own?.healthMax ?? 100, stamina: STAMINA_WHOLE, poise: own?.poiseMax ?? 40 };
}

/** Whether the health warns: some left, but no more than `LOW_HEALTH` of it. */
export const healthLow = (own: FighterView | null): boolean =>
  !!own && lowShare(own.health / Math.max(1, own.healthMax));

/** How long the vitals stand full and untouched before they rest, in seconds. */
export const REST_SECONDS = 4;

/** Whether every vital is whole: health and stamina short of no whole point, and no whole point of poise taken. */
export const vitalsWhole = (own: FighterView | null): boolean =>
  !own || (own.health > own.healthMax - 1 && own.stamina > STAMINA_WHOLE - 1 && own.poise < 1);

/** How long the vitals have stood calm, `seconds` after `was`: whole, with no foe on the target plate. */
export const calmFor = (was: number, whole: boolean, targeted: boolean, seconds: number): number =>
  whole && !targeted ? was + Math.max(0, seconds) : 0;

/** One vital's bar: its framed node, its meter, and the length it was last laid at. */
interface Bar {
  readonly node: HTMLElement;
  readonly meter: Meter;
  width: number;
}

/** The vitals at the top left. */
export class Vitals {
  readonly root: HTMLElement;
  private readonly bars: Record<VitalName, Bar>;
  private readonly poiseWord: HTMLElement;
  private readonly charges: HTMLElement;
  private readonly pips: readonly HTMLElement[];
  private readonly buffs: StatusRow;
  private calm = 0;
  private poise: PoiseState | null = null;
  /** Health's length, as the layout last gave it, and whether the bars stand at the larger step. */
  private length = 0;
  private wide = false;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'vitals', parent);
    this.root.role = 'group';
    this.root.ariaLabel = 'Your vitals';
    const bar = ([name, label]: [VitalName, string]) => {
      const node = element('div', `vital ${name}`, this.root);
      node.role = 'meter';
      node.ariaLabel = label;
      node.ariaValueMin = '0';
      // Poise drains of itself, so it shows no lost strip and breaks off nothing.
      const drains = name === 'poise';
      const meter = new Meter(node, 'bar', { lossShown: !drains, pieceLeast: drains ? null : PIECE_LEAST.vital });
      return [name, { node, meter, width: 0 }] as const;
    };
    this.bars = Object.fromEntries(VITALS.map(bar)) as Record<VitalName, Bar>;
    this.poiseWord = element('span', 'poise-word', this.bars.poise.node);
    this.charges = element('div', 'drinks', this.root);
    this.charges.role = 'meter';
    this.charges.ariaLabel = 'Healing charges';
    this.charges.ariaValueMin = '0';
    this.charges.ariaValueMax = String(CHARGES_MOST);
    this.pips = Array.from({ length: CHARGES_MOST }, () => element('span', 'drink', this.charges));
    this.buffs = new StatusRow(this.root, 'Your buffs');
    // A meter is a well, not a track, here: the frame gives the bar its edge.
    for (const [name] of VITALS) this.bars[name].meter.root.classList.remove(ROLES.track);
  }

  /** Lays the bars at health's `length` and the step the display stands at. */
  lay(length: number, wide: boolean): void {
    [this.length, this.wide] = [length, wide];
  }

  /** Shows `own`'s vitals `seconds` on; `flashing` while the stamina flashes for a press with none, and `targeted`
   *  while a foe stands on the target plate. */
  update(own: FighterView | null, seconds: number, flashing: boolean, targeted: boolean): void {
    const shown = vitalsOf(own);
    const most = vitalMost(own);
    const sizes = this.wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
    const track = own ? poiseTrackOf(own) : { state: 'empty' as const, fill: 0, word: '' };
    for (const [name] of VITALS) {
      const bar = this.bars[name];
      bar.meter.set(name === 'poise' ? track.fill : shown[name].share, seconds);
      const width = this.length > 0 ? barLength(this.length, most[name], most.health, sizes[name]) : 0;
      if (width !== bar.width) {
        bar.width = width;
        bar.node.style.width = width > 0 ? `${width}px` : '';
      }
      const now = String(Math.round(shown[name].share * most[name]));
      if (bar.node.ariaValueNow !== now) bar.node.ariaValueNow = now;
      const top = String(most[name]);
      if (bar.node.ariaValueMax !== top) bar.node.ariaValueMax = top;
    }
    this.bars.health.node.classList.toggle('low', healthLow(own));
    this.bars.stamina.node.classList.toggle('flash', flashing);
    this.showPoise(track.state, track.word, shown.poise.text);
    this.showCharges(own);
    const buffs = ownBuffs(own?.statuses);
    this.buffs.show(0, buffs);
    this.calm = calmFor(this.calm, vitalsWhole(own) && !flashing && buffs.length === 0, targeted, seconds);
    this.root.classList.toggle('rest', this.calm >= REST_SECONDS);
  }

  /** The healing charges: each diamond whole, filling by its share from the foot, or empty. */
  private showCharges(own: FighterView | null): void {
    const { fills, held, text } = chargesShown(own);
    this.pips.forEach((pip, index) => {
      const fill = fills[index] ?? 0;
      pip.classList.toggle('full', fill >= 1);
      setStyle(pip, '--fill', `${Math.round(fill * 100)}%`);
    });
    const now = String(held);
    if (this.charges.ariaValueNow !== now) this.charges.ariaValueNow = now;
    if (this.charges.ariaValueText !== text) this.charges.ariaValueText = text;
  }

  /** Poise's state as the foes' poise tracks read it: filling, Iron, Staggered (or Charged) or Open, its word beside
   *  the bar; it flashes only as the player breaks into a stagger. */
  private showPoise(state: PoiseState, word: string, percent: string): void {
    const node = this.bars.poise.node;
    if (state !== this.poise) {
      const breaks = state === 'staggered' && this.poise !== null;
      for (const was of ['empty', 'filling', 'iron', 'staggered', 'open'])
        node.classList.toggle(`poise-${was}`, was === state);
      node.classList.toggle('poise-flash', breaks);
      this.poise = state;
    }
    if (this.poiseWord.textContent !== word) this.poiseWord.textContent = word;
    const said = word || percent;
    if (node.ariaValueText !== said) node.ariaValueText = said;
  }
}

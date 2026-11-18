// The player's vitals along the foot of the screen, as DFO's Enhanced HUD lays its three: side by side and centred,
// health in the middle, each bar with its name and its percentage written inside it, the health's frame flashing blood
// when it runs low and the stamina's when a swing or a dodge is asked of it with none. Full and untouched, with no foe
// on the target plate, the row rests out of sight, and the first point lost or spent brings it back at once.
import type { FighterView } from '../rules/fighters.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { element, Meter } from './meter.ts';

/** Health at or under this share of the whole warns. */
export const LOW_HEALTH = 0.25;

/** The row, in CSS pixels: how far up from the screen's foot it stands, each bar's width (at most `width`, or `share`
 *  of a narrower screen) and height with its frame, and the gap between two bars. */
export const VITALS_ROW = { bottom: 22, width: 190, share: 0.23, height: 24, gap: 16 } as const;

export type VitalName = 'health' | 'stamina' | 'poise';
/** Left to right: poise where DFO's magicka stands, health in the middle, stamina where its fatigue does. */
const VITALS: readonly [VitalName, string][] = [
  ['poise', 'Poise'],
  ['health', 'Health'],
  ['stamina', 'Stamina'],
];
/** The stamina a fighter has in all (crates/combat/src/tuning.rs). */
const STAMINA_WHOLE = 100;

/** A vital as its bar shows it: its share of the whole, and the percentage written in it, rounded as a player reads
 *  it, never 0% while anything is left and never more than 100%. */
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

/** Whether the health warns: some left, but no more than `LOW_HEALTH` of it. */
export const healthLow = (own: FighterView | null): boolean =>
  !!own && own.health > 0 && own.health / Math.max(1, own.healthMax) <= LOW_HEALTH;

/** How long the vitals stand full and untouched before the row rests, in seconds. */
export const REST_SECONDS = 4;

/** Whether every vital is whole: health and stamina short of no whole point, and no whole point of poise taken. */
export const vitalsWhole = (own: FighterView | null): boolean =>
  !own || (own.health > own.healthMax - 1 && own.stamina > STAMINA_WHOLE - 1 && own.poise < 1);

/** How long the vitals have stood calm, `seconds` after `was`: whole, with no foe on the target plate. */
export const calmFor = (was: number, whole: boolean, targeted: boolean, seconds: number): number =>
  whole && !targeted ? was + Math.max(0, seconds) : 0;

/** The vitals' row. */
export class Vitals {
  readonly root: HTMLElement;
  private readonly rows: Record<VitalName, { meter: Meter; number: HTMLElement }>;
  private calm = 0;

  constructor(parent: HTMLElement) {
    const bars = element('div', 'vitals', parent);
    this.root = bars;
    const row = ([name, label]: [VitalName, string]) => {
      // Poise drains of itself, so it shows no lost strip and breaks off nothing.
      const drains = name === 'poise';
      const meter = new Meter(bars, `vital ${name}`, {
        lossShown: !drains,
        pieceLeast: drains ? null : PIECE_LEAST.vital,
      });
      element('span', 'label', meter.root, label);
      return [name, { meter, number: element('span', 'number', meter.root) }] as const;
    };
    this.rows = Object.fromEntries(VITALS.map(row)) as Record<VitalName, { meter: Meter; number: HTMLElement }>;
  }

  /** Shows `own`'s vitals `seconds` on; `flashing` while the stamina flashes for a press with none, and `targeted`
   *  while a foe stands on the target plate. */
  update(own: FighterView | null, seconds: number, flashing: boolean, targeted: boolean): void {
    const shown = vitalsOf(own);
    for (const [name] of VITALS) {
      const { meter, number } = this.rows[name];
      meter.set(shown[name].share, seconds);
      if (number.textContent !== shown[name].text) number.textContent = shown[name].text;
    }
    this.rows.health.meter.root.classList.toggle('low', healthLow(own));
    this.rows.stamina.meter.root.classList.toggle('flash', flashing);
    this.calm = calmFor(this.calm, vitalsWhole(own) && !flashing, targeted, seconds);
    this.root.classList.toggle('rest', this.calm >= REST_SECONDS);
  }
}

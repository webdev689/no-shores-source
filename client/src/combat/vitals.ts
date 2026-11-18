// The player's vitals as one panel at the bottom left, in DFO's Enhanced HUD manner: a carved window holding three
// labelled bars, each with its name and its percentage written inside it, the health's frame flashing blood when it
// runs low and the stamina's when a swing or a dodge is asked of it with none.
import { ROLES } from '../plus/kit.ts';
import type { FighterView } from '../rules/fighters.ts';
import { element, Meter } from './meter.ts';

/** Health at or under this share of the whole warns. */
export const LOW_HEALTH = 0.25;

export type VitalName = 'health' | 'stamina' | 'poise';
const VITALS: readonly [VitalName, string][] = [
  ['health', 'Health'],
  ['stamina', 'Stamina'],
  ['poise', 'Poise'],
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

/** The vitals' panel. */
export class Vitals {
  private readonly rows: Record<VitalName, { meter: Meter; number: HTMLElement }>;

  constructor(parent: HTMLElement) {
    const panel = element('div', `vitals ${ROLES.window}`, parent);
    const row = ([name, label]: [VitalName, string]) => {
      // Poise drains of itself, so it shows no lost strip.
      const meter = new Meter(panel, `vital ${name}`, name !== 'poise');
      element('span', 'label', meter.root, label);
      return [name, { meter, number: element('span', 'number', meter.root) }] as const;
    };
    this.rows = Object.fromEntries(VITALS.map(row)) as Record<VitalName, { meter: Meter; number: HTMLElement }>;
  }

  /** Shows `own`'s vitals `seconds` on; `flashing` while the stamina flashes for a press with none. */
  update(own: FighterView | null, seconds: number, flashing: boolean): void {
    const shown = vitalsOf(own);
    for (const [name] of VITALS) {
      const { meter, number } = this.rows[name];
      meter.set(shown[name].share, seconds);
      if (number.textContent !== shown[name].text) number.textContent = shown[name].text;
    }
    this.rows.health.meter.root.classList.toggle('low', healthLow(own));
    this.rows.stamina.meter.root.classList.toggle('flash', flashing);
  }
}

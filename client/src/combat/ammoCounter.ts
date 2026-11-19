// The shots left beside the crosshair while the Ranged loadout is drawn, as the fight's rules count them on the
// player's own fighter: in brass once a fifth of the capacity or less is left, and "No ammo" in the loss colour at none.

import { element } from './meter.ts';

/** The share of the capacity at or under which the shots left read as low. */
const LOW_SHARE = 0.2;

/** What the counter says of `ammo` shots left of `most`: its words, and whether it tells of none or of few; null says
 *  nothing. */
export function ammoWords(
  ammo: number | null | undefined,
  most: number | null = null,
): { readonly words: string; readonly empty: boolean; readonly low: boolean } | null {
  if (ammo === null || ammo === undefined) return null;
  if (ammo <= 0) return { words: 'No ammo', empty: true, low: false };
  return { words: String(ammo), empty: false, low: most !== null && most > 0 && ammo <= most * LOW_SHARE };
}

/** The counter, standing by the screen's middle where the crosshair stands. */
export class AmmoCounter {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'ammo', parent);
    this.root.hidden = true;
  }

  update(ammo: number | null | undefined, most: number | null = null): void {
    const said = ammoWords(ammo, most);
    this.root.hidden = !said;
    if (!said) return;
    if (this.root.textContent !== said.words) this.root.textContent = said.words;
    this.root.classList.toggle('empty', said.empty);
    this.root.classList.toggle('low', said.low);
  }
}

// The shots left beside the crosshair while the Ranged loadout is drawn, as the fight's rules count them on the
// player's own fighter; "No ammo" in the loss colour at none.

import { element } from './meter.ts';

/** What the counter says of `ammo` shots left: its words, and whether it tells of none; null says nothing. */
export function ammoWords(ammo: number | null | undefined): { readonly words: string; readonly empty: boolean } | null {
  if (ammo === null || ammo === undefined) return null;
  return ammo > 0 ? { words: String(ammo), empty: false } : { words: 'No ammo', empty: true };
}

/** The counter, standing by the screen's middle where the crosshair stands. */
export class AmmoCounter {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'ammo', parent);
    this.root.hidden = true;
  }

  update(ammo: number | null | undefined): void {
    const said = ammoWords(ammo);
    this.root.hidden = !said;
    if (!said) return;
    if (this.root.textContent !== said.words) this.root.textContent = said.words;
    this.root.classList.toggle('empty', said.empty);
  }
}

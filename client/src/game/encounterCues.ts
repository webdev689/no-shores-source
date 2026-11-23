// An Elite Dungeon's moments as the page hears them, kept from one frame to the next: a Reckoning's last three seconds
// ticking and its landing's boom and flash from its light; the warded Boss's slam; a ward's own ringing as it rises;
// the drowned floor's harm on the player; and a relic's refusal once as it falls past three tenths. The room tells
// each; this only remembers what it already played.
import { EVENT } from '../combat/cues.ts';
import { type EncounterSeen, SEAL_KIND } from '../network/encounterMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { EncounterLayout } from './dungeonLayout.ts';
import { FLASH_S } from './encounterLaw.ts';

type Point = readonly [number, number, number];

/** The room's ticks a second. */
const TICKS_PER_SECOND = 60;
/** The Reckoning's seconds that tick as it comes, and the share of its strength a relic is refused under. */
const TICKED_S = 3;
const RELIC_WARNED = 0.3;
/** The recordings each moment plays where it happens. */
export const ENCOUNTER_SOUNDS = {
  reckoning: 'amb.thunder.crack',
  slam: 'story.thud',
  ward: 'anima.divine',
  drowned: 'hit.blunt',
} as const;

/** What a frame of the encounters plays: the world's sounds where they happen, the interface's tick and refusal, and
 *  a landed Reckoning's flash (its anchor and the share of it left). */
export interface EncounterHeard {
  readonly sounds: { readonly cue: string; readonly at: Point }[];
  readonly ui: ('tab' | 'refused')[];
  readonly flash: { readonly at: number; readonly share: number } | null;
}

export class EncounterCues {
  private ticked = 0;
  private relics = new Map<number, number>();
  private landed: { readonly at: number; readonly seconds: number } | null = null;
  private shownAt = 0;

  /** This frame's sounds and flash, at `seconds` of the page's clock, for `player` standing at `feet`. */
  frame(
    plan: EncounterLayout,
    seen: EncounterSeen,
    events: readonly FightEvent[],
    {
      player,
      feet,
      where,
      seconds,
    }: {
      player: number;
      feet: Point;
      where: (id: number) => Point | null;
      seconds: number;
    },
  ): EncounterHeard {
    const sounds: { cue: string; at: Point }[] = [];
    const ui: ('tab' | 'refused')[] = [];
    const boss = seen.boss ? where(seen.boss) : null;
    // A Reckoning shown: each of its last seconds ticks once, and as it lands it booms at its light and flashes.
    if (seen.reckoningTicks > 0) this.shownAt = seen.reckoningAt;
    const left = Math.ceil(seen.reckoningTicks / TICKS_PER_SECOND);
    if (seen.reckoningTicks > 0 && left <= TICKED_S && left !== this.ticked) ui.push('tab');
    this.ticked = seen.reckoningTicks > 0 ? left : 0;
    for (const event of events) {
      if (event.kind === EVENT.reckoningLanded) {
        this.landed = { at: this.shownAt, seconds };
        const light = plan.anchors[this.shownAt];
        if (light) sounds.push({ cue: ENCOUNTER_SOUNDS.reckoning, at: light });
      }
      if (event.kind === EVENT.bossSlammed && boss) sounds.push({ cue: ENCOUNTER_SOUNDS.slam, at: boss });
      if (event.kind === EVENT.wardRaised && boss) sounds.push({ cue: ENCOUNTER_SOUNDS.ward, at: boss });
      if (event.kind === EVENT.drowned && event.defender === player)
        sounds.push({ cue: ENCOUNTER_SOUNDS.drowned, at: feet });
    }
    // A relic falling below three tenths, as the banner reddens, is refused once, and again only once it has stood at
    // them or over.
    seen.seals.forEach((seal, index) => {
      if (seal.kind !== SEAL_KIND.holdfast) return;
      const before = this.relics.get(index) ?? 1;
      if (before >= RELIC_WARNED && seal.relic < RELIC_WARNED) ui.push('refused');
      this.relics.set(index, seal.relic);
    });
    const since = this.landed ? seconds - this.landed.seconds : Infinity;
    const flash = this.landed && since < FLASH_S ? { at: this.landed.at, share: 1 - since / FLASH_S } : null;
    return { sounds, ui, flash };
  }
}

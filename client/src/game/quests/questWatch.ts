// What is news on the houses' roads, as the room's word on a player's gear changes: the scenes a step says (a quest
// begun, a task done and the next begun) and the toasts for what a road gives (an Art, a Tenet, a fragment to choose).
// The first word a page hears is where it stands, said nothing, so a page that loads mid-road says nothing it has said
// before; so is a word that goes back, as a room's starting character does until the player's own is claimed.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { OPENING, QUESTS, type Walked, linesBetween } from './questBook.ts';

/** What the page keeps of a character to tell what is new: where they walk, their pledge, what each Art's road has
 *  earned and each Art's fragment choices waiting, in the Arts' order. */
export interface Kept extends Walked {
  readonly pledge: number;
  readonly earned: readonly number[];
  readonly choices: readonly number[];
}

/** What a gear message holds of the roads; none from a room that sends none. */
export function keptOf(gear: GearState | null): Kept | null {
  const quest = gear?.quest;
  if (!gear || !quest) return null;
  const { done, choices } = quest;
  return {
    quest: quest.quest,
    task: quest.task,
    done,
    pledge: gear.standing?.pledge ?? 0,
    earned: gear.arts?.earned ?? [],
    choices,
  };
}

/** Whether `after` stands behind `before`, as no character goes: unpledged, a quest undone, a gift taken back, or a
 *  task of the same quest gone back. */
export function behind(before: Kept, after: Kept): boolean {
  const lost = (was: readonly number[], now: readonly number[]) =>
    was.some((bits, index) => (bits & ~(now[index] ?? 0)) !== 0);
  return (
    (before.pledge > 0 && after.pledge === 0) ||
    lost(before.done, after.done) ||
    lost(before.earned, after.earned) ||
    (before.quest === after.quest && after.task < before.task)
  );
}

/** The toasts for what a road gave between `before` and `after`: each Art, Tenet and fragment choice. */
export function giftsBetween(before: Kept, after: Kept): string[] {
  return arts.arts.flatMap((art, place) => {
    const given = (after.earned[place] ?? 0) & ~(before.earned[place] ?? 0);
    const tenets = art.tenets.filter((_tenet, index) => (given & (2 << index)) !== 0);
    const choosing = (after.choices[place] ?? 0) > (before.choices[place] ?? 0);
    return [
      ...((given & 1) !== 0 ? [`${art.name} Art earned: ${art.anima.name}`] : []),
      ...tenets.map((tenet) => `Tenet earned: ${tenet.name}`),
      ...(choosing ? [`A ${art.name} fragment to choose`] : []),
    ];
  });
}

/** How long after the first word on a character its changes are where it stands, not news: a room holds a starting
 *  character until the player's own is claimed, a claim waiting on another room for some seconds (acquiredFeed.ts). */
export const SETTLE_MS = 10_000;

/** What a look finds new. */
export interface News {
  readonly scenes: readonly string[];
  readonly toasts: readonly string[];
}

const NOTHING: News = { scenes: [], toasts: [] };

export class QuestWatch {
  private kept: Kept | null = null;
  private since = 0;
  private wasPast: boolean | null = null;

  /** What is new in `gear` at `now` (milliseconds), `past` whether the story and the welcome are past: no scene while
   *  they are not. As they pass in this page, a character on the opening's first task hears it begin. */
  look(gear: GearState | null, past: boolean, now: number): News {
    const passed = this.wasPast === false && past;
    this.wasPast = past;
    const [before, after] = [this.kept, keptOf(gear)];
    let news = NOTHING;
    if (after && (!before || now - this.since < SETTLE_MS)) {
      if (!before) this.since = now;
      this.kept = after;
    } else if (after && before && !behind(before, after)) {
      this.kept = after;
      news = { scenes: past ? linesBetween(before, after) : [], toasts: giftsBetween(before, after) };
    }
    const opening = QUESTS[OPENING - 1];
    const begun = passed && opening && this.kept?.quest === OPENING && this.kept.task === 0;
    return begun ? { ...news, scenes: [opening.begin, ...news.scenes] } : news;
  }
}

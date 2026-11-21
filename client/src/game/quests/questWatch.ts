// What is news on the houses' roads, as the room's word on a player's gear changes: the scenes a step says (a quest
// begun, a task done and the next begun) and the toasts for what a road gives (an Art, a Tenet, a fragment to choose).
// The first word a page hears is where it stands, said nothing, so a page that loads mid-road says nothing it has said
// before; so is a word that goes back, as a room's starting character does until the player's own is claimed. A
// quest's begin is said once for an account in a browser, which keeps it said, as the welcome keeps its scenes. What
// is found while the story or the welcome holds the screen waits for it to pass.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { QUESTS, type Walked, beginOf, linesBetween } from './questBook.ts';

/** What the page keeps of a character to tell what is new: where they walk and the task's counts, their pledge, what
 *  each Art's road has earned and each Art's fragment choices waiting, in the Arts' order. */
export interface Kept extends Walked {
  readonly counts: readonly number[];
  readonly pledge: number;
  readonly earned: readonly number[];
  readonly choices: readonly number[];
}

/** What a gear message holds of the roads; none from a room that sends none. */
export function keptOf(gear: GearState | null): Kept | null {
  const quest = gear?.quest;
  if (!gear || !quest) return null;
  const { done, choices, counts } = quest;
  return {
    quest: quest.quest,
    task: quest.task,
    counts,
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

/** Where the browser keeps, for an account (`<key>.<account>`), the quests whose begin it has said, by id. */
export const BEGUN_KEY = 'overlook.roads.begun';

/** What a look finds new. */
export interface News {
  readonly scenes: readonly string[];
  readonly toasts: readonly string[];
}

/** What the browser keeps of the roads. */
type Keeping = Pick<Storage, 'getItem' | 'setItem'>;

export class QuestWatch {
  private kept: Kept | null = null;
  private since = 0;
  /** Whether the first word past the settling has been heard. */
  private settled = false;
  /** The scenes found and not yet said, each with the quest whose begin it is (0 for none). */
  private held: { readonly scene: string; readonly begins: number }[] = [];
  /** The begins said in this page, by account and quest id, for a browser that keeps nothing. */
  private readonly said = new Set<string>();
  private readonly keeping: Keeping | null;
  private readonly account: () => string | null;

  /** A watch keeping its begins said in `keeping` for the account `account` names; none keeps them in the page. */
  constructor(keeping: Keeping | null = null, account: () => string | null = () => null) {
    [this.keeping, this.account] = [keeping, account];
  }

  /** What is new in `gear` at `now` (milliseconds), `past` whether the story and the welcome are past: no scene while
   *  they are not, the scenes found held until they are. */
  look(gear: GearState | null, past: boolean, now: number): News {
    const [before, after] = [this.kept, keptOf(gear)];
    let toasts: string[] = [];
    if (after && (!before || now - this.since < SETTLE_MS)) {
      if (!before) this.since = now;
      this.kept = after;
    } else if (after && before && !behind(before, after)) {
      this.kept = after;
      toasts = giftsBetween(before, after);
      this.hold(linesBetween(before, after), 0);
      // A quest walked anew begins at its first task; on the first settled word, only with nothing counted yet.
      const anew = before.quest !== after.quest;
      const untouched = after.counts.every((count) => count === 0);
      if (after.task === 0 && (anew || (!this.settled && untouched))) this.begin(after.quest);
      this.settled = true;
    }
    return { scenes: past ? this.release() : [], toasts };
  }

  private hold(scenes: readonly string[], begins: number): void {
    this.held.push(...scenes.map((scene) => ({ scene, begins })));
  }

  /** Holds the quest's begin, unless the browser has said it for this account or holds it already. */
  private begin(place: number): void {
    const quest = QUESTS[place - 1];
    if (!quest || this.begun(quest.id) || this.held.some((each) => each.begins === place)) return;
    this.hold(beginOf(quest), place);
  }

  /** The scenes held, now to be said: a begin only of the quest walked now, so one left meanwhile (the opening left by
   *  a pledge during the welcome) is never said; each begin said is kept. */
  private release(): string[] {
    const walked = this.kept?.quest ?? 0;
    const said = this.held.filter((each) => each.begins === 0 || each.begins === walked);
    this.held = [];
    const begun = QUESTS[walked - 1];
    if (begun && said.some((each) => each.begins === walked)) this.keepBegun(begun.id);
    return said.map((each) => each.scene);
  }

  /** The browser's key for the account's begins said. */
  private get key(): string {
    return `${BEGUN_KEY}.${this.account() ?? 'none'}`;
  }

  private begun(id: string): boolean {
    if (this.said.has(`${this.key} ${id}`)) return true;
    try {
      return (this.keeping?.getItem(this.key) ?? '').split(',').includes(id);
    } catch {
      return false;
    }
  }

  private keepBegun(id: string): void {
    this.said.add(`${this.key} ${id}`);
    try {
      const kept = (this.keeping?.getItem(this.key) ?? '').split(',').filter(Boolean);
      this.keeping?.setItem(this.key, [...kept, id].join(','));
    } catch {
      // A browser that keeps nothing may say a road's begin again in another page.
    }
  }
}

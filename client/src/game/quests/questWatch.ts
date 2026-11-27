// When the houses' roads speak, as the room's word on a player's character changes (questNews.ts says what is new):
// the first word a page hears on the player's own character is where it stands, said nothing, so a page that loads
// mid-road says nothing it has said before; a word that goes back is never news. A quest's begin is said once for an
// account in a browser, which keeps it said, as the welcome keeps its scenes; a step's greeting once a task. What a
// step says while the story or the welcome holds the screen waits for it to pass, but a moment's line (a failure, an
// ambush) is said only as it happens or not at all.
import type { GearState } from '../../network/gearMessages.ts';
import { QUESTS, beginOf, linesBetween } from './questBook.ts';
import type { Notice } from '../obtained.ts';
import {
  type Kept,
  behind,
  houseGiftGiven,
  houseGiftScene,
  giftsBetween,
  greetBetween,
  keptOf,
  metBetween,
  momentsBetween,
  stepsBetween,
} from './questNews.ts';

/** Where the browser keeps, for an account (`<key>.<account>`), the quests whose begin it has said, by id. */
export const BEGUN_KEY = 'noshores.roads.begun';

/** What a look finds new: the scenes to say in order, the moment's lines (said only if none like them waits), and the
 *  notices of what the player obtained. */
export interface News {
  readonly scenes: readonly string[];
  readonly moments: readonly string[];
  readonly notices: readonly Notice[];
}

/** What the browser keeps of the roads. */
type Keeping = Pick<Storage, 'getItem' | 'setItem'>;

export class QuestWatch {
  private kept: Kept | null = null;
  /** The scenes found and not yet said, each with the quest whose begin it is (0 for none). */
  private held: { readonly scene: string; readonly begins: number }[] = [];
  /** The tasks whose figure has greeted the player in this page, by quest and task. */
  private readonly greeted = new Set<string>();
  /** The begins said in this page, by account and quest id, for a browser that keeps nothing. */
  private readonly said = new Set<string>();
  private readonly keeping: Keeping | null;
  private readonly account: () => string | null;

  /** A watch keeping its begins said in `keeping` for the account `account` names; none keeps them in the page. */
  constructor(keeping: Keeping | null = null, account: () => string | null = () => null) {
    [this.keeping, this.account] = [keeping, account];
  }

  /** What is new in `gear`, `past` whether the story and the welcome are past: no scene while they are not, the
   *  scenes found held until they are, the moment's lines dropped. */
  look(gear: GearState | null, past: boolean): News {
    const [before, after] = [this.kept, keptOf(gear)];
    let [notices, moments]: [Notice[], string[]] = [[], []];
    if (after && !before) {
      // The first word: where the player stands. One from before the roads, on a first task with nothing counted,
      // hears its road begin if this browser has not said it for the account.
      this.kept = after;
      if (after.task === 0 && after.counts.every((count) => count === 0)) this.begin(after.quest);
    } else if (after && before && !behind(before, after)) {
      this.kept = after;
      notices = [...stepsBetween(before, after), ...giftsBetween(before, after)];
      moments = past ? momentsBetween(before, after) : [];
      this.hold([...this.greet(before, after), ...metBetween(before, after), ...linesBetween(before, after)], 0);
      const begins = after.task === 0 && before.quest !== after.quest && this.begin(after.quest);
      // The house's own piece: its leader's line, unless the road's begin, which tells of it, is said instead.
      const house = houseGiftGiven(before, after);
      const line = house && !begins ? houseGiftScene(house) : undefined;
      if (line) this.hold([line], 0);
    }
    return { scenes: past ? this.release() : [], moments, notices };
  }

  /** The step's greeting, the first time its figure walks in this task. */
  private greet(before: Kept, after: Kept): string[] {
    const greeting = greetBetween(before, after);
    const task = `${after.quest} ${after.task}`;
    if (greeting === undefined || this.greeted.has(task)) return [];
    this.greeted.add(task);
    return [greeting];
  }

  private hold(scenes: readonly string[], begins: number): void {
    this.held.push(...scenes.map((scene) => ({ scene, begins })));
  }

  /** Holds the quest's begin, unless the browser has said it for this account or holds it already; whether it did. */
  private begin(place: number): boolean {
    const quest = QUESTS[place - 1];
    if (!quest || this.begun(quest.id) || this.held.some((each) => each.begins === place)) return false;
    this.hold(beginOf(quest), place);
    return true;
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

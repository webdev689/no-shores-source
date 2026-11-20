// The activities' screens, wired by the game: This Week for the menu's Journal. It keeps the last word of the
// character any room sent, so the screens read the same at sea as ashore, and builds their words from the rules
// (`activityWords.ts`), never judging a rule itself.
import './activityScreens.css';
import { activitiesAt, gatesAt } from './activities.ts';
import { type Named, type ThisWeek, thisWeekOf } from './activityWords.ts';
import { askDungeon } from './dungeonLayout.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { NodeInfo } from './worldData.ts';

/** What the screens read of the player on foot: the room's word on their gear. */
export interface ScreensFoot {
  readonly gear: { readonly gear: GearState | null } | null;
}

/** The screens' clock, and how they look again: every quarter second on the page. */
export interface ScreensClock {
  readonly now: () => number;
  readonly every: (run: () => void) => void;
}

export interface ActivityScreens {
  /** This Week as the Journal shows it, built again only when the minute or the gear changes; null before the room
   *  module is read. */
  week(): ThisWeek | null;
}

/** How often the screens look again, in milliseconds. */
const LOOK_MS = 250;
const PAGE_CLOCK: ScreensClock = { now: () => Date.now(), every: (run) => void setInterval(run, LOOK_MS) };

export function startActivityScreens(
  root: HTMLElement,
  module: Promise<WebAssembly.Module>,
  nodes: readonly NodeInfo[],
  foot: () => ScreensFoot | null,
  clock: ScreensClock = PAGE_CLOCK,
): ActivityScreens {
  let compiled: WebAssembly.Module | null = null;
  void module.then((read) => (compiled = read)).catch(() => undefined);
  /** The last word of the character a room sent: kept through a voyage, where no room keeps gear. */
  let kept: GearState | null = null;
  let built: { readonly minute: number; readonly gear: GearState | null; readonly board: ThisWeek } | null = null;
  const placeName = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;
  const look = () => {
    kept = foot()?.gear?.gear ?? kept;
  };
  clock.every(look);
  return {
    week: () => {
      const laying = compiled;
      if (!laying) return null;
      const minute = Math.floor(clock.now() / 60_000);
      if (built?.minute === minute && built.gear === kept) return built.board;
      const named: Named = {
        dungeon: (patrol, number) => askDungeon(laying, patrol, placeName(patrol), number).name,
        place: placeName,
      };
      // A save with no story counts as past the prologue, as the rules read it.
      const gates = kept ? gatesAt(laying, kept.level, kept.prologueDone ?? true) : null;
      const board = thisWeekOf(activitiesAt(laying, minute), gates, kept?.activity ?? null, named);
      built = { minute, gear: kept, board };
      return board;
    },
  };
}

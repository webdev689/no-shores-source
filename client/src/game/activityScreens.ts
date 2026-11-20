// The activities' screens, wired by the game: This Week for the menu's Journal, and the card E opens at a dungeon's
// entrance. It keeps the last word of the character any room sent, so the screens read the same at sea as ashore,
// and builds their words from the rules (`activityWords.ts`), never judging a rule itself.
import './activityScreens.css';
import { activitiesAt, gatesAt } from './activities.ts';
import { type AtEntrance, type Named, type ThisWeek, entranceCardOf, thisWeekOf } from './activityWords.ts';
import { askDungeon } from './dungeonLayout.ts';
import { EntranceCardView } from './entranceCard.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { NodeInfo } from './worldData.ts';

/** What the screens read of the player on foot: the place and seas they stand in, the dungeon they are in, whether
 *  they have fallen, and the room's word on their gear. */
export interface ScreensFoot {
  readonly node: NodeInfo;
  readonly seas: Difficulty;
  readonly dungeon: object | null;
  readonly fallen: boolean;
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
  /** E at entrance `number`, its dungeon named `name`: its card, or straight in while the room module is unread. */
  card(number: number, name: string): void;
  /** Why each tier's seas are shut to the player by their level, by tier (null where open); none before a room's
   *  word. */
  seasShut(): readonly (string | null)[];
}

/** How often the screens look again, in milliseconds. */
const LOOK_MS = 250;
const PAGE_CLOCK: ScreensClock = { now: () => Date.now(), every: (run) => void setInterval(run, LOOK_MS) };

export function startActivityScreens(
  root: HTMLElement,
  module: Promise<WebAssembly.Module>,
  nodes: readonly NodeInfo[],
  foot: () => ScreensFoot | null,
  trips: { enter(number: number, name: string): void },
  clock: ScreensClock = PAGE_CLOCK,
): ActivityScreens {
  let compiled: WebAssembly.Module | null = null;
  void module.then((read) => (compiled = read)).catch(() => undefined);
  /** The last word of the character a room sent: kept through a voyage, where no room keeps gear. */
  let kept: GearState | null = null;
  let built: { readonly minute: number; readonly gear: GearState | null; readonly board: ThisWeek } | null = null;
  const placeName = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;
  /** The card standing, where it was opened and the minute and gear it was last built for. */
  let opened: { readonly entrance: AtEntrance; minute: number; gear: GearState | null } | null = null;
  const close = () => {
    opened = null;
    view.hide();
  };
  const view = new EntranceCardView(root, {
    enter: () => {
      const entrance = opened?.entrance;
      close();
      if (entrance) trips.enter(entrance.number, entrance.name);
    },
    close,
  });
  /** Builds the card again for where it was opened. */
  const showCard = (laying: WebAssembly.Module) => {
    if (!opened) return;
    const minute = Math.floor(clock.now() / 60_000);
    const gates = kept ? gatesAt(laying, kept.level, kept.prologueDone ?? true) : null;
    [opened.minute, opened.gear] = [minute, kept];
    view.show(entranceCardOf(opened.entrance, activitiesAt(laying, minute), gates, kept?.activity ?? null));
  };
  const look = () => {
    const here = foot();
    kept = here?.gear?.gear ?? kept;
    if (!opened || !compiled) return;
    if (!here || here.fallen || here.dungeon || here.node !== opened.entrance.node) return close();
    if (opened.minute !== Math.floor(clock.now() / 60_000) || opened.gear !== kept) showCard(compiled);
    // A menu opened and shut over the card gives the keys back to the game; the card takes them again.
    setGearScreenOpen(true);
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
    seasShut: () => (compiled && kept ? gatesAt(compiled, kept.level, kept.prologueDone ?? true).seas : []),
    card: (number, name) => {
      const here = foot();
      if (!here || here.dungeon || here.fallen) return;
      if (!compiled) return trips.enter(number, name);
      kept = here.gear?.gear ?? kept;
      opened = { entrance: { node: here.node, seas: here.seas, number, name }, minute: -1, gear: null };
      showCard(compiled);
    },
  };
}

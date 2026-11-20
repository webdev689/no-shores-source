// The activities' screens, wired by the game: This Week for the menu's Journal, and the card E opens at a dungeon's
// entrance. It keeps the last word of the character any room sent, so the screens read the same at sea as ashore,
// and builds their words from the rules (`activityWords.ts`), never judging a rule itself.
import './activityScreens.css';
import { activitiesAt, gatesAt } from './activities.ts';
import {
  type AtEntrance,
  type EntranceCard,
  type Named,
  type ThisWeek,
  entranceCardOf,
  thisWeekOf,
} from './activityWords.ts';
import { type FinderSocket, type Finding, findCompany, findingWords } from './companyFinder.ts';
import { weekBountiesOf } from './bountyBoard.ts';
import { askDungeon } from './dungeonLayout.ts';
import { type TripFoot, type TripGame, dungeonTrips } from './dungeonTrips.ts';
import { EntranceCardView } from './entranceCard.ts';
import { type Trips, takeWipe } from './footTrips.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { companyPlaces, sharedRun } from './rooms.ts';
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

/** The screens' clock, how they look again (every quarter second on the page), and how a socket to Find a Company
 *  opens (a WebSocket on the page). */
export interface ScreensClock {
  readonly now: () => number;
  readonly every: (run: () => void) => void;
  readonly open?: (address: string) => FinderSocket;
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
/** What the card says of a run found for a base it no longer opens, the week having turned. */
const WEEK_TURNED = 'The week turned. Try again.';
const PAGE_CLOCK: ScreensClock = { now: () => Date.now(), every: (run) => void setInterval(run, LOOK_MS) };

export function startActivityScreens(
  root: HTMLElement,
  module: Promise<WebAssembly.Module>,
  nodes: readonly NodeInfo[],
  foot: () => ScreensFoot | null,
  trips: { enter(number: number, name: string, run?: string): void },
  link: Pick<AccountLink, 'token' | 'finderAt'> | null,
  clock: ScreensClock = PAGE_CLOCK,
): ActivityScreens {
  let compiled: WebAssembly.Module | null = null;
  void module.then((read) => (compiled = read)).catch(() => undefined);
  /** The last word of the character a room sent: kept through a voyage, where no room keeps gear. */
  let kept: GearState | null = null;
  let built: { readonly minute: number; readonly gear: GearState | null; readonly board: ThisWeek } | null = null;
  const placeName = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;
  /** The card standing: where it was opened, what it says, and the minute and gear it was built for. */
  let opened: {
    readonly entrance: AtEntrance;
    readonly card: EntranceCard;
    readonly minute: number;
    readonly gear: GearState | null;
  } | null = null;
  /** The search under way from the card, and the words of the last one that ended unasked. */
  let search: Finding | null = null;
  let said: string | null = null;
  const stopSearch = () => {
    search?.stop();
    search = null;
  };
  const close = () => {
    stopSearch();
    [opened, said] = [null, null];
    view.hide();
  };
  /** Shows the card as it stands, with Find a Company's state. */
  const render = () => {
    if (!opened) return;
    const canFind = opened.card.finds !== null && Boolean(link?.token);
    const finding = search ? findingWords(search.since, clock.now()) : null;
    view.show(opened.card, { canFind, finding, said });
  };
  const find = () => {
    const [finds, token] = [opened?.card.finds ?? null, link?.token ?? null];
    if (!opened || !link || finds === null || token === null || search) return;
    const { number, name } = opened.entrance;
    said = null;
    const heard = {
      found: (run: string) => {
        search = null;
        // Matched as the week turned, the run may be one the card no longer opens: it says so, as it stands now.
        if (compiled && opened) showCard(compiled, opened.entrance);
        const finds = opened?.card.finds ?? null;
        if (finds === null || sharedRun(finds, [run]) === null) {
          said = WEEK_TURNED;
          return render();
        }
        close();
        trips.enter(number, name, run);
      },
      ended: (why: string) => {
        [search, said] = [null, why];
        render();
      },
    };
    search = findCompany(link.finderAt(finds), finds, token, heard, clock.now, clock.open);
    render();
  };
  const view = new EntranceCardView(root, {
    enter: () => {
      const entrance = opened?.entrance;
      close();
      if (entrance) trips.enter(entrance.number, entrance.name);
    },
    close,
    find,
    stop: () => {
      stopSearch();
      render();
    },
  });
  /** Builds the card again for where it was opened. */
  const showCard = (laying: WebAssembly.Module, entrance: AtEntrance) => {
    const minute = Math.floor(clock.now() / 60_000);
    const gates = kept ? gatesAt(laying, kept.level, kept.prologueDone ?? true) : null;
    const card = entranceCardOf(entrance, activitiesAt(laying, minute), gates, kept?.activity ?? null);
    opened = { entrance, card, minute, gear: kept };
    // A search for a run the card no longer opens ends: the week turned, or a gate shut.
    if (search && search.base !== card.finds) stopSearch();
    render();
  };
  const look = () => {
    const here = foot();
    kept = here?.gear?.gear ?? kept;
    if (!opened || !compiled) return;
    if (!here || here.fallen || here.dungeon || here.node !== opened.entrance.node) return close();
    if (opened.minute !== Math.floor(clock.now() / 60_000) || opened.gear !== kept) showCard(compiled, opened.entrance);
    else if (search) render();
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
      const drawn = activitiesAt(laying, minute);
      const board = thisWeekOf(drawn, gates, kept?.activity ?? null, named, weekBountiesOf(kept, drawn.day));
      built = { minute, gear: kept, board };
      return board;
    },
    seasShut: () => (compiled && kept ? gatesAt(compiled, kept.level, kept.prologueDone ?? true).seas : []),
    card: (number, name) => {
      const here = foot();
      if (!here || here.dungeon || here.fallen) return;
      if (!compiled) return trips.enter(number, name);
      kept = here.gear?.gear ?? kept;
      showCard(compiled, { node: here.node, seas: here.seas, number, name });
    },
  };
}

/** The activities as the game wires them: the ways into the dungeons and out, asking the account where the company
 *  plays (`dungeonTrips`); their screens; the trips the player on foot takes, where E at an entrance opens its card;
 *  and what a frame on foot heeds first: a room whose gate shuts sends the player back to their ship (`shut`), and
 *  nothing more of it is drawn (true), and a company fallen goes out by the way in. */
export function startActivities(
  root: HTMLElement,
  nodes: readonly NodeInfo[],
  link: AccountLink | null,
  game: Omit<TripGame, 'foot' | 'companyPlaces'> & { readonly foot: () => (TripFoot & ScreensFoot) | null },
): {
  readonly trips: ReturnType<typeof dungeonTrips>;
  readonly screens: ActivityScreens;
  readonly onFoot: Trips;
  heed(here: { readonly shut: string | null; readonly held: { wiped: boolean } }, shut: (why: string) => void): boolean;
} {
  const trips = dungeonTrips({ ...game, companyPlaces: () => companyPlaces(link) });
  const screens = startActivityScreens(root, game.module, nodes, game.foot, trips, link);
  return {
    trips,
    screens,
    onFoot: { ...trips, enter: (number, name) => screens.card(number, name) },
    heed: (here, shut) => {
      if (here.shut) return (shut(here.shut), true);
      if (takeWipe(here.held)) trips.fell();
      return false;
    },
  };
}

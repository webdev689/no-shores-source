// The activities' screens, wired by the game: what the menu's Journal reads for its timers, quests and bounties, the
// card E opens at a dungeon's entrance and the Playlist a port's island's tile opens, drawn as a layer of the interface. It
// keeps the last word of the character any room sent, so the screens read the same at sea as ashore, and builds their
// words from the rules (`activityWords.ts`), never judging a rule itself.
import type { Layer } from '../ui/stack.ts';
import { enterAskedRun } from './runAsked.ts';
import { enterTestRun } from './characters/testLaunch.ts';
import { leaveToCharacters } from './settingsPage.ts';
import { roomNow } from '../sky/worldClock.ts';
import { type Activities, activitiesAt, type Gates, gatesAt } from './activities.ts';
import {
  type AtEntrance,
  type EntranceCard,
  type Named,
  type ThisWeek,
  entranceCardOf,
  thisWeekOf,
} from './activityWords.ts';
import { type FinderSocket, type Finding, findCompany, findingWords } from './companyFinder.ts';
import { askDungeon } from './dungeonLayout.ts';
import { countBy } from './npc/npcClock.ts';
import { type TripFoot, type TripGame, dungeonTrips } from './dungeonTrips.ts';
import { breachTrips } from './breachTrips.ts';
import { EntranceCardView } from './entranceCard.ts';
import { type Trips, takeWipe } from './footTrips.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { startPlaylists } from './playlistScreens.ts';
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
  /** The day and the week as the Journal's timers show them, built again only when the minute or the gear changes;
   *  null before the room module is read. */
  week(): ThisWeek | null;
  /** The last word of the character a room sent, kept at sea: the Journal's quests and bounties read it. */
  kept(): GearState | null;
  /** E at entrance `number`, its dungeon named `name`: its card, or straight in while the room module is unread. */
  card(number: number, name: string): void;
  /** Why each tier's seas are shut to the player by their level, by tier (null where open); none before a room's
   *  word. */
  seasShut(): readonly (string | null)[];
  /** Opens the Playlist beside port city `city` (its id, as `overlook`), from the island's panel docked there. */
  playlist(city: string): boolean;
  /** Opens the card of Elite Dungeon `node` at Normal from the sea (the island's panel): Enter and Find a Company go in
   *  from the sea, as the Playlist's runs do, and out back to it. */
  seaCard(node: NodeInfo): void;
  /** The day's and week's draws and the character's gates now, for the island's panel; null before the room module. */
  facts(): { readonly activities: Activities; readonly gates: Gates | null } | null;
  /** The entrance's card or the Playlist as the interface draws it, while one stands. */
  readonly layer: Layer;
}

/** How often the screens look again, in milliseconds. */
const LOOK_MS = 250;
/** What the card says of a run found for a base it no longer opens, the week having turned. */
const WEEK_TURNED = 'The week turned. Try again.';
const PAGE_CLOCK: ScreensClock = { now: roomNow, every: (run) => void setInterval(run, LOOK_MS) };

export function startActivityScreens(
  module: Promise<WebAssembly.Module>,
  nodes: readonly NodeInfo[],
  foot: () => ScreensFoot | null,
  trips: {
    enter(number: number, name: string, run?: string): void;
    intoRun?(node: NodeInfo, run: string): void;
    fromSea?(node: NodeInfo): void;
    toBreach?(run: string): void;
  },
  link: (Pick<AccountLink, 'token' | 'finderAt'> & Partial<Pick<AccountLink, 'roster'>>) | null,
  clock: ScreensClock = PAGE_CLOCK,
  atSea: () => GearState | null = () => null,
  onSea: () => boolean = () => true,
): ActivityScreens {
  let compiled: WebAssembly.Module | null = null;
  void module.then((read) => (compiled = read)).catch(() => undefined);
  /** The last word of the character a room sent: on foot the room's, at sea the sea's as it counts the ships sunk, kept
   *  between them. */
  let kept: GearState | null = null;
  let built: { readonly minute: number; readonly gear: GearState | null; readonly board: ThisWeek } | null = null;
  /** The draws and gates last read for the island's panel, again only when the minute or the gear changes. */
  let drawnNow: {
    readonly minute: number;
    readonly gear: GearState | null;
    readonly facts: { readonly activities: Activities; readonly gates: Gates | null };
  } | null = null;
  const placeName = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;
  /** The card standing: where it was opened (`atSea`: from the island's panel, its run started at sea), what it says,
   *  and the minute and gear it was built for. */
  let opened: {
    readonly entrance: AtEntrance;
    readonly atSea: boolean;
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
    const { number, name, node } = opened.entrance;
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
        const atSea = opened?.atSea ?? false;
        close();
        if (atSea) trips.intoRun?.(node, run);
        else trips.enter(number, name, run);
      },
      ended: (why: string) => {
        [search, said] = [null, why];
        render();
      },
    };
    search = findCompany(link.finderAt(finds), finds, token, heard, clock.now, clock.open);
    render();
  };
  const view = new EntranceCardView({
    enter: () => {
      const [entrance, atSea] = [opened?.entrance, opened?.atSea ?? false];
      close();
      if (entrance && atSea) trips.fromSea?.(entrance.node);
      else if (entrance) trips.enter(entrance.number, entrance.name);
    },
    close,
    find,
    stop: () => {
      stopSearch();
      render();
    },
  });
  /** Builds the card again for where it was opened. */
  const showCard = (laying: WebAssembly.Module, entrance: AtEntrance, atSea = opened?.atSea ?? false) => {
    const minute = Math.floor(clock.now() / 60_000);
    const gates = kept ? gatesAt(laying, kept.level, kept.prologueDone ?? true) : null;
    const card = entranceCardOf(entrance, activitiesAt(laying, minute), gates, kept?.activity ?? null);
    // From the sea, its company is found for the run started at sea (`node-<id>--sea`).
    const finds = atSea && card.finds !== null ? `${card.finds}--sea` : card.finds;
    opened = { entrance, atSea, card: { ...card, finds }, minute, gear: kept };
    // A search for a run the card no longer opens ends: the week turned, or a gate shut.
    if (search && search.base !== finds) stopSearch();
    render();
  };
  const playlists = startPlaylists({
    module: () => compiled,
    nodes,
    kept: () => kept,
    intoRun: (node, run) => trips.intoRun?.(node, run),
    toBreach: (run) => trips.toBreach?.(run),
    link,
    atSea: onSea,
    now: clock.now,
    ...(clock.open && { open: clock.open }),
  });
  const look = () => {
    const here = foot();
    kept = here?.gear?.gear ?? atSea() ?? kept;
    playlists.look();
    if (!opened || !compiled) return;
    if (opened.atSea ? !onSea() : !here || here.fallen || here.dungeon || here.node !== opened.entrance.node)
      return close();
    if (opened.minute !== Math.floor(clock.now() / 60_000) || opened.gear !== kept) showCard(compiled, opened.entrance);
    else if (search) render();
    // A menu opened and shut over the card gives the keys back to the game; the card takes them again.
    setGearScreenOpen(true);
  };
  clock.every(look);
  return {
    layer: (ui) => view.layer(ui) ?? playlists.layer(ui),
    playlist: (city) => playlists.open(city),
    seaCard: (node) => {
      if (node.kind !== 'dungeon') return;
      if (!compiled) return trips.fromSea?.(node);
      kept = atSea() ?? kept;
      showCard(compiled, { node, seas: 'normal', number: 0, name: node.name }, true);
    },
    facts: () => {
      if (!compiled) return null;
      const minute = Math.floor(clock.now() / 60_000);
      if (drawnNow?.minute === minute && drawnNow.gear === kept) return drawnNow.facts;
      const gates = kept ? gatesAt(compiled, kept.level, kept.prologueDone ?? true) : null;
      drawnNow = { minute, gear: kept, facts: { activities: activitiesAt(compiled, minute), gates } };
      return drawnNow.facts;
    },
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
      const board = {
        ...thisWeekOf(drawn, gates, kept?.activity ?? null, named, kept?.level ?? null),
        lamps: kept?.islandLamps,
      };
      built = { minute, gear: kept, board };
      return board;
    },
    kept: () => kept,
    seasShut: () => (compiled && kept ? gatesAt(compiled, kept.level, kept.prologueDone ?? true).seas : []),
    card: (number, name) => {
      const here = foot();
      if (!here || here.dungeon || here.fallen) return;
      if (!compiled) return trips.enter(number, name);
      kept = here.gear?.gear ?? kept;
      showCard(compiled, { node: here.node, seas: here.seas, number, name }, false);
    },
  };
}

/** The activities as the game wires them: the ways into the dungeons and out, asking the account where the company
 *  plays (`dungeonTrips`); their screens; the trips the player on foot takes, where E at an entrance opens its card;
 *  and what a frame on foot heeds first: a room whose gate shuts sends the player back to their ship (`shut`), and
 *  nothing more of it is drawn (true), and a company fallen goes out by the way in. */
export function startActivities(
  nodes: readonly NodeInfo[],
  link: AccountLink | null,
  game: Omit<TripGame, 'foot' | 'companyPlaces'> & {
    readonly foot: () => (TripFoot & ScreensFoot & { readonly launchedFor?: string | null }) | null;
    /** The sea's last word of the character while the player is at sea or over an island's side (null before one),
     *  undefined anywhere else: the Playlist closes once the player is not there. */
    readonly atSea?: () => GearState | null | undefined;
    /** Says why the player is not where they went, or a Breach's word to them. */
    readonly tell?: (words: string) => void;
  },
): {
  readonly trips: ReturnType<typeof dungeonTrips> & ReturnType<typeof breachTrips>;
  readonly screens: ActivityScreens;
  readonly onFoot: Trips;
  heed(
    here: { readonly shut: string | null; readonly held: { wiped: boolean } },
    shut: (why: string) => void,
    onFoot: boolean,
  ): boolean;
} {
  const dungeons = dungeonTrips({ ...game, companyPlaces: () => companyPlaces(link) });
  const breaches = breachTrips({ ...game, nodes });
  // A company member in a Breach's run is joined in its run; in any other, as a dungeon's.
  const join = (node: NodeInfo, place: string) => void (breaches.joinRun(place) || dungeons.join(node, place));
  const trips = { ...dungeons, ...breaches, join, toBreach: breaches.toGate };
  const atSea = game.atSea;
  const screens = startActivityScreens(
    game.module,
    nodes,
    game.foot,
    trips,
    link,
    PAGE_CLOCK,
    () => atSea?.() ?? null,
    () => atSea === undefined || atSea() !== undefined,
  );
  // The keepers' countdowns turn on the same clock, so they read the same rules.
  countBy(game.module);
  if (import.meta.env.DEV) {
    const inside = () => (game.foot() ? Boolean(game.foot()?.dungeon) : null);
    enterAskedRun(location.search, nodes, inside, trips.intoRun);
  }
  // A test room launched from the Test Room: the rooms the player stands in on foot, none at sea, null under way.
  const standing = () => {
    const foot = game.foot();
    if (foot) return [foot.dungeon?.room, foot.run?.run, foot.launchedFor];
    return atSea?.() === undefined ? null : [];
  };
  enterTestRun(sessionStorage, nodes, standing, trips, () => leaveToCharacters('test'));
  return {
    trips,
    screens,
    onFoot: { ...trips, enter: (number, name) => screens.card(number, name) },
    heed: (here, shut, onFoot) => {
      if (here.shut) return (shut(here.shut), true);
      if (takeWipe(here.held, onFoot)) trips.fell();
      return false;
    },
  };
}

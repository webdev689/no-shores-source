// The Playlist as the game wires it: its tile over a living port's island opens its screen, built from the rules
// (`playlistWords.ts`) and the last word of the character a room sent; Launch starts a fresh run, alone or for the
// company to join, and Find a Company searches the playlist's one queue, each run then gone into from the sea. The
// screen closes, its search stopped, once the player is no longer at sea or over an island's side.
import type { Layer } from '../ui/stack.ts';
import { activitiesAt, gatesAt } from './activities.ts';
import { type FinderSocket, type Finding, SEARCH_LOST, findCompany, findingWords } from './companyFinder.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearState } from '../network/gearMessages.ts';
import { LAUNCHING, PlaylistView } from './playlistScreen.ts';
import { type PlaylistEntry, type PlaylistScreenState, launchRoom, playlistScreenOf } from './playlistWords.ts';
import { nodeOfRoom, runInstance } from './rooms.ts';
import { breachPlanOf } from './breachPlan.ts';
import type { NodeInfo } from './worldData.ts';

/** What the Playlist needs: the room module once read, the places by id, the last word of the character, the way
 *  into a run, the account's link for Find a Company and the company's Roster (none offline), whether the player is
 *  still at sea (true unless said), its clock, and a draw of one of a count. */
export interface PlaylistDeps {
  readonly module: () => WebAssembly.Module | null;
  readonly nodes: readonly NodeInfo[];
  readonly kept: () => GearState | null;
  readonly intoRun: (node: NodeInfo, run: string) => void;
  /** Into a Breach's run launched or found: to its gate's patrol zone, standing at the gate in the run's company. */
  readonly toBreach?: (run: string) => void;
  readonly link: (Pick<AccountLink, 'token' | 'finderAt'> & Partial<Pick<AccountLink, 'roster'>>) | null;
  readonly atSea?: () => boolean;
  readonly now: () => number;
  readonly open?: (address: string) => FinderSocket;
  readonly pick?: (count: number) => number;
  readonly instance?: () => string;
}

export interface Playlists {
  /** Opens the screen beside port city `city` (its id, as `overlook`), from the island's panel docked there: true once
   *  it stands. */
  open(city: string): boolean;
  /** Looks again: the screen built anew as the second (its countdowns) or the character's word changes, and closed
   *  once the player has left the sea. */
  look(): void;
  readonly layer: Layer;
}

/** What the footer says when the accounts do not answer Launch's ask for a run, of a Breach played alone, and of one
 *  Launched online while signed out. */
export const LAUNCH_LOST = 'The accounts did not answer. Try again.';
export const BREACH_ONLINE = 'A Breach is played online.';
export const BREACH_SIGN_IN = 'Sign in to launch a Breach.';

export function startPlaylists(deps: PlaylistDeps): Playlists {
  const instance = deps.instance ?? (() => runInstance());
  const pick = deps.pick ?? ((count: number) => Math.floor(Math.random() * count));
  const placeName = (id: string) => deps.nodes.find((node) => node.id === id)?.name ?? id;
  /** The screen standing: the port it was opened beside, and the second and the word it was built for. */
  let opened: { port: string; second: number; gear: GearState | null; screen: PlaylistScreenState } | null = null;
  /** The search under way, and whether it is Launch's ask rather than Find a Company's. */
  let search: Finding | null = null;
  let launching = false;
  let said: string | null = null;
  /** Whether the player is in a company, as the Roster last said, and how many times the screen has opened, so an
   *  answer to an earlier opening is not taken for this one's. */
  let company = false;
  let opens = 0;
  const stopSearch = () => {
    search?.stop();
    search = null;
  };
  const close = () => {
    stopSearch();
    [opened, said, company] = [null, null, false];
    view.hide();
  };
  const render = () => {
    if (!opened) return;
    const finding = search ? (launching ? LAUNCHING : findingWords(search.since, deps.now())) : null;
    view.show(opened.screen, { canFind: Boolean(deps.link?.token), finding, said, launching, company });
  };
  /** Builds the screen for the port it was opened beside; false while the room module is unread. */
  const build = (port: string): boolean => {
    const module = deps.module();
    if (!module) return false;
    const kept = deps.kept();
    const minute = Math.floor(deps.now() / 60_000);
    const second = Math.floor(deps.now() / 1000);
    const gates = kept ? gatesAt(module, kept.level, kept.prologueDone ?? true) : null;
    const drawn = activitiesAt(module, minute);
    const record = kept?.activity ?? null;
    const plan = breachPlanOf(module);
    const screen = playlistScreenOf(port, drawn, gates, record, kept?.level ?? null, placeName, deps.now(), plan);
    opened = { port, second, gear: kept, screen };
    render();
    return true;
  };
  /** Into a run of `place`, closing the screen: none where the place is unknown. A Breach's run is gone into by its
   *  gate's patrol zone. */
  const into = (run: string) => {
    const where = nodeOfRoom(run);
    const node = deps.nodes.find((each) => each.id === where?.id);
    if (!node) return;
    close();
    if (where && where.breach !== null) deps.toBreach?.(run);
    else deps.intoRun(node, run);
  };
  /** Asks the server for a run of `entry`'s base: Find a Company's group, or with `launch` a playlist's run at once,
   *  alone or for the company, its Elite Dungeon drawn there as a found run's is; false where the page cannot ask. */
  const seek = (entry: PlaylistEntry, launch: boolean): boolean => {
    const [base, token, link] = [entry.launch.finds, deps.link?.token ?? null, deps.link];
    if (base === null || token === null || !link || search) return false;
    [said, launching] = [null, launch];
    const address = launch ? `${link.finderAt(base)}?launch` : link.finderAt(base);
    search = findCompany(
      address,
      base,
      token,
      {
        found: (run) => {
          search = null;
          into(run);
        },
        ended: (why) => {
          [search, said] = [null, launching && why === SEARCH_LOST ? LAUNCH_LOST : why];
          render();
        },
      },
      deps.now,
      deps.open,
    );
    render();
    return true;
  };
  const view = new PlaylistView({
    launch: (entry: PlaylistEntry) => {
      if (search) return;
      // A playlist's Elite Dungeon is the server's draw while signed in; the week's two are the week's own. A Breach's
      // run is the server's alone: its gate stands only in the zone's room online.
      if (entry.launch.place === null && entry.launch.playlist !== null && seek(entry, true)) return;
      if (entry.launch.seas === 'breach') {
        if (seek(entry, true)) return;
        // Online, the finder launches only for an account; a tier shut or a search under way says nothing more.
        said = !deps.link ? BREACH_ONLINE : !deps.link.token ? BREACH_SIGN_IN : said;
        return render();
      }
      const module = deps.module();
      const elites = module ? activitiesAt(module, Math.floor(deps.now() / 60_000)).elites : [];
      // Playing alone keeps nothing, so the page draws it: no account's record is paid there.
      const place = entry.launch.place ?? elites[pick(elites.length)];
      if (place !== undefined) into(launchRoom(entry.launch, place, instance()));
    },
    find: (entry: PlaylistEntry) => {
      // A Breach is launched by its company, never matched.
      if (entry.launch.seas !== 'breach') seek(entry, false);
    },
    stop: () => {
      stopSearch();
      render();
    },
    close,
  });
  return {
    layer: view.layer,
    open: (city) => {
      // A city's social space is named for it; the Playlist is one for the whole game, opened beside any port.
      build(`Beside ${placeName(`${city}-social`)}`);
      // Launch goes with the company where there is one: the Roster says, a moment after the screen opens.
      const asked = (opens += 1);
      void deps.link
        ?.roster?.()
        .then((roster) => {
          if (asked !== opens || !opened) return;
          company = typeof roster !== 'string' && (roster.company?.members.length ?? 0) > 1;
          render();
        })
        .catch(() => undefined);
      return true;
    },
    look: () => {
      if (!opened) return;
      if (!(deps.atSea?.() ?? true)) return close();
      if (opened.second !== Math.floor(deps.now() / 1000) || opened.gear !== deps.kept()) build(opened.port);
      else if (search) render();
    },
  };
}

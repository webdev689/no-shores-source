// The Playlist as the game wires it: a Playlist's mark beside a port opens its screen, built from the rules
// (`playlistWords.ts`) and the last word of the character a room sent; Launch starts a fresh run, alone or for the
// company to join, and Find a Company searches the playlist's one queue, each run then gone into from the sea.
import type { Layer } from '../ui/stack.ts';
import { activitiesAt, gatesAt } from './activities.ts';
import { type FinderSocket, type Finding, findCompany, findingWords } from './companyFinder.ts';
import type { AccountLink } from '../network/accounts.ts';
import type { GearState } from '../network/gearMessages.ts';
import { PlaylistView } from './playlistScreen.ts';
import { type PlaylistEntry, type PlaylistScreenState, launchRoom, playlistScreenOf } from './playlistWords.ts';
import { playlistPort } from './seaMarks.ts';
import { nodeOfRoom, runInstance } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** What the Playlist needs: the room module once read, the places by id, the last word of the character, the way
 *  into a run, the account's link for Find a Company (none offline), its clock, and a draw of one of a count. */
export interface PlaylistDeps {
  readonly module: () => WebAssembly.Module | null;
  readonly nodes: readonly NodeInfo[];
  readonly kept: () => GearState | null;
  readonly intoRun: (node: NodeInfo, run: string) => void;
  readonly link: Pick<AccountLink, 'token' | 'finderAt'> | null;
  readonly now: () => number;
  readonly open?: (address: string) => FinderSocket;
  readonly pick?: (count: number) => number;
  readonly instance?: () => string;
}

export interface Playlists {
  /** A press on mark `id`: true, and its screen open, where it is a Playlist's mark. */
  open(id: string): boolean;
  /** Looks again: the screen built anew as the minute or the character's word changes, and the wait shown. */
  look(): void;
  readonly layer: Layer;
}

export function startPlaylists(deps: PlaylistDeps): Playlists {
  const instance = deps.instance ?? (() => runInstance());
  const pick = deps.pick ?? ((count: number) => Math.floor(Math.random() * count));
  const placeName = (id: string) => deps.nodes.find((node) => node.id === id)?.name ?? id;
  /** The screen standing: the port it was opened beside, and the minute and the word it was built for. */
  let opened: { port: string; minute: number; gear: GearState | null; screen: PlaylistScreenState } | null = null;
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
  const render = () => {
    if (!opened) return;
    const finding = search ? findingWords(search.since, deps.now()) : null;
    view.show(opened.screen, { canFind: Boolean(deps.link?.token), finding, said });
  };
  /** Builds the screen for the port it was opened beside; false while the room module is unread. */
  const build = (port: string): boolean => {
    const module = deps.module();
    if (!module) return false;
    const kept = deps.kept();
    const minute = Math.floor(deps.now() / 60_000);
    const gates = kept ? gatesAt(module, kept.level, kept.prologueDone ?? true) : null;
    const drawn = activitiesAt(module, minute);
    const record = kept?.activity ?? null;
    const screen = playlistScreenOf(port, drawn, gates, record, kept?.level ?? null, placeName, deps.now());
    opened = { port, minute, gear: kept, screen };
    render();
    return true;
  };
  /** Into a run of `place`, closing the screen: none where the place is unknown. */
  const into = (run: string) => {
    const node = deps.nodes.find((each) => each.id === nodeOfRoom(run)?.id);
    if (!node) return;
    close();
    deps.intoRun(node, run);
  };
  const view = new PlaylistView({
    launch: (entry: PlaylistEntry) => {
      const module = deps.module();
      const elites = module ? activitiesAt(module, Math.floor(deps.now() / 60_000)).elites : [];
      const place = entry.launch.place ?? elites[pick(elites.length)];
      if (place !== undefined && !search) into(launchRoom(entry.launch, place, instance()));
    },
    find: (entry: PlaylistEntry) => {
      const [base, token, link] = [entry.launch.finds, deps.link?.token ?? null, deps.link];
      if (base === null || token === null || !link || search) return;
      said = null;
      search = findCompany(
        link.finderAt(base),
        base,
        token,
        {
          found: (run) => {
            search = null;
            into(run);
          },
          ended: (why) => {
            [search, said] = [null, why];
            render();
          },
        },
        deps.now,
        deps.open,
      );
      render();
    },
    stop: () => {
      stopSearch();
      render();
    },
    close,
  });
  return {
    layer: view.layer,
    open: (id) => {
      const city = playlistPort(id);
      if (city === null) return false;
      // A city's social space is named for it; the Playlist is one for the whole game, opened beside any port.
      build(`Beside ${placeName(`${city}-social`)}`);
      return true;
    },
    look: () => {
      if (!opened) return;
      if (opened.minute !== Math.floor(deps.now() / 60_000) || opened.gear !== deps.kept()) build(opened.port);
      else if (search) render();
    },
  };
}

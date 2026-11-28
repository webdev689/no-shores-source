// Where a returning player arrives after the title: wherever they last left the overworld or a
// social space, or online the passage zone of a dive under way. Online the accounts say it (`/v1/me`), from the
// character the rooms kept, and the rooms stand the player there; offline, where no room keeps a character, the page
// keeps it in the browser as it plays. One who has just played the story through arrives at Overlook, where its
// welcome waits.
import type { LastPlace } from '../../../server/accounts/lastPlace.ts';
import { arriving, type Flow } from './flow.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number];

/** Where the page keeps the place, and how often it looks whether the place has changed while the player plays,
 *  seconds: in the game's worker a write is a message to the page, which a page already going never reads, so the
 *  place is kept as it changes, not only as the page goes. */
export const PLACE_KEY = 'noshores.place';
const KEEP_EVERY_S = 1;

/** A place to resume at: aboard the ship, where it lay when the page knows it (offline: online the sea room keeps it),
 *  or on foot in a social space, where the player stood when the page knows it (offline: online its room stands them
 *  there), facing as they did. */
export type Resumed =
  | { readonly kind: 'sea'; readonly at?: Point; readonly heading?: number }
  | { readonly kind: 'social'; readonly node: string; readonly at?: Point; readonly facing?: number }
  | { readonly kind: 'passage'; readonly room: string };

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && value.every((number) => Number.isFinite(number));
const isAngle = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A place as the browser keeps it, read leniently: anything that is not one is none. */
export function placeOf(text: string | null): Resumed | null {
  let read: unknown = null;
  try {
    read = text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof read !== 'object' || read === null) return null;
  const kept = read as { kind?: unknown; node?: unknown; at?: unknown; heading?: unknown; facing?: unknown };
  const spot = isPoint(kept.at) ? { at: kept.at } : {};
  if (kept.kind === 'sea') return { kind: 'sea', ...spot, ...(isAngle(kept.heading) ? { heading: kept.heading } : {}) };
  if (kept.kind !== 'social' || typeof kept.node !== 'string') return null;
  return { kind: 'social', node: kept.node, ...spot, ...(isAngle(kept.facing) ? { facing: kept.facing } : {}) };
}

/** The accounts' word as a place to resume at; the rooms stand the player, so the page takes no spot from it. */
export function placeHeard(heard: LastPlace | null | undefined): Resumed | null {
  if (!heard) return null;
  if (heard.kind === 'passage') return heard;
  return heard.kind === 'sea' ? { kind: 'sea' } : { kind: 'social', node: heard.node, facing: heard.facing };
}

/** Where a social place is arrived at on the landmass open: its node, its spawn the spot kept where the page knows it;
 *  none for a node not open here, a locked one, or one that is no social space, so the player goes to Overlook. */
export function socialArrival(
  place: Extract<Resumed, { kind: 'social' }>,
  nodes: readonly NodeInfo[],
): { readonly node: NodeInfo; readonly facing: number | null } | null {
  const node = nodes.find((each) => each.id === place.node && each.kind === 'social' && !each.locked);
  if (!node) return null;
  return { node: place.at ? { ...node, spawns: [place.at] } : node, facing: place.facing ?? null };
}

/** Keeps where the player is, as `now` says it (none: as it was), when it has changed, every KEEP_EVERY_S and as the
 *  page is hidden or goes, so a page that plays alone comes back there. */
export function keepPlace(now: () => Resumed | null, storage: Pick<Storage, 'setItem'> = localStorage): () => void {
  let kept = '';
  const keep = () => {
    const place = now();
    const words = place && JSON.stringify(place);
    if (!words || words === kept) return;
    try {
      storage.setItem(PLACE_KEY, words);
      kept = words;
    } catch {
      // A browser that keeps nothing still plays; the next visit begins at Overlook.
    }
  };
  setInterval(keep, KEEP_EVERY_S * 1000);
  addEventListener('pagehide', keep);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keep();
  });
  return keep;
}

/** The place kept in the browser. */
export function placeKept(storage: Pick<Storage, 'getItem'> = localStorage): Resumed | null {
  try {
    return placeOf(storage.getItem(PLACE_KEY));
  } catch {
    return null;
  }
}

/** What resuming asks of the game: whether it plays online, the accounts' word on the place once the session is
 *  settled, the place the browser kept (offline), the landmass's nodes, the ways aboard (at a spot the page kept)
 *  and into a social space, Overlook's own arrival, and the flow set as the trip begins. */
export interface Resuming {
  readonly online: boolean;
  readonly heard: () => Promise<LastPlace | null | undefined>;
  readonly kept: () => Resumed | null;
  readonly nodes: readonly NodeInfo[];
  readonly aboard: (at?: { readonly anchorage: Point; readonly heading: number }) => Promise<void>;
  readonly ashore: (node: NodeInfo, facing: number | null) => Promise<void>;
  readonly overlook: () => Promise<void>;
  /** Into a dive's passage zone by its room: whether the page laid and joined it. */
  readonly passage: (room: string) => Promise<boolean>;
  readonly flow: (flow: Flow) => void;
}

/** After the title: back aboard, in the social space the player last stood in or the passage zone of their dive,
 *  else at Overlook. */
export async function resume(game: Resuming): Promise<void> {
  const kept = game.online ? placeHeard(await game.heard()) : game.kept();
  if (kept?.kind === 'passage') return (await game.passage(kept.room).catch(() => false)) ? undefined : game.overlook();
  if (kept?.kind === 'sea') {
    game.flow({ mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea' } });
    return game.aboard(kept.at && { anchorage: kept.at, heading: kept.heading ?? 0 });
  }
  const social = kept?.kind === 'social' ? socialArrival(kept, game.nodes) : null;
  if (!social) return game.overlook();
  game.flow(arriving(social.node.id, social.node.name));
  return game.ashore(social.node, social.facing);
}

/** Where the player is now, as the page keeps it: aboard at sea, where the ship lies; on their feet in a social space,
 *  where they stand; anywhere else none, so the place kept stays the last of the two. */
export function placeNow(
  playing: {
    readonly flow: Flow;
    readonly sea: { readonly position: Point; readonly heading: number } | null;
    readonly foot: { readonly node: NodeInfo; readonly fallen: boolean; readonly dungeon: unknown } | null;
  },
  body: { readonly x: number; readonly y: number; readonly facing: number },
): Resumed | null {
  const { flow, sea, foot } = playing;
  if (flow.mode === 'sea' && sea) return { kind: 'sea', at: [sea.position[0], sea.position[1]], heading: sea.heading };
  const social = flow.mode === 'foot' && foot?.node.kind === 'social' && !foot.fallen && !foot.dungeon;
  return social ? { kind: 'social', node: foot.node.id, at: [body.x, body.y], facing: body.facing } : null;
}

// The marks the sea's view shows: a port's icon over its harbour once the ship is near, the Playlist's beside it, and a
// mark for each hostile ship within its sight; or the landings over the island's side the view stands over, with the
// Playlist beside its city's. Laid on the picture, a crowd of ports thinned to the nearest (a hostile ship's mark is
// never thinned away), and each named where its name fits. A locked node's mark still shows, so the player sees what
// lies ahead, but a click on it never lands.
import type { SeenHostile } from '../network/messages.ts';
import type { CameraPose, Viewport } from '../overworld/overworldCamera.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import type { Point2, Vec3 } from '../overworld/ground.ts';
import { sideNodes } from '../overworld/islandView.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from '../plus/compass.ts';
import { HOSTILE_PREFIX, hostileLook, hostileMarks, hostileNote } from './seaHostiles.ts';
import type { Landmass } from './landmass.ts';
import { LOCKED_WORDS, portOf, socialLater, socialLocked } from './nodes.ts';
import { declutter, namesShown, PORT_SEEN_M } from './seaLaw.ts';
import { lockedWords } from './worldData.ts';

/** How far in from the picture's top and foot a held mark stands, clear of the place's name and, at sea, the sea's
 *  bar. */
const MARK_EDGES = { sea: { top: 96, foot: 120 }, side: { top: 96, foot: 48 } } as const;
/** Marks at sea nearer each other on the picture than this are one: the nearer is shown. */
const MARK_GAP_PX = 30;
/** A mark stands this far over the ground it marks, metres. */
const MARK_RISE_M = 2;

/** What a click on a mark over an island's side does, `chosen` the landing chosen before: chooses its landing, or lands
 *  there once chosen; a locked node is never chosen, and only says it is locked. Null for a mark not on the side. */
export function landingChoice(
  side: readonly Mark[],
  chosen: string | null,
  id: string,
): { readonly kind: 'choose' | 'land' } | { readonly kind: 'locked'; readonly words: string } | null {
  const mark = side.find((each) => each.id === id);
  if (!mark) return null;
  if (mark.locked)
    return { kind: 'locked', words: socialLater(mark.id) ? `${mark.name} opens later` : lockedWords(mark.name) };
  return { kind: chosen === id ? 'land' : 'choose' };
}

/** A landmass's marks: each node over its ground (its social space on the city's level), a locked node marked so (a
 *  patrol area or mission until a pass is done on it, or a social space still locked), its port over its harbour,
 *  and the Playlist beside it, open whether or not the city's social space is. */
export function islandMarksOf(landmass: Pick<Landmass, 'nodes' | 'plan' | 'heightAt'>): Mark[] {
  const marks: Mark[] = landmass.nodes.map((node) => {
    const ground =
      node.kind === 'social' && landmass.plan ? landmass.plan.social.level : landmass.heightAt(...node.centre);
    const place: Vec3 = [node.centre[0], node.centre[1], Math.max(0, ground) + MARK_RISE_M];
    const locked = node.locked === true || socialLocked(node.id);
    return { id: node.id, kind: node.kind, name: node.name, at: place, edge: true, locked };
  });
  const harbour = portOf(landmass.plan)?.harbour;
  if (landmass.plan && harbour) {
    const port = { id: `${landmass.plan.id}-port`, kind: 'port', name: landmass.plan.name, edge: true } as const;
    marks.push({ ...port, at: [harbour[0], harbour[1], MARK_RISE_M] });
    const playlist = { id: playlistMarkOf(landmass.plan.id), kind: 'playlist', name: 'Playlist', edge: true } as const;
    marks.push({ ...playlist, at: [harbour[0], harbour[1], MARK_RISE_M] });
  }
  return marks;
}

/** The Playlist's mark beside a port city's harbour: `<city>-playlist`. */
export const playlistMarkOf = (city: string) => `${city}-playlist`;

/** The port city a Playlist's mark stands beside; null for any other mark. */
export const playlistPort = (id: string): string | null => (id.endsWith('-playlist') ? id.slice(0, -9) : null);

/** Each Playlist's mark laid beside its city's, as wide apart as the two are drawn, so neither covers the other: its
 *  port's at sea, its social space's over the island's side; to its right, or to its left where the picture `width`
 *  across ends first. */
function besideItsCity(laid: readonly PlacedMark[], width: number): PlacedMark[] {
  return laid.map((mark) => {
    const city = mark.kind === 'playlist' ? playlistPort(mark.id) : null;
    const port = city ? laid.find((one) => one.id === `${city}-port` || one.id === `${city}-social`) : undefined;
    if (!port) return mark;
    const apart = (port.sizePx + mark.sizePx) / 2 + MARK_GAP_PX / 3;
    const right = port.x + apart + mark.sizePx / 2 <= width;
    return { ...mark, x: right ? port.x + apart : port.x - apart, y: port.y };
  });
}

/** The marks over the island's side a landfall shows, the ship at `ship` off an island whose middle is `centre`: the
 *  nodes on the ship's side, the city's social space among them when `docking`, and the island's Playlist however it
 *  is reached; and those the view is framed on, the nodes alone, so a landfall far from the harbour is never stretched
 *  to show it, its Playlist held at the picture's edge. */
export function landfallMarks(
  island: readonly Mark[],
  ship: Point2,
  centre: Point2,
  docking: boolean,
): { readonly side: Mark[]; readonly framed: Mark[] } {
  const nodes = island.filter((mark) => mark.kind !== 'port' && mark.kind !== 'playlist');
  const near = sideNodes(ship, centre, nodes);
  const social = nodes.find((mark) => mark.kind === 'social');
  const framed = docking && social && !near.includes(social) ? [social, ...near] : near;
  const playlist = island.filter((mark) => mark.kind === 'playlist');
  return { side: [...framed, ...playlist], framed };
}

/** The landing `id` among the side's marks, if a player may land there: a locked one is none. */
export function landable(side: readonly Mark[], id: string): Mark | null {
  const mark = side.find((each) => each.id === id);
  return mark && !mark.locked ? mark : null;
}

/** The marks laid for the view (`sail` over the ship, `landing` over an island's side, else none), the ship at `ship`
 *  among `hostiles`, from `pose` on a picture of `viewport`: those placed, for a click to pick, and each as the HUD
 *  shows it. */
export function seaMarks(
  view: 'sail' | 'landing' | 'other',
  island: readonly Mark[],
  side: readonly Mark[],
  ship: Point2,
  pose: CameraPose,
  viewport: Viewport,
  chosen: string | null,
  hostiles: readonly SeenHostile[] = [],
): { readonly placed: PlacedMark[]; readonly shown: ScreenMark[] } {
  const away = (spot: readonly number[]) => Math.hypot((spot[0] ?? 0) - ship[0], (spot[1] ?? 0) - ship[1]);
  const marks =
    view === 'sail'
      ? island.filter((mark) => (mark.kind === 'port' || mark.kind === 'playlist') && away(mark.at) <= PORT_SEEN_M)
      : view === 'landing'
        ? // A desolate city's social space is no landing, and shows no mark.
          side.filter((mark) => !socialLocked(mark.id) || socialLater(mark.id))
        : [];
  const edges = view === 'sail' ? MARK_EDGES.sea : MARK_EDGES.side;
  const laid = besideItsCity(placeMarks(marks, pose, viewport, edges), viewport.width);
  const ships = view === 'sail' ? placeMarks(hostileMarks(hostiles, ship), pose, viewport, edges) : [];
  // The Playlist stands beside its port, never thinned away by it, and shows while its port does.
  const kept =
    view === 'sail'
      ? declutter(
          laid.filter((mark) => mark.kind !== 'playlist'),
          MARK_GAP_PX,
        )
      : laid;
  const beside = (mark: PlacedMark) => kept.some((port) => port.id === `${playlistPort(mark.id)}-port`);
  const ports = view === 'sail' ? [...kept, ...laid.filter((mark) => mark.kind === 'playlist' && beside(mark))] : kept;
  const placed = [...ports, ...ships].sort((one, other) => other.distance - one.distance);
  const named = namesShown(placed);
  const shown = placed.map((each): ScreenMark => {
    const marked = { ...each, chosen: each.id === chosen, named: named.has(each.id) || each.id === chosen };
    const hostile = hostiles.find((one) => `${HOSTILE_PREFIX}${one.id}` === each.id);
    if (hostile) {
      const note = hostileNote(hostile, away([hostile.x, hostile.y]));
      return { ...marked, kind: 'hostile', note, hostile: hostileLook(hostile), locked: false };
    }
    const mark = marks.find((one) => one.id === each.id);
    return {
      ...marked,
      note: socialLater(each.id)
        ? LOCKED_WORDS
        : mark?.locked
          ? 'Locked'
          : distanceText(mark ? away(mark.at) : each.distance),
      locked: mark?.locked === true,
    };
  });
  return { placed, shown };
}

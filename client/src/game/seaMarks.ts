// The marks the sea's view shows: a port's icon over its harbour once the ship is near, and a mark for each hostile
// ship within its sight. Laid on the picture, a crowd of ports thinned to the nearest (a hostile ship's mark is never
// thinned away), and each named where its name fits. Over an island docked at no node is marked on the map: its panel
// holds them (`islandPanel.ts`), and a click there chooses a landing by its id.
import type { SeenHostile } from '../network/messages.ts';
import type { CameraPose, Viewport } from '../overworld/overworldCamera.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import type { Point2, Vec3 } from '../overworld/ground.ts';
import { sideNodes } from '../overworld/islandView.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from '../plus/compass.ts';
import { HOSTILE_PREFIX, hostileLook, hostileMarks, hostileNote } from './seaHostiles.ts';
import type { Landmass } from './landmass.ts';
import { portOf, socialLater, socialLocked } from './nodes.ts';
import { declutter, namesShown, PORT_SEEN_M } from './seaLaw.ts';
import { lockedWords } from './worldData.ts';

/** How far in from the picture's top and foot a held mark stands, clear of the place's name and the ship's console. */
const MARK_EDGES = { top: 96, foot: 260 } as const;
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
 *  patrol area or mission until a pass is done on it, or a social space still locked), and its port over its
 *  harbour. */
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
  }
  return marks;
}

/** The nodes over the island's side a landfall frames, the ship at `ship` off an island whose middle is `centre`: the
 *  nodes on the ship's side, the city's social space among them when `docking`. */
export function landfallMarks(island: readonly Mark[], ship: Point2, centre: Point2, docking: boolean): Mark[] {
  const nodes = island.filter((mark) => mark.kind !== 'port');
  const near = sideNodes(ship, centre, nodes);
  const social = nodes.find((mark) => mark.kind === 'social');
  return docking && social && !near.includes(social) ? [social, ...near] : near;
}

/** The landing `id` among the side's marks, if a player may land there: a locked one is none. */
export function landable(side: readonly Mark[], id: string): Mark | null {
  const mark = side.find((each) => each.id === id);
  return mark && !mark.locked ? mark : null;
}

/** The marks laid over the ship (`sail`; none over an island's side or elsewhere), the ship at `ship` among
 *  `hostiles`, from `pose` on a picture of `viewport`: those placed, for a click to pick, and each as the HUD shows it. */
export function seaMarks(
  view: 'sail' | 'landing' | 'other',
  island: readonly Mark[],
  ship: Point2,
  pose: CameraPose,
  viewport: Viewport,
  chosen: string | null,
  hostiles: readonly SeenHostile[] = [],
): { readonly placed: PlacedMark[]; readonly shown: ScreenMark[] } {
  if (view !== 'sail') return { placed: [], shown: [] };
  const away = (spot: readonly number[]) => Math.hypot((spot[0] ?? 0) - ship[0], (spot[1] ?? 0) - ship[1]);
  const marks = island.filter((mark) => mark.kind === 'port' && away(mark.at) <= PORT_SEEN_M);
  const ports = declutter(placeMarks(marks, pose, viewport, MARK_EDGES), MARK_GAP_PX);
  const ships = placeMarks(hostileMarks(hostiles, ship), pose, viewport, MARK_EDGES);
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
    return { ...marked, note: distanceText(mark ? away(mark.at) : each.distance), locked: false };
  });
  return { placed, shown };
}

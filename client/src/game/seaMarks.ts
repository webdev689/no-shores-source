// The marks the sea's view shows: a port's icon over its harbour once the ship is near, or the landings over the
// island's side the view stands over; laid on the picture, a crowd at sea thinned to the nearest, and each named where
// its name fits. A locked node's mark still shows, so the player sees what lies ahead, but a click on it never lands.
import type { CameraPose, Viewport } from '../overworld/overworldCamera.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from './hudLaw.ts';
import type { Landmass } from './landmass.ts';
import { declutter, namesShown, PORT_SEEN_M } from './seaLaw.ts';
import { lockedWords } from './worldData.ts';

/** How far in from the picture's top and foot a held mark stands, clear of the place's name and, at sea, the sea's
 *  bar. */
const MARK_EDGES = { sea: { top: 96, foot: 120 }, side: { top: 96, foot: 48 } } as const;
/** Marks at sea nearer each other on the picture than this are one: the nearer is shown. */
const MARK_GAP_PX = 30;
/** A mark stands this far over the ground it marks, metres. */
const MARK_RISE_M = 2;

/** A landmass's marks: each node over its middle (a social space over its level), a locked node marked so, and its
 *  city's port over the harbour. */
export function islandMarks(landmass: Pick<Landmass, 'nodes' | 'plan' | 'heightAt'>): Mark[] {
  const marks: Mark[] = landmass.nodes.map((node) => {
    const ground =
      node.kind === 'social' && landmass.plan ? landmass.plan.social.level : landmass.heightAt(...node.centre);
    const place: Mark['at'] = [node.centre[0], node.centre[1], Math.max(0, ground) + MARK_RISE_M];
    return { id: node.id, kind: node.kind, name: node.name, at: place, edge: true, locked: node.locked === true };
  });
  const harbour = landmass.plan?.harbour;
  if (landmass.plan && harbour) {
    const port = { id: `${landmass.plan.id}-port`, kind: 'port', name: landmass.plan.name, edge: true } as const;
    marks.push({ ...port, at: [harbour[0], harbour[1], MARK_RISE_M] });
  }
  return marks;
}

/** What a click on a mark over an island's side does, `chosen` the landing chosen before: chooses its landing, or lands
 *  there once chosen; a locked node is never chosen, and only says it is locked. Null for a mark not on the side. */
export function landingChoice(
  side: readonly Mark[],
  chosen: string | null,
  id: string,
): { readonly kind: 'choose' | 'land' } | { readonly kind: 'locked'; readonly words: string } | null {
  const mark = side.find((each) => each.id === id);
  if (!mark) return null;
  if (mark.locked) return { kind: 'locked', words: lockedWords(mark.name) };
  return { kind: chosen === id ? 'land' : 'choose' };
}

/** The marks laid for the view (`sail` over the ship, `landing` over an island's side, else none), the ship at `ship`,
 *  from `pose` on a picture of `viewport`: those placed, for a click to pick, and each as the HUD shows it. */
export function seaMarks(
  view: 'sail' | 'landing' | 'other',
  island: readonly Mark[],
  side: readonly Mark[],
  ship: Point2,
  pose: CameraPose,
  viewport: Viewport,
  chosen: string | null,
): { readonly placed: PlacedMark[]; readonly shown: ScreenMark[] } {
  const away = (mark: Mark) => Math.hypot(mark.at[0] - ship[0], mark.at[1] - ship[1]);
  const marks =
    view === 'sail'
      ? island.filter((mark) => mark.kind === 'port' && away(mark) <= PORT_SEEN_M)
      : view === 'landing'
        ? side
        : [];
  const laid = placeMarks(marks, pose, viewport, view === 'sail' ? MARK_EDGES.sea : MARK_EDGES.side);
  const placed = view === 'sail' ? declutter(laid, MARK_GAP_PX) : laid;
  const named = namesShown(placed);
  const shown = placed.map((each) => {
    const mark = marks.find((one) => one.id === each.id);
    return {
      ...each,
      note: mark?.locked ? 'Locked' : distanceText(mark ? away(mark) : each.distance),
      chosen: each.id === chosen,
      named: named.has(each.id) || each.id === chosen,
      locked: mark?.locked === true,
    };
  });
  return { placed, shown };
}

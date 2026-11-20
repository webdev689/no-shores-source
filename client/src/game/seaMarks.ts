// The marks the sea's view shows: a port's icon over its harbour once the ship is near, or the landings over the
// island's side the view stands over; laid on the picture, a crowd at sea thinned to the nearest, and each named where
// its name fits.
import type { CameraPose, Viewport } from '../overworld/overworldCamera.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from './hudLaw.ts';
import { LOCKED_WORDS, socialLater, socialLocked } from './nodes.ts';
import { declutter, namesShown, PORT_SEEN_M } from './seaLaw.ts';

/** How far in from the picture's top and foot a held mark stands, clear of the place's name and, at sea, the sea's
 *  bar. */
const MARK_EDGES = { sea: { top: 96, foot: 120 }, side: { top: 96, foot: 48 } } as const;
/** Marks at sea nearer each other on the picture than this are one: the nearer is shown. */
const MARK_GAP_PX = 30;

/** The landing `id` among the side's marks, if a player may land there: a social space still locked is none. */
export function landable(side: readonly Mark[], id: string): Mark | null {
  return socialLocked(id) ? null : (side.find((mark) => mark.id === id) ?? null);
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
        ? // A desolate city's social space is no landing, and shows no mark.
          side.filter((mark) => !socialLocked(mark.id) || socialLater(mark.id))
        : [];
  const laid = placeMarks(marks, pose, viewport, view === 'sail' ? MARK_EDGES.sea : MARK_EDGES.side);
  const placed = view === 'sail' ? declutter(laid, MARK_GAP_PX) : laid;
  const named = namesShown(placed);
  const shown = placed.map((each) => {
    const mark = marks.find((one) => one.id === each.id);
    return {
      ...each,
      note: socialLater(each.id) ? LOCKED_WORDS : distanceText(mark ? away(mark) : each.distance),
      chosen: each.id === chosen,
      named: named.has(each.id) || each.id === chosen,
    };
  });
  return { placed, shown };
}

// The marks the sea's view shows: a port's icon over its harbour once the ship is near, and a mark for each hostile
// ship within her sight; or the landings over the island's side the view stands over. Laid on the picture, a crowd of
// ports thinned to the nearest (a hostile ship's mark is never thinned away), and each named where its name fits.
import type { SeenPirate } from '../network/messages.ts';
import type { CameraPose, Viewport } from '../overworld/overworldCamera.ts';
import { type Mark, type PlacedMark, placeMarks } from '../overworld/overworldMarks.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { ScreenMark } from './hud.ts';
import { distanceText } from './hudLaw.ts';
import { HOSTILE_PREFIX, hostileLook, hostileMarks, hostileNote } from './seaHostiles.ts';
import { declutter, namesShown, PORT_SEEN_M } from './seaLaw.ts';

/** How far in from the picture's top and foot a held mark stands, clear of the place's name and, at sea, the sea's
 *  bar. */
const MARK_EDGES = { sea: { top: 96, foot: 120 }, side: { top: 96, foot: 48 } } as const;
/** Marks at sea nearer each other on the picture than this are one: the nearer is shown. */
const MARK_GAP_PX = 30;

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
  hostiles: readonly SeenPirate[] = [],
): { readonly placed: PlacedMark[]; readonly shown: ScreenMark[] } {
  const away = (spot: readonly number[]) => Math.hypot((spot[0] ?? 0) - ship[0], (spot[1] ?? 0) - ship[1]);
  const marks =
    view === 'sail'
      ? island.filter((mark) => mark.kind === 'port' && away(mark.at) <= PORT_SEEN_M)
      : view === 'landing'
        ? side
        : [];
  const edges = view === 'sail' ? MARK_EDGES.sea : MARK_EDGES.side;
  const laid = placeMarks(marks, pose, viewport, edges);
  const ships = view === 'sail' ? placeMarks(hostileMarks(hostiles, ship), pose, viewport, edges) : [];
  const ports = view === 'sail' ? declutter(laid, MARK_GAP_PX) : laid;
  const placed = [...ports, ...ships].sort((one, other) => other.distance - one.distance);
  const named = namesShown(placed);
  const shown = placed.map((each): ScreenMark => {
    const marked = { ...each, chosen: each.id === chosen, named: named.has(each.id) || each.id === chosen };
    const pirate = hostiles.find((one) => `${HOSTILE_PREFIX}${one.id}` === each.id);
    if (pirate) {
      const note = hostileNote(pirate, away([pirate.x, pirate.y]));
      return { ...marked, kind: 'hostile', note, hostile: hostileLook(pirate) };
    }
    const mark = marks.find((one) => one.id === each.id);
    return { ...marked, note: distanceText(mark ? away(mark.at) : each.distance) };
  });
  return { placed, shown };
}

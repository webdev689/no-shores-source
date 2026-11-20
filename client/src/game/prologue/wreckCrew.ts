// The Brig's surviving crew on the wreck: two or three of them in each zone with boarders, already fighting them when
// the player comes, dressed as the hands who worked her deck in the storm. They fight on the players' side and can
// fall; a zone is cleared by its boarders falling, whatever becomes of its crew.
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import type { Dress } from '../../player/dressing.ts';
import { HANDS } from './brig.ts';
import { inArea, topAt, type WreckLayout, type Zone } from './wreckLayout.ts';
import { ALIVE_MOST, type Standing } from './wreckProgress.ts';

type Point = readonly [number, number];

/** The crew's roster types (the rules' `CREW` faction): a swordsman and a skirmisher, taken in turn. */
export const CREW_TYPES: readonly number[] = [19, 20];
/** The crew stand as Minors, as most boarders do. */
const CREW_RANK = 1;
/** The wreck's room stands as many foes alive as a node's (`NODE_FOES_MOST`); the crew keep clear of the boarders'
 *  share of them. */
export const ROOM_FOES_MOST = 24;
export const CREW_ALIVE_MOST = ROOM_FOES_MOST - ALIVE_MOST;
/** How far from the boarder he faces a crewman stands with no spot laid for him, metres. */
const APART_M = 1.6;
/** A spot this much higher or lower than the boarder's feet is another deck, metres. */
const SAME_DECK_M = 0.6;
const TRIES = 8;

/** Where a crewman stands, and the way he faces (radians clockwise from north). */
export interface CrewSpot {
  readonly at: Point;
  readonly facing: number;
}

const facingFrom = ([x, y]: Point, [toX, toY]: Point): number => Math.atan2(toX - x, -(toY - y));

/** Where a zone's crew stand: the layout's spots if it lays them, each facing the nearest boarder; else, for a zone
 *  with a wave (never the arena's, which has none), one by each of its first boarders (two, or three for a wave of
 *  three or more), on its own deck within the zone, on the side toward the zone's checkpoint where that stands. */
export function crewSpots(zone: Zone, course: readonly CourseBlock[]): CrewSpot[] {
  const wave = zone.wave;
  if (wave.length === 0) return [];
  const apart = (one: Point, other: Point) => Math.hypot(one[0] - other[0], one[1] - other[1]);
  const nearest = (spot: Point) =>
    wave.reduce((best, foe) => (apart(foe.at, spot) < apart(best.at, spot) ? foe : best));
  // A zone of the layout file may lay its crew's spots or leave them to be found.
  const laid = (zone as Zone & { readonly crew?: readonly Point[] }).crew;
  if (laid) return laid.map(([x, y]) => ({ at: [x, y], facing: facingFrom([x, y], nearest([x, y]).at) }));
  const spots: CrewSpot[] = [];
  for (let index = 0; index < Math.max(2, Math.min(3, wave.length)); index++) {
    const foe = wave[index % wave.length];
    if (!foe) continue;
    const deck = topAt(course, ...foe.at);
    const [toX, toY] = [zone.checkpoint[0] - foe.at[0], zone.checkpoint[1] - foe.at[1]];
    const home = Math.atan2(toX, -toY);
    for (let attempt = 0; attempt < TRIES; attempt++) {
      // Toward the checkpoint first, then round either way from it.
      const turn = Math.ceil(attempt / 2) * (attempt % 2 ? 1 : -1) * ((2 * Math.PI) / TRIES);
      const way = home + turn;
      const spot: Point = [foe.at[0] + Math.sin(way) * APART_M, foe.at[1] - Math.cos(way) * APART_M];
      const top = topAt(course, ...spot);
      const taken = spots.some((other) => apart(other.at, spot) < 1);
      if (taken || top <= 0 || Math.abs(top - deck) > SAME_DECK_M || !inArea(zone.area, ...spot)) continue;
      spots.push({ at: spot, facing: facingFrom(spot, foe.at) });
      break;
    }
  }
  return spots;
}

/** What standing the crew needs of the wreck's run: its room, its foes' figures, the foes the room last showed, its
 *  layout, and the level the boarders stand at. */
export interface CrewRun {
  readonly room: {
    standFoe(type: number, rank: number, x: number, y: number, facing: number, level: number): number;
  };
  readonly figures: { dressFoe(id: number, type: number, look: Dress): void };
  readonly foes: ReadonlyMap<number, { readonly view: { readonly health: number } }>;
  readonly layout: WreckLayout;
  readonly level: number;
}

/** The wreck's crew: each zone's stood once, as the first of its boarders stands. */
export class WreckCrew {
  private readonly zones = new Set<number>();
  /** Every crewman stood, by the room's number, and those a snapshot has shown. */
  private readonly stood = new Set<number>();
  private readonly seen = new Set<number>();

  /** The crew living: shown standing, or stood and not shown yet. A crewman shown once and gone is no more. */
  private living(foes: CrewRun['foes']): number {
    let living = 0;
    for (const id of this.stood) {
      const kept = foes.get(id);
      if (kept) this.seen.add(id);
      if (kept ? kept.view.health > 0 : !this.seen.has(id)) living++;
    }
    return living;
  }

  /** Whether the room's foe `id` is one of the crew. */
  has(id: number): boolean {
    return this.stood.has(id);
  }

  /** Stands the crew of each zone whose boarders begin to stand in `standing`, as many as leave the boarders room. */
  stand(standing: readonly Standing[], run: CrewRun): void {
    const { layout, room, figures } = run;
    // Looked at every frame, so a crewman shown and then taken away is never mistaken for one not shown yet.
    this.living(run.foes);
    for (const { zone } of standing) {
      if (this.zones.has(zone)) continue;
      this.zones.add(zone);
      const found = layout.zones[zone];
      const spots = found ? crewSpots(found, layout.course) : [];
      const roomLeft = CREW_ALIVE_MOST - this.living(run.foes);
      spots.slice(0, Math.max(0, roomLeft)).forEach(({ at, facing }, index) => {
        const type = CREW_TYPES[index % CREW_TYPES.length] ?? 0;
        const id = room.standFoe(type, CREW_RANK, ...at, facing, run.level);
        if (id === 0) return;
        this.stood.add(id);
        const look = HANDS[(this.stood.size - 1) % HANDS.length];
        if (look) figures.dressFoe(id, type, look);
      });
    }
  }
}

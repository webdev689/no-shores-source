// A patrol zone's folk where no foe holds the ground (its layout's folk sites: its hamlets, farms and mills): Overlook's
// guards and its townsfolk going about their own business, each walking a stretch of the zone's paths there and back
// and stopping a while at each end. Their rounds are laid on the world clock from the sites and the paths, as a social
// space's townsfolk's are (`life/routine.ts`), so every browser shows them in the same places doing the same things.
// They are not foes: the room knows nothing of them, and the fight never takes them for targets.

import type { Dress } from '../player/dressing.ts';
import { type Path, alongPath, pathThrough } from './life/paths.ts';
import { type Leg, type Routine, WALK_M_S, doingAt, stayAt } from './life/routine.ts';
import { seeded } from './life/seeded.ts';
import { type Post, type Task, bearingTo } from './nodes.ts';
import { type Townsperson, dressOf } from './townsfolk.ts';

type Point = readonly [number, number];

/** Where folk live: a site's middle, and how far round it they walk, metres. */
export interface FolkSite {
  readonly at: Point;
  readonly radius: number;
}

/** How long a stretch of path one person walks, metres, the least worth walking, and how far apart the ends of two
 *  stretches along one path stand, so no two stopping there stand in each other. */
const STRETCH_M = 24;
const LEAST_M = 12;
const GAP_M = 8;
/** How far round a site's middle no one walks, metres: where its paths meet, so none walks across another's way. */
const HUB_M = 8;
/** The most folk a site holds. */
const MOST = 6;
/** What townsfolk do at each end of their stretch; a guard stands and looks out. */
const TASKS: readonly Task[] = ['idle', 'sweep', 'carry'];
/** A guard of Overlook: an iron helm and chain over the townsfolk's clothes, a sword at the hip. */
const GUARD_ARMOUR = { helm: 'iron', cuirass: 'chain' } as const;

const apart = (one: Point, two: Point) => Math.hypot(two[0] - one[0], two[1] - one[1]);

/** A line through `points` as it is drawn, with no keeping right. */
function lineThrough(points: readonly Point[]): Path {
  const along = [0];
  for (let nth = 1; nth < points.length; nth++)
    along.push((along[nth - 1] ?? 0) + apart(points[nth - 1] as Point, points[nth] as Point));
  return { points, along, length: along[along.length - 1] ?? 0 };
}

/** The stretches of the paths a site's folk walk: each run of a path's points within its radius and off its middle,
 *  cut into `STRETCH_M` with `GAP_M` between, the nearest its middle first. */
function stretchesOf({ at, radius }: FolkSite, paths: readonly (readonly Point[])[]): Point[][] {
  const near = (point: Point | undefined) => !!point && apart(point, at) >= HUB_M && apart(point, at) <= radius;
  const runs: Point[][] = [];
  for (const points of paths)
    points.forEach((point, nth) => {
      if (!near(point)) return;
      if (near(points[nth - 1])) runs[runs.length - 1]?.push(point);
      else runs.push([point]);
    });
  const stretches: Point[][] = [];
  for (const run of runs.map(lineThrough))
    for (let from = 0; from + LEAST_M <= run.length; from += STRETCH_M + GAP_M) {
      const to = Math.min(from + STRETCH_M, run.length);
      const between = run.points.filter((point, nth) => (run.along[nth] ?? 0) > from && (run.along[nth] ?? 0) < to);
      stretches.push([alongPath(run, from).place, ...between, alongPath(run, to).place]);
    }
  const off = (stretch: readonly Point[]) => {
    const line = lineThrough(stretch);
    return apart(alongPath(line, line.length / 2).place, at);
  };
  return stretches.sort((one, two) => off(one) - off(two)).slice(0, MOST);
}

/** Someone walking `stretch` there and back, doing each of `tasks` a while at its ends, facing on along the way. */
function roundOf(stretch: readonly Point[], tasks: readonly [Task, Task], random: () => number): Routine {
  const [first, second] = [stretch[0] as Point, stretch[1] as Point];
  const [last, before] = [stretch[stretch.length - 1] as Point, stretch[stretch.length - 2] as Point];
  const post = (task: Task, end: Point, from: Point): Post => ({
    task,
    at: end,
    facing: bearingTo(from, end),
    keep: 'kept',
    reached_from: 0,
  });
  const ends = [
    [post(tasks[0], first, second), pathThrough(stretch)],
    [post(tasks[1], last, before), pathThrough([...stretch].reverse())],
  ] as const;
  const legs: Leg[] = [];
  let time = 0;
  for (const [stay, walk] of ends) {
    const left = time + stayAt(stay, random);
    legs.push({ start: time, end: left, post: stay }, { start: left, end: left + walk.length / WALK_M_S, path: walk });
    time = left + walk.length / WALK_M_S;
  }
  return { loop: time, offset: random() * time, legs };
}

/** A patrol zone's folk at their rounds, each site's farthest out its guard. */
export class ZoneFolk {
  private readonly folk: readonly { readonly routine: Routine; readonly dress: Dress }[];

  constructor(sites: readonly FolkSite[], paths: readonly (readonly Point[])[]) {
    this.folk = sites.flatMap((site) => {
      // Seeded by the site, so its folk are the same each visit and in every browser.
      const random = seeded(Math.round(site.at[0] * 31 + site.at[1]));
      const stretches = stretchesOf(site, paths);
      return stretches.map((stretch, nth) => {
        const guard = nth === stretches.length - 1;
        const task = () => TASKS[Math.floor(random() * TASKS.length)] ?? 'idle';
        const dress = dressOf(nth, random);
        const tasks = guard ? (['idle', 'idle'] as const) : ([task(), task()] as const);
        const outfit = { ...dress.outfit, armour: GUARD_ARMOUR, right: 'sword_iron' };
        return { routine: roundOf(stretch, tasks, random), dress: guard ? { ...dress, outfit } : dress };
      });
    });
  }

  /** Where everyone stands and what they do at world time `worldS`, seconds. */
  peopleAt(worldS: number): Townsperson[] {
    return this.folk.map(({ routine, dress }, id) => {
      const { place, facing, anim } = doingAt(routine, worldS);
      return { id, x: place[0], y: place[1], facing, anim, dress };
    });
  }
}

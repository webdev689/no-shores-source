// Where the intro's camera flies over each island, worked out from the island's own city: in from the sea out of the
// cloud, over its harbour toward the town, round it, and back up into the cloud; for the island where a fight is shown,
// down low over its plaza instead; and for Saltmere, the long glide in to the view the title stands over.
import { around, type Point3, type RailKey } from '../../cinema/rail.ts';
import type { Landmass } from '../landmass.ts';
import { offshore } from '../seaLaw.ts';

/** Seconds a passing island's shot runs, and Saltmere's glide before the title. */
export const ISLAND_S = 13;
export const HOME_S = 15;
/** Heights of the shot over the sea, metres: in the cloud, under it, low over a town. */
const IN_CLOUD_M = 1050;
const UNDER_CLOUD_M = 520;

/** What the shot is laid out on: the island's town, the way out to sea from it, and its plaza. */
export interface IslandFrame {
  readonly town: Point3;
  /** Bearing from the town out through its harbour to the sea (0 north). */
  readonly out: number;
  readonly plaza: Point3;
  /** Where ships ride off its harbour. */
  readonly anchorage: readonly [number, number];
}

const bearing = (from: readonly [number, number], to: readonly [number, number]) =>
  Math.atan2(to[0] - from[0], from[1] - to[1]);

/** The island's frame, from its city's plan, or from the middle of its outline where it has none. */
export function islandFrame(landmass: Landmass): IslandFrame {
  const ground = (x: number, y: number) => Math.max(0, landmass.heightAt(x, y) || 0);
  const outline = landmass.outline;
  const middle: [number, number] = outline.length
    ? [outline.reduce((sum, point) => sum + point[0], 0) / outline.length, outline.reduce((sum, point) => sum + point[1], 0) / outline.length]
    : [landmass.view.leftM, landmass.view.topM];
  const centre = landmass.plan?.centre ?? middle;
  const harbour = landmass.plan?.harbour ?? [centre[0] + 1, centre[1]];
  const social = landmass.nodes[0]?.centre ?? centre;
  return {
    town: [centre[0], centre[1], ground(centre[0], centre[1])],
    out: bearing(centre, harbour),
    plaza: [social[0], social[1], ground(social[0], social[1])],
    anchorage: offshore(landmass.heightAt, centre, harbour),
  };
}

/** A point `distance` along `yaw` from the town, at `height` over the sea. */
const fromTown = (frame: IslandFrame, yaw: number, distance: number, height: number): Point3 => {
  const point = around(frame.town, yaw, distance, 0);
  return [point[0], point[1], height];
};

/** A passing island's shot: out of the cloud over the sea, over the harbour toward the town, round it, back up. */
export function passingRail(frame: IslandFrame, side: 1 | -1): RailKey[] {
  const { town, out } = frame;
  const look: Point3 = [town[0], town[1], town[2] + 30];
  return [
    { at: 0, eye: fromTown(frame, out + side * 0.25, 3400, IN_CLOUD_M), look },
    { at: 3.2, eye: fromTown(frame, out + side * 0.18, 2300, UNDER_CLOUD_M), look },
    { at: 7.5, eye: fromTown(frame, out + side * 0.08, 950, town[2] + 230), look },
    { at: 10.5, eye: fromTown(frame, out - side * 0.75, 800, town[2] + 300), look },
    { at: ISLAND_S, eye: fromTown(frame, out - side * 1.3, 1700, IN_CLOUD_M), look: fromTown(frame, out - side * 1.7, 3200, IN_CLOUD_M + 80) },
  ];
}

/** The fight's island: down out of the cloud and low over the plaza, where the fight is, then up again. */
export function fightRail(frame: IslandFrame, side: 1 | -1): RailKey[] {
  const { plaza, out } = frame;
  const look: Point3 = [plaza[0], plaza[1], plaza[2] + 1.2];
  const near = (yaw: number, distance: number, height: number): Point3 => around(plaza, yaw, distance, height);
  return [
    { at: 0, eye: fromTown(frame, out + side * 0.3, 2600, IN_CLOUD_M), look },
    { at: 3.4, eye: near(out + side * 0.25, 600, 260), look },
    { at: 7, eye: near(out + side * 0.1, 26, 9), look, fov: 0.75 },
    { at: 10, eye: near(out - side * 0.9, 22, 6), look, fov: 0.75 },
    { at: ISLAND_S, eye: near(out - side * 1.4, 900, IN_CLOUD_M - plaza[2]), look: near(out - side * 1.6, 2400, IN_CLOUD_M) },
  ];
}

/** Saltmere: down out of the cloud over the open sea and in toward Overlook, to the view the title stands over. */
export function homeRail(frame: IslandFrame): RailKey[] {
  const { town, out } = frame;
  const look: Point3 = [town[0], town[1], town[2] + 45];
  return [
    { at: 0, eye: fromTown(frame, out + 0.35, 5200, IN_CLOUD_M), look },
    { at: 4, eye: fromTown(frame, out + 0.28, 3600, UNDER_CLOUD_M - 60), look },
    { at: 10, eye: fromTown(frame, out + 0.16, 1900, town[2] + 190), look },
    { at: HOME_S, eye: titleEye(frame, 0), look },
  ];
}

/** The eye the title stands over, `drift` metres along the slow drift it keeps while it waits. */
export function titleEye(frame: IslandFrame, drift: number): Point3 {
  const { town, out } = frame;
  const point = around(town, out + 0.1, 1350, 0);
  const across = out + Math.PI / 2;
  return [point[0] + Math.sin(across) * drift, point[1] - Math.cos(across) * drift, town[2] + 120];
}

/** The ships riding off an island: two under sail heading out, one at anchor; `seconds` into its shot. */
export function shipsOff(frame: IslandFrame, seconds: number): { x: number; y: number; heading: number; underWay: boolean; hull: 'brig' | 'sloop' }[] {
  const [x, y] = frame.anchorage;
  const across = frame.out + Math.PI / 2;
  const sail = (offset: number, ahead: number, heading: number, speed: number) => {
    const travelled = ahead + seconds * speed;
    return {
      x: x + Math.sin(across) * offset + Math.sin(heading) * travelled,
      y: y - Math.cos(across) * offset - Math.cos(heading) * travelled,
      heading,
    };
  };
  return [
    { ...sail(320, 250, frame.out + 0.15, 4.5), underWay: true, hull: 'brig' },
    { ...sail(-280, 600, frame.out - 0.5, 3.8), underWay: true, hull: 'sloop' },
    { ...sail(-120, -150, frame.out + 2.4, 0), underWay: false, hull: 'sloop' },
  ];
}

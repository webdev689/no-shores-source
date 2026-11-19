// The friendly ships the waters' traffic sails between the port cities, as the page draws them at sea and from land:
// asked of the waters' rules a few times a second round the eye at world time, moved smoothly between answers along
// their way, each drawn as her hull in friendly colours, her sails set and filled, posed on the swell.
import type { ShipMark } from '../plus/compass.ts';
import type { Swell } from '../rules/landRules.ts';
import { CHART_CELL_M } from '../overworld/discovery.ts';
import type { MapWaters } from '../heldmap/watersWash.ts';
import {
  LAND_CELL,
  SEAM_BIT,
  startWatersRules,
  type TrafficShip,
  type WatersGrid,
  type WatersRules,
  type WatersTable,
} from '../rules/watersRules.ts';
import type { WorldData } from './worldData.ts';
import type { SeaFrame } from './sea.ts';
import { hullSails, hullWaterline } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import { HULLS, type HullMask } from '../water/hullMask.ts';

/** The pace every friendly ship keeps, m/s (`crates/world/src/traffic.rs`). */
export const FRIENDLY_SPEED_M_S = 5;
/** How often the rules are asked where the ships are, seconds: a few times a second. */
export const ASK_EVERY_S = 0.25;
/** How fast a ship as drawn closes on where she is reckoned to be, a share a second: a turn onto her next leg is eased
 *  over about a second rather than taken at once. */
const EASE_RATE = 4;
/** Seconds a ship first seen is taken to have sailed as she is, so her sails are already set and trimmed. */
const FIRST_SEEN_S = 5;
/** How far from the eye friendly ships are drawn from land, metres. */
export const SEEN_FROM_LAND_M = 15_000;
/** The way a ship under way shows the water, m/s, as the sea's own ships do. */
const UNDER_WAY = 4;

/** World time: seconds since the Unix epoch, from the page's clock, so every machine sails the same ships. */
export const worldTimeS = (): number => Date.now() / 1000;

/** The waters as the page opens them once: their rules, and their table and grid at the held map's own cell in the
 *  map's terms. */
export interface OpenWaters {
  readonly rules: WatersRules;
  readonly map: MapWaters;
}

/** The waters' table and grid in the held map's terms: each cell's water by index, -1 on land, and the seam apart. */
export function mapWatersOf(table: WatersTable, grid: WatersGrid): MapWaters {
  const water = Int16Array.from(grid.cells, (cell) => (cell === LAND_CELL ? -1 : cell & ~SEAM_BIT));
  const seam = Uint8Array.from(grid.cells, (cell) => (cell !== LAND_CELL && (cell & SEAM_BIT) !== 0 ? 1 : 0));
  const { columns, rows, cellM } = grid;
  return { columns, rows, cellM, water, seam, waters: table.waters, mainPorts: table.mainPorts };
}

/** Opens the waters on the room's module with the world's layout and every city as a port it may sail from. */
export function openWaters(module: WebAssembly.Module, world: WorldData): OpenWaters {
  const rules = startWatersRules(module);
  const ports = world.cities.map(({ id, name, continent, centre }) => ({ id, name, continent, centre }));
  const table = rules.open(world.layoutText, ports);
  return { rules, map: mapWatersOf(table, rules.grid(CHART_CELL_M)) };
}

/** A friendly ship as drawn this frame: her id and hull, where she is and her heading (radians clockwise from north). */
export interface FriendlySailing {
  readonly id: number;
  readonly hull: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** The sea a ship rides: its swell, and how deep it is at a point. */
export interface FriendlyWater {
  readonly swell: Swell | undefined;
  depthAt(x: number, y: number): number;
}

/** A ship between answers: her last answer and when it came, how far she is drawn off where it reckons her (closing
 *  as frames go), and where she was drawn last. */
interface Track {
  answer: TrafficShip;
  answeredS: number;
  offset: { x: number; y: number; heading: number };
  x: number;
  y: number;
  heading: number;
}

const headingOf = ([east, south]: readonly [number, number]) => Math.atan2(east, -south);

/** Where a ship answered at `answeredS` is reckoned at `nowS`: on along her leg at her pace. */
export function reckoned(answer: TrafficShip, answeredS: number, nowS: number): readonly [number, number] {
  const run = FRIENDLY_SPEED_M_S * (nowS - answeredS);
  return [answer.position[0] + answer.direction[0] * run, answer.position[1] + answer.direction[1] * run];
}

/** The friendly ships round the eye, asked of the rules every `ASK_EVERY_S` and eased between answers, each one's rig
 *  kept from frame to frame. */
export class FriendlyShips {
  private readonly ask: (centre: readonly [number, number], radiusM: number, timeS: number) => TrafficShip[];
  private readonly tracks = new Map<number, Track>();
  private readonly rigs = new Map<number, SailRig>();
  private sinceAsk = Infinity;

  constructor(ask: (centre: readonly [number, number], radiusM: number, timeS: number) => TrafficShip[]) {
    this.ask = ask;
  }

  /** The ships within `radiusM` of `centre` at world time `nowS`, `seconds` on since the last frame, nearest first. */
  near(centre: readonly [number, number], radiusM: number, nowS: number, seconds: number): FriendlySailing[] {
    this.sinceAsk += seconds;
    if (this.sinceAsk >= ASK_EVERY_S) {
      this.sinceAsk = 0;
      const answered = new Map(this.ask(centre, radiusM, nowS).map((ship) => [ship.id, ship]));
      for (const id of this.tracks.keys()) if (!answered.has(id)) this.tracks.delete(id);
      for (const id of this.rigs.keys()) if (!answered.has(id)) this.rigs.delete(id);
      for (const [id, answer] of answered) {
        const track = this.tracks.get(id);
        const heading = headingOf(answer.direction);
        // A ship already drawn keeps where she was drawn: the gap to her new answer is closed over the next frames.
        const offset = track
          ? { x: track.x - answer.position[0], y: track.y - answer.position[1], heading: track.heading - heading }
          : { x: 0, y: 0, heading: 0 };
        const [x, y] = answer.position;
        this.tracks.set(id, { answer, answeredS: nowS, offset, x, y, heading });
      }
    }
    const keep = Math.exp(-seconds * EASE_RATE);
    const sailing: FriendlySailing[] = [];
    for (const [id, track] of this.tracks) {
      const { offset } = track;
      [offset.x, offset.y] = [offset.x * keep, offset.y * keep];
      offset.heading = Math.atan2(Math.sin(offset.heading), Math.cos(offset.heading)) * keep;
      const [x, y] = reckoned(track.answer, track.answeredS, nowS);
      [track.x, track.y] = [x + offset.x, y + offset.y];
      track.heading = headingOf(track.answer.direction) + offset.heading;
      sailing.push({ id, hull: track.answer.hull, x: track.x, y: track.y, heading: track.heading });
    }
    const away = (ship: FriendlySailing) => Math.hypot(ship.x - centre[0], ship.y - centre[1]);
    return sailing.sort((one, other) => away(one) - away(other));
  }

  /** Each ship as the ships layer draws her, `scale` times her size, in friendly colours, her sails set and filled by
   *  the wind blowing toward `windBearing`, posed on `water`'s swell at `time`. */
  drawn(
    ships: readonly FriendlySailing[],
    scale: number,
    water: FriendlyWater,
    windBearing: number,
    seconds: number,
    time: number,
  ): DrawnShip[] {
    return ships.map((ship) => {
      const wind = { offDeg: windOff(ship.heading, windBearing), set: true };
      let rig = this.rigs.get(ship.id);
      if (!rig) {
        rig = new SailRig(hullSails(ship.hull));
        rig.step(FIRST_SEEN_S, wind, time);
        this.rigs.set(ship.id, rig);
      }
      rig.step(seconds, wind, time);
      const { lengthM, beamM } = hullWaterline(ship.hull);
      const lies = { ...ship, underWay: true };
      const pose = poseOnSwell(water.swell, water.depthAt, lies, (lengthM / 2) * scale, (beamM / 2) * scale, time);
      const place = {
        x: ship.x,
        y: ship.y,
        z: pose.heave,
        heading: ship.heading,
        pitch: pose.pitch,
        roll: pose.roll,
        scale,
      };
      return { hull: ship.hull, place, rig, look: { side: 'friendly' as const } };
    });
  }
}

/** What a frame draws of the friendly ships: each ship, the footprints on the water with theirs among them, and the
 *  compass's marks. */
export interface FriendlyFrame {
  readonly ships: readonly DrawnShip[];
  readonly hulls: readonly HullMask[];
  readonly marks: readonly ShipMark[];
}

/** The sea at land's height `heightAt`, riding `swell`: as deep as the ground is under the sea, Infinity off the
 *  charts. */
export function waterOf(swell: Swell | undefined, heightAt: (x: number, y: number) => number): FriendlyWater {
  return {
    swell,
    depthAt: (x, y) => {
      const ground = heightAt(x, y);
      return Number.isFinite(ground) ? Math.max(0, -ground) : Infinity;
    },
  };
}

/** One frame of the friendly ships within `radiusM` of `centre`, `scale` times their size: their footprints join
 *  `hulls` (the first kept first, the rest nearest `centre` first, as many as the water holds). */
export function friendlyFrame(
  fleet: FriendlyShips,
  view: { readonly centre: readonly [number, number]; readonly radiusM: number; readonly scale: number },
  water: FriendlyWater,
  hulls: readonly HullMask[],
  seconds: number,
  time: number,
): FriendlyFrame {
  const near = fleet.near(view.centre, view.radiusM, worldTimeS(), seconds);
  const ships = fleet.drawn(near, view.scale, water, water.swell?.bearing ?? 0, seconds, time);
  const away = (mask: HullMask) => Math.hypot(mask.x - view.centre[0], mask.y - view.centre[1]);
  const [first, ...rest] = hulls;
  const others = [...rest, ...friendlyHulls(near, view.scale)].sort((one, other) => away(one) - away(other));
  return { ships, hulls: (first ? [first, ...others] : others).slice(0, HULLS), marks: friendlyMarks(near) };
}

/** Each ship's footprint on the water, `scale` times her size, under way. */
export function friendlyHulls(ships: readonly FriendlySailing[], scale: number): HullMask[] {
  return ships.map(({ x, y, heading, hull }) => {
    const { lengthM, beamM } = hullWaterline(hull);
    return { x, y, heading, halfLength: (lengthM / 2) * scale, halfBeam: (beamM / 2) * scale, way: UNDER_WAY };
  });
}

/** The compass's marks for the friendly ships; it keeps those within its own reach. */
export function friendlyMarks(ships: readonly FriendlySailing[]): ShipMark[] {
  return ships.map(({ x, y }) => ({ x, y, kind: 'friendly' }));
}

/** The waters and their friendly traffic as the game holds them: opened once a page, off the first frame (about
 *  0.6 s in WebAssembly), then the ships drawn round the eye each frame at sea and on foot. */
export class FriendlyTraffic {
  waters: OpenWaters | null = null;
  private readonly fleet = new FriendlyShips((centre, radiusM, timeS) =>
    this.waters ? this.waters.rules.shipsNear(centre, radiusM, timeS) : [],
  );

  /** Opens the waters on the room's module once it has come, after the next frame; `opened` hears them. */
  constructor(module: Promise<WebAssembly.Module>, world: WorldData, opened: (waters: OpenWaters) => void) {
    const open = () =>
      module
        .then((compiled) => opened((this.waters = openWaters(compiled, world))))
        .catch((error: unknown) => console.error('the waters could not be opened:', error));
    requestAnimationFrame(() => setTimeout(open));
  }

  /** At sea: the ships within the view's reach of hers, at the size every ship is drawn now, as hers is
   *  (`shownScale`), their footprints joining the sea's. */
  atSea(shown: SeaFrame, water: FriendlyWater, seconds: number, time: number): FriendlyFrame {
    const view = { centre: shown.focus, radiusM: shown.shot.far, scale: shown.ships[0]?.place.scale ?? 1 };
    return friendlyFrame(this.fleet, view, water, shown.hulls, seconds, time);
  }

  /** On foot: the ships within `SEEN_FROM_LAND_M` of the eye, at their true size. */
  onFoot(eye: readonly number[], water: FriendlyWater, seconds: number, time: number): FriendlyFrame {
    const view = { centre: [eye[0] ?? 0, eye[1] ?? 0] as const, radiusM: SEEN_FROM_LAND_M, scale: 1 };
    return friendlyFrame(this.fleet, view, water, [], seconds, time);
  }
}

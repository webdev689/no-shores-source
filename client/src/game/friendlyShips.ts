// The friendly ships the waters' traffic sails between the port cities, as the page draws them at sea and from land:
// asked of the waters' rules a few times a second round the eye at world time, moved smoothly between answers along
// their way, each drawn as its hull in friendly colours, its sails set and filled (furled at anchor), posed on the
// swell, with its plain crew aboard.
import type { ShipMark } from '../plus/compass.ts';
import type { Swell } from '../rules/landRules.ts';
import type { TrafficShip } from '../rules/watersRules.ts';
import type { OpenWaters } from './pageWaters.ts';
import type { SeaFrame } from './seaFrame.ts';
import { hullSails, hullWaterline } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { plainCrew } from '../ships/shipCrew.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import { HULLS, type HullMask } from '../water/hullMask.ts';

/** How often the rules are asked where the ships are, seconds: a few times a second. */
export const ASK_EVERY_S = 0.25;
/** How fast a ship as drawn closes on where it is reckoned to be, a share a second: a turn onto its next leg is eased
 *  over about a second rather than taken at once. */
const EASE_RATE = 4;
/** Seconds a ship first seen is taken to have sailed as it is, so its sails are already set and trimmed. */
const FIRST_SEEN_S = 5;
/** How far from the eye friendly ships are drawn from land, metres. */
export const SEEN_FROM_LAND_M = 15_000;
/** The way a ship under way shows the water, m/s, as the sea's own ships do. */
const UNDER_WAY = 4;

/** World time: seconds since the Unix epoch, from the page's clock, so every machine sails the same ships. */
export const worldTimeS = (): number => Date.now() / 1000;

/** A friendly ship as drawn this frame: its id and hull, where it is and its heading (radians clockwise from north),
 *  and whether it lies at anchor at its route's end. */
export interface FriendlySailing {
  readonly id: number;
  readonly hull: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly lying?: boolean;
}

/** The sea a ship rides: its swell, and how deep it is at a point. */
export interface FriendlyWater {
  readonly swell: Swell | undefined;
  depthAt(x: number, y: number): number;
}

/** A ship between answers: its last answer and when it came, and how far it is drawn off where it reckons it,
 *  closing as frames go. */
interface Track {
  answer: TrafficShip;
  answeredS: number;
  offset: { x: number; y: number; heading: number };
}

const headingOf = ([east, south]: readonly [number, number]) => Math.atan2(east, -south);

/** Whether a ship has arrived and lies at anchor at its route's end. */
const lyingOf = (answer: TrafficShip) => answer.progressM >= answer.lengthM;

/** Where a ship answered at `answeredS` is reckoned at `nowS`: on along its leg at `speedMS`, or where it lies. */
export function reckoned(
  answer: TrafficShip,
  answeredS: number,
  nowS: number,
  speedMS: number,
): readonly [number, number] {
  const run = lyingOf(answer) ? 0 : speedMS * (nowS - answeredS);
  return [answer.position[0] + answer.direction[0] * run, answer.position[1] + answer.direction[1] * run];
}

/** The friendly ships round the eye, asked of the rules every `ASK_EVERY_S` and eased between answers at the pace the
 *  waters' table gives (`speedMS`), each one's rig kept from frame to frame. */
export class FriendlyShips {
  private readonly ask: (centre: readonly [number, number], radiusM: number, timeS: number) => TrafficShip[];
  private readonly speedMS: number;
  private readonly tracks = new Map<number, Track>();
  private readonly rigs = new Map<number, SailRig>();
  private sinceAsk = Infinity;

  constructor(
    ask: (centre: readonly [number, number], radiusM: number, timeS: number) => TrafficShip[],
    speedMS: number,
  ) {
    this.ask = ask;
    this.speedMS = speedMS;
  }

  /** The ships within `radiusM` of `centre` at world time `nowS`, `seconds` on since the last frame, nearest first;
   *  none the room has `taken` off its route, which it draws where it has them. */
  near(
    centre: readonly [number, number],
    radiusM: number,
    nowS: number,
    seconds: number,
    taken: ReadonlySet<number> = new Set(),
  ): FriendlySailing[] {
    this.sinceAsk += seconds;
    if (this.sinceAsk >= ASK_EVERY_S || [...this.tracks.keys()].some((id) => taken.has(id))) {
      this.sinceAsk = 0;
      const routed = this.ask(centre, radiusM, nowS).filter((ship) => !taken.has(ship.id));
      const answered = new Map(routed.map((ship) => [ship.id, ship]));
      for (const id of this.tracks.keys()) if (!answered.has(id)) this.tracks.delete(id);
      for (const id of this.rigs.keys()) if (!answered.has(id)) this.rigs.delete(id);
      for (const [id, answer] of answered) {
        const track = this.tracks.get(id);
        const heading = headingOf(answer.direction);
        // A ship already drawn keeps where it was drawn: the gap to its new answer is closed over the next frames.
        const drawnNow = track && reckoned(track.answer, track.answeredS, nowS, this.speedMS);
        const offset =
          track && drawnNow
            ? {
                x: drawnNow[0] + track.offset.x - answer.position[0],
                y: drawnNow[1] + track.offset.y - answer.position[1],
                heading: headingOf(track.answer.direction) + track.offset.heading - heading,
              }
            : { x: 0, y: 0, heading: 0 };
        this.tracks.set(id, { answer, answeredS: nowS, offset });
      }
    }
    const keep = Math.exp(-seconds * EASE_RATE);
    const sailing: FriendlySailing[] = [];
    for (const [id, track] of this.tracks) {
      const { offset } = track;
      [offset.x, offset.y] = [offset.x * keep, offset.y * keep];
      offset.heading = Math.atan2(Math.sin(offset.heading), Math.cos(offset.heading)) * keep;
      const [x, y] = reckoned(track.answer, track.answeredS, nowS, this.speedMS);
      const heading = headingOf(track.answer.direction) + offset.heading;
      const lying = lyingOf(track.answer);
      sailing.push({ id, hull: track.answer.hull, x: x + offset.x, y: y + offset.y, heading, lying });
    }
    const away = (ship: FriendlySailing) => Math.hypot(ship.x - centre[0], ship.y - centre[1]);
    return sailing.sort((one, other) => away(one) - away(other));
  }

  /** Each ship as the ships layer draws it, `scale` times its size, in friendly colours, its sails set and filled by
   *  the wind blowing toward `windBearing` (furled at anchor), posed on `water`'s swell at `time`, its plain crew
   *  aboard. */
  drawn(
    ships: readonly FriendlySailing[],
    scale: number,
    water: FriendlyWater,
    windBearing: number,
    seconds: number,
    time: number,
  ): DrawnShip[] {
    return ships.map((ship) => {
      const wind = { offDeg: windOff(ship.heading, windBearing), set: !ship.lying };
      let rig = this.rigs.get(ship.id);
      if (!rig) {
        rig = new SailRig(hullSails(ship.hull));
        rig.step(FIRST_SEEN_S, wind, time);
        this.rigs.set(ship.id, rig);
      }
      rig.step(seconds, wind, time);
      const { lengthM, beamM } = hullWaterline(ship.hull);
      const lies = { ...ship, underWay: !ship.lying };
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
      return {
        hull: ship.hull,
        place,
        rig,
        look: { side: 'friendly' as const },
        crew: plainCrew(`friendly-${ship.id}`),
      };
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

/** A frame's time: `seconds` on since the last, at the page's `time`; and how many friendly ships of each hull the
 *  ships layer can still draw (`slots`). */
export interface FriendlyStep {
  readonly seconds: number;
  readonly time: number;
  readonly slots: (hull: number) => number;
  /** The traffic ids the room has taken off their routes. */
  readonly taken?: ReadonlySet<number>;
}

/** The nearest `slots(hull)` of each hull among `ships` (nearest first), in their order. */
function drawable(ships: readonly FriendlySailing[], slots: (hull: number) => number): FriendlySailing[] {
  const counted = new Map<number, number>();
  return ships.filter(({ hull }) => {
    const before = counted.get(hull) ?? 0;
    counted.set(hull, before + 1);
    return before < slots(hull);
  });
}

/** One frame of the friendly ships within `radiusM` of `centre`, `scale` times their size: only those the ships layer
 *  can draw are rigged, posed and footprinted, and their footprints join `hulls` (the first kept first, the rest
 *  nearest `centre` first, as many as the water holds). The compass hears of every one. */
export function friendlyFrame(
  fleet: FriendlyShips,
  view: { readonly centre: readonly [number, number]; readonly radiusM: number; readonly scale: number },
  water: FriendlyWater,
  hulls: readonly HullMask[],
  step: FriendlyStep,
): FriendlyFrame {
  const { seconds, time } = step;
  const near = fleet.near(view.centre, view.radiusM, worldTimeS(), seconds, step.taken);
  const drawn = drawable(near, step.slots);
  const ships = fleet.drawn(drawn, view.scale, water, water.swell?.bearing ?? 0, seconds, time);
  const away = (mask: HullMask) => Math.hypot(mask.x - view.centre[0], mask.y - view.centre[1]);
  const [first, ...rest] = hulls;
  const others = [...rest, ...friendlyHulls(drawn, view.scale)].sort((one, other) => away(one) - away(other));
  return { ships, hulls: (first ? [first, ...others] : others).slice(0, HULLS), marks: friendlyMarks(near) };
}

/** Each ship's footprint on the water, `scale` times its size: under way, or still at anchor. */
export function friendlyHulls(ships: readonly FriendlySailing[], scale: number): HullMask[] {
  return ships.map(({ id, x, y, heading, hull, lying }) => {
    const { lengthM, beamM } = hullWaterline(hull);
    const way = lying ? 0 : UNDER_WAY;
    const [halfLength, halfBeam] = [(lengthM / 2) * scale, (beamM / 2) * scale];
    return { id: `friendly ${id}`, x, y, heading, halfLength, halfBeam, way };
  });
}

/** The compass's marks for the friendly ships; it keeps those within its own reach. */
export function friendlyMarks(ships: readonly FriendlySailing[]): ShipMark[] {
  return ships.map(({ x, y }) => ({ x, y, kind: 'friendly' }));
}

/** The friendly traffic as the game holds it: none until the page's one opening of the waters, then the ships drawn
 *  round the eye each frame at sea and on foot, at most `perHull` of each hull with the room's own among them. */
export class FriendlyTraffic {
  private fleet: FriendlyShips | null = null;
  private readonly perHull: number;

  constructor(waters: Promise<OpenWaters>, perHull: number) {
    this.perHull = perHull;
    const ask =
      ({ rules }: OpenWaters) =>
      (centre: readonly [number, number], radiusM: number, timeS: number) =>
        rules.shipsNear(centre, radiusM, timeS);
    void waters.then(
      (open) => (this.fleet = new FriendlyShips(ask(open), open.table.friendlySpeedMS)),
      () => undefined,
    );
  }

  /** At sea: the ships within the view's reach of the player's, at the size every ship is drawn now, as the player's is
   *  (`shownScale`), their footprints joining the sea's, as many of each hull as the room's own leave room for; none
   *  the room has `taken`, which the sea draws where the room has them. */
  atSea(
    shown: SeaFrame,
    water: FriendlyWater,
    { seconds, time, taken }: { readonly seconds: number; readonly time: number; readonly taken: ReadonlySet<number> },
  ): FriendlyFrame {
    if (!this.fleet) return { ships: [], hulls: shown.hulls, marks: [] };
    const view = { centre: shown.focus, radiusM: shown.shot.far, scale: shown.ships[0]?.place.scale ?? 1 };
    const slots = (hull: number) => this.perHull - shown.ships.filter((ship) => ship.hull === hull).length;
    return friendlyFrame(this.fleet, view, water, shown.hulls, { seconds, time, slots, taken });
  }

  /** On foot: the ships within `SEEN_FROM_LAND_M` of the eye, at their true size. */
  onFoot(eye: readonly number[], water: FriendlyWater, seconds: number, time: number): FriendlyFrame {
    if (!this.fleet) return { ships: [], hulls: [], marks: [] };
    const view = { centre: [eye[0] ?? 0, eye[1] ?? 0] as const, radiusM: SEEN_FROM_LAND_M, scale: 1 };
    return friendlyFrame(this.fleet, view, water, [], { seconds, time, slots: () => this.perHull });
  }
}

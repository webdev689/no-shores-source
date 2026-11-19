// The prologue's ambush: captains set upon the player's Brig where the story places them, fought by the game's own
// sea fight (SeaCombat, the World Editor's aim, lay, effects and panel) on the land worker's fight door. The rules
// sail every ship as a Sloop; the player's is drawn as the Brig, and every ship is posed on the swell the story
// hands it (a storm's, maybe), for the drawing only.
import type { FightSource } from '../../editor/fighting.ts';
import type { MarkDrawer } from '../../editor/naval.ts';
import { SAILS_RUNG } from '../../editor/sailing.ts';
import type { CaptainAt, FightEvent, FightVessel } from '../../rules/fightRules.ts';
import type { Swell } from '../../rules/landRules.ts';
import { SailRig, type SailCorners, windOff } from '../../ships/sails.ts';
import type { ShipBar } from '../../ships/shipBars.ts';
import { shipSails, shipWaterline, type Waterline } from '../../ships/shipMesh.ts';
import type { ShipCamera, ShipPlace } from '../../ships/shipView.ts';
import { poseOnSwell } from '../../ships/swellPose.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { HullMask } from '../../water/hullMask.ts';
import type { Shot } from '../camera.ts';
import { SeaCombat } from '../seaCombat.ts';

/** A captain the story sets upon her: her bearing off the player's bow (radians, to starboard), how far off (metres),
 *  her faction (1 the Grey Tithe, 2 pirates) and rank (1 Minor to 5 Boss), and her heading (radians clockwise from
 *  north; straight for the player when not given). */
export interface Ambusher {
  readonly bearing: number;
  readonly distanceM: number;
  readonly faction: 1 | 2;
  readonly rank: number;
  readonly heading?: number;
}

/** What the story reacts to: a ball striking her, her ball striking a captain, a captain going down, one sunk. */
export type Happening = 'hit-taken' | 'hit-given' | 'sinking' | 'sunk';

/** One frame of the ambush: the camera's shot, every ship as drawn (hers first, the Brig; then each captain's Sloop,
 *  darker), their footprints, the captains' bars, the panel's lines, what happened since the last frame, how many
 *  captains are still afloat, and whether every one has sunk. */
export interface StoryFightFrame {
  readonly shot: Shot;
  readonly ships: readonly {
    place: ShipPlace;
    hull: 'own' | 'captain';
    shade: number;
    rig: SailRig;
    sunk: boolean;
  }[];
  readonly hulls: readonly HullMask[];
  readonly bars: readonly ShipBar[];
  readonly lines: readonly string[];
  readonly happened: readonly Happening[];
  readonly afloat: number;
  readonly over: boolean;
}

/** The story's fight is the same every time it is fought. */
const STORY_SEED = 1;
/** A captain's Sloop is drawn darker, as in the World Editor. */
const CAPTAIN_SHADE = 0.55;
/** The way a ship's foam shows round her bow, m/s. */
const UNDER_WAY = 2;
/** The player's ship as drawn, and every captain's. */
const OWN_HULL = 'brig';
const CAPTAIN_HULL = 'sloop';

/** Where each ambusher is put to sea round the player's ship, as the fight door takes her. */
export function ambushersAt(
  ship: { readonly x: number; readonly y: number; readonly heading: number },
  ambushers: readonly Ambusher[],
): CaptainAt[] {
  return ambushers.map((ambusher) => {
    const bearing = ship.heading + ambusher.bearing;
    // Metres east and south: north is -y.
    const x = ship.x + Math.sin(bearing) * ambusher.distanceM;
    const y = ship.y - Math.cos(bearing) * ambusher.distanceM;
    const toward = Math.atan2(ship.x - x, y - ship.y);
    const heading = ambusher.heading ?? (toward + 2 * Math.PI) % (2 * Math.PI);
    return { x, y, heading, faction: ambusher.faction, rank: ambusher.rank };
  });
}

/** What the story reacts to among a fight view's events, in their order. Ship 0 is the player's. */
export function happenedOf(events: readonly FightEvent[]): Happening[] {
  return events.flatMap((event): Happening[] => {
    if (event.kind === 'hit' && event.ship === 0) return ['hit-taken'];
    if (event.kind === 'hit' && event.by === 0) return ['hit-given'];
    if (event.kind === 'state' && event.ship !== 0 && (event.state === 'sinking' || event.state === 'sunk'))
      return [event.state];
    return [];
  });
}

/** The ambush: the sea fight on the land worker's door, every event it answers kept for the story, and each ship's
 *  rig, hers the Brig's and each captain's a Sloop's. */
export class StoryFight {
  private readonly land: LandWorker;
  private readonly combat: SeaCombat;
  private readonly heard: FightEvent[];
  private readonly sloopSails: readonly SailCorners[];
  private readonly ownRig = new SailRig(shipSails(OWN_HULL));
  private readonly captainRigs: SailRig[] = [];
  private readonly waterlines: Readonly<Record<'own' | 'captain', Waterline>> = {
    own: shipWaterline(OWN_HULL),
    captain: shipWaterline(CAPTAIN_HULL),
  };
  private failure: unknown = null;

  private constructor(land: LandWorker, combat: SeaCombat, heard: FightEvent[], sloopSails: readonly SailCorners[]) {
    this.land = land;
    this.combat = combat;
    this.heard = heard;
    this.sloopSails = sloopSails;
  }

  /** Sets `ambushers` upon her `ship` on the land worker's open landmass at `now`, every captain's Sloop drawn with
   *  `hull`'s sails and the fight's balls and arcs with its marks. */
  static async begin(
    land: LandWorker,
    ship: { x: number; y: number; heading: number },
    ambushers: readonly Ambusher[],
    hull: { sails: readonly SailCorners[]; marks: MarkDrawer },
    now: number,
  ): Promise<StoryFight> {
    const floats = new Float64Array([ship.x, ship.y, ship.heading, 0, 0, 0, 0, 0]);
    const first = await land.fightBegin(floats, STORY_SEED, now, ambushersAt(ship, ambushers));
    const heard: FightEvent[] = [];
    const source: FightSource = {
      fightBegin: () => Promise.reject(new Error('the story begins its own fight')),
      fightStep: async (_id, orders, time, ticks) => {
        const view = await land.fightStep(orders, time, ticks);
        heard.push(...view.events);
        return view;
      },
      fightEnd: () => land.fightEnd(),
    };
    return new StoryFight(land, new SeaCombat(source, first, hull.marks, hull.sails, now), heard, hull.sails);
  }

  /** One frame, `seconds` on at `time`: the fight steps, drawing to `far`, every ship drawn `drawnScale` times her
   *  size on `swell`. A step the rules refused is thrown here. */
  frame(input: {
    seconds: number;
    time: number;
    far: number;
    swell: Swell | undefined;
    drawnScale?: number;
  }): StoryFightFrame {
    if (this.failure !== null) throw this.failure;
    const scale = input.drawnScale ?? 1;
    const shot = this.combat.frame(input.seconds, input.time, input.far, (error) => {
      this.failure = error;
    });
    const view = this.combat.view;
    const captains = this.combat.captains;
    while (this.captainRigs.length < captains.length) this.captainRigs.push(new SailRig(this.sloopSails));
    const windBearing = input.swell?.bearing ?? 0;
    const drawn = (vessel: FightVessel, hull: 'own' | 'captain', rig: SailRig) => {
      const [x = 0, y = 0, heading = 0, , , , , rung = 0] = vessel.ship;
      rig.step(input.seconds, { offDeg: windOff(heading, windBearing), set: rung === SAILS_RUNG }, input.time);
      const { lengthM, beamM } = this.waterlines[hull];
      const lies = { x, y, heading };
      const swell = poseOnSwell(
        input.swell,
        () => Infinity,
        lies,
        (lengthM / 2) * scale,
        (beamM / 2) * scale,
        input.time,
      );
      // Going down, she settles and lists as the rules have her, on the swell's heave.
      const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
      const going = vessel.state === 'sinking' || vessel.state === 'sunk';
      const pose = going ? { heave: swell.heave + heave, pitch, roll } : swell;
      const place = { x, y, z: pose.heave, heading, pitch: pose.pitch, roll: pose.roll, scale };
      const shade = hull === 'own' ? 1 : CAPTAIN_SHADE;
      return { place, hull, shade, rig, sunk: vessel.state === 'sunk' };
    };
    const ships = [
      drawn(view.player, 'own', this.ownRig),
      ...captains.map((captain, index) => drawn(captain, 'captain', this.captainRigs[index] ?? this.ownRig)),
    ];
    const happened = happenedOf(this.heard.splice(0));
    const afloat = captains.filter((captain) => captain.state !== 'sinking' && captain.state !== 'sunk').length;
    return {
      shot,
      ships,
      hulls: this.hulls(view.player, captains, scale),
      bars: this.combat.bars(scale),
      lines: this.combat.lines(input.time),
      happened,
      afloat,
      over: captains.every((captain) => captain.state === 'sunk'),
    };
  }

  /** Each afloat ship's footprint on the water: hers the Brig's, each captain's a Sloop's. */
  private hulls(player: FightVessel, captains: readonly FightVessel[], scale: number): HullMask[] {
    const hull = (vessel: FightVessel, kind: 'own' | 'captain'): HullMask[] => {
      if (vessel.state === 'sinking' || vessel.state === 'sunk') return [];
      const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
      const way = Math.hypot(ahead, abeam) > 0.5 ? UNDER_WAY : 0;
      const { lengthM, beamM } = this.waterlines[kind];
      return [{ x, y, heading, halfLength: (lengthM / 2) * scale, halfBeam: (beamM / 2) * scale, way }];
    };
    return [...hull(player, 'own'), ...captains.flatMap((captain) => hull(captain, 'captain'))];
  }

  /** A key down or up; answers whether the fight takes it (SeaCombat.key). */
  key(key: string, down: boolean): boolean {
    return this.combat.key(key, down);
  }

  drag(right: number, down: number): void {
    this.combat.drag(right, down);
  }

  aim(held: boolean): void {
    this.combat.aim(held);
  }

  holdFire(): void {
    this.combat.holdFire();
  }

  wheel(steps: number): void {
    this.combat.wheel(steps);
  }

  /** The balls aloft, the lay's arcs and the effects, as SeaCombat draws them. */
  draw(pass: GPURenderPassEncoder, camera: ShipCamera, time: number): void {
    this.combat.draw(pass, camera, time);
  }

  /** Ends the fight on the land worker: the captains and their balls are gone. */
  end(): Promise<void> {
    return this.land.fightEnd();
  }
}

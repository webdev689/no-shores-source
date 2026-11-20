// The prologue's ambush: captains set upon the player's Brig where the story places them, fought by the game's own
// sea fight (SeaCombat, the World Editor's aim, lay, effects and panel) on the land worker's fight door. The rules
// sail every ship as a Sloop; the player's is drawn as the Brig, and every ship is posed on the swell the story
// hands it (a storm's, maybe), for the drawing only.
import type { FightSource } from '../../editor/fighting.ts';
import type { SeaFightModel } from '../../plus/seaFight.ts';
import type { MarkDrawer } from '../../editor/naval.ts';
import { SAILS_RUNG } from '../../editor/sailing.ts';
import type { CaptainAt, FightCaptain, FightEvent, FightVessel, FightView, ShipState } from '../../rules/fightRules.ts';
import type { Swell } from '../../rules/landRules.ts';
import { SailRig, type SailCorners, windOff } from '../../ships/sails.ts';
import type { ShipBar } from '../../ships/shipBars.ts';
import { shipSails, shipWaterline, type Waterline } from '../../ships/shipMesh.ts';
import type { ShipCamera, ShipPlace } from '../../ships/shipView.ts';
import { poseOnSwell } from '../../ships/swellPose.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { HullMask } from '../../water/hullMask.ts';
import type { Founder } from './sailing.ts';
import type { FightHeard } from '../audio/ambience/seaFight.ts';
import type { Shot } from '../camera.ts';
import { SeaCombat } from '../seaCombat.ts';
import type { FightReadout } from '../seaPanel.ts';

/** A captain the story sets upon the player: its bearing off the player's bow (radians, to starboard), how far off
 *  (metres), its faction (1 the Grey Tithe, 2 pirates) and rank (1 Minor to 5 Boss), and its heading (radians
 *  clockwise from north; straight for the player when not given), and its way (m/s) if it comes on under sail. */
export interface Ambusher {
  readonly bearing: number;
  readonly distanceM: number;
  readonly faction: 1 | 2;
  readonly rank: number;
  readonly heading?: number;
  readonly way?: number;
}

/** The rigs a fight's ships begin with, as another drawing left them: the player's (else a new one), then each
 *  captain's. */
export interface Rigs {
  readonly own?: SailRig;
  readonly captains: readonly SailRig[];
}

/** A captain's Sloop going down, as the rules last sent it: how it will lie once sunk, and in how many seconds. */
export interface Going {
  readonly sunk: Founder;
  readonly inS: number;
}

/** What the story reacts to: a ball striking the player's ship, its ball striking a captain, a captain going down,
 *  one sunk. */
export type Happening = 'hit-taken' | 'hit-given' | 'sinking' | 'sunk';

/** One frame of the ambush: the camera's shot, every ship as drawn (the player's first, the Brig; then each captain's
 *  Sloop, darker) with its state, their footprints, the captains' bars, the fight's readout and what the tracker
 *  counts of it, what happened since the last frame, how many captains are still to beat (afloat and fighting), and
 *  whether the fight is over: every captain beaten, sunk or struck. */
export interface StoryFightFrame {
  readonly shot: Shot;
  readonly ships: readonly {
    place: ShipPlace;
    hull: 'own' | 'captain';
    shade: number;
    rig: SailRig;
    state: ShipState;
    sunk: boolean;
    founder: Founder;
    going: Going | null;
  }[];
  readonly hulls: readonly HullMask[];
  readonly bars: readonly ShipBar[];
  /** The fight's readout, as the sea's display shows it. */
  readonly display: SeaFightModel | null;
  /** What the tracker counts and the toasts say of the fight. */
  readonly readout: FightReadout;
  readonly happened: readonly Happening[];
  readonly over: boolean;
}

/** A whole turn, radians. */
const TURN = 2 * Math.PI;
/** The story's fight is the same every time it is fought. */
const STORY_SEED = 1;
/** A captain's ship is drawn darker, as in the World Editor. */
export const CAPTAIN_SHADE = 0.55;
/** The way a ship's foam shows round its bow, m/s. */
const UNDER_WAY = 2;
/** The player's ship as drawn, and every captain's. */
const OWN_HULL = 'brig';
const CAPTAIN_HULL = 'sloop';

/** Where each ambusher is put to sea round the player's ship, as the fight door takes it. */
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
    const way = ambusher.way ? { way: ambusher.way } : {};
    return { x, y, heading, faction: ambusher.faction, rank: ambusher.rank, ...way };
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
 *  rig, the player's ship's the Brig's and each captain's a Sloop's. */
export class StoryFight {
  private readonly land: LandWorker;
  private readonly combat: SeaCombat;
  private readonly heard: FightEvent[];
  private readonly answered: { latest: FightView };
  private readonly sloopSails: readonly SailCorners[];
  private readonly ownRig: SailRig;
  private readonly captainRigs: SailRig[];
  private readonly waterlines: Readonly<Record<'own' | 'captain', Waterline>> = {
    own: shipWaterline(OWN_HULL),
    captain: shipWaterline(CAPTAIN_HULL),
  };
  private failure: unknown = null;

  private constructor(
    land: LandWorker,
    combat: SeaCombat,
    rules: { heard: FightEvent[]; answered: { latest: FightView } },
    sloopSails: readonly SailCorners[],
    rigs: Rigs,
  ) {
    this.land = land;
    this.combat = combat;
    this.heard = rules.heard;
    this.answered = rules.answered;
    this.sloopSails = sloopSails;
    this.ownRig = rigs.own ?? new SailRig(shipSails(OWN_HULL));
    this.captainRigs = [...rigs.captains];
  }

  /** Sets `ambushers` upon the player's `ship` on the land worker's open landmass at `now`, every captain's Sloop
   *  drawn with `hull`'s sails and the fight's balls and arcs with its marks. A ship coming on with `way` (m/s) comes
   *  under sail; each ship's sails go on from the rig `rigs` hands it (the player's, then each ambusher's), as last
   *  drawn. Every ship sails in the story's `wind` (m/s east and south), the storm drawn round it, never the world's. */
  static async begin(
    land: LandWorker,
    ship: { x: number; y: number; heading: number; way?: number },
    ambushers: readonly Ambusher[],
    hull: { sails: readonly SailCorners[]; marks: MarkDrawer },
    now: number,
    wind: () => readonly [number, number],
    rigs: Rigs = { captains: [] },
  ): Promise<StoryFight> {
    // The rules take a heading in [0, 2π) alone; the sea's may have turned past either end.
    const heading = ((ship.heading % TURN) + TURN) % TURN;
    const way = Math.max(0, ship.way ?? 0);
    const rung = way > 0 ? SAILS_RUNG : 0;
    const floats = new Float64Array([ship.x, ship.y, heading < TURN ? heading : 0, way, 0, 0, way, rung]);
    const first = await land.fightBegin(floats, STORY_SEED, now, ambushersAt(ship, ambushers));
    const heard: FightEvent[] = [];
    // The sea fight lets go of the rules' last answer the frame it is over: the story keeps it.
    const answered = { latest: first };
    const source: FightSource = {
      fightBegin: () => Promise.reject(new Error('the story begins its own fight')),
      fightStep: async (_id, orders, time, ticks) => {
        const view = await land.fightStep(orders, time, ticks, wind());
        heard.push(...view.events);
        answered.latest = view;
        return view;
      },
      fightEnd: () => land.fightEnd(),
    };
    const combat = new SeaCombat({ source, own: 'Brig' }, first, hull.marks, now);
    return new StoryFight(land, combat, { heard, answered }, hull.sails, rigs);
  }

  /** One frame, `seconds` on at `time`: the fight steps, drawing to `far`, every ship drawn `drawnScale` times its
   *  size on `swell`. A step the rules refused is thrown here. */
  /** The fight's events this frame and its ships as they lie, as the sea's sounds hear them. */
  get fightHeard(): FightHeard {
    return this.combat.heard;
  }

  /** The fight's two sides, as the music hears them: every captain in it, and the player's own vessel. */
  get sides(): { readonly captains: readonly FightCaptain[]; readonly vessel: FightVessel } {
    const view = this.answered.latest;
    return { captains: [view.captain, ...(view.others ?? [])], vessel: view.player };
  }

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
    const view = this.answered.latest;
    const captains = [view.captain, ...(view.others ?? [])];
    while (this.captainRigs.length < captains.length) this.captainRigs.push(new SailRig(this.sloopSails));
    const windBearing = input.swell?.bearing ?? 0;
    const drawn = (vessel: FightVessel | FightCaptain, hull: 'own' | 'captain', rig: SailRig) => {
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
      // Its hurts and its going down settle, trim and list it as the rules have it, on the swell drawn here: the
      // rules' own pose rides a swell of theirs, so taking it as it goes down would jump it.
      const [settled, trim, list] = 'founder' in vessel && vessel.founder ? vessel.founder : [0, 0, 0];
      const place = {
        x,
        y,
        z: swell.heave - settled * scale,
        heading,
        pitch: swell.pitch + trim,
        roll: swell.roll + list,
        scale,
      };
      const shade = hull === 'own' ? 1 : CAPTAIN_SHADE;
      const going =
        'sunk_founder' in vessel && vessel.sunk_founder && vessel.sinks_in !== undefined
          ? { sunk: vessel.sunk_founder, inS: vessel.sinks_in }
          : null;
      const founder: Founder = [settled, trim, list];
      return { place, hull, shade, rig, state: vessel.state, sunk: vessel.state === 'sunk', founder, going };
    };
    const ships = [
      drawn(view.player, 'own', this.ownRig),
      ...captains.map((captain, index) => drawn(captain, 'captain', this.captainRigs[index] ?? this.ownRig)),
    ];
    const happened = happenedOf(this.heard.splice(0));
    return {
      shot,
      ships,
      hulls: this.hulls(view.player, captains, scale),
      bars: this.combat.bars(scale),
      display: this.combat.display(input.time),
      readout: this.combat.readout(input.time),
      happened,
      over: view.over !== null,
    };
  }

  /** Each afloat ship's footprint on the water: the player's ship's the Brig's, each captain's a Sloop's. */
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
    this.combat.wheel(steps, performance.now() / 1000);
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

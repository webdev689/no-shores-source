import type { FightLay } from '../rules/fightRules.ts';
import { type AimView, aimViewOf } from '../ships/aimView.ts';
import type { FleetLay, FleetLook } from '../rules/fleetRules.ts';
import type { LandView } from '../rules/landRules.ts';
import type { Mark, Splash } from '../ships/effects.ts';
import { type FeelShip, FightFeel } from '../ships/fightFeel.ts';
import { factionSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { barOver, type ShipBar, shipName } from '../ships/shipBars.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera, ShipPlace } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FleetInput, FleetVessel } from './fleetLink.ts';
import type { FleetSloop } from './fleetPlay.ts';
import { AimCamera } from './aimCamera.ts';
import { aimOf, easedAimOf, type MarkDrawer, SHIP_RUNG } from './naval.ts';
import type { Orbit } from './orbit.ts';
import { SAILS_RUNG } from './sailing.ts';

/** Another player's Sloop is drawn this light: the same model as the player's own. */
const OTHER_SHADE = 0.85;
/** A ball is drawn this many times its size, to be seen. */
const BALL_DRAWN = 2;
const BALL = [0.12, 0.12, 0.12] as const;

/** A lay as the aim draws it. */
function aimLay(lay: FleetLay | null): FightLay | null {
  if (!lay) return null;
  const ends = lay.ends.map((end) => end && { ...end });
  const { side, launches, elevation, reach, radius, spread, onTarget } = lay;
  return { side, launches, elevation, reach, ends, radius, spread, on_target: onTarget };
}

/** Where a ship the room shows is drawn in the window, its height scaled as the land is drawn. */
function placeOf(vessel: FleetVessel, view: LandView, shown: number): ShipPlace {
  const [x = 0, y = 0, heading = 0] = vessel.ship;
  const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
  return { x: x - view.leftM, y: y - view.topM, z: heave * shown, heading, pitch, roll };
}

/** The owner's Sloop in a fleet room, as the World Editor shows it: its session's orders and prediction (`FleetSloop`),
 *  every other ship the room shows, the balls aloft, its look's lay, and the fight's effects. */
export class FleetScene {
  readonly play: FleetSloop;
  private readonly marks: MarkDrawer;
  private readonly shown: (hull: number) => number;
  private readonly feel = new FightFeel(7);
  /** The wind's bearing the sails were last stepped in. */
  private windBearing = 0;
  private lay: FleetLay | null = null;
  /** Each other ship's rig by its number, for the hull it sails. */
  private readonly rigs = new Map<number, { readonly hull: number; readonly rig: SailRig }>();
  /** What draws its lay's aim over the water, where the marks' device can, and the eye it is laid from. */
  private readonly aimView: AimView | null;
  private readonly aimEye = new AimCamera();
  /** The look the aim laid at its last frame, while it lays one. */
  private aimed: FleetLook | null = null;

  constructor(play: FleetSloop, marks: MarkDrawer, shown: (hull: number) => number = (hull) => hull) {
    this.play = play;
    this.marks = marks;
    this.aimView = marks.gpu ? aimViewOf(marks.gpu) : null;
    this.shown = shown;
  }

  /** The hull a ship the room shows is drawn as: a captain's as the room names it, another player's the Sloop. */
  private hullOf(vessel: FleetVessel): number {
    return vessel.captain ? this.shown(hullOfCaptain(vessel)) : SLOOP_HULL;
  }

  /** The look the aim camera laid at its last frame (`aimCamera`), while it lays one. */
  look(): FleetLook | null {
    return this.aimed;
  }

  /** The camera `seconds` on: eased to its battery while `aiming` and its guns can speak, and home again; the look it
   *  lays is kept for the next step (`look`). */
  aimCamera(orbit: Orbit, view: LandView, shown: number, aiming: boolean, seconds: number): Orbit {
    const speaks = aiming && this.play.session.own()?.state === 'afloat';
    const how = { shown, aiming: speaks };
    const aimed = easedAimOf(this.aimEye, orbit, this.play, view, how, this.lay, seconds);
    this.aimed = aimed.look;
    return aimed.orbit;
  }

  /** One frame: its orders owed and sent, its look's lay laid, the room's events made effects and fires burned. Answers
   *  the water's pushes. */
  step(seconds: number, input: FleetInput, now: number, view: LandView): Splash[] {
    this.play.advance(seconds, input, now);
    this.lay = input.look ? this.play.lay(input.look, now) : null;
    const toWindow = (point: readonly [number, number, number]) =>
      [point[0] - view.leftM, point[1] - view.topM, point[2]] as const;
    return this.feel.frame({
      events: this.play.takeEvents(),
      ships: this.feelShips(),
      balls: this.play.balls(now).map(([x = 0, y = 0, z = 0, radius = 0]) => [x, y, z, radius] as const),
      now,
      seconds,
      windBearing: this.windBearing,
      toWindow,
    });
  }

  /** Every ship the room shows, by its number, as the fight's feel sees it: the player's, each other with its rig. */
  private feelShips(): Map<number, FeelShip> {
    const own = this.play.session.own();
    const ships = new Map<number, FeelShip>();
    for (const vessel of own ? [own, ...this.play.others()] : this.play.others()) {
      const hull = vessel === own ? SLOOP_HULL : this.hullOf(vessel);
      const fight = { ...vessel, sail: vessel.hurts.sail, max_sail: vessel.hurts.maxSail };
      const rig = vessel === own ? null : (this.rigs.get(vessel.id)?.rig ?? null);
      const side = vessel.captain ? factionSide(vessel.faction) : ('player' as const);
      ships.set(vessel.id, { vessel: fight, rig, hull, side });
    }
    return ships;
  }

  /** Every other ship's footprint on the water while it floats, at its hull's waterline. */
  hulls(view: LandView): HullMask[] {
    return this.play
      .others()
      .filter((vessel) => vessel.state !== 'sinking' && vessel.state !== 'sunk')
      .map((vessel) => {
        const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
        const waterline = hullWaterline(this.hullOf(vessel));
        return {
          id: `fleet ${vessel.id}`,
          x: x - view.leftM,
          y: y - view.topM,
          heading,
          halfLength: waterline.lengthM / 2,
          halfBeam: waterline.beamM / 2,
          way: Math.hypot(ahead, abeam),
        };
      });
  }

  /** Every other ship afloat, heights as drawn: a captain's in its hull and its faction's colours, another player's
   *  Sloop a little darker than the player's; each one's sails stepped `seconds` on in the wind blowing toward `bearing`. */
  ships(
    view: LandView,
    shown: number,
    wind: { readonly bearing: number; readonly seconds: number },
    now: number,
  ): DrawnShip[] {
    const others = this.play.others();
    const sailing = new Set(others.map((vessel) => vessel.id));
    for (const id of this.rigs.keys()) if (!sailing.has(id)) this.rigs.delete(id);
    this.windBearing = wind.bearing;
    return others.flatMap((vessel) => {
      if (vessel.state === 'sunk') return [];
      const hull = this.hullOf(vessel);
      let rigged = this.rigs.get(vessel.id);
      if (!rigged || rigged.hull !== hull) {
        rigged = { hull, rig: new SailRig(hullSails(hull)) };
        this.rigs.set(vessel.id, rigged);
      }
      const place = placeOf(vessel, view, shown);
      const set = vessel.ship[SHIP_RUNG] === SAILS_RUNG;
      rigged.rig.step(wind.seconds, { offDeg: windOff(place.heading, wind.bearing), set }, now);
      const look = vessel.captain
        ? { side: factionSide(vessel.faction) }
        : { side: 'player' as const, shade: OTHER_SHADE };
      return [{ hull, place, rig: rigged.rig, look }];
    });
  }

  /** Draws the balls aloft and the effects, heights as drawn (its lay is `drawAimOver`'s). */
  draw(pass: GPURenderPassEncoder, view: LandView, shown: number, camera: ShipCamera, now: number): void {
    const marks: Mark[] = this.feel.marks(now).map((mark) => ({ ...mark, z: mark.z * shown }));
    const ships = this.feelShips();
    marks.push(
      ...this.feel.scars(
        this.play.others().map((vessel) => {
          const ship = ships.get(vessel.id);
          return ship && vessel.state !== 'sunk' ? { ship, place: placeOf(vessel, view, shown) } : null;
        }),
      ),
    );
    for (const [x, y, z, radius] of this.play.balls(now))
      marks.push({ x: x - view.leftM, y: y - view.topM, z: z * shown, radius: radius * BALL_DRAWN, colour: BALL });
    this.marks.drawInto(pass, marks, camera);
  }

  /** Draws its lay's aim (`aimOf`) over a finished picture, after the water, hidden where `depth` stands nearer;
   *  heights as drawn. */
  drawAimOver(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTexture,
    view: LandView,
    shown: number,
    camera: ShipCamera,
    now: number,
  ): void {
    const own = this.play.session.own();
    const guns = own && { left: own.guns.left, braced: own.braced };
    const aim = own && guns && aimOf(aimLay(this.lay), { state: own.state, guns }, view, shown);
    if (aim) this.aimView?.drawOver(encoder, target, depth, aim, camera, now);
  }

  /** Each captain's bar over its hull's masthead, heights as drawn. */
  bars(view: LandView, shown: number): ShipBar[] {
    return this.play
      .others()
      .filter((vessel) => vessel.captain)
      .map((vessel) =>
        barOver(
          { ...vessel, ...vessel.hurts, name: shipName(vessel.faction, vessel.hull) },
          view,
          shown,
          plateOverM(this.hullOf(vessel)),
        ),
      )
      .filter((bar) => bar !== null);
  }

  /** The panel's lines. */
  lines(now: number): string[] {
    return this.play.lines(now, this.lay);
  }
}

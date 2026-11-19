import type { FightLay, FightLook } from '../rules/fightRules.ts';
import type { FleetLay } from '../rules/fleetRules.ts';
import type { LandView } from '../rules/landRules.ts';
import { Effects, type Mark, type Splash } from '../ships/effects.ts';
import { factionSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, plateOverM, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { barOver, type ShipBar, shipName } from '../ships/shipBars.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipCamera, ShipPlace } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FleetInput, FleetVessel } from './fleetLink.ts';
import type { FleetSloop } from './fleetPlay.ts';
import { aimCameraOf, arcsOf, DECK_M, lookOf, type MarkDrawer, SHIP_RUNG } from './naval.ts';
import type { Orbit } from './orbit.ts';
import { SAILS_RUNG } from './sailing.ts';

/** Another player's Sloop is drawn this light: the same model as hers. */
const OTHER_SHADE = 0.85;
/** A ball is drawn this many times its size, to be seen. */
const BALL_DRAWN = 2;
const BALL = [0.12, 0.12, 0.12] as const;

/** The hull a ship the room shows sails: a captain's as the room names it, another player's the Sloop. */
const hullOf = (vessel: FleetVessel): number => (vessel.captain ? hullOfCaptain(vessel) : SLOOP_HULL);

/** A lay as the editor's arcs draw it. */
function arcsLay(lay: FleetLay | null): FightLay | null {
  if (!lay) return null;
  const ends = lay.ends.map((end) => end && { ...end });
  const { side, launches, elevation, reach, radius, onTarget } = lay;
  return { side, launches, elevation, reach, ends, radius, on_target: onTarget };
}

/** Where a ship the room shows is drawn in the window, her height scaled as the land is drawn. */
function placeOf(vessel: FleetVessel, view: LandView, shown: number): ShipPlace {
  const [x = 0, y = 0, heading = 0] = vessel.ship;
  const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
  return { x: x - view.leftM, y: y - view.topM, z: heave * shown, heading, pitch, roll };
}

/** The owner's Sloop in a fleet room, as the World Editor shows her: her session's orders and prediction (`FleetSloop`),
 *  every other ship the room shows, the balls aloft, her look's lay, and the fight's effects. */
export class FleetScene {
  readonly play: FleetSloop;
  private readonly marks: MarkDrawer;
  private readonly effects = new Effects(7);
  private lay: FleetLay | null = null;
  /** Each other ship's rig by her number, for the hull she sails. */
  private readonly rigs = new Map<number, { readonly hull: number; readonly rig: SailRig }>();

  constructor(play: FleetSloop, marks: MarkDrawer) {
    this.play = play;
    this.marks = marks;
  }

  /** The look the camera lays while aiming from her. */
  look(orbit: Orbit, view: LandView): FightLook {
    return lookOf(orbit, this.play, view);
  }

  /** The camera while aiming from her. */
  aimCamera(orbit: Orbit, view: LandView, shown: number): Orbit {
    return aimCameraOf(orbit, this.play, view, shown);
  }

  /** One frame: her orders owed and sent, her look's lay laid, the room's events made effects and fires burned. Answers
   *  the water's pushes. */
  step(seconds: number, input: FleetInput, now: number, view: LandView): Splash[] {
    this.play.advance(seconds, input, now);
    this.lay = input.look ? this.play.lay(input.look, now) : null;
    const toWindow = (point: readonly [number, number, number]) =>
      [point[0] - view.leftM, point[1] - view.topM, point[2]] as const;
    const splashes = this.effects.take(this.play.takeEvents(), now, toWindow);
    const [x, y, heave, fires] = this.play.fires();
    this.effects.burn(toWindow([x, y, heave + DECK_M]), fires, now, seconds);
    for (const vessel of this.play.others()) {
      const [x = 0, y = 0] = vessel.ship;
      const [heave = 0] = vessel.pose;
      this.effects.burn(toWindow([x, y, heave + DECK_M]), vessel.state === 'sinking' ? 0 : vessel.fires, now, seconds);
    }
    return splashes;
  }

  /** Every other ship's footprint on the water while she floats, at her hull's waterline. */
  hulls(view: LandView): HullMask[] {
    return this.play
      .others()
      .filter((vessel) => vessel.state !== 'sinking' && vessel.state !== 'sunk')
      .map((vessel) => {
        const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
        const waterline = hullWaterline(hullOf(vessel));
        return {
          x: x - view.leftM,
          y: y - view.topM,
          heading,
          halfLength: waterline.lengthM / 2,
          halfBeam: waterline.beamM / 2,
          way: Math.hypot(ahead, abeam),
        };
      });
  }

  /** Every other ship afloat, heights as drawn: a captain's in her hull and her faction's colours, another player's
   *  Sloop a little darker than hers; each one's sails stepped `seconds` on in the wind blowing toward `bearing`. */
  ships(
    view: LandView,
    shown: number,
    wind: { readonly bearing: number; readonly seconds: number },
    now: number,
  ): DrawnShip[] {
    const others = this.play.others();
    const sailing = new Set(others.map((vessel) => vessel.id));
    for (const id of this.rigs.keys()) if (!sailing.has(id)) this.rigs.delete(id);
    return others.flatMap((vessel) => {
      if (vessel.state === 'sunk') return [];
      const hull = hullOf(vessel);
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

  /** Draws the balls aloft, her lay's arcs and the effects, heights as drawn. */
  draw(pass: GPURenderPassEncoder, view: LandView, shown: number, camera: ShipCamera, now: number): void {
    const marks: Mark[] = this.effects.marks(now).map((mark) => ({ ...mark, z: mark.z * shown }));
    for (const [x, y, z, radius] of this.play.balls(now))
      marks.push({ x: x - view.leftM, y: y - view.topM, z: z * shown, radius: radius * BALL_DRAWN, colour: BALL });
    marks.push(...arcsOf(arcsLay(this.lay), view, shown));
    this.marks.drawInto(pass, marks, camera);
  }

  /** Each captain's bar over her hull's masthead, heights as drawn. */
  bars(view: LandView, shown: number): ShipBar[] {
    return this.play
      .others()
      .filter((vessel) => vessel.captain)
      .map((vessel) =>
        barOver(
          { ...vessel, ...vessel.hurts, name: shipName(vessel.faction) },
          view,
          shown,
          plateOverM(hullOf(vessel)),
        ),
      )
      .filter((bar) => bar !== null);
  }

  /** The panel's lines. */
  lines(now: number): string[] {
    return this.play.lines(now, this.lay);
  }
}

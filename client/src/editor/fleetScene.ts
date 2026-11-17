import type { FightLay, FightLook } from '../rules/fightRules.ts';
import type { FleetLay } from '../rules/fleetRules.ts';
import type { LandView } from '../rules/landRules.ts';
import { Effects, type Mark, type Splash } from '../ships/effects.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipCamera, ShipPlace, ShipView } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FleetInput, FleetVessel } from './fleetLink.ts';
import type { FleetSloop } from './fleetPlay.ts';
import { aimCameraOf, arcsOf, lookOf, type MarkDrawer } from './naval.ts';
import type { Orbit } from './orbit.ts';

/** A captain's Sloop is drawn this light, another player's this: the same model as hers. */
const CAPTAIN_SHADE = 0.55;
const OTHER_SHADE = 0.85;
/** A fire's flames rise from this far over her waterline (metres): just over her deck. */
const DECK_M = 2.4;
/** A ball is drawn this many times its size, to be seen. */
const BALL_DRAWN = 2;
const BALL = [0.12, 0.12, 0.12] as const;

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

  /** Every other ship's footprint on the water while she floats. */
  hulls(view: LandView, waterline: Waterline): HullMask[] {
    return this.play
      .others()
      .filter((vessel) => vessel.state !== 'sinking' && vessel.state !== 'sunk')
      .map((vessel) => {
        const [x = 0, y = 0, heading = 0, ahead = 0, abeam = 0] = vessel.ship;
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

  /** Draws every other ship (captains darker), the balls aloft, her lay's arcs and the effects, heights as drawn. */
  draw(
    pass: GPURenderPassEncoder,
    view: LandView,
    shown: number,
    camera: ShipCamera,
    ship: ShipView | null,
    now: number,
  ): void {
    this.play.others().forEach((vessel, index) => {
      if (vessel.state === 'sunk') return;
      ship?.drawInto(
        pass,
        placeOf(vessel, view, shown),
        camera,
        index + 1,
        vessel.captain ? CAPTAIN_SHADE : OTHER_SHADE,
      );
    });
    const marks: Mark[] = this.effects.marks(now).map((mark) => ({ ...mark, z: mark.z * shown }));
    for (const [x, y, z, radius] of this.play.balls(now))
      marks.push({ x: x - view.leftM, y: y - view.topM, z: z * shown, radius: radius * BALL_DRAWN, colour: BALL });
    marks.push(...arcsOf(arcsLay(this.lay), view, shown));
    this.marks.drawInto(pass, marks, camera);
  }

  /** The panel's lines. */
  lines(now: number): string[] {
    return this.play.lines(now, this.lay);
  }
}

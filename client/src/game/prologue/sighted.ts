// The owner's fourth and fifth beats begin: the crew cry out through the storm, ships inbound, each with a mark over
// their head; the camera pulls out to show the ships coming out of the dark, then comes back to the Brig, where the
// fight's own camera will take it up.
import type { AmbienceLevels } from '../../cinema/ambience.ts';
import { Cues } from '../../cinema/cues.ts';
import { type Point3, type RailKey, railShot } from '../../cinema/rail.ts';
import { FIELD_OF_VIEW } from '../../overworld/overworldCamera.ts';
import { captainAtSea } from '../../ships/shipCrew.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { CREATION_LENS, creationEye, youAtHelm } from './helm.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { sung } from './music.ts';
import { onDeck, type Sailed } from './sailing.ts';
import { STORM, STORM_FOG } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const LENS = { fov: 0.9, near: 0.3, far: 30_000 } as const;
/** The ships coming for it: bearing off its bow (radians, to starboard), how far off they first show, and their way. */
export const INBOUND: readonly { readonly bearing: number; readonly distanceM: number }[] = [
  { bearing: -0.32, distanceM: 760 },
  { bearing: 0.05, distanceM: 820 },
  { bearing: 0.38, distanceM: 720 },
];
export const INBOUND_WAY_M_S = 5;
/** Their captains, pirate Majors, as the fight takes them up (`ambushersFrom`). */
const PIRATES = 2;
const MAJOR = 2;
/** When the crew first cry out, the camera turned to look down its deck at them; when it is back where the fight's
 *  own camera stands; and the beat's length. */
export const CRY_S = 2;
const BACK_S = 11.5;
const SIGHTED_S = 13;
/** The storm as it sounds on its deck. */
export const STORM_SOUND: Partial<AmbienceLevels> = { wind: 1, rain: 1, waves: 1, creak: 0.5 };
/** The fight's camera as it first stands: behind it, this far, this far down, looking this high over it. */
export const FIGHT_VIEW = { distance: 75, pitch: 0.3, lookOverM: 6 } as const;

/** How far ahead of a shot's eye the point it looks at is taken, when a rail takes the shot up: as far as the creation
 *  camera stands from the player, about. */
const LOOK_M = 5;

/** A shot drawn in the world as a rail's key in the frame of its deck placed at `place` (metres to its bow, to its
 *  starboard, up from its waterline): its eye, a point it looks at, and its lens. */
export function shotOnDeck(shot: Shot, place: ShipPlace): { eye: Point3; look: Point3; fov: number } {
  const scale = place.scale ?? 1;
  const [sinHeading, cosHeading] = [Math.sin(place.heading), Math.cos(place.heading)];
  // onDeck turned back: east and south to forward and starboard, then its pitch and roll taken off the height.
  const toDeck = ([east, south, up]: readonly [number, number, number]): Point3 => {
    const [eastOff, southOff] = [east - place.x, south - place.y];
    const along = sinHeading * eastOff - cosHeading * southOff;
    const across = cosHeading * eastOff + sinHeading * southOff;
    const rise = along * Math.sin(place.pitch) - across * Math.sin(place.roll);
    return [along / scale, across / scale, (up - place.z - rise) / scale];
  };
  const way = [
    Math.sin(shot.yaw) * Math.cos(shot.pitch),
    -Math.cos(shot.yaw) * Math.cos(shot.pitch),
    -Math.sin(shot.pitch),
  ];
  const look = [0, 1, 2].map((axis) => (shot.eye[axis] ?? 0) + (way[axis] ?? 0) * LOOK_M) as [number, number, number];
  return { eye: toDeck(shot.eye), look: toDeck(look), fov: shot.fov };
}

/** The camera's way, in the Brig's frame: from `start` (where the creation left it, turned round the player as it
 *  was, for the screen it was framed for) round behind them at the helm to look down its deck at the crew as they cry
 *  out, up and out over its stern to look ahead at the ships with the crew still in the picture, and down to where
 *  the fight's camera stands, through its lens. */
export function sightedKeys(start: { readonly eye: Point3; readonly look: Point3; readonly fov: number }): RailKey[] {
  const behind = -FIGHT_VIEW.distance * Math.cos(FIGHT_VIEW.pitch);
  return [
    { at: 0, eye: start.eye, look: start.look, fov: start.fov },
    { at: 1.8, eye: [-17, -2.5, 7.5], look: [2, 0, 4.5] },
    { at: 4, eye: [-20, -3, 8.5], look: [30, 0, 4] },
    { at: 6.5, eye: [-48, -14, 22], look: [200, 0, 0] },
    { at: 9, eye: [-45, 24, 20], look: [400, 20, 0] },
    {
      at: BACK_S,
      eye: [behind, 0, FIGHT_VIEW.distance * Math.sin(FIGHT_VIEW.pitch) + FIGHT_VIEW.lookOverM],
      look: [0, 0, FIGHT_VIEW.lookOverM],
      fov: FIELD_OF_VIEW,
    },
  ];
}

/** The ships coming for it, as first seen round the Brig where it lies now, each with its captain and crew aboard,
 *  named as the fight numbers its captains. */
export function inboundAt(brig: { readonly x: number; readonly y: number; readonly heading: number }): Sailed[] {
  return INBOUND.map((ship, index) => {
    const bearing = brig.heading + ship.bearing;
    const x = brig.x + Math.sin(bearing) * ship.distanceM;
    const y = brig.y - Math.cos(bearing) * ship.distanceM;
    return {
      who: `inbound-${index}`,
      hull: 'sloop',
      x,
      y,
      heading: Math.atan2(brig.x - x, y - brig.y),
      underWay: true,
      shade: 0.5,
      crew: captainAtSea(`pirate-${index + 1}`, PIRATES, MAJOR),
    };
  });
}

export class Sighted implements Beat {
  readonly name = 'sighted';
  readonly skippable = true;
  private readonly story: Story;
  private readonly cues: Cues;
  /** The shot the creation last drew, which the camera's way starts from; null for a story begun here. */
  private readonly from: Shot | null;
  /** The camera's way, laid on the first frame, from where the camera was. */
  private keys: RailKey[] | null = null;
  /** Why the crew's cries could not be played, thrown from the next frame for the director to go on past it. */
  private failure: { readonly error: unknown } | null = null;
  private since = 0;
  private spoken = false;
  /** Set once skipped: its moments left still change the world, but none says or sounds a thing. */
  private skipped = false;
  /** Where the inbound ships are now, as the fight will take them up. */
  readonly inbound: Sailed[];
  done = false;

  constructor(story: Story, from: Shot | null = null) {
    this.story = story;
    this.from = from;
    const { stage, brig } = story;
    const { ambience } = stage.parts;
    stage.weatherTowards(STORM_FOG, 1.5);
    ambience.set(STORM_SOUND, 1.5);
    story.lightning.striking = true;
    this.inbound = inboundAt(brig);
    const heard = (moment: () => void) => () => {
      if (!this.skipped) moment();
    };
    this.cues = new Cues([
      [
        CRY_S,
        heard(
          () =>
            void stage.play('sighted').then(
              () => (this.spoken = true),
              (error: unknown) => (this.failure = { error }),
            ),
        ),
      ],
      [3.2, () => stage.weatherTowards(STORM, 5)],
      [4.2, heard(() => this.strikeAmong(1))],
    ]);
  }

  private strikeAmong(index: number): void {
    const ship = this.inbound[index];
    if (ship) this.story.lightning.strike(ship.x + 60, ship.y - 40, [this.story.brig.x, this.story.brig.y]);
  }

  skip(): void {
    this.skipped = true;
    this.cues.finish();
    this.since = SIGHTED_S;
    this.done = true;
  }

  /** The storm's song whole, its choir and brass with it, as the pirates come out of the dark. */
  music(): Hearing {
    return sung('storm', 'peak');
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    if (this.failure) throw this.failure.error;
    this.since += tick.seconds;
    this.cues.step(this.since);
    brig.step(tick.seconds);
    for (const ship of this.inbound) {
      const way = INBOUND_WAY_M_S * tick.seconds;
      Object.assign(ship, { x: ship.x + Math.sin(ship.heading) * way, y: ship.y - Math.cos(ship.heading) * way });
    }
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const windBearing = stage.windBearing();
    const ships = sailing.frame([brig.sailed(), ...this.inbound], tick.seconds, tick.clock, windBearing, stage.swell());
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    const shot = this.shot(own, tick.viewport.width / Math.max(1, tick.viewport.height));
    if (this.since >= SIGHTED_S && this.spoken) this.done = true;
    const moves: Readonly<Record<string, string>> =
      this.since < 6 ? { lookout: 'gesture', bosun: 'gesture' } : { gunner: 'chop' };
    return {
      shot,
      ships,
      actors: [...brig.crew(own, tick.clock, moves), youAtHelm(story, own, 'idle')],
      heads: brig.heads(own),
      land: false,
      heard: { at: 'sea', deck: false, sailing: true },
      focus: [brig.x, brig.y],
    };
  }

  private shot(own: ShipPlace, aspect: number): Shot {
    const steady: ShipPlace = { ...own, pitch: own.pitch * 0.3, roll: own.roll * 0.3 };
    this.keys ??= sightedKeys(
      this.from ? shotOnDeck(this.from, steady) : { ...creationEye(0, aspect), fov: CREATION_LENS.fov },
    );
    const carried = this.keys.map((key) => ({
      ...key,
      eye: onDeck(steady, ...key.eye),
      look: onDeck(steady, ...key.look),
    }));
    return { ...LENS, ...railShot(carried, this.since, LENS.fov) };
  }
}

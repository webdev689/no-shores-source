// The owner's fourth and fifth beats begin: the crew cry out through the storm, ships inbound, each with a mark over
// their head; the camera pulls out to show the ships coming out of the dark, then comes back to the Brig, where the
// fight's own camera will take her up.
import { Cues } from '../../cinema/cues.ts';
import { type RailKey, railShot } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { creationEye, youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import { onDeck, type Sailed } from './sailing.ts';
import { STORM, STORM_FOG } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const LENS = { fov: 0.9, near: 0.3, far: 30_000 } as const;
/** The ships coming for her: bearing off her bow (radians, to starboard), how far off they first show, and their way. */
export const INBOUND: readonly { readonly bearing: number; readonly distanceM: number }[] = [
  { bearing: -0.32, distanceM: 760 },
  { bearing: 0.05, distanceM: 820 },
  { bearing: 0.38, distanceM: 720 },
];
const INBOUND_WAY_M_S = 5;
/** When the camera is back where the fight's own camera stands, and the beat's length. */
const BACK_S = 11;
const SIGHTED_S = 13;
/** The fight's camera as it first stands: behind her, this far, this far down, looking this high over her. */
export const FIGHT_VIEW = { distance: 75, pitch: 0.3, lookOverM: 6 } as const;

/** The camera's way, in the Brig's frame: from in front of the player round behind them at the helm, up and out over
 *  her stern to look ahead at the ships, and down to where the fight's camera stands. */
function sightedKeys(): RailKey[] {
  const front = creationEye(0);
  const behind = -FIGHT_VIEW.distance * Math.cos(FIGHT_VIEW.pitch);
  return [
    { at: 0, eye: front.eye, look: front.look, fov: 0.75 },
    { at: 2.2, eye: [-17.5, -2.2, 6.5], look: [30, 0, 5] },
    { at: 5.5, eye: [-55, -32, 34], look: [520, 0, 8] },
    { at: 8.5, eye: [-40, 38, 26], look: [600, 30, 6] },
    {
      at: BACK_S,
      eye: [behind, 0, FIGHT_VIEW.distance * Math.sin(FIGHT_VIEW.pitch) + FIGHT_VIEW.lookOverM],
      look: [0, 0, FIGHT_VIEW.lookOverM],
    },
  ];
}

export class Sighted implements Beat {
  readonly name = 'sighted';
  readonly skippable = true;
  private readonly story: Story;
  private readonly cues: Cues;
  private readonly keys = sightedKeys();
  private since = 0;
  private spoken = false;
  /** Where the inbound ships are now, as the fight will take them up. */
  readonly inbound: Sailed[];
  done = false;

  constructor(story: Story) {
    this.story = story;
    const { stage, brig } = story;
    const { ambience } = stage.parts;
    storyCue('sighted');
    stage.weatherTowards(STORM_FOG, 1.5);
    this.inbound = INBOUND.map((ship, index) => {
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
      };
    });
    this.cues = new Cues([
      [0.3, () => void stage.play('sighted').then(() => (this.spoken = true))],
      [3.2, () => stage.weatherTowards(STORM, 5)],
      [4.2, () => this.strikeAmong(1)],
      [6.5, () => ambience.thunder(1.1)],
    ]);
  }

  private strikeAmong(index: number): void {
    const ship = this.inbound[index];
    if (ship) this.story.lightning.strike(ship.x + 60, ship.y - 40, [this.story.brig.x, this.story.brig.y]);
  }

  skip(): void {
    this.cues.finish();
    this.story.stage.parts.dialogue.skip();
    this.since = SIGHTED_S;
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
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
    const shot = this.shot(own);
    if (this.since >= SIGHTED_S && this.spoken) this.done = true;
    const moves: Readonly<Record<string, string>> = this.since < 6 ? { lookout: 'gesture', bosun: 'gesture' } : { gunner: 'chop' };
    return {
      shot,
      ships,
      actors: [...brig.crew(own, tick.clock, moves), youAtHelm(story, own, 'guard')],
      heads: brig.heads(own),
      land: false,
      focus: [brig.x, brig.y],
    };
  }

  private shot(own: ShipPlace): Shot {
    const steady: ShipPlace = { ...own, pitch: own.pitch * 0.3, roll: own.roll * 0.3 };
    const carried = this.keys.map((key) => ({
      ...key,
      eye: onDeck(steady, ...key.eye),
      look: onDeck(steady, ...key.look),
    }));
    return { ...LENS, ...railShot(carried, this.since, LENS.fov) };
  }
}

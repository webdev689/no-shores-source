// What one frame at sea is handed and what it shows, as the sea (`sea.ts`) steps and the display reads it.
import type { FightHeard } from './audio/ambience/seaFight.ts';
import type { Viewport } from '../overworld/overworldCamera.ts';
import type { Pace } from '../overworld/voyage.ts';
import type { CardAt } from '../player/cards.ts';
import type { InputFrame } from '../player/input.ts';
import type { Swell } from '../rules/landRules.ts';
import type { ShipBar } from '../ships/shipBars.ts';
import type { Stir } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Shot } from './camera.ts';
import type { ScreenMark } from './hud.ts';
import type { Landfall } from './seaLaw.ts';
import type { SeaShip } from './seaShips.ts';

/** What one frame at sea is handed: `seconds` on, at world time `time`, on a picture of `viewport` CSS pixels; the
 *  look keys' `turn` and `tilt`; the sea's `swell`, the steady wind blowing the way it runs; and the controls the
 *  player walks its deck by, none while `paused`. */
export interface SeaInput {
  readonly seconds: number;
  readonly time: number;
  readonly viewport: Viewport;
  readonly turn: number;
  readonly tilt: number;
  readonly swell: Swell | undefined;
  readonly controls: InputFrame;
  readonly paused: boolean;
}

/** What one frame at sea shows: the shot, the ships, the marks, and the words and dial of the sea's bar. */
export interface SeaFrame {
  readonly shot: Shot;
  readonly ships: readonly SeaShip[];
  /** How many times its true size every ship is drawn (`shownScale`): the Overworld's, or the size coming in. */
  readonly shipScale: number;
  /** Each ship's footprint on the water, world metres: none inside it, foam round its bow under way. */
  readonly hulls: readonly HullMask[];
  /** In a fight, each captain's bar over its masthead as it is drawn. */
  readonly bars: readonly ShipBar[];
  readonly marks: readonly ScreenMark[];
  readonly note: string;
  /** What the ship is offered off the island's coast: to dock, to go ashore, or nothing. */
  readonly landfall: Landfall;
  /** Under way on a voyage; or stopped short of one, which can be resumed. */
  readonly sailing: boolean;
  readonly resumable: boolean;
  readonly pace: Pace;
  /** Whether the view stands over an island's side, its landings marked. */
  readonly overSide: boolean;
  /** Everyone aboard the player's Sloop once the view is down there, and whether the player sees through their own
   *  eyes on its deck. */
  readonly figures: readonly CardAt[];
  readonly firstPerson: boolean;
  /** Where the player's feet are walking its deck, world metres, as it is drawn; none off the walk. */
  readonly feet: readonly [number, number, number] | null;
  /** Where its bow and quarters stir the water's ripples this frame, which follow it (`focus`, world metres). */
  readonly stirs: readonly Stir[];
  readonly focus: readonly [number, number];
  /** A fight's events this frame and its ships as they lie, for the sea's sounds; none out of a fight. */
  readonly fightHeard: FightHeard | null;
}

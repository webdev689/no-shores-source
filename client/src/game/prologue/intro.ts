// The intro, the owner's first beat: the camera fades in high over the cloud at first light, then dives through it to
// each island in turn (a highland in mist, a green one in rain, a desert town where a fight breaks out on the plaza, a
// tundra town in snow), with ships sailing off each, and last to Saltmere, where gulls wheel over the harbour, the
// title rises and a prompt to begin breathes. Holding Space flies straight to Saltmere. An island that will not open
// is passed over for the next; a Saltmere that will not open is the beat's failure, thrown from its frame. Left for
// any reason, the intro lets its islands go and hands Saltmere back to the land.
import { type RailKey, railLength, railShot } from '../../cinema/rail.ts';
import { playedByTouch } from '../../cinema/screen.ts';
import type { Weather } from '../../cinema/weather.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { type Pairing, fighters } from './fighters.ts';
import {
  fightRail,
  HOME_S,
  homeRail,
  type IslandFrame,
  islandFrame,
  passingRail,
  shipsOff,
  titleEye,
} from './introShots.ts';
import type { Islands } from './islands.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { sung } from './music.ts';
import type { Sailed, Sailing } from './sailing.ts';
import { FAIR, HIGHLAND, OVER_CLOUD, RAIN, SALTMERE, SNOW } from './skies.ts';
import type { Stage, StoryFrame } from './stage.ts';

/** The islands the intro passes, in turn, each with its weather; one shows a fight on its plaza. */
const PASSING: readonly { readonly id: string; readonly weather: Weather; readonly fight?: boolean }[] = [
  { id: 'continent-2', weather: HIGHLAND },
  { id: 'continent-6', weather: RAIN },
  { id: 'continent-4', weather: FAIR, fight: true },
  { id: 'continent-9', weather: SNOW },
];
/** The fight on the desert plaza: Grey Tithe against pirates (roster types), pair by pair. */
const FIGHT: readonly (readonly [number, number])[] = [
  [2, 14],
  [4, 15],
  [1, 13],
];
const LENS = { fov: 0.9, near: 1, far: 60_000 } as const;
/** The dawn over the cloud before the first island, and the white the camera passes through between islands. */
const DAWN_S = 6;
const CLOUD_WHITE = 0.92;
/** How long the prompt waits after the title rises, and how fast the view drifts while the title waits. */
const PROMPT_AFTER_S = 2.4;
const DRIFT_M_S = 3;

type Phase =
  | { readonly kind: 'dark' }
  | { readonly kind: 'dawn' }
  | { readonly kind: 'island'; readonly index: number; readonly rail: RailKey[]; readonly frame: IslandFrame }
  | { readonly kind: 'cloud'; readonly next: number }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'home'; readonly rail: RailKey[]; readonly frame: IslandFrame }
  | { readonly kind: 'title'; readonly frame: IslandFrame };

export class Intro implements Beat {
  readonly name = 'intro';
  private readonly stage: Stage;
  private readonly islands: Islands;
  private readonly sailing: Sailing;
  private phase: Phase = { kind: 'dark' };
  private since = 0;
  private lastShot: Shot | null = null;
  private begun = false;
  /** Whether the first island opened, so the dawn's passage into cloud shows it rather than the next. */
  private firstOpened = false;
  /** Counts the passages begun: an island that opens after a later passage (or a skip) began is not shown. */
  private passage = 0;
  /** What could not be done (Saltmere would not open), thrown from the next frame. */
  private failure: { readonly error: unknown } | null = null;
  /** When, in the phase's own seconds, the cloud's white lifts off the island it hid; null while none waits. */
  private liftAt: number | null = null;
  done = false;

  constructor(stage: Stage, islands: Islands, sailing: Sailing) {
    this.stage = stage;
    this.islands = islands;
    this.sailing = sailing;
    stage.parts.screen.fade(1, 0);
    void this.openFirst();
  }

  /** Whether holding Space would cut the flight short: not once Saltmere is reached, or on the way there. */
  get skippable(): boolean {
    const kind = this.phase.kind;
    return kind !== 'skipped' && kind !== 'home' && kind !== 'title';
  }

  private async openFirst(): Promise<void> {
    const first = PASSING[0];
    const passage = this.passage;
    this.firstOpened = first
      ? await this.islands.open(first.id).then(
          () => true,
          (error: unknown) => (this.passOver(first.id, error), false),
        )
      : false;
    if (passage !== this.passage) return;
    // A first island that would not open leaves the dawn over Saltmere, still shown.
    if (this.firstOpened) await this.islands.show();
    if (passage !== this.passage) return;
    this.stage.weatherTowards(OVER_CLOUD, 0);
    this.stage.parts.ambience.set({ wind: 0.35, waves: 0, rain: 0, gulls: 0, fire: 0, deep: 0, creak: 0 }, 0.5);
    this.enter({ kind: 'dawn' });
    this.stage.parts.screen.fade(0, 3);
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.since = 0;
  }

  /** Into the cloud between islands: white, the next opening (unless it is open already); once open and drawn, the
   *  white lifts on its shot. */
  private toCloud(next: number, opened = false): void {
    const { screen, ambience } = this.stage.parts;
    screen.fade(CLOUD_WHITE, 1.1, 'white');
    ambience.whoosh();
    this.stage.parts.birds.clear();
    this.enter({ kind: 'cloud', next });
    this.openPassage(next, opened);
  }

  /** Opens the island `next` (Saltmere past the last) behind the cloud's white; one that will not open is passed over
   *  for the one after it. */
  private openPassage(next: number, opened = false): void {
    const passage = ++this.passage;
    const passing = PASSING[next];
    const opening = opened ? Promise.resolve() : passing ? this.islands.open(passing.id) : this.islands.home();
    void opening.then(
      () => this.cleared(next, !opened, passage),
      (error: unknown) => {
        if (passage !== this.passage) return;
        if (!passing) this.failure = { error };
        else {
          this.passOver(passing.id, error);
          this.openPassage(next + 1);
        }
      },
    );
  }

  /** An island that would not open, said in the log; the flight goes on without it. */
  private passOver(id: string, error: unknown): void {
    console.error(`the intro passes over ${id}, which would not open:`, error);
  }

  private async cleared(next: number, swap: boolean, passage: number): Promise<void> {
    if (passage !== this.passage) return;
    const passing = PASSING[next];
    if (passing && swap) await this.islands.show();
    if (passage !== this.passage) return;
    const frame = islandFrame(this.islands.landmass);
    // The white has had its second to cover the swap before it lifts.
    const lift = Math.max(0, 1.1 - this.since);
    if (passing) {
      this.stage.weatherTowards(passing.weather, 2);
      const side = next % 2 === 0 ? 1 : -1;
      if (passing.fight) this.stage.parts.keepClose([frame.plaza[0], frame.plaza[1]]);
      this.ambienceFor(passing.weather);
      this.enter({
        kind: 'island',
        index: next,
        rail: passing.fight ? fightRail(frame, side) : passingRail(frame, side),
        frame,
      });
    } else this.goHome(frame);
    this.liftAt = lift;
  }

  private goHome(frame: IslandFrame): void {
    const { birds, ambience } = this.stage.parts;
    this.stage.weatherTowards(SALTMERE, 2.5);
    ambience.set({ wind: 0.25, rain: 0, waves: 0.6, gulls: 0.75, creak: 0 }, 3);
    const [x, y] = frame.anchorage;
    birds.flock([x, y, 28], 14, 120, 11);
    birds.flock([frame.town[0], frame.town[1], frame.town[2] + 70], 10, 160, 12);
    const eye = titleEye(frame, 0);
    birds.flock(
      [eye[0] + (frame.town[0] - eye[0]) * 0.12, eye[1] + (frame.town[1] - eye[1]) * 0.12, eye[2] - 25],
      7,
      45,
      13,
    );
    this.enter({ kind: 'home', rail: homeRail(frame), frame });
  }

  private ambienceFor(weather: Weather): void {
    this.stage.parts.ambience.set(
      { rain: weather.rain * 0.7, wind: 0.3 + weather.overcast * 0.3, waves: 0.25, gulls: 0.15 },
      2,
    );
  }

  /** Holding Space flies straight to Saltmere's title: the flight stops where it is (no passage begins after it, so
   *  no island opens over Saltmere), the view goes black, and Saltmere's glide ends under the title. */
  skip(): void {
    if (!this.skippable) return;
    this.enter({ kind: 'skipped' });
    const passage = ++this.passage;
    this.liftAt = null;
    const { screen } = this.stage.parts;
    screen.fade(1, 0.4);
    void this.islands.home().then(
      () => {
        if (passage !== this.passage) return;
        const frame = islandFrame(this.islands.landmass);
        this.goHome(frame);
        this.since = HOME_S;
        screen.fade(0, 0, 'white');
        screen.fade(0, 1.2);
      },
      (error: unknown) => (this.failure = { error }),
    );
  }

  /** The director moves on (the intro begun, or failed): no passage under way shows its island or sets its weather
   *  and sound, and Saltmere is drawn and opened in the land's worker again, for every beat and game after. */
  leave(): void {
    this.passage++;
    this.liftAt = null;
    void this.islands.home().catch((error: unknown) => console.error('Saltmere would not open again:', error));
  }

  key(key: string, down: boolean): boolean {
    // Any key once the prompt shows begins, Space too: at the title there is nothing left to skip.
    if (down && this.phase.kind === 'title' && this.since > PROMPT_AFTER_S) this.begin();
    return this.phase.kind === 'title';
  }

  /** A tap or click once the prompt shows begins too. */
  press(): void {
    if (this.phase.kind === 'title' && this.since > PROMPT_AFTER_S) this.begin();
  }

  private begin(): void {
    if (this.begun) return;
    this.begun = true;
    const { screen } = this.stage.parts;
    screen.showPrompt(null);
    screen.showTitle(false);
    this.done = true;
  }

  /** Where the camera stands when the beat after takes it up. */
  get shot(): Shot | null {
    return this.lastShot;
  }

  /** The theme, whole, over the cloud, the islands and the title. */
  music(): Hearing {
    return sung('theme', 'peak');
  }

  frame(tick: Tick): StoryFrame | null {
    if (this.failure) throw this.failure.error;
    this.since += tick.seconds;
    if (this.liftAt !== null && this.since >= this.liftAt) {
      this.liftAt = null;
      this.stage.parts.screen.fade(0, 1.6, 'white');
    }
    this.stage.stepWeather(tick.seconds);
    const shot = this.shotNow(tick);
    if (!shot) return null;
    this.lastShot = shot;
    const ships = this.ships(tick);
    return { shot, ships, actors: this.actors(tick), focus: [shot.eye[0], shot.eye[1]] };
  }

  private shotNow(tick: Tick): Shot | null {
    const phase = this.phase;
    const lens = (rail: { eye: [number, number, number]; yaw: number; pitch: number; fov: number }): Shot => ({
      ...LENS,
      ...rail,
    });
    switch (phase.kind) {
      case 'dark':
        return null;
      case 'dawn': {
        const frame = islandFrame(this.islands.landmass);
        const start = passingRail(frame, 1)[0];
        if (!start) return null;
        const rise = Math.min(1, this.since / DAWN_S);
        const eye: [number, number, number] = [start.eye[0] - 900 * (1 - rise), start.eye[1], 1500 - 400 * rise];
        if (this.since >= DAWN_S) this.toCloud(this.firstOpened ? 0 : 1, this.firstOpened);
        return lens({ eye, yaw: -2.35 + rise * 0.6, pitch: 0.04 + rise * 0.25, fov: LENS.fov });
      }
      case 'island': {
        if (this.since >= railLength(phase.rail)) this.toCloud(phase.index + 1);
        return lens(railShot(phase.rail, this.since, LENS.fov, 'none'));
      }
      case 'skipped':
        // The view holds where the skip found it while the black comes down over it.
        return this.lastShot;
      case 'cloud': {
        if (!this.lastShot) return null;
        const ahead = tick.seconds * 60;
        const eye: [number, number, number] = [
          this.lastShot.eye[0] + Math.sin(this.lastShot.yaw) * ahead,
          this.lastShot.eye[1] - Math.cos(this.lastShot.yaw) * ahead,
          this.lastShot.eye[2],
        ];
        return { ...this.lastShot, eye };
      }
      case 'home': {
        const glide = lens(railShot(phase.rail, this.since, LENS.fov, 'out'));
        if (this.since >= HOME_S) {
          this.enter({ kind: 'title', frame: phase.frame });
          this.stage.parts.screen.showTitle(true);
        }
        return glide;
      }
      case 'title': {
        if (this.since > PROMPT_AFTER_S)
          this.stage.parts.screen.showPrompt(playedByTouch() ? 'Tap to begin' : 'Press any key to begin');
        const look = phase.frame.town;
        const eye = titleEye(phase.frame, this.since * DRIFT_M_S);
        const rail = railShot([{ at: 0, eye, look: [look[0], look[1], look[2] + 45] }], 0, LENS.fov);
        return lens(rail);
      }
    }
  }

  private ships(tick: Tick): StoryFrame['ships'] {
    const phase = this.phase;
    if (phase.kind !== 'island' && phase.kind !== 'home' && phase.kind !== 'title') return [];
    const seconds = phase.kind === 'title' ? HOME_S + this.since : this.since;
    const placed: Sailed[] = shipsOff(phase.frame, seconds).map((ship, index) => ({ ...ship, who: `intro-${index}` }));
    return this.sailing.frame(placed, tick.seconds, tick.clock, this.stage.windBearing(), this.stage.swell());
  }

  private actors(tick: Tick): StoryFrame['actors'] {
    const phase = this.phase;
    if (phase.kind !== 'island' || !PASSING[phase.index]?.fight) return [];
    const { plaza, out } = phase.frame;
    const ground = this.stage.parts.scene.groundAt(plaza[0], plaza[1]) ?? plaza[2];
    const pairs: Pairing[] = FIGHT.map(([first, second], index) => {
      const across = out + Math.PI / 2;
      const offset = (index - 1) * 4.5;
      const spot: [number, number, number] = [
        plaza[0] + Math.sin(across) * offset,
        plaza[1] - Math.cos(across) * offset,
        ground,
      ];
      return { first, second, at: spot, facing: out + (index - 1) * 0.6 };
    });
    return fighters(this.stage.parts.roster, pairs, tick.clock);
  }
}

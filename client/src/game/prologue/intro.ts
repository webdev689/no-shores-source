// The intro, the story's first beat: the camera fades in high over the cloud at first light, goes down through the
// cloud to Saltmere, where gulls wheel over the harbour, and ends as the title rises and a prompt to begin breathes.
// Holding Space goes straight to the title. Where the page has accounts, beginning opens the character screen over the
// title's scene, and the intro ends once a character is chosen there.
import { railShot } from '../../cinema/rail.ts';
import { playedByTouch } from '../../cinema/screen.ts';
import { BINDS } from '../../player/input.ts';
import type { Shot } from '../camera.ts';
import { boundWord } from '../controls.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import type { Beat, Tick } from './beat.ts';
import { HOME_S, homeRail, type IslandFrame, islandFrame, shipsOff, titleEye } from './introShots.ts';
import { sung } from './music.ts';
import type { Sailed, Sailing } from './sailing.ts';
import { OVER_CLOUD, SALTMERE } from './skies.ts';
import type { Stage, StoryFrame } from './stage.ts';

const LENS = { fov: 0.9, near: 1, far: 60_000 } as const;
/** The dawn over the cloud; the white the camera goes down through, held whole before Saltmere shows under it. */
const DAWN_S = 6;
const CLOUD_S = 1.1;
const CLOUD_WHITE = 0.92;
/** How fast the camera flies on through the cloud. */
const CLOUD_M_S = 60;
/** How long a skip's black takes to come down before the title shows under it. */
const SKIP_BLACK_S = 0.4;
/** How long the prompt waits after the title rises, and how fast the view drifts while the title waits. */
const PROMPT_AFTER_S = 2.4;
const DRIFT_M_S = 3;

type Phase = 'dark' | 'dawn' | 'cloud' | 'skipped' | 'home' | 'title';

/** What beginning at the title opens, where the page has accounts: the character screen, which answers whether the
 *  story is played from its storm, the player goes on past it, or comes back to the title. `straight`: it opens at
 *  once, the title's intro passed (the page left the game for it). */
export interface TitleGate {
  readonly straight: boolean;
  open(): Promise<'story' | 'onward' | 'title' | 'unread'>;
}

/** The title's prompt, by whatever the player plays with: on the pad, its jump's button. */
export const beginPrompt = (touched: boolean, pad = BINDS.device === 'pad'): string =>
  touched ? 'Tap to begin' : pad ? `Press ${boundWord('jump', 'pad')} to begin` : 'Press any key to begin';

export class Intro implements Beat {
  readonly name = 'intro';
  private readonly stage: Stage;
  private readonly sailing: Sailing;
  private readonly saltmere: IslandFrame;
  private phase: Phase = 'dark';
  private since = 0;
  private lastShot: Shot | null = null;
  private begun = false;
  private readonly gate: TitleGate | null;
  done = false;
  /** Whether the character screen sent the player on past the story; null where no screen stood (offline). */
  onward: boolean | null = null;

  constructor(stage: Stage, sailing: Sailing, gate: TitleGate | null = null) {
    this.stage = stage;
    this.sailing = sailing;
    this.gate = gate;
    this.saltmere = islandFrame(stage.parts.landmass());
    stage.parts.screen.fade(1, 0);
    if (gate?.straight) {
      // The title's scene comes up behind the screen, from black.
      this.enter('skipped');
      this.begin();
    }
  }

  /** Whether holding Space would cut the intro short: not once Saltmere is reached, or on the way there. */
  get skippable(): boolean {
    return this.phase === 'dark' || this.phase === 'dawn' || this.phase === 'cloud';
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.since = 0;
  }

  /** First light over the cloud, the black lifting on it a frame after it came down, so the fade is seen. */
  private dawn(): void {
    this.stage.weatherTowards(OVER_CLOUD, 0);
    this.stage.parts.ambience.set({ wind: 0.35, waves: 0, rain: 0, gulls: 0, fire: 0, deep: 0, creak: 0 }, 0.5);
    this.enter('dawn');
    this.stage.parts.screen.fade(0, 3);
  }

  /** Down into the cloud: white over the view as the camera flies on, Saltmere under it once the white is whole. */
  private intoCloud(): void {
    const { screen, ambience, birds } = this.stage.parts;
    screen.fade(CLOUD_WHITE, CLOUD_S, 'white');
    ambience.whoosh();
    birds.clear();
    this.enter('cloud');
  }

  private goHome(): void {
    const { birds, ambience } = this.stage.parts;
    const frame = this.saltmere;
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
    this.enter('home');
  }

  /** Holding Space goes straight to Saltmere's title: the view goes black, and the title shows under it. */
  skip(): void {
    if (!this.skippable) return;
    this.enter('skipped');
    this.stage.parts.screen.fade(1, SKIP_BLACK_S);
  }

  key(key: string, down: boolean): boolean {
    // Any key once the prompt shows begins, Space too: at the title there is nothing left to skip.
    if (down && this.phase === 'title' && this.since > PROMPT_AFTER_S) this.begin();
    return this.phase === 'title';
  }

  /** A tap or click once the prompt shows begins too. */
  press(): void {
    if (this.phase === 'title' && this.since > PROMPT_AFTER_S) this.begin();
  }

  private begin(): void {
    if (this.begun) return;
    this.begun = true;
    const { screen } = this.stage.parts;
    screen.showPrompt(null);
    screen.showTitle(false);
    if (!this.gate) {
      this.done = true;
      return;
    }
    void this.gate.open().then(
      (answer) => {
        if (answer === 'title') return this.toTitle();
        // The accounts not answering, the story goes on as this browser keeps it, as it does offline.
        this.onward = answer === 'unread' ? null : answer === 'onward';
        this.done = true;
      },
      // A screen that failed leaves the story to go on as it would offline.
      () => (this.done = true),
    );
  }

  /** Back at the title from the character screen: the title rises again, and its prompt after it. */
  private toTitle(): void {
    this.begun = false;
    if (this.phase !== 'title') return;
    this.since = 0;
    this.stage.parts.screen.showTitle(true);
  }

  /** The theme, whole, over the cloud, Saltmere and the title. */
  music(): Hearing {
    return sung('theme', 'peak');
  }

  frame(tick: Tick): StoryFrame {
    this.since += tick.seconds;
    if (this.phase === 'dark') this.dawn();
    this.stage.stepWeather(tick.seconds);
    const shot = this.shotNow(tick);
    this.lastShot = shot;
    return { shot, ships: this.ships(tick), actors: [], focus: [shot.eye[0], shot.eye[1]] };
  }

  private shotNow(tick: Tick): Shot {
    const lens = (rail: { eye: [number, number, number]; yaw: number; pitch: number; fov: number }): Shot => ({
      ...LENS,
      ...rail,
    });
    const frame = this.saltmere;
    const { screen } = this.stage.parts;
    switch (this.phase) {
      case 'dark':
      case 'dawn': {
        const start = homeRail(frame)[0]?.eye ?? titleEye(frame, 0);
        const rise = Math.min(1, this.since / DAWN_S);
        const eye: [number, number, number] = [start[0] - 900 * (1 - rise), start[1], 1500 - 400 * rise];
        if (this.since >= DAWN_S) this.intoCloud();
        return lens({ eye, yaw: -2.35 + rise * 0.6, pitch: 0.04 + rise * 0.25, fov: LENS.fov });
      }
      case 'cloud': {
        const last = this.lastShot ?? lens(railShot(homeRail(frame), 0, LENS.fov));
        if (this.since >= CLOUD_S) {
          this.goHome();
          screen.fade(0, 1.6, 'white');
          return lens(railShot(homeRail(frame), 0, LENS.fov, 'out'));
        }
        const ahead = tick.seconds * CLOUD_M_S;
        const eye: [number, number, number] = [
          last.eye[0] + Math.sin(last.yaw) * ahead,
          last.eye[1] - Math.cos(last.yaw) * ahead,
          last.eye[2],
        ];
        return { ...last, eye };
      }
      case 'skipped': {
        // The view holds where the skip found it while the black comes down over it.
        const held = this.lastShot ?? lens(railShot(homeRail(frame), 0, LENS.fov));
        if (this.since < SKIP_BLACK_S) return held;
        this.goHome();
        this.since = HOME_S;
        screen.fade(0, 0, 'white');
        screen.fade(0, 1.2);
        return this.shotNow({ ...tick, seconds: 0 });
      }
      case 'home': {
        const glide = lens(railShot(homeRail(frame), this.since, LENS.fov, 'out'));
        if (this.since >= HOME_S) {
          this.enter('title');
          if (!this.begun) screen.showTitle(true);
        }
        return glide;
      }
      case 'title': {
        // Begun from a key or a tap between frames, the title is drawn once more: it must not ask again.
        if (this.since > PROMPT_AFTER_S && !this.begun) screen.showPrompt(beginPrompt(playedByTouch()));
        const look = frame.town;
        const eye = titleEye(frame, this.since * DRIFT_M_S);
        const rail = railShot([{ at: 0, eye, look: [look[0], look[1], look[2] + 45] }], 0, LENS.fov);
        return lens(rail);
      }
    }
  }

  private ships(tick: Tick): StoryFrame['ships'] {
    if (this.phase !== 'home' && this.phase !== 'title') return [];
    const seconds = this.phase === 'title' ? HOME_S + this.since : this.since;
    const placed: Sailed[] = shipsOff(this.saltmere, seconds).map((ship, index) => ({
      ...ship,
      who: `intro-${index}`,
    }));
    return this.sailing.frame(placed, tick.seconds, tick.clock, this.stage.windBearing(), this.stage.swell());
  }
}

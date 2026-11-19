// The owner's thirteenth beat: the player wakes on Saltmere's shore in first person, gulls overhead, the sea at their
// feet; a stranger comes down the beach, kneels beside them and speaks, and holds out her hand. The player takes it,
// gets up, and the two walk up the shore toward Overlook, until the picture goes to black and the game takes them to
// its social space.
import { playedByTouch } from '../../cinema/screen.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { groundUnder } from '../../editor/closeUp.ts';
import { type Dress, plainDress } from '../../player/dressing.ts';
import type { Shot } from '../camera.ts';
import type { Landmass } from '../landmass.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';
import { type Beach, findBeach } from './beach.ts';
import type { Beat, Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
import { islandFrame } from './introShots.ts';
import { storyCue } from './music.ts';
import { MORNING } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { lidsAt } from './wake.ts';

const LENS = { fov: 1.0, near: 0.05, far: 20_000 } as const;
export const STRANGER_ID = ACTOR_IDS + 80;
/** The stranger: dressed as Overlook's townsfolk are, a woman of the town. */
export const STRANGER_DRESS: Dress = {
  ...plainDress('human', 0.6),
  body: 'female',
  outfit: { ...plainDress('human', 0.6).outfit, right: null, hair: { style: 'braid', colour: 'auburn' } },
};
/** The beach searches: their squares round the plaza, sampled every so many metres; the wider one if the first finds
 *  no strand. */
const SEARCHES = [
  { reachM: 1100, step: 8 },
  { reachM: 3200, step: 16 },
] as const;
/** The stranger's walk down the beach: setting off this long after the eyes first open, from this far inland, at this
 *  pace, to kneel this far up the beach from the player and this far to their side. */
const COME_AFTER_S = 3;
const FROM_M = 12;
const WALK_M_S = 1.35;
const KNEEL_M = 1.1;
const SIDE_M = 0.6;
/** When she kneels by the player, and how long she is down before she speaks. */
export const KNEELS_AT_S = COME_AFTER_S + (FROM_M - KNEEL_M) / WALK_M_S;
const SPEAKS_AFTER_S = 0.8;
/** Her head over the ground kneeling and standing, and the point over it that her words and feelings stand on. */
const KNEEL_HEAD_M = 1.2;
const STAND_HEAD_M = 1.7;
const OVER_HEAD_M = 0.3;
/** Getting up, and the walk up the shore together, and when it fades. */
const RISE_S = 2.4;
const TOGETHER_M_S = 1.15;
const TOGETHER_S = 6.5;

type Phase = 'searching' | 'waking' | 'talking' | 'asking' | 'rising' | 'leaning' | 'walking' | 'gone';

/** Keys pressed on the way to another window or to let the pointer go, never to take her hand. */
const AWAY_KEYS = new Set(['alt', 'tab', 'escape', 'meta', 'control', 'shift', 'os']);

/** The prompt that asks the player to take her hand, by whatever they play with. */
export const takeHandPrompt = (touched: boolean) =>
  touched ? 'Tap to take her hand' : 'Click or press any key to take her hand';

export class Shore implements Beat {
  readonly name = 'shore';
  readonly skippable = false;
  private readonly story: Story;
  private beach: Beach | null = null;
  private phase: Phase = 'searching';
  private since = 0;
  private rose = 0;
  private walked = 0;
  /** Work that failed (laying the beach, a scene), thrown from the next frame so the director goes on past it. */
  private failed: { readonly error: unknown } | null = null;
  done = false;

  constructor(story: Story) {
    this.story = story;
    const { stage } = story;
    storyCue('shore');
    stage.weatherTowards(MORNING, 0);
    stage.parts.ambience.set({ deep: 0, waves: 0.8, gulls: 0.6, wind: 0.3, rain: 0.12, fire: 0, creak: 0 }, 2);
    stage.parts.screen.lids(1);
    this.search().catch(this.fail);
  }

  private readonly fail = (error: unknown) => {
    this.failed = { error };
  };

  private async search(): Promise<void> {
    const { story } = this;
    const landmass = story.stage.parts.landmass();
    const frame = islandFrame(landmass);
    let found: Beach | null = null;
    try {
      found = await this.strand(landmass);
    } catch (error) {
      // The beach is only searched for on the land's worker; without its answer the plaza still stands.
      console.error('the shore could not be searched; the player wakes on the plaza:', error);
    }
    // A coast with no strand, or ground that cannot be searched: the player wakes on the plaza itself, by its first
    // spawn, the stranger coming to them from the town's side.
    const spawn = landmass.nodes[0]?.spawns[0] ?? [frame.plaza[0], frame.plaza[1]];
    found ??= { at: spawn, inland: frame.out + Math.PI };
    this.beach = found;
    story.stage.parts.keepClose([found.at[0], found.at[1]]);
    story.stage.parts.birds.flock([found.at[0], found.at[1], 22], 9, 60, 21);
    this.phase = 'waking';
    this.since = 0;
    story.stage.parts.screen.fade(0, 2);
  }

  /** The nearest strand to the plaza, searched on the exact ground round it; null where the coast has none. */
  private async strand(landmass: Landmass): Promise<Beach | null> {
    const frame = islandFrame(landmass);
    const harbour = landmass.plan?.harbour ?? [frame.plaza[0], frame.plaza[1]];
    for (const search of SEARCHES) {
      const samples = Math.round((search.reachM * 2) / search.step) + 1;
      const [left, top] = [frame.plaza[0] - search.reachM, frame.plaza[1] - search.reachM];
      const { patch } = await this.story.land.ground(left, top, search.step, samples, samples);
      const heightAt = (x: number, y: number) => groundUnder(patch, x, y);
      const found = findBeach(heightAt, [frame.plaza[0], frame.plaza[1]], harbour, landmass.cleared, search.reachM);
      if (found) return found;
    }
    return null;
  }

  private talk(): void {
    this.phase = 'talking';
    this.story.stage.play('shore', true, { stranger: 'stranger' }).then(() => {
      // A shore hushed and left while she spoke asks nothing of a player no longer there.
      if (this.phase !== 'talking') return;
      this.phase = 'asking';
      this.story.stage.parts.screen.showPrompt(takeHandPrompt(playedByTouch()));
    }, this.fail);
  }

  /** The player takes her hand, and gets up. */
  private take(): void {
    if (this.phase !== 'asking') return;
    this.story.stage.parts.screen.showPrompt(null);
    this.phase = 'rising';
    this.rose = 0;
  }

  key(key: string, down: boolean): boolean {
    const asking = this.phase === 'asking';
    if (down && !AWAY_KEYS.has(key)) this.take();
    return asking;
  }

  /** A tap or click takes her hand too. */
  press(): void {
    this.take();
  }

  leave(): void {
    this.phase = 'gone';
    this.story.stage.parts.screen.showPrompt(null);
  }

  private ground(x: number, y: number): number {
    return Math.max(0, this.story.stage.parts.scene.groundAt(x, y) ?? 0);
  }

  frame(tick: Tick): StoryFrame | null {
    if (this.failed) throw this.failed.error;
    const beach = this.beach;
    if (!beach) return null;
    const { stage } = this.story;
    this.since += tick.seconds;
    stage.stepWeather(tick.seconds);
    stage.parts.screen.lids(lidsAt(this.since));
    if (this.phase === 'waking' && this.since >= KNEELS_AT_S + SPEAKS_AFTER_S) this.talk();
    if (this.phase === 'rising') {
      this.rose = Math.min(1, this.rose + tick.seconds / RISE_S);
      if (this.rose >= 1) {
        this.phase = 'leaning';
        stage.play('standing', true, { stranger: 'stranger' }).then(() => (this.phase = 'walking'), this.fail);
      }
    }
    if (this.phase === 'walking') {
      this.walked += tick.seconds;
      if (this.walked > TOGETHER_S - 1.6 && this.walked - tick.seconds <= TOGETHER_S - 1.6)
        stage.parts.screen.fade(1, 1.6);
      if (this.walked >= TOGETHER_S) {
        this.phase = 'gone';
        this.done = true;
      }
    }
    const [you, stranger] = this.people(beach);
    const head = this.headM() + OVER_HEAD_M;
    const heads = new Map([['stranger', [stranger.x, stranger.y, stranger.z + head] as const]]);
    const actors: Actor[] = this.phase === 'walking' || this.phase === 'gone' ? [you, stranger] : [stranger];
    return { shot: this.shot(beach, you, stranger), actors, heads, focus: [beach.at[0], beach.at[1]] };
  }

  /** How high her head stands: kneeling by the player, rising with them, then standing. */
  private headM(): number {
    if (this.phase === 'talking' || this.phase === 'asking' || (this.phase === 'waking' && this.since >= KNEELS_AT_S))
      return KNEEL_HEAD_M;
    if (this.phase === 'rising') return KNEEL_HEAD_M + (STAND_HEAD_M - KNEEL_HEAD_M) * eased(this.rose);
    return STAND_HEAD_M;
  }

  /** The player and the stranger where they are now. */
  private people(beach: Beach): [Actor, Actor] {
    const [inlandX, inlandY] = [Math.sin(beach.inland), -Math.cos(beach.inland)];
    const side = beach.inland + Math.PI / 2;
    const [sideX, sideY] = [Math.sin(side) * SIDE_M, -Math.cos(side) * SIDE_M];
    const [x, y] = beach.at;
    const walking = this.phase === 'walking' || this.phase === 'gone';
    const together = walking ? this.walked * TOGETHER_M_S : 0;
    const youAt: [number, number] = [x + inlandX * together, y + inlandY * together];
    const you: Actor = {
      id: YOU_ID,
      dress: this.story.dress,
      anim: walking ? 'walk' : 'idle',
      x: youAt[0],
      y: youAt[1],
      z: this.ground(...youAt),
      facing: beach.inland,
    };
    // Down the beach to her place by the player, where she kneels; up the shore with them from that same place, so
    // she never jumps.
    const coming = Math.max(0, FROM_M - KNEEL_M - Math.max(0, this.since - COME_AFTER_S) * WALK_M_S);
    const away = KNEEL_M + coming + together;
    const strangerAt: [number, number] = [x + inlandX * away + sideX, y + inlandY * away + sideY];
    const knelt = this.since >= KNEELS_AT_S;
    const kneeling = knelt && (this.phase === 'waking' || this.phase === 'talking' || this.phase === 'asking');
    const stranger: Actor = {
      id: STRANGER_ID,
      dress: STRANGER_DRESS,
      anim: walking || !knelt ? 'walk' : kneeling ? 'kneel' : 'idle',
      x: strangerAt[0],
      y: strangerAt[1],
      z: this.ground(...strangerAt),
      facing: walking ? beach.inland : Math.atan2(x - strangerAt[0], strangerAt[1] - y),
    };
    return [you, stranger];
  }

  /** Through the player's eyes, lying, then rising; behind the two as they walk up the shore. */
  private shot(beach: Beach, you: Actor, stranger: Actor): Shot {
    if (this.phase === 'walking' || this.phase === 'gone') {
      const back = beach.inland + Math.PI;
      const eye: Point3 = [you.x + Math.sin(back) * 4.5, you.y - Math.cos(back) * 4.5, you.z + 2.2];
      return {
        ...LENS,
        fov: 0.9,
        eye: [...eye],
        ...lookAt(eye, [you.x + Math.sin(beach.inland) * 6, you.y - Math.cos(beach.inland) * 6, you.z + 1.3]),
      };
    }
    const lift = this.phase === 'leaning' ? 1 : this.phase === 'rising' ? this.rose : 0;
    const eye: Point3 = [beach.at[0], beach.at[1], this.ground(beach.at[0], beach.at[1]) + 0.3 + 1.35 * eased(lift)];
    const toStranger = lookAt(eye, [stranger.x, stranger.y, stranger.z + this.headM()]);
    // Up at the sky at first; the head turns to the stranger as she comes near, and stays on her from then.
    const turned = eased(Math.min(1, Math.max(0, (this.since - 6) / 2.5)));
    const sky = { yaw: beach.inland + 0.3, pitch: -1.2 };
    return {
      ...LENS,
      eye: [...eye],
      yaw: sky.yaw + Math.atan2(Math.sin(toStranger.yaw - sky.yaw), Math.cos(toStranger.yaw - sky.yaw)) * turned,
      pitch: sky.pitch + (toStranger.pitch - sky.pitch) * turned,
    };
  }
}

/** A share eased in and out. */
const eased = (share: number) => share * share * (3 - 2 * share);

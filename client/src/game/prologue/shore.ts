// The owner's thirteenth beat: the player wakes on Saltmere's shore in first person, gulls overhead, the sea at their
// feet; a stranger comes down the beach, kneels and speaks, the player gets up, and the two walk up the shore toward
// Overlook, until the picture goes to black and the game takes them to its social space.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { groundUnder } from '../../editor/closeUp.ts';
import { type Dress, plainDress } from '../../player/dressing.ts';
import type { Shot } from '../camera.ts';
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
/** The stranger's walk down the beach: from this far inland, at this pace; kneeling this far from the player. */
const FROM_M = 26;
const WALK_M_S = 1.35;
const KNEEL_M = 1.1;
/** The walk up the shore together, and when it fades. */
const TOGETHER_M_S = 1.15;
const TOGETHER_S = 6.5;

type Phase = 'searching' | 'waking' | 'talking' | 'rising' | 'leaning' | 'walking' | 'gone';

export class Shore implements Beat {
  readonly name = 'shore';
  readonly skippable = false;
  private readonly story: Story;
  private beach: Beach | null = null;
  private phase: Phase = 'searching';
  private since = 0;
  private cues: Cues | null = null;
  private rose = 0;
  private walked = 0;
  done = false;

  constructor(story: Story) {
    this.story = story;
    const { stage } = story;
    storyCue('shore');
    stage.weatherTowards(MORNING, 0);
    stage.parts.ambience.set({ deep: 0, waves: 0.8, gulls: 0.6, wind: 0.3, rain: 0.12, fire: 0, creak: 0 }, 2);
    stage.parts.screen.lids(1);
    void this.search();
  }

  private async search(): Promise<void> {
    const { story } = this;
    const landmass = story.stage.parts.landmass();
    const frame = islandFrame(landmass);
    const harbour = landmass.plan?.harbour ?? [frame.plaza[0], frame.plaza[1]];
    let found: Beach | null = null;
    for (const search of SEARCHES) {
      const samples = Math.round((search.reachM * 2) / search.step) + 1;
      const [left, top] = [frame.plaza[0] - search.reachM, frame.plaza[1] - search.reachM];
      const { patch } = await story.land.ground(left, top, search.step, samples, samples);
      const heightAt = (x: number, y: number) => groundUnder(patch, x, y);
      found = findBeach(heightAt, [frame.plaza[0], frame.plaza[1]], harbour, landmass.cleared, search.reachM);
      if (found) break;
    }
    // A coast with no strand at all washes the player up on the plaza's own shore side, by its first spawn.
    const spawn = landmass.nodes[0]?.spawns[0] ?? [frame.plaza[0], frame.plaza[1]];
    found ??= { at: spawn, inland: frame.out + Math.PI, edge: spawn };
    this.beach = found;
    story.stage.parts.keepClose([found.at[0], found.at[1]]);
    story.stage.parts.birds.flock([found.at[0], found.at[1], 22], 9, 60, 21);
    this.phase = 'waking';
    this.since = 0;
    story.stage.parts.screen.fade(0, 2);
    this.cues = new Cues([[9.5, () => this.talk()]]);
  }

  private talk(): void {
    this.phase = 'talking';
    void this.story.stage.play('shore', true, { stranger: 'stranger' }).then(() => {
      this.phase = 'rising';
      this.rose = 0;
    });
  }

  private ground(x: number, y: number): number {
    return Math.max(0, this.story.stage.parts.scene.groundAt(x, y) ?? 0);
  }

  frame(tick: Tick): StoryFrame | null {
    const beach = this.beach;
    if (!beach) return null;
    const { stage } = this.story;
    this.since += tick.seconds;
    this.cues?.step(this.since);
    stage.stepWeather(tick.seconds);
    stage.parts.screen.lids(lidsAt(this.since));
    if (this.phase === 'rising') {
      this.rose = Math.min(1, this.rose + tick.seconds / 2.4);
      if (this.rose >= 1) {
        this.phase = 'leaning';
        void stage.play('standing', true, { stranger: 'stranger' }).then(() => (this.phase = 'walking'));
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
    const heads = new Map([['stranger', [stranger.x, stranger.y, stranger.z + 2] as const]]);
    const actors: Actor[] = this.phase === 'walking' || this.phase === 'gone' ? [you, stranger] : [stranger];
    return { shot: this.shot(beach, you, stranger), actors, heads, focus: [beach.at[0], beach.at[1]] };
  }

  /** The player and the stranger where they are now. */
  private people(beach: Beach): [Actor, Actor] {
    const [inlandX, inlandY] = [Math.sin(beach.inland), -Math.cos(beach.inland)];
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
    // Down the beach toward the player until kneeling by them; then beside them, walking with them.
    const coming = Math.max(0, FROM_M - Math.max(0, this.since - 3.5) * WALK_M_S);
    const arrived = coming <= KNEEL_M;
    const away = Math.max(KNEEL_M, coming);
    const side = beach.inland + Math.PI / 2;
    const strangerAt: [number, number] = walking
      ? [youAt[0] + Math.sin(side) * 0.9, youAt[1] - Math.cos(side) * 0.9]
      : [x + inlandX * away + Math.sin(side) * 0.6, y + inlandY * away - Math.cos(side) * 0.6];
    const kneeling = arrived && (this.phase === 'waking' || this.phase === 'talking' || this.phase === 'rising');
    const stranger: Actor = {
      id: STRANGER_ID,
      dress: STRANGER_DRESS,
      anim: walking || !arrived ? 'walk' : kneeling ? 'kneel' : 'idle',
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
    const lift = this.phase === 'rising' || this.phase === 'leaning' ? (this.phase === 'leaning' ? 1 : this.rose) : 0;
    const eased = lift * lift * (3 - 2 * lift);
    const eye: Point3 = [beach.at[0], beach.at[1], this.ground(beach.at[0], beach.at[1]) + 0.3 + 1.35 * eased];
    const strangerHead: Point3 = [stranger.x, stranger.y, stranger.z + (stranger.anim === 'kneel' ? 1.2 : 1.7)];
    const toStranger = lookAt(eye, strangerHead);
    // Up at the sky at first; the head turns to the stranger as they come near, and stays on them rising.
    const turn = Math.min(1, Math.max(0, (this.since - 6) / 2.5));
    const turned = turn * turn * (3 - 2 * turn);
    const sky = { yaw: beach.inland + 0.3, pitch: -1.2 };
    return {
      ...LENS,
      eye: [...eye],
      yaw: sky.yaw + Math.atan2(Math.sin(toStranger.yaw - sky.yaw), Math.cos(toStranger.yaw - sky.yaw)) * turned,
      pitch: sky.pitch + (toStranger.pitch - sky.pitch) * turned,
    };
  }
}

// The story's director: it runs the owner's beats in order, hands each what the last left (the camera's shot, the
// ships sighted, where the two ships met), lets a cutscene be skipped by holding Space, and, once the player has
// washed up on Saltmere's shore, gives the game back to the player at Overlook's social space.
import { HoldToSkip } from '../../cinema/cues.ts';
import type { InputFrame } from '../../player/input.ts';
import type { Shot } from '../camera.ts';
import { Battle } from './battle.ts';
import { type Beat, type BeatName, BEATS, keepProloguePlayed, prologuePlayed } from './beat.ts';
import { Deep } from './deep.ts';
import { Intro } from './intro.ts';
import type { Islands } from './islands.ts';
import { Making } from './making.ts';
import type { Nameplate } from './nameplate.ts';
import { Overboard } from './overboard.ts';
import { Calm, Ram } from './ram.ts';
import type { Sailed } from './sailing.ts';
import { Shore } from './shore.ts';
import { Sighted } from './sighted.ts';
import { StormDive } from './storm.ts';
import type { Story } from './story.ts';
import { Wake } from './wake.ts';
import { WreckFight } from './wreckFight.ts';
import { layoutAt, readWreck, type WreckLayout } from './wreckLayout.ts';
import { type WreckContext, WreckRun } from './wreckRun.ts';

/** How the story ends: into the game at Overlook, the story played or not. */
export type StoryEnd = 'played' | 'begun';

/** What the director keeps from one beat for the next. */
interface Carried {
  shot: Shot | null;
  inbound: Sailed[];
  meeting: { readonly x: number; readonly y: number } | null;
  layout: WreckLayout | null;
  run: Promise<WreckRun> | null;
}

/** A shot over the storm's sea for a beat begun with nothing before it (a page started at a later beat). */
function seaShot(story: Story): Shot {
  const { brig } = story;
  return { eye: [brig.x - 80, brig.y + 80, 40], yaw: brig.heading, pitch: 0.2, fov: 0.9, near: 0.3, far: 30_000 };
}

export class Prologue {
  private readonly story: Story;
  private readonly islands: Islands;
  private readonly nameplate: Nameplate;
  private readonly wreckContext: WreckContext;
  private readonly skipping = new HoldToSkip(1);
  private readonly played: boolean;
  private beat: Beat;
  private carried: Carried = { shot: null, inbound: [], meeting: null, layout: null, run: null };
  private clock = 0;
  /** Set once the story hands the player to the game. */
  end: StoryEnd | null = null;

  constructor(story: Story, islands: Islands, nameplate: Nameplate, wreckContext: WreckContext, from: BeatName | null) {
    this.story = story;
    this.islands = islands;
    this.nameplate = nameplate;
    this.wreckContext = wreckContext;
    this.played = prologuePlayed(localStorage);
    this.beat = this.make(from ?? 'intro');
  }

  /** The beat named, made from what the beats before it left. */
  private make(name: BeatName): Beat {
    const { story, carried } = this;
    const shot = () => carried.shot ?? seaShot(story);
    switch (name) {
      case 'intro':
        return new Intro(story.stage, this.islands, story.sailing);
      case 'storm':
        return new StormDive(story, shot());
      case 'creation':
        return new Making(story);
      case 'sighted':
        return new Sighted(story);
      case 'battle':
        return new Battle(story, carried.inbound.length ? carried.inbound : new Sighted(story).inbound);
      case 'calm':
        return new Calm(story, shot());
      case 'ram':
        return new Ram(story);
      case 'wake':
        return new Wake(story, this.wreck());
      case 'wreck':
        return new WreckFight(story, this.wreck(), this.openRun(), this.nameplate);
      case 'overboard':
        return new Overboard(story, this.wreck());
      case 'deep': {
        const [x, y] = this.wreck().arena.thule;
        return new Deep(story, [x + 10, y]);
      }
      case 'shore':
        return new Shore(story);
    }
  }

  /** The wreck, where the two ships met. */
  private wreck(): WreckLayout {
    if (!this.carried.layout) {
      const { brig } = this.story;
      const meeting = this.carried.meeting ?? { x: brig.x, y: brig.y };
      this.carried.layout = layoutAt(readWreck(), [meeting.x, meeting.y]);
    }
    return this.carried.layout;
  }

  /** The wreck's run, opened once behind the wake's black. */
  private openRun(): Promise<WreckRun> {
    this.carried.run ??= WreckRun.open(this.wreckContext, this.wreck(), this.wreck().wake.at);
    return this.carried.run;
  }

  /** What the beat that ended leaves, and the beat after it; a played story ends at the title. */
  private next(): void {
    const ended = this.beat;
    ended.leave?.();
    if (ended instanceof Sighted) this.carried.inbound = ended.inbound;
    if (ended instanceof Ram) this.carried.meeting = ended.meeting;
    if (ended instanceof Ram) void this.openRun();
    if (ended instanceof Intro && this.played) {
      this.end = 'begun';
      return;
    }
    if (ended instanceof Overboard) void this.carried.run?.then((run) => run.leave());
    if (ended instanceof Deep) void this.islands.home();
    if (ended instanceof Shore) {
      keepProloguePlayed(localStorage);
      this.end = 'played';
      return;
    }
    const index = BEATS.indexOf(ended.name);
    const following = BEATS[index + 1];
    if (following) this.beat = this.make(following);
  }

  /** The beat being played, for the page to ask what it takes. */
  get now(): Beat {
    return this.beat;
  }

  /** Keys reach the beat first; Space held skips a cutscene. */
  key(key: string, down: boolean): boolean {
    return this.beat.key?.(key, down) ?? false;
  }

  /** A tap or click: the title's beginning. */
  press(): void {
    if (this.beat instanceof Intro) this.beat.press();
  }

  /** Whether the player is playing a beat where the pointer is theirs to lock (the wreck). */
  get wantsPointer(): boolean {
    return this.beat instanceof WreckFight && this.beat.playing;
  }

  /** The sea fight the pointer drives, while one is on. */
  get fight(): Battle['fighting'] {
    return this.beat instanceof Battle ? this.beat.fighting : null;
  }

  /** One frame of the story: the beat played, drawn, and moved on once it is done. */
  frame(controls: InputFrame, seconds: number, size: { width: number; height: number }, viewport: { width: number; height: number }): void {
    if (this.end) return;
    this.clock += seconds;
    const { stage } = this.story;
    const beat = this.beat;
    if (beat.skippable && beat.skip) {
      const holding = controls.held('jump');
      const skipped = this.skipping.step(seconds, holding);
      stage.parts.screen.showSkip(holding ? this.skipping.share : null);
      if (skipped) {
        beat.skip();
        this.skipping.step(0, false);
      }
    } else stage.parts.screen.showSkip(null);
    const shown = beat.frame({ seconds, clock: this.clock, controls, size, viewport });
    if (shown) {
      this.carried.shot = shown.shot;
      stage.draw(shown, size, this.clock, seconds);
    }
    if (beat.done) this.next();
  }
}

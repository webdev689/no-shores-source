// The story's director: it runs the beats in order, hands each what the last left (the camera's shot, the
// ships sighted, where the two ships met), lets a cutscene be skipped by holding Space, and, once the player has
// washed up on Saltmere's shore, gives the game back to the player at Overlook's social space.
import { HoldToSkip } from '../../cinema/cues.ts';
import type { InputFrame } from '../../player/input.ts';
import type { Shot } from '../camera.ts';
import { boundWord } from '../controls.ts';
import type { GearHere } from '../gearScreen.ts';
import { dialogueWaits } from '../../speech/dialogue.ts';
import { hushed } from './music.ts';
import { asWreck, Battle, type Wreck } from './battle.ts';
import { type Beat, type BeatName, BEATS, keepProloguePlayed, prologuePlayed, SCENE } from './beat.ts';
import { Deep } from './deep.ts';
import { Intro } from './intro.ts';
import { Making } from './making.ts';
import type { Nameplate } from './nameplate.ts';
import { Overboard } from './overboard.ts';
import { Calm } from './calm.ts';
import { Ram } from './ram.ts';
import type { Sailed } from './sailing.ts';
import { Shore } from './shore.ts';
import { inboundAt, Sighted } from './sighted.ts';
import { StormDive } from './storm.ts';
import type { Story } from './story.ts';
import { Wake } from './wake.ts';
import { WreckFight } from './wreckFight.ts';
import { layoutAt, readWreck, type WreckLayout } from './wreckLayout.ts';
import { type WreckContext, WreckRun } from './wreckRun.ts';
import { WreckScenery } from './wreckScenery.ts';

/** How the story ends: into the game at Overlook, the story played or not. */
export type StoryEnd = 'played' | 'begun';

/** What the director keeps from one beat for the next. */
interface Carried {
  shot: Shot | null;
  inbound: Sailed[];
  /** The beaten ships the fight left, as the calm and then the ram draw them on. */
  wrecks: Wreck[] | null;
  meeting: { readonly x: number; readonly y: number } | null;
  layout: WreckLayout | null;
  scenery: WreckScenery | null;
  run: Promise<WreckRun> | null;
}

/** How many of a beat's frames are drawn under the black before it fades in: its pictures' and pipelines' first
 *  making falls there, unseen. */
const WARM_FRAMES = 3;

/** A shot over the storm's sea for a beat begun with nothing before it (a page started at a later beat). */
function seaShot(story: Story): Shot {
  const { brig } = story;
  return { eye: [brig.x - 80, brig.y + 80, 40], yaw: brig.heading, pitch: 0.2, fov: 0.9, near: 0.3, far: 30_000 };
}

export class Prologue {
  private readonly story: Story;
  private readonly nameplate: Nameplate;
  private readonly wreckContext: WreckContext;
  private readonly skipping = new HoldToSkip(1);
  private readonly played: boolean;
  /** Whether a touch is held on the screen, which skips a cutscene as Space held does. */
  private touching = false;
  private beat: Beat;
  private carried: Carried = {
    shot: null,
    inbound: [],
    wrecks: null,
    meeting: null,
    layout: null,
    scenery: null,
    run: null,
  };
  private clock = 0;
  /** The black held before a beat that begins from it: how long it has held, and how many of the beat's frames have
   *  been drawn under it. */
  private held: { seconds: number; frames: number } | null = null;
  /** Set once the story hands the player to the game. */
  end: StoryEnd | null = null;

  constructor(story: Story, nameplate: Nameplate, wreckContext: WreckContext, from: BeatName | null) {
    this.story = story;
    this.nameplate = nameplate;
    this.wreckContext = wreckContext;
    this.played = prologuePlayed(localStorage);
    this.beat = this.make(from ?? 'intro');
    this.hold();
  }

  /** Holds the black before the beat now begun, if it begins from black; one that does not, begun while the black
   *  still held (the beat before skipped under it), fades in at once. */
  private hold(): void {
    if (this.held && !this.beat.fromBlack) this.fadeIn();
    this.held = this.beat.fromBlack ? { seconds: 0, frames: 0 } : null;
  }

  /** The beat now begun fades in from black, over its own time or SCENE.inS; whatever fade the screen was easing
   *  (a failed beat's clearing) gives way to it. */
  private fadeIn(): void {
    const { screen } = this.story.stage.parts;
    screen.fade(1, 0);
    screen.fade(0, this.beat.fadeInS ?? SCENE.inS);
  }

  /** The beat named, made from what the beats before it left. */
  protected make(name: BeatName): Beat {
    const { story, carried } = this;
    const shot = () => carried.shot ?? seaShot(story);
    const wrecks = () => carried.wrecks ?? inboundAt(story.brig).map(asWreck);
    // Past the intro the story goes to sea, and on to the wreck: its mesh and light come while the beats before play.
    if (name !== 'intro') void this.wreckContext.drawn().catch(() => undefined);
    switch (name) {
      case 'intro':
        return new Intro(story.stage, story.sailing, story.gate ?? null);
      case 'storm':
        return new StormDive(story, shot());
      case 'creation':
        return new Making(story);
      case 'sighted':
        return new Sighted(story, carried.shot);
      case 'battle':
        return new Battle(story, carried.inbound.length ? carried.inbound : inboundAt(story.brig));
      case 'calm':
        return new Calm(story, shot(), wrecks());
      case 'ram':
        return new Ram(story, wrecks());
      case 'wake':
        return new Wake(story, this.wreck(), this.scenery(), this.openRun());
      case 'wreck':
        return new WreckFight(story, this.wreck(), this.scenery(), this.openRun(), this.nameplate);
      case 'overboard':
        return new Overboard(story, this.wreck(), this.scenery());
      case 'deep':
        return new Deep(story, this.wreck(), this.scenery());
      case 'shore':
        return new Shore(story);
    }
  }

  /** Where the two ships met, and the wreck laid there. */
  private meeting(): readonly [number, number] {
    const { brig } = this.story;
    const meeting = this.carried.meeting ?? { x: brig.x, y: brig.y };
    return [meeting.x, meeting.y];
  }

  private wreck(): WreckLayout {
    this.carried.layout ??= layoutAt(readWreck(), this.meeting());
    return this.carried.layout;
  }

  /** The wreck as drawn, made once for every beat that shows it, from the wake to the deep, each asking again for a
   *  wreck that failed to come. */
  private scenery(): WreckScenery {
    const { gpu, drawn } = this.wreckContext;
    this.carried.scenery ??= new WreckScenery(gpu, drawn, this.wreck(), this.meeting());
    this.carried.scenery.again();
    return this.carried.scenery;
  }

  /** The wreck's run, opened once behind the wake's black. A run that fails to open is the wreck's beat to tell. */
  private openRun(): Promise<WreckRun> {
    if (!this.carried.run) {
      this.carried.run = WreckRun.open(this.wreckContext, this.wreck(), this.meeting(), this.scenery());
      void this.carried.run.catch(() => undefined);
    }
    return this.carried.run;
  }

  /** The beat after the one that ended, made from what it left; a beat that cannot be made is passed over. `before`
   *  runs only if a beat follows, before each beat tried lays anything over the view. */
  private next(before: () => void = () => undefined): void {
    const ended = this.beat;
    // A hold on Space belongs to the cutscene it began on: the next must be held for its own second.
    this.skipping.step(0, false);
    try {
      this.carry(ended);
    } catch (error) {
      console.error(`what the story's ${ended.name} left could not be carried on:`, error);
    }
    if (this.end) return;
    for (let index = BEATS.indexOf(ended.name) + 1; index < BEATS.length; index++) {
      const following = BEATS[index];
      if (!following) break;
      before();
      try {
        this.beat = this.make(following);
        this.hold();
        return;
      } catch (error) {
        console.error(`the story's ${following} could not begin:`, error);
      }
    }
    // Nothing after it could begin: the game is the player's.
    this.end = 'played';
  }

  /** What the beat that ended leaves for those after it; a played story ends at the title, and the story at the shore. */
  private carry(ended: Beat): void {
    ended.leave?.();
    if (ended instanceof Sighted) this.carried.inbound = ended.inbound;
    if (ended instanceof Battle || ended instanceof Calm) this.carried.wrecks = ended.wrecks;
    if (ended instanceof Ram) this.carried.meeting = ended.meeting;
    if (ended instanceof Ram) void this.openRun();
    if (ended.onward ?? (ended instanceof Intro && this.played)) {
      this.end = 'begun';
      return;
    }
    // The room is let go once the wreck's fight is over, and the wreck's drawing once the deep has shown it last.
    if (ended instanceof WreckFight) this.carried.run = null;
    if (ended instanceof Deep) {
      this.carried.scenery?.destroy();
      this.carried.scenery = null;
    }
    if (ended instanceof Shore) {
      keepProloguePlayed(localStorage);
      this.end = 'played';
    }
  }

  /** The beat being played, for the page to ask what it takes. */
  get now(): Beat {
    return this.beat;
  }

  /** Keys reach the beat first; Space held skips a cutscene. */
  key(key: string, down: boolean): boolean {
    return this.beat.key?.(key, down) ?? false;
  }

  /** A tap or click: the title's beginning, or the stranger's hand taken on the shore; none while a line of the
   *  dialogue box waits, whose press it is. */
  press(): void {
    if (dialogueWaits()) return;
    if (this.beat instanceof Intro || this.beat instanceof Shore) this.beat.press();
  }

  /** A touch on the screen held down, or let go. */
  touch(held: boolean): void {
    this.touching = held;
  }

  /** Whether the player is playing a beat where the pointer is theirs to lock (the wreck). */
  get wantsPointer(): boolean {
    return this.beat instanceof WreckFight && this.beat.playing;
  }

  /** The player's gear for the menu, while they play on the wreck; none elsewhere in the story. */
  get gear(): GearHere | null {
    return this.beat instanceof WreckFight ? this.beat.gear : null;
  }

  /** The sea fight the pointer drives, while one is on. */
  get fight(): Battle['fighting'] {
    return this.beat instanceof Battle ? this.beat.fighting : null;
  }

  /** One frame of the story: the beat played, drawn, and moved on once it is done. A beat that fails is left for the
   *  next, so the story never stops on a failure. */
  frame(
    controls: InputFrame,
    seconds: number,
    size: { width: number; height: number },
    viewport: { width: number; height: number },
  ): void {
    if (this.end) return;
    try {
      this.play(controls, seconds, size, viewport);
    } catch (error) {
      this.failed(this.beat, error);
    }
  }

  private play(
    controls: InputFrame,
    seconds: number,
    size: { width: number; height: number },
    viewport: { width: number; height: number },
  ): void {
    const beat = this.beat;
    // A beat holding its world still holds the story's time, though its own frame still hears what is pressed.
    const passing = beat.still ? 0 : seconds;
    this.clock += passing;
    const { stage } = this.story;
    stage.step(passing);
    const { held } = this;
    if (held) {
      // Black between scenes, at least SCENE.blackS, and longer while the beat's scene is coming, the logo over it.
      held.seconds += seconds;
      const waiting = held.seconds < SCENE.blackS || beat.ready === false;
      stage.parts.screen.fade(1, 0);
      stage.parts.screen.showLoading(waiting && held.seconds >= SCENE.blackS);
      if (waiting) {
        stage.parts.music.frame(beat.music?.() ?? hushed(), seconds);
        return;
      }
    }
    if (beat.skippable && beat.skip) {
      const holding = controls.held('jump') || this.touching;
      const skipped = this.skipping.step(seconds, holding);
      // The hint shows, faint, whenever there is something to skip, so the skip can be found before it is held.
      stage.parts.screen.showSkip(holding ? this.skipping.share : 0, boundWord('jump'));
      if (skipped) {
        // A skipped cutscene's world is left as its end leaves it, but none of its words are said.
        beat.skip();
        stage.hush();
        this.skipping.step(0, false);
      }
    } else {
      // A hold begun on a beat that could be skipped never carries over to skip one after it.
      this.skipping.step(0, false);
      stage.parts.screen.showSkip(null);
    }
    const shown = beat.frame({ seconds, clock: this.clock, controls, size, viewport });
    stage.parts.music.frame(beat.music?.() ?? hushed(), seconds);
    if (shown) {
      this.carried.shot = shown.shot;
      stage.draw(shown, size, this.clock, passing);
    }
    if (held && shown && ++held.frames >= WARM_FRAMES) {
      this.fadeIn();
      this.held = null;
    }
    if (beat.done) this.next();
  }

  /** A beat that cannot go on: what it said is stopped, and the story goes on past it, what the beat laid over the
   *  view cleared first. A story that ends there keeps its screen, so its black lifts only once the game's veil is
   *  up under it. */
  private failed(beat: Beat, error: unknown): void {
    console.error(`the story's ${beat.name} could not go on:`, error);
    const { stage } = this.story;
    stage.hush();
    this.next(() => stage.parts.screen.clear());
  }

  /** The story has ended: the wreck's drawing and its room, if a beat after it never let them go, are let go now. */
  leave(): void {
    this.carried.scenery?.destroy();
    this.carried.scenery = null;
    void this.carried.run?.then(
      (run) => run.leave(),
      () => undefined,
    );
    this.carried.run = null;
  }
}

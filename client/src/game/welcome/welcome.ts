// Elder Maren Hale's welcome, played on foot in Overlook's social space once the stranger has gone: she comes to the
// player and walks them round the plaza (`walk.ts`), saying each stop's lines in the dialogue box, and the HUD saying
// to follow her while the player lags. It is no cutscene: the player
// walks where they like the whole time. While she walks, her counter stands empty; opening it ends the walk, and she
// is back behind it, the plaza's own figure of her. Due once the story ends, kept in the browser with the stops said,
// so a walk ended early (the place left, the page reloaded, the player gone far from her) takes up from them on the
// next arrival; played once every stop is said, or once her counter is opened.
import type { CardAt, Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Cast, Line } from '../../speech/cast.ts';
import { onScreen, type Shot } from '../camera.ts';
import { KEEPERS } from '../keepers.ts';
import { WayGraph } from '../life/ways.ts';
import { ACTOR_IDS, actorCards, overHead } from '../prologue/actors.ts';
import { headOnView } from '../prologue/stage.ts';
import { awayFromCounters, plazaFrameOf, plazaOf } from '../townsfolk.ts';
import type { NodeInfo } from '../worldData.ts';
import { HER_COUNTER, WelcomeWalk } from './walk.ts';

/** Where the browser keeps that the welcome has been played, beside the story's own mark (`noshores.prologue`), and
 *  the scenes said in a walk ended early, by name. */
export const WELCOME_KEY = 'noshores.welcome';
export const WELCOME_SAID_KEY = 'noshores.welcome.said';
/** Her figure's number among the story's placed figures, clear of the stranger's. */
const MAREN_ID = ACTOR_IDS + 90;

/** The welcome's mark in the browser: due once the story ends, played once given, forgone once left before it. */
type WelcomeMark = 'due' | 'played' | 'forgone';

function welcomeMark(kept: Pick<Storage, 'getItem'>, key = WELCOME_KEY): string | null {
  try {
    return kept.getItem(key);
  } catch {
    return null;
  }
}

/** The scenes said in a walk ended early. */
export const welcomeSaid = (kept: Pick<Storage, 'getItem'>): string[] =>
  (welcomeMark(kept, WELCOME_SAID_KEY) ?? '').split(',').filter(Boolean);

export const welcomePlayed = (kept: Pick<Storage, 'getItem'>): boolean => welcomeMark(kept) === 'played';
export const welcomeDue = (kept: Pick<Storage, 'getItem'>): boolean => welcomeMark(kept) === 'due';
/** Whether the browser holds no mark of the welcome at all: neither due, played nor forgone. */
export const welcomeUnmarked = (kept: Pick<Storage, 'getItem'>): boolean => welcomeMark(kept) === null;

export function keepWelcome(kept: Pick<Storage, 'setItem'>, mark: WelcomeMark, said: Iterable<string> = []): void {
  try {
    kept.setItem(WELCOME_KEY, mark);
    kept.setItem(WELCOME_SAID_KEY, [...said].join(','));
  } catch {
    // A browser that keeps nothing may play the welcome again after the story, or lose it to a reload.
  }
}

/** What the welcome speaks with: the dialogue box, and the HUD's prompt. */
export interface WelcomeVoice {
  readonly dialogue: {
    play(lines: readonly Line[], cast: Cast, options: { auto: boolean }): Promise<void>;
    skip(): void;
    frame(seconds: number): void;
    remove(): void;
  };
  readonly objective: { show(word: string, line: string, seconds?: number): void; clear(): void; remove(): void };
}

/** What the welcome stands on: the figures' forge, the ground's height, its lines and where it is kept. */
export interface WelcomeParts {
  readonly forge: Cards;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly cast: Cast;
  readonly scenes: Readonly<Record<string, readonly Line[]>>;
  readonly kept: Pick<Storage, 'setItem'>;
}

export class Welcome {
  private readonly walk: WelcomeWalk;
  private readonly parts: WelcomeParts;
  private readonly voice: WelcomeVoice;
  private readonly dress: Dress = KEEPERS.lamplighters.dress;
  /** Her feet's height, found again as she walks. */
  private z: number;
  /** Whether the follow prompt shows. */
  private prompting = false;
  done = false;

  /** The welcome in a social space with the player at `you`, seen through `shot`, taken up after the scenes `said`;
   *  null where its plaza has none of her counters. She starts out of the shot where she can. */
  static begin(
    node: NodeInfo,
    parts: WelcomeParts,
    voice: () => WelcomeVoice,
    you: { readonly x: number; readonly y: number; readonly z: number },
    said: readonly string[],
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
  ): Welcome | null {
    const seen = ([x, y]: readonly [number, number]) => {
      const feet = { x, y, z: parts.groundAt(x, y) ?? you.z };
      const onView = (point: readonly [number, number, number]) =>
        headOnView(onScreen(shot, viewport, point), viewport);
      return onView([feet.x, feet.y, feet.z]) !== null || onView(overHead(feet)) !== null;
    };
    const frame = plazaFrameOf(plazaOf(node));
    const ways = new WayGraph(node.ways ?? { points: [], links: [] });
    const walk = WelcomeWalk.round(node.stations ?? [], frame, ways, [you.x, you.y], said, seen);
    return walk ? new Welcome(walk, parts, voice()) : null;
  }

  private constructor(walk: WelcomeWalk, parts: WelcomeParts, voice: WelcomeVoice) {
    this.walk = walk;
    this.parts = parts;
    this.voice = voice;
    this.z = parts.groundAt(walk.maren.x, walk.maren.y) ?? 0;
    awayFromCounters.add(HER_COUNTER);
  }

  /** A frame on foot with the player at `you`: she walks or waits, speaks what the walk asks, and her card is drawn;
   *  nothing once the welcome is done. While `held` (the menu or a keeper's screen open over the view) she stands
   *  where she is, her words wait, and no stop's scene begins, so she never talks over a keeper. */
  frame(
    shot: Shot,
    seconds: number,
    clock: number,
    you: { readonly x: number; readonly y: number },
    held = false,
  ): CardAt[] {
    if (this.done) return [];
    // Behind a screen the prompt is cleared, as the screen stands under it; it comes back on the first frame after.
    if (held) this.prompt(false);
    else {
      const asked = this.walk.step(seconds, [you.x, you.y]);
      if (asked.say) this.say(asked.say);
      if (this.walk.phase === 'done') {
        this.finish();
        return [];
      }
      this.prompt(asked.lagging);
    }
    const passed = held ? 0 : seconds;
    const { maren } = this.walk;
    this.z = this.parts.groundAt(maren.x, maren.y) ?? this.z;
    this.voice.dialogue.frame(passed);
    const anim = maren.walking && !held ? 'walk' : 'idle';
    return actorCards(
      [{ id: MAREN_ID, dress: this.dress, anim, ...maren, z: this.z }],
      this.parts.forge,
      shot.eye,
      clock,
    );
  }

  /** The player has left the social space: the welcome ends where she is, her words with it, still due. */
  leave(): void {
    if (this.done) return;
    this.walk.end();
    this.finish();
  }

  /** The menu opens at `view`: her own counter's screen ends the walk there, the welcome played. */
  counterOpened(view: string): void {
    if (this.done || view !== HER_COUNTER) return;
    keepWelcome(this.parts.kept, 'played');
    this.walk.end();
    this.finish();
  }

  /** Says a stop's lines, its keepers marked; once said, she walks on. */
  private say(scene: string): void {
    const lines = this.parts.scenes[scene] ?? [];
    const said = () => {
      if (this.done) return;
      this.walk.said();
      // Kept scene by scene, so a walk ended early takes up where it was.
      keepWelcome(this.parts.kept, this.walk.given ? 'played' : 'due', this.walk.given ? [] : this.walk.heard);
    };
    this.voice.dialogue.play(lines, this.parts.cast, { auto: true }).then(said, (error: unknown) => {
      console.error(`the welcome's ${scene} could not be played:`, error);
      said();
    });
  }

  /** The follow prompt, shown whenever the player lags and hidden as they catch up, for as long as the walk lasts. */
  private prompt(lagging: boolean): void {
    if (lagging === this.prompting) return;
    this.prompting = lagging;
    if (lagging) this.voice.objective.show('Follow', 'Elder Maren Hale', Infinity);
    else this.voice.objective.clear();
  }

  private finish(): void {
    this.done = true;
    awayFromCounters.delete(HER_COUNTER);
    this.voice.dialogue.remove();
    this.voice.objective.remove();
  }
}

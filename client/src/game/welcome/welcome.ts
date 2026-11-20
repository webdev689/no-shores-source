// Elder Maren Hale's welcome, played on foot in Overlook's social space once the stranger has gone: she comes from
// her counter to the player and walks them round the plaza (`walk.ts`), saying each stop's lines in the dialogue box,
// the keepers she names marked over their heads, and the HUD saying to follow her while the player lags. It is no
// cutscene: the player walks where they like the whole time. While she walks, her counter stands empty; once she is
// back behind it the plaza's own figure of her takes over. Due once the story ends, and played once begun, in the
// browser.
import type { CardAt, Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Cast, EmoteKind, Line } from '../../speech/cast.ts';
import { onScreen, type Shot } from '../camera.ts';
import { KEEPERS } from '../keepers.ts';
import type { StationInfo } from '../nodes.ts';
import { ACTOR_IDS, actorCards, overHead } from '../prologue/actors.ts';
import { headOnView } from '../prologue/stage.ts';
import { awayFromCounters, plazaFrameOf, plazaOf } from '../townsfolk.ts';
import type { NodeInfo } from '../worldData.ts';
import { HER_COUNTER, WelcomeWalk } from './walk.ts';

/** Where the browser keeps that the welcome has been played, beside the story's own mark (`overlook.prologue`). */
export const WELCOME_KEY = 'overlook.welcome';
/** Her figure's number among the story's placed figures, clear of the stranger's. */
const MAREN_ID = ACTOR_IDS + 90;
/** The mark over a keeper she names. */
const NAMED_EMOTE: EmoteKind = 'alert';
/** Her head's name for the speech over it, and her speaker's. */
const HER_HEAD = 'maren';

/** The welcome's mark in the browser: due once the story ends, played once begun, forgone once left before it. */
type WelcomeMark = 'due' | 'played' | 'forgone';

function welcomeMark(kept: Pick<Storage, 'getItem'>): string | null {
  try {
    return kept.getItem(WELCOME_KEY);
  } catch {
    return null;
  }
}

export const welcomePlayed = (kept: Pick<Storage, 'getItem'>): boolean => welcomeMark(kept) === 'played';
export const welcomeDue = (kept: Pick<Storage, 'getItem'>): boolean => welcomeMark(kept) === 'due';

export function keepWelcome(kept: Pick<Storage, 'setItem'>, mark: WelcomeMark): void {
  try {
    kept.setItem(WELCOME_KEY, mark);
  } catch {
    // A browser that keeps nothing may play the welcome again after the story, or lose it to a reload.
  }
}

/** What the welcome speaks and marks with: the dialogue box, the marks over heads, and the HUD's prompt. */
export interface WelcomeVoice {
  readonly dialogue: {
    play(lines: readonly Line[], cast: Cast, options: { auto: boolean }): Promise<void>;
    skip(): void;
    frame(seconds: number): void;
    remove(): void;
  };
  readonly overheads: {
    emote(head: string, kind: EmoteKind): void;
    frame(seconds: number, heads: ReadonlyMap<string, readonly [number, number] | null>): void;
    remove(): void;
  };
  readonly objective: { show(word: string, line: string, seconds?: number): void; clear(): void; remove(): void };
}

/** What the welcome stands on: the figures' forge, the ground's height, its lines and where it is kept as played. */
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

  /** The welcome in a social space, begun and kept as played; null where its plaza has none of her counters. */
  static begin(node: NodeInfo, parts: WelcomeParts, voice: () => WelcomeVoice): Welcome | null {
    const walk = WelcomeWalk.round(node.stations ?? [], plazaFrameOf(plazaOf(node)));
    if (!walk) return null;
    keepWelcome(parts.kept, 'played');
    return new Welcome(walk, parts, voice());
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
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: { readonly x: number; readonly y: number },
    held = false,
  ): CardAt[] {
    if (this.done) return [];
    if (!held) {
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
    const heads = new Map<string, readonly [number, number] | null>();
    const seen = (point: readonly [number, number, number]) => headOnView(onScreen(shot, viewport, point), viewport);
    heads.set(HER_HEAD, seen(overHead({ ...maren, z: this.z })));
    for (const station of this.namedOthers()) heads.set(station.kind, seen(keeperHead(station, this.parts.groundAt)));
    this.voice.overheads.frame(passed, heads);
    this.voice.dialogue.frame(passed);
    const anim = maren.walking ? 'walk' : 'idle';
    return actorCards(
      [{ id: MAREN_ID, dress: this.dress, anim, ...maren, z: this.z }],
      this.parts.forge,
      shot.eye,
      clock,
    );
  }

  /** The player has left the social space: the welcome ends where she is, her words with it. */
  leave(): void {
    if (this.done) return;
    this.walk.end();
    this.finish();
  }

  /** Says a stop's lines, its keepers marked; once said, she walks on. */
  private say(scene: string): void {
    for (const station of this.namedOthers()) this.voice.overheads.emote(station.kind, NAMED_EMOTE);
    const lines = this.parts.scenes[scene] ?? [];
    const said = () => this.walk.said();
    this.voice.dialogue.play(lines, this.parts.cast, { auto: true }).then(said, (error: unknown) => {
      console.error(`the welcome's ${scene} could not be played:`, error);
      said();
    });
  }

  /** The keepers a stop names but her own counter, where she is the one speaking, her words over her own head. */
  private namedOthers(): readonly StationInfo[] {
    return this.walk.named.filter((station) => station.kind !== HER_COUNTER);
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
    this.voice.overheads.remove();
    this.voice.objective.remove();
  }
}

/** The point over a keeper's head behind their counter. */
function keeperHead(station: StationInfo, groundAt: (x: number, y: number) => number | null) {
  const [x, y] = station.keeper;
  return overHead({ x, y, z: groundAt(x, y) ?? 0 });
}

// The houses' roads in the browser: once the story and Elder Maren Hale's welcome are past, the tracker shows the
// quest walked; its lines are said in the dialogue box one scene after another (questWatch.ts); a counter that a talk
// goal of the task names offers to speak with its keeper; the HUD marks where the task's next goal stands and the
// held map the nodes its goals name; and what a road gives is toasted. Each is the room's word read, never a
// judgement of the page's own.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { placeMarks } from '../../overworld/overworldMarks.ts';
import { type Cast, type Line, castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Shot } from '../camera.ts';
import type { Use } from '../footGear.ts';
import type { ScreenMark } from '../hudMarks.ts';
import { distanceText } from '../hudLaw.ts';
import { HARBOURMASTER, keeperOf } from '../keepers.ts';
import type { Quest } from '../tasks.ts';
import { worldOutput } from '../uiSounds.ts';
import { COUNTERS, goalNodes, markedGoal, talkAt, trackedOf } from './questBook.ts';
import { QuestWatch } from './questWatch.ts';

/** What the lines are said in: the dialogue box, as the welcome's (welcome.ts WelcomeVoice). */
export interface QuestVoice {
  play(lines: readonly Line[], cast: Cast, options: { auto: boolean }): Promise<void>;
  frame(seconds: number): void;
}

/** How long a toast for a road's gift stands, milliseconds. */
const TOAST_MS = 4000;
/** How far over the ground the quest's mark stands, metres; its size on the screen; and how far in from the top and
 *  foot it is held, clear of the place's name and the fight's bars. */
const MARK_RISE_M = 2;
const MARK_PX = 28;
const MARK_EDGES = { top: 96, foot: 160 } as const;

export class Quests {
  private readonly watch = new QuestWatch();
  private readonly voice: () => QuestVoice;
  private readonly cast: Cast;
  private readonly scenes: Readonly<Record<string, readonly Line[]>>;
  private readonly now: () => number;
  private spoken: QuestVoice | null = null;
  private gear: GearState | null = null;
  /** The room's word on the player's gear where they are now, none until the room there has said it. */
  private here: GearState | null = null;
  private past = false;
  private readonly waiting: string[] = [];
  private saying = false;
  private toasted: { readonly text: string; readonly until: number }[] = [];
  /** The talk goals asked of the room and said, by quest, task and goal, so a second press says them no more. */
  private readonly asked = new Set<string>();

  constructor(
    parts: { readonly cast: Cast; readonly scenes: Readonly<Record<string, readonly Line[]>> },
    voice: () => QuestVoice,
    now: () => number = () => performance.now(),
  ) {
    [this.cast, this.scenes, this.voice, this.now] = [parts.cast, parts.scenes, voice, now];
  }

  /** The room's word on the player's gear, wherever they are: none, as a room just joined has given, keeps the last
   *  for the roads but marks no place, which only that room can say. */
  hear(gear: GearState | null | undefined): void {
    this.here = gear ?? null;
    if (gear) this.gear = gear;
  }

  /** A frame `seconds` long, `past` whether the story and the welcome are past, `held` while a screen stands over the
   *  view: what is new is taken, and the next scene waiting is said once none is and nothing holds the view. */
  frame(seconds: number, past: boolean, held: boolean): void {
    this.past = past;
    const now = this.now();
    const news = this.watch.look(this.gear, past, now);
    this.waiting.push(...news.scenes);
    this.toasted = [
      ...this.toasted.filter((toast) => toast.until > now),
      ...news.toasts.map((text) => ({ text, until: now + TOAST_MS })),
    ];
    const next = !held && !this.saying ? this.waiting.shift() : undefined;
    if (next !== undefined) this.say(next);
    this.spoken?.frame(held ? 0 : seconds);
  }

  /** Says `scene`'s lines, the next waiting once they end. */
  private say(scene: string): void {
    const lines = this.scenes[scene];
    if (!lines) return console.error(`the roads' scene ${scene} is not in houses.json`);
    this.spoken ??= this.voice();
    this.saying = true;
    const said = () => void (this.saying = false);
    this.spoken.play(lines, this.cast, { auto: true }).then(said, (error: unknown) => {
      console.error(`the roads' scene ${scene} could not be played:`, error);
      said();
    });
  }

  /** The toasts for what the roads gave lately. */
  get toasts(): string[] {
    return this.toasted.map((toast) => toast.text);
  }

  /** What the tracker shows: the quest walked, once the story and the welcome are past. */
  get tracked(): Quest | null {
    return this.past ? trackedOf(this.gear?.quest) : null;
  }

  /** The nodes the task's goals name, for the held map. */
  get nodes(): string[] {
    return this.past ? goalNodes(this.gear?.quest) : [];
  }

  /** Where the task's next goal with a place stands in the player's room, x and y; null where none is here. */
  get goalAt(): readonly [number, number] | null {
    const where = this.past ? this.here?.quest?.at : null;
    return where ? [where[0], where[1]] : null;
  }

  /** What E does at the counter of a station of kind `counter` (its offer's view), while a talk goal of the task names
   *  it: speaks with its keeper, asking the room (ask 64) and saying the goal's scene. Null otherwise, so the counter
   *  opens as before. */
  speak(counter: string, ask: (asked: GearAsk) => void): Use | null {
    const state = this.gear?.quest;
    const goal = this.past ? talkAt(state, counter) : null;
    const column = COUNTERS[counter];
    if (!state || !goal || column === undefined) return null;
    const keeper = keeperOf(counter);
    const name = (keeper && this.cast.speakers[keeper.speaker]?.name) ?? HARBOURMASTER;
    const key = `${state.quest} ${state.task} ${counter}`;
    return {
      words: `Speak with ${name}`,
      run: () => {
        ask({ kind: ASKS.speakWith, column });
        if (this.asked.has(key)) return;
        this.asked.add(key);
        if (goal.scene) this.waiting.push(goal.scene);
      },
    };
  }

  /** The quest's mark on the screen through `shot` on a picture `viewport` CSS pixels, standing on `groundAt`'s
   *  ground, named for its goal, its distance from the player at `from`; none while there is no place to mark. */
  marks(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    from: readonly [number, number],
    groundAt: (x: number, y: number) => number | null,
  ): ScreenMark[] {
    const where = this.goalAt;
    const goal = markedGoal(this.gear?.quest);
    if (!where || !goal) return [];
    const [x, y] = where;
    const point = [x, y, (groundAt(x, y) ?? shot.eye[2]) + MARK_RISE_M] as const;
    const pose = poseOf({ eye: [...shot.eye], forward: forwardOf(shot.yaw, -shot.pitch) }, shot.fov);
    const mark = { id: 'quest', kind: 'mission', name: goal.text, at: point, edge: true } as const;
    const note = distanceText(Math.hypot(x - from[0], y - from[1]));
    return placeMarks([mark], pose, viewport, MARK_EDGES).map((placed) => ({
      ...placed,
      kind: 'quest',
      sizePx: MARK_PX,
      note,
      chosen: false,
      named: true,
      locked: false,
    }));
  }
}

/** The roads on the game's page: their lines read from content/story/, said in a dialogue box of their own. */
export function questsOn(stack: Stack): Quests {
  const read = castOf(cast);
  return new Quests({ cast: read, scenes: scenesOf(houses, read) }, () => new DialogueBox(stack, worldOutput));
}

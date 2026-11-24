// The houses' roads in the browser: once the story and the stranger's welcome are past, the tracker shows the
// quest walked; its lines are said in the dialogue box one scene after another (questWatch.ts); a counter that a talk
// goal of the task names offers to speak with its keeper; the HUD marks where the task's next goal stands and the
// held map the nodes its goals name; a varied step's figures and ward stand in the world (questFigures.ts); and what
// a road gives is toasted. Each is the room's word read, never a judgement of the page's own.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import type { MarkedFoe } from '../../combat/foePlate.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { placeMarks } from '../../overworld/overworldMarks.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import type { FoeType } from '../../rules/roster.ts';
import { type Cast, type Line, castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Shot } from '../camera.ts';
import type { Use } from '../footGear.ts';
import type { ScreenMark } from '../hudMarks.ts';
import { distanceText } from '../../plus/compass.ts';
import { HARBOURMASTER, keeperOf } from '../keepers.ts';
import { rosterFor } from '../footRoom.ts';
import { actorCards } from '../prologue/actors.ts';
import type { Quest } from '../tasks.ts';
import { worldOutput } from '../uiSounds.ts';
import { COUNTERS, buyAt, goalNodes, talkAt, trackedOf } from './questBook.ts';
import { FIGURE_MOVES, FigureGlides, questActors, wardPlate } from './questFigures.ts';
import { type Chart, type Guide, type Standing, guideOf } from './waypoint.ts';
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
  private readonly watch: QuestWatch;
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
  /** The scene being said, if one is. */
  private saying: string | null = null;
  private toasted: { readonly text: string; readonly until: number }[] = [];
  /** The step's figures, drawn between the room's words on them. */
  private readonly glides = new FigureGlides();
  /** When the room's last word on the quest came, milliseconds on `now`. */
  private heardAt = 0;
  /** Where the compass last pointed for the quest walked, and each step's word, from where the player stood. */
  private guided: Guide = { at: null, notes: [] };
  /** The forge the figures are drawn by, and the rules' roster their looks are read from, once it has come. */
  private readonly forge: Cards | null;
  roster: readonly FoeType[] = [];

  /** The roads with their lines (`parts`), the browser's keeping of the begins said for the account `parts.account`
   *  names, a dialogue box made when first wanted, and a clock in milliseconds. */
  constructor(
    parts: {
      readonly cast: Cast;
      readonly scenes: Readonly<Record<string, readonly Line[]>>;
      readonly kept?: Pick<Storage, 'getItem' | 'setItem'>;
      readonly account?: () => string | null;
      readonly forge?: Cards;
    },
    voice: () => QuestVoice,
    now: () => number = () => performance.now(),
  ) {
    [this.cast, this.scenes, this.voice, this.now] = [parts.cast, parts.scenes, voice, now];
    this.watch = new QuestWatch(parts.kept ?? null, parts.account);
    this.forge = parts.forge ?? null;
  }

  /** The step's figures and its ward's figure in the room the player is in, as cards for an eye at `eye` at `clock`
   *  (seconds), standing on `groundAt`'s ground. */
  cards(
    eye: readonly [number, number, number],
    clock: number,
    groundAt: (x: number, y: number) => number | null,
  ): CardAt[] {
    const now = this.now();
    const actors = questActors(this.here?.quest, this.roster, groundAt, (index, figure) => {
      return this.glides.place(index, now) ?? [figure.x, figure.y, figure.z];
    });
    const forge = this.forge;
    if (!forge) return [];
    for (const actor of actors) forge.warm(actor.dress, () => FIGURE_MOVES, 0, actor.id);
    return actorCards(actors, forge, eye, clock);
  }

  /** The plate over the ward the step defends in the room the player is in, as the fight's display draws a
   *  companion's; none without one. */
  wardPlate(groundAt: (x: number, y: number) => number | null): MarkedFoe | null {
    return wardPlate(this.here?.quest, this.cast, groundAt);
  }

  /** The room's word on the player's gear, wherever they are: none, as a room just joined has given, keeps the last
   *  for the roads but marks no place, which only that room can say; a word not on the player's own character (a
   *  room's starting character) is none at all. */
  hear(gear: GearState | null | undefined): void {
    const own = gear && gear.quest?.claimed !== false ? gear : null;
    if (own !== this.here) this.glides.heard(own?.quest?.figures ?? [], this.now());
    // Each word sets the step's clock afresh; between words the tracker runs it down from when it came.
    if (own && own.quest !== this.gear?.quest) this.heardAt = this.now();
    this.here = own;
    if (own) this.gear = own;
  }

  /** A frame `seconds` long, `past` whether the story and the welcome are past, `held` while a screen stands over the
   *  view: what is new is taken, and the next scene waiting is said once none is and nothing holds the view. */
  frame(seconds: number, past: boolean, held: boolean): void {
    this.past = past;
    const now = this.now();
    const news = this.watch.look(this.gear, past);
    this.waiting.push(...news.scenes);
    // A moment's line waiting or being said already is not said twice: the player hears it once for the moment.
    for (const line of news.moments) if (line !== this.saying && !this.waiting.includes(line)) this.waiting.push(line);
    this.toasted = [
      ...this.toasted.filter((toast) => toast.until > now),
      ...news.toasts.map((text) => ({ text, until: now + TOAST_MS })),
    ];
    const next = !held && this.saying === null ? this.waiting.shift() : undefined;
    if (next !== undefined) this.say(next);
    this.spoken?.frame(held ? 0 : seconds);
  }

  /** Says `scene`'s lines, the next waiting once they end. */
  private say(scene: string): void {
    const lines = this.scenes[scene];
    if (!lines) return console.error(`the roads' scene ${scene} is not in houses.json`);
    this.spoken ??= this.voice();
    this.saying = scene;
    const said = () => void (this.saying = null);
    this.spoken.play(lines, this.cast, { auto: true }).then(said, (error: unknown) => {
      console.error(`the roads' scene ${scene} could not be played:`, error);
      said();
    });
  }

  /** The toasts for what the roads gave lately. */
  get toasts(): string[] {
    return this.toasted.map((toast) => toast.text);
  }

  /** Where the compass points for the quest walked from where the player stands (`standing`), over `chart`, kept for
   *  the tracker's words; none before the story and the welcome are past. At sea, where no frame runs the roads (their
   *  lines and toasts wait for land), `past` says whether they are. */
  guide(standing: Standing, chart: Chart, past = this.past): Guide {
    this.past = past;
    const marked = this.goalAt;
    const where = standing.on === 'land' ? { ...standing, marked } : standing;
    this.guided = this.past ? guideOf(this.gear?.quest, where, chart) : { at: null, notes: [] };
    return this.guided;
  }

  /** What the tracker shows: the quest walked, once the story and the welcome are past, each step with its way. */
  get tracked(): Quest | null {
    const tracked = this.past ? trackedOf(this.gear?.quest, (this.now() - this.heardAt) / 1000) : null;
    if (!tracked) return null;
    const { notes } = this.guided;
    return {
      ...tracked,
      steps: tracked.steps.map((step, index) => ({ ...step, ...(notes[index] ? { note: notes[index] } : {}) })),
    };
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

  /** Whether the keeper at the counter `counter` (a station's kind) has something for the player, once the story
   *  and the welcome are past: a step of the quest walked asks to speak with them, as `speak` answers, or to buy one
   *  of their wares. */
  wants(counter: string): boolean {
    return this.speak(counter, () => undefined) !== null || (this.past && buyAt(this.gear?.quest, counter));
  }

  /** What E does at the counter of a station of kind `counter` (its offer's view), while a talk goal of the task names
   *  it: speaks with its keeper, asking the room (ask 64); the goal's scene is said as the room meets it. Null
   *  otherwise, so the counter opens as before. */
  speak(counter: string, ask: (asked: GearAsk) => void): Use | null {
    const state = this.gear?.quest;
    const goal = this.past ? talkAt(state, counter) : null;
    const column = COUNTERS[counter];
    if (!state || !goal || column === undefined) return null;
    const keeper = keeperOf(counter);
    const name = (keeper && this.cast.speakers[keeper.speaker]?.name) ?? HARBOURMASTER;
    return { words: `Speak with ${name}`, run: () => ask({ kind: ASKS.speakWith, column }) };
  }

  /** The quest's mark on the screen through `shot` on a picture `viewport` CSS pixels, standing on `groundAt`'s
   *  ground where the compass points (`guide`), named for the goal it points at, its distance from the player at
   *  `from`; none while it points nowhere. */
  marks(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    from: readonly [number, number],
    groundAt: (x: number, y: number) => number | null,
  ): ScreenMark[] {
    const { at: where, goal } = this.guided;
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

/** The roads on the game's page: their lines read from content/story/, said in a dialogue box of their own, their
 *  begins said kept in the browser for the account `account` names, their figures drawn by `forge` in the looks of the
 *  roster `module`'s rules hold. */
export function questsOn(
  stack: Stack,
  account: () => string | null,
  forge: Cards,
  module: Promise<WebAssembly.Module>,
): Quests {
  const read = castOf(cast);
  const parts = { cast: read, scenes: scenesOf(houses, read), kept: localStorage, account, forge };
  const quests = new Quests(parts, () => new DialogueBox(stack, worldOutput));
  rosterFor(module).then(
    (roster) => (quests.roster = roster),
    (error: unknown) => console.error('the roads have no roster to dress their figures by:', error),
  );
  return quests;
}

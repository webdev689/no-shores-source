// The houses' roads in the browser: once the story and the stranger's welcome are past, the tracker shows the
// quest walked; its lines are said one scene after another (questWatch.ts), in the keeper's own screen where it is
// open and the keeper says the scene alone, else in the dialogue box; a counter that a talk goal of the task names (or
// whose keeper offers the quest) offers to speak with its keeper, whose screen it opens; the HUD marks where the task's next goal stands and the
// held map the nodes its goals name; a varied step's figures and ward stand in the world (questFigures.ts); and what
// a road gives is noticed at the foot of the screen (obtained.ts), and so is a house's horde: its Art unbounded as it
// begins, and bound again as it ends. Each is the room's word read, never a judgement of the page's own.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import type { MarkedFoe } from '../../combat/foePlate.ts';
import type { Rider } from '../../combat/horseSounds.ts';
import type { GearState } from '../../network/gearMessages.ts';
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { placeMarks } from '../../overworld/overworldMarks.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import { MOUNT_SLOT, worn } from '../../player/gear.ts';
import type { FoeType } from '../../rules/roster.ts';
import { type Cast, type Line, castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import { continueCap } from '../hudParts.ts';
import { movesOnByItself } from '../../speech/pace.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Shot } from '../camera.ts';
import type { Use } from '../footGear.ts';
import type { ScreenMark } from '../hudMarks.ts';
import { distanceText } from '../../plus/compass.ts';
import { type Station, openGearWindow } from '../gearScreen.ts';
import { keeperOf } from '../keepers.ts';
import { sayInScreen } from '../npc/npcSpeech.ts';
import { rosterFor } from '../footRoom.ts';
import { actorCards } from '../prologue/actors.ts';
import type { Quest } from '../tasks.ts';
import { worldOutput } from '../uiSounds.ts';
import { BINDS } from '../../player/input.ts';
import { type Notice, notify } from '../obtained.ts';
import { buyAt, goalNodes, talkAt, trackedOf, walked } from './questBook.ts';
import { lessonKeys } from './lessons.ts';
import { artIcon } from './questNews.ts';
import { FIGURE_MOVES, FigureGlides, questActors, wardPlate } from './questFigures.ts';
import { type Chart, type Guide, type Standing, guideOf } from './waypoint.ts';
import { QuestWatch } from './questWatch.ts';

/** What the lines are said in: the dialogue box, as the welcome's (welcome.ts WelcomeVoice). */
export interface QuestVoice {
  play(lines: readonly Line[], cast: Cast, options: { auto: boolean }): Promise<void>;
  frame(seconds: number): void;
}

type Art = (typeof arts.arts)[number];
/** What is noticed of a horde's Art, under its emblem: as it begins, and as it ends. */
export const unboundedNotice = (art: Art): Notice => ({
  title: `${art.name} unbounded`,
  line: 'Every ability ready.',
  icon: artIcon(art),
});
export const boundNotice = (art: Art): Notice => ({
  title: `${art.name} bound again`,
  line: 'Its abilities cost as before.',
  icon: artIcon(art),
});
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
  /** The Art a horde holds unbounded in the room the player is in, while it runs. */
  private unbounded: Art | null = null;
  /** Where what the roads give is noticed (obtained.ts). */
  private readonly notify: (...notices: readonly Notice[]) => void;
  /** The step's figures, drawn between the room's words on them. */
  private readonly glides = new FigureGlides();
  /** The step's figures on horseback as last drawn, heard as riders are, by numbers no fighter has. */
  private riding: Rider[] = [];
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
      readonly notify?: (...notices: readonly Notice[]) => void;
    },
    voice: () => QuestVoice,
    now: () => number = () => performance.now(),
  ) {
    [this.cast, this.scenes, this.voice, this.now] = [parts.cast, parts.scenes, voice, now];
    this.watch = new QuestWatch(parts.kept ?? null, parts.account);
    this.forge = parts.forge ?? null;
    this.notify = parts.notify ?? notify;
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
      return this.glides.place(index, now) ?? [figure.x, figure.y, figure.z, figure.facing];
    });
    const ridden = actors.filter((actor) => actor.anim.startsWith('horse'));
    this.riding = ridden.map((actor) => ({
      id: -actor.id,
      feet: [actor.x, actor.y, actor.z],
      mounted: true,
      boosting: 0,
    }));
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
    const art = arts.arts.find((each) => each.id === own?.arts?.art);
    const unbounded = own?.quest?.horde && art ? art : null;
    // The horde over, fallen or left, the power ends where the player sees it.
    if (this.unbounded && this.unbounded !== unbounded) this.notify(boundNotice(this.unbounded));
    if (unbounded && this.unbounded !== unbounded) this.notify(unboundedNotice(unbounded));
    this.unbounded = unbounded;
    this.here = own;
    if (own) this.gear = own;
  }

  /** A frame `seconds` long, `past` whether the story and the welcome are past, `held` while a screen stands over the
   *  view, `fighting` while the player is in a fight: what is new is taken, and the next scene waiting is said once
   *  none is and nothing holds the view. */
  frame(seconds: number, past: boolean, held: boolean, fighting = false): void {
    this.past = past;
    const news = this.watch.look(this.gear, past);
    this.waiting.push(...news.scenes);
    // A moment's line waiting or being said already is not said twice: the player hears it once for the moment.
    for (const line of news.moments) if (line !== this.saying && !this.waiting.includes(line)) this.waiting.push(line);
    this.notify(...news.notices);
    // While a screen stands over the view, only a scene its keeper says alone is said, in their screen.
    const head = this.saying === null ? this.waiting[0] : undefined;
    const onScreen = head !== undefined && held ? sayInScreen(this.scenes[head] ?? []) : null;
    if (head !== undefined && (onScreen || !held)) this.say(this.waiting.shift() ?? head, onScreen, fighting);
    this.spoken?.frame(held ? 0 : seconds);
  }

  /** Says `scene`'s lines (in a keeper's screen where it took them, `onScreen`), the next waiting once they end; in the
   *  dialogue box each line waits for a press, unless it moves on by itself (in a `fight`, or under Auto). */
  private say(scene: string, onScreen: Promise<void> | null = null, fight = false): void {
    const lines = this.scenes[scene];
    if (!lines) return console.error(`the roads' scene ${scene} is not in houses.json`);
    this.saying = scene;
    const said = () => void (this.saying = null);
    if (onScreen) return void onScreen.then(said);
    this.spoken ??= this.voice();
    this.spoken.play(lines, this.cast, { auto: movesOnByItself(fight) }).then(said, (error: unknown) => {
      console.error(`the roads' scene ${scene} could not be played:`, error);
      said();
    });
  }

  /** Where the compass points for the quest walked from where the player stands (`standing`), over `chart`, kept for
   *  the tracker's words; none before the story and the welcome are past. At sea, where no frame runs the roads (their
   *  lines and notices wait for land), `past` says whether they are. */
  guide(standing: Standing, chart: Chart, past = this.past): Guide {
    this.past = past;
    const where = { ...standing, marked: this.goalAt };
    this.guided = this.past ? guideOf(this.gear?.quest, where, chart) : { at: null, notes: [] };
    return this.guided;
  }

  /** The step's figures on horseback as last drawn (`cards`), for their hooves to be heard. */
  get riders(): readonly Rider[] {
    return this.riding;
  }

  /** What the tracker shows: the quest walked, once the story and the welcome are past, each step with its way, and
   *  a lesson's step its keys as bound now on the keys or the pad played last. */
  get tracked(): Quest | null {
    const horsed = !this.gear || worn(this.gear, MOUNT_SLOT) !== undefined;
    const tracked = this.past ? trackedOf(this.gear?.quest, (this.now() - this.heardAt) / 1000, horsed) : null;
    if (!tracked) return null;
    const { notes } = this.guided;
    const goals = walked(this.gear?.quest)?.task.goals ?? [];
    return {
      ...tracked,
      steps: tracked.steps.map((step, index) => {
        const goal = goals[index];
        const keys = goal && !step.done ? lessonKeys(goal, BINDS.device, BINDS.now) : [];
        return { ...step, ...(notes[index] ? { note: notes[index] } : {}), ...(keys.length > 0 ? { keys } : {}) };
      }),
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
   *  and the welcome are past: a step of the quest walked asks to speak with them (or to acquire it from them), as
   *  `speak` answers, or to buy one of their wares. */
  wants(counter: string): boolean {
    return this.speak(counter) !== null || (this.past && buyAt(this.gear?.quest, counter));
  }

  /** What E does at the counter of a station of kind `counter` (its offer's view), while a talk goal of the task names
   *  it, or its keeper offers the quest walked: "Speak with" its keeper, opening their screen, where the word is asked
   *  of the room and its lines said (npc/npcScreen.ts). Null otherwise, so the counter opens as before. */
  speak(counter: string): Use | null {
    const goal = this.past ? talkAt(this.gear?.quest, counter) : null;
    const keeper = keeperOf(counter);
    if (!goal || !keeper) return null;
    const name = this.cast.speakers[keeper.speaker]?.name ?? keeper.title;
    // A counter with a keeper is a station's.
    return { words: `Speak with ${name}`, run: () => openGearWindow({ view: counter as Station }) };
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
  const quests = new Quests(parts, () => new DialogueBox(stack, worldOutput, continueCap));
  rosterFor(module).then(
    (roster) => (quests.roster = roster),
    (error: unknown) => console.error('the roads have no roster to dress their figures by:', error),
  );
  return quests;
}

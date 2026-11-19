// What every beat of the story draws and speaks with: the game's scene and figures, the hulls the story sails, the
// weather, birds and fire, the voices, the screen's fades, and the sounds of the sea. A beat answers a frame of what
// to show; the stage draws it as the game draws its own, then places the barks and emotes over the heads it names.
import type { Birds } from '../../cinema/birds.ts';
import type { Flames } from '../../cinema/flames.ts';
import type { Ambience } from '../../cinema/ambience.ts';
import type { Screen } from '../../cinema/screen.ts';
import { CLEAR, mixWeather, swellGained, type Weather } from '../../cinema/weather.ts';
import type { FirstPerson } from '../../firstperson/firstPerson.ts';
import type { Gpu } from '../../gpu.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import type { Swell } from '../../rules/landRules.ts';
import type { FoeType } from '../../rules/roster.ts';
import type { ShipCamera, ShipView } from '../../ships/shipView.ts';
import type { Cast, Line } from '../../speech/cast.ts';
import type { DialogueBox } from '../../speech/dialogue.ts';
import type { Overheads } from '../../speech/overheads.ts';
import type { HullMask } from '../../water/hullMask.ts';
import { onScreen, type Shot } from '../camera.ts';
import type { FigureView } from '../figureView.ts';
import type { FootView } from '../footView.ts';
import type { Hud } from '../hud.ts';
import type { LandDrawers } from '../landDrawers.ts';
import type { Landmass } from '../landmass.ts';
import type { Drawer, GameScene } from '../scene.ts';
import { standingDrawers } from '../standing.ts';
import { type Actor, actorCards } from './actors.ts';
import type { Objective } from './objective.ts';
import type { Hull, ShipDraw } from './sailing.ts';

/** What a beat shows in a frame. */
export interface StoryFrame {
  readonly shot: Shot;
  readonly actors?: readonly Actor[];
  /** Figures drawn as they are already carded (a room's foes, the walker's own). */
  readonly cards?: readonly CardAt[];
  readonly ships?: readonly ShipDraw[];
  /** More to draw with the land: a fight's balls and marks, the wreck's timber. */
  readonly drawers?: readonly Drawer[];
  readonly hulls?: readonly HullMask[];
  readonly focus?: readonly [number, number];
  /** Over the finished picture: the first person's hands. */
  readonly after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void;
  /** World points over the heads that speak or feel, by the name barks and emotes use. */
  readonly heads?: ReadonlyMap<string, readonly [number, number, number]>;
  /** Whether the land's own drawers (its city and nature) are drawn: not under the sea's storm far from any coast. */
  readonly land?: boolean;
}

/** What the stage is made of; the game makes each once. */
export interface StageParts {
  readonly gpu: Gpu;
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly hud: Hud;
  readonly scene: GameScene;
  readonly figures: FigureView;
  readonly forge: Cards;
  readonly firstPerson: FirstPerson;
  readonly hulls: Readonly<Record<Hull, ShipView>>;
  readonly birds: Birds;
  readonly flames: Flames;
  readonly screen: Screen;
  readonly dialogue: DialogueBox;
  readonly overheads: Overheads;
  readonly ambience: Ambience;
  readonly objective: Objective;
  readonly footView: FootView;
  readonly cast: Cast;
  readonly scenes: Readonly<Record<string, readonly Line[]>>;
  /** The foes' roster, for the factions a cutscene stages. */
  readonly roster: readonly FoeType[];
  /** Keeps the exact ground round a world point, sampled from the land's worker, for a scene near the ground. */
  readonly keepClose: (point: readonly [number, number]) => void;
  /** The open landmass's drawers (its city and nature), or null before one is open. */
  readonly landDrawers: () => LandDrawers | null;
  readonly landmass: () => Landmass;
}

/** How many ships of one hull a frame draws at most: each has a slot of its own. */
const SLOTS_A_HULL = 16;

export class Stage {
  readonly parts: StageParts;
  /** The weather now, and the weather it eases toward over the rest of its glide. */
  private weatherNow: Weather = CLEAR;
  private weatherFrom: Weather = CLEAR;
  private weatherTo: Weather = CLEAR;
  private glide = { seconds: 0, done: 0 };

  constructor(parts: StageParts) {
    this.parts = parts;
  }

  get weather(): Weather {
    return this.weatherNow;
  }

  /** The weather eases to `to` over `seconds` (at once for 0). */
  weatherTowards(to: Weather, seconds: number): void {
    this.weatherFrom = this.weatherNow;
    this.weatherTo = to;
    this.glide = { seconds: Math.max(0, seconds), done: 0 };
    if (seconds <= 0) this.weatherNow = to;
  }

  /** Where the weather's wind blows toward, radians clockwise from north: the sails fill and the rain slants by it. */
  windBearing(): number {
    const [east, south] = this.weatherNow.wind;
    return Math.atan2(east, -south);
  }

  /** The sea's swell as the scene draws it now: the land's own, gained by the weather. */
  swell(): Swell | undefined {
    const swell = this.parts.scene.land?.swell;
    return swell && swellGained(swell, this.weatherNow.seaGain);
  }

  /** Steps the weather's glide and lays the weather on the scene; a lightning flash is the beat's to add. */
  stepWeather(seconds: number, flash = 0, bolt: Weather['bolt'] = null): void {
    if (this.glide.done < this.glide.seconds) {
      this.glide.done = Math.min(this.glide.seconds, this.glide.done + seconds);
      const share = this.glide.done / this.glide.seconds;
      this.weatherNow = mixWeather(this.weatherFrom, this.weatherTo, share * share * (3 - 2 * share));
    }
    this.parts.scene.weather = { ...this.weatherNow, flash: Math.max(this.weatherNow.flash, flash), bolt };
  }

  /** Draws a beat's frame: the land, its city and nature where asked, the ships, every figure, the birds and the fire,
   *  and what the beat adds; then the barks and emotes over the heads it names, and the dialogue's typing. */
  draw(
    frame: StoryFrame,
    size: { readonly width: number; readonly height: number },
    clock: number,
    seconds: number,
  ): void {
    const { scene, figures, forge, hulls, birds, flames, overheads, dialogue, canvas } = this.parts;
    const shot = frame.shot;
    const land = frame.land === false ? null : this.parts.landDrawers();
    const cards = [...actorCards(frame.actors ?? [], forge, shot.eye, clock), ...(frame.cards ?? [])];
    const ships = frame.ships ?? [];
    const sailed = (pass: GPURenderPassEncoder, camera: ShipCamera) => {
      const slots: Record<Hull, number> = { brig: 0, sloop: 0 };
      for (const ship of ships) {
        const slot = slots[ship.hull]++;
        if (slot < SLOTS_A_HULL) hulls[ship.hull].drawInto(pass, ship.place, camera, slot, ship.shade, ship.rig);
      }
    };
    const drawers = [...standingDrawers(land, sailed, figures, cards), birds, flames, ...(frame.drawers ?? [])];
    scene.draw(shot, size, clock, seconds, drawers, {
      after: frame.after,
      hulls: frame.hulls,
      focus: frame.focus,
    });
    const view = { width: canvas.clientWidth, height: canvas.clientHeight };
    const heads = new Map<string, readonly [number, number] | null>();
    for (const [name, point] of frame.heads ?? []) heads.set(name, onScreen(shot, view, point));
    overheads.frame(seconds, heads);
    dialogue.frame(seconds);
  }

  /** Plays a scene in order: each bark over its speaker's head, each run of lines together in the dialogue box (by
   *  itself in a cutscene, `auto`, else as the player presses on), and every line's emote over its speaker's head.
   *  `heads` maps a speaker to the head that says it, where the head's name is not the speaker's own. */
  async play(scene: string, auto = true, heads: Readonly<Record<string, string>> = {}): Promise<void> {
    const lines = this.parts.scenes[scene] ?? [];
    const { overheads, dialogue, cast } = this.parts;
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line) break;
      const head = heads[line.who] ?? line.who;
      if (line.kind === 'bark') {
        overheads.bark(head, line, cast);
        if (line.emote) overheads.emote(head, line.emote);
        index++;
        await wait(BARK_GAP_S);
        continue;
      }
      const run: Line[] = [];
      while (lines[index] && lines[index]?.kind !== 'bark') run.push(lines[index++] as Line);
      await dialogue.play(run, cast, {
        auto,
        onLine: (said) => said.emote && overheads.emote(heads[said.who] ?? said.who, said.emote),
      });
    }
  }
}

/** The gap after a bark before the scene's next line, seconds. */
const BARK_GAP_S = 1.1;

const wait = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

// What every beat of the story draws and speaks with: the game's scene and figures, the hulls the story sails, the
// weather, birds and fire, the voices, the screen's fades, and the sounds of the sea. A beat answers a frame of what
// to show; the stage draws it as the game draws its own, then places the barks over the heads it names.
import type { Birds } from '../../cinema/birds.ts';
import type { Flames } from '../../cinema/flames.ts';
import type { Ambience } from '../../cinema/ambience.ts';
import type { Screen } from '../../cinema/screen.ts';
import { CLEAR, mixWeather, swellGained, type Weather } from '../../cinema/weather.ts';
import type { FightHeard } from '../audio/ambience/seaFight.ts';
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
import type { Ambience as WorldAmbience } from '../audio/ambience/ambience.ts';
import { STRIKE_KEPT_S } from '../../sky/skyDriver.ts';
import type { Strike } from '../../sky/skyLaw.ts';
import type { MusicDirector } from '../audio/music/director.ts';
import type { Drawer, GameScene, Overlay } from '../scene.ts';
import { standingDrawers } from '../standing.ts';
import { type Actor, actorCards } from './actors.ts';
import type { Hull, ShipDraw } from './sailing.ts';
import { STORY_DAY_S, overTheSky, toldSky } from './storySky.ts';

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
  readonly after?: (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => void;
  /** World points over the heads that speak, by the name barks use. */
  readonly heads?: ReadonlyMap<string, readonly [number, number, number]>;
  /** Whether the land's own drawers (its city and nature) are drawn: not under the sea's storm far from any coast. */
  readonly land?: boolean;
  /** Where the world's own soundscape is heard round the frame's focus: at sea (on a ship's deck or over her, under
   *  way or not), or ashore on Saltmere's coast. None: the story's own sounds alone. */
  readonly heard?: WorldHeard;
}

export type WorldHeard =
  | { readonly at: 'sea'; readonly deck: boolean; readonly sailing: boolean; readonly fight?: FightHeard }
  | { readonly at: 'ashore' };

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
  /** The game's own soundscape, which the story is heard in at sea, on the wreck and ashore. */
  readonly worldSound: WorldAmbience;
  /** The game's music, which the story's beats tell what to play. */
  readonly music: MusicDirector;
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

/** How long the game's veil over a loading place takes to rise or to fall, seconds: `.veil`'s transition in
 *  client/index.html. */
export const HUD_VEIL_S = 0.7;
/** How long the story's screen takes to clear its black: `Screen.clear`'s fade. */
const SCREEN_CLEAR_S = 0.6;

/** The Brig's pace under sail in the storm, as the sea's pace is set (100 her fastest): her wash and her bow's
 *  thump. */
const SAILING_PACE = 70;

/** How many ships of one hull a frame draws at most: each has a slot of its own. */
const SLOTS_A_HULL = 16;

/** A head's point as speech uses it: on the view, or null, so words off its edges are neither shown nor heard. */
export function headOnView(
  point: readonly [number, number] | null,
  view: { readonly width: number; readonly height: number },
): readonly [number, number] | null {
  if (!point) return null;
  const [across, down] = point;
  return across >= 0 && across <= view.width && down >= 0 && down <= view.height ? point : null;
}

export class Stage {
  readonly parts: StageParts;
  /** The weather now, and the weather it eases toward over the rest of its glide. */
  private weatherNow: Weather = CLEAR;
  private weatherFrom: Weather = CLEAR;
  private weatherTo: Weather = CLEAR;
  private glide = { seconds: 0, done: 0 };
  /** The story's sky clock, which its clouds drift and its lightning strikes on, and the strikes the sky still keeps:
   *  each a bolt the story's lightning threw, the last one's seed known so it strikes once. */
  private skyS = 0;
  private strikes: Strike[] = [];
  private lastBolt: number | null = null;
  /** Counts the scenes begun and hushed: a scene stops at its next line once a later one begins or it is hushed. */
  private scenes = 0;
  /** False from the story's end until its black has wholly gone from over the game. */
  screenOpen = true;
  /** Whether the world's own soundscape was heard last frame: a strike's thunder is then its. */
  hearsTheWorld = false;

  constructor(parts: StageParts) {
    this.parts = parts;
  }

  /** The scenes' own time: a bark's gap is counted in it, as each beat's moments are, never on the wall's clock. */
  private clock = 0;
  private waiting: { readonly until: number; readonly resolve: () => void }[] = [];

  /** Every frame of the story, drawn or not: the beds and spot sounds move on, and the scenes' time. */
  step(seconds: number): void {
    this.parts.ambience.frame(seconds);
    this.tick(seconds);
  }

  /** The scenes' time moves on by `seconds`, and every gap it has passed ends. */
  tick(seconds: number): void {
    this.clock += seconds;
    const due = this.waiting.filter((each) => each.until <= this.clock);
    this.waiting = this.waiting.filter((each) => each.until > this.clock);
    for (const each of due) each.resolve();
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.waiting.push({ until: this.clock + seconds, resolve }));
  }

  /** Stops whatever is being said: the scene playing, the dialogue box, and every bark over a head. */
  hush(): void {
    this.scenes += 1;
    this.parts.dialogue.skip();
    this.parts.overheads.clear();
    // A scene waiting out a gap ends now, rather than when the story's time would have reached it.
    const waiting = this.waiting;
    this.waiting = [];
    for (const each of waiting) each.resolve();
  }

  /** Gives the game back what the story laid over it: its own clear weather, silence from the story's sounds, its
   *  HUD without a death or a fight's panel, and no birds, fire or prompt of the story's; its screen, once clear, goes. */
  leave(): void {
    this.hush();
    const { ambience, scene, birds, flames, hud, footView, screen } = this.parts;
    ambience.stop();
    this.weatherTowards(CLEAR, 0);
    scene.weather = CLEAR;
    scene.sky.told = null;
    scene.lamps = [];
    birds.clear();
    flames.clear();
    hud.tasks.show(null);
    hud.seaFight(null);
    hud.toast();
    hud.reach({ kind: 'inside' });
    hud.hints([]);
    footView.hide();
    // The game's veil rises under the story's black (the screen stands over the HUD) as the game takes over; the black
    // is let go only once the veil is wholly up, so the story's last picture never shows through the crossing.
    this.screenOpen = false;
    setTimeout(() => screen.clear(), HUD_VEIL_S * 1000);
    setTimeout(
      () => {
        this.screenOpen = true;
        screen.remove();
      },
      (HUD_VEIL_S + SCREEN_CLEAR_S) * 1000,
    );
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

  /** The weather's wind, metres a second east and south: the sea fight's ships sail in it. */
  wind(): readonly [number, number] {
    return this.weatherNow.wind;
  }

  /** Where the weather's wind blows toward, radians clockwise from north: the sails fill and the rain slants by it. */
  windBearing(): number {
    const [east, south] = this.wind();
    return Math.atan2(east, -south);
  }

  /** The sea's swell as the scene draws it now: the land's own, gained by the weather. */
  swell(): Swell | undefined {
    const swell = this.parts.scene.land?.swell;
    return swell && swellGained(swell, this.weatherNow.seaGain);
  }

  /** Steps the weather's glide and lays it on the scene: told to the game's sky at its hour, with every bolt the
   *  story's lightning throws as a strike there, and the rest laid by the story's own atmosphere. A weather with no
   *  hour lays it all, a lightning flash the beat's to add. */
  stepWeather(seconds: number, flash = 0, bolt: Weather['bolt'] = null): void {
    if (this.glide.done < this.glide.seconds) {
      this.glide.done = Math.min(this.glide.seconds, this.glide.done + seconds);
      const share = this.glide.done / this.glide.seconds;
      this.weatherNow = mixWeather(this.weatherFrom, this.weatherTo, share * share * (3 - 2 * share));
    }
    this.skyS += seconds;
    const worldS = STORY_DAY_S + this.skyS;
    if (bolt && bolt.seed !== this.lastBolt)
      this.strikes.push({ x: bolt.x, y: bolt.y, atS: worldS, toGround: true, power: 1 });
    this.lastBolt = bolt?.seed ?? null;
    this.strikes = this.strikes.filter((strike) => worldS - strike.atS <= STRIKE_KEPT_S);
    const { scene } = this.parts;
    scene.sky.told = toldSky(this.weatherNow, worldS, this.strikes);
    const own = { ...this.weatherNow, flash: Math.max(this.weatherNow.flash, flash), bolt };
    scene.weather = overTheSky(own);
  }

  /** Draws a beat's frame: the land, its city and nature where asked, the ships, every figure, the birds and the fire,
   *  and what the beat adds; then the barks over the heads it names, and the dialogue's typing. */
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
      const slots: Record<Hull, number> = { brig: 0, sloop: 0, frigate: 0 };
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
    for (const [name, point] of frame.heads ?? []) heads.set(name, headOnView(onScreen(shot, view, point), view));
    overheads.frame(seconds, heads);
    dialogue.frame(seconds);
    this.hear(frame, seconds);
  }

  /** The world's own soundscape round the frame's focus where the frame says it is heard; the story's beds hand it
   *  the sea and the weather there, and take them back where it is not. */
  private hear(frame: StoryFrame, seconds: number): void {
    const { worldSound, ambience } = this.parts;
    const heard = frame.heard;
    this.hearsTheWorld = !!heard;
    ambience.handOver(this.hearsTheWorld);
    if (!heard) return;
    const landmass = this.parts.landmass();
    const { shot } = frame;
    if (heard.at === 'sea') {
      const [x, y] = frame.focus ?? [shot.eye[0], shot.eye[1]];
      worldSound.atSea(
        landmass,
        [x, y],
        shot,
        { sailing: heard.sailing, pace: SAILING_PACE, deck: heard.deck, fightHeard: heard.fight ?? null },
        seconds,
      );
      return;
    }
    // The strand is heard as any of Saltmere's coast away from its town.
    const node = landmass.nodes.find((each) => each.kind !== 'social') ?? landmass.nodes[0];
    if (node) worldSound.onFoot(node, landmass, shot);
  }

  /** Plays a scene in order: each bark over its speaker's head, each run of lines together in the dialogue box (by
   *  itself in a cutscene, `auto`, else as the player presses on), its words alone, with no glyph over a head.
   *  `heads` maps a speaker to the head that says it, where the head's name is not the speaker's own; `saying` hears
   *  each line as it begins, for a beat whose camera answers what is said. */
  async play(
    scene: string,
    auto = true,
    heads: Readonly<Record<string, string>> = {},
    saying: (line: Line) => void = () => undefined,
  ): Promise<void> {
    const lines = this.parts.scenes[scene] ?? [];
    const { overheads, dialogue, cast } = this.parts;
    const playing = ++this.scenes;
    let index = 0;
    while (index < lines.length && playing === this.scenes) {
      const line = lines[index];
      if (!line) break;
      const head = heads[line.who] ?? line.who;
      if (line.kind === 'bark') {
        overheads.bark(head, line, cast);
        saying(line);
        index++;
        await this.wait(BARK_GAP_S);
        continue;
      }
      const run: Line[] = [];
      while (lines[index] && lines[index]?.kind !== 'bark') run.push(lines[index++] as Line);
      await dialogue.play(run, cast, {
        auto,
        onLine: saying,
      });
    }
  }
}

/** The gap after a bark before the scene's next line, seconds. */
const BARK_GAP_S = 1.1;

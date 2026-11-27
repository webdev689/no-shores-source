// What the game draws of the patrols' dungeons: a patrol's entrances among its land's drawers, and a dungeon as its own
// scene, its figures lit by its torches; and a Breach's run, its spaces over the dark as the event props draw them,
// under its own sky and lamps.
import { cityClimate } from '../city/plan.ts';
import { EVENT_LAMPS, carriedLight, lampsRound } from '../sky/lamps.ts';
import { runLightAt, runSky } from './breachLook.ts';
import { ENTRANCE_MODELS, type Entrance } from './entrances.ts';
import { EntranceView } from './entranceView.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { passagePieceLights, passagePiecesLaid, stylePacks } from './dungeonDressing.ts';
import { loadStylePack, type ModulePack, PASSAGE_PACK } from './dungeonModules.ts';
import type { PassagePlan } from '../rules/passageRules.ts';
import type { PieceState } from './passages/passagePieces.ts';
import type { Climate } from '../textures/climate.ts';
import { DungeonScene } from './dungeonScene.ts';
import { DungeonView } from './dungeonView.ts';
import type { Gpu } from '../gpu.ts';
import type { PropTable } from '../models/tables.ts';
import type { FigureView } from './figureView.ts';
import type { Foot, FootFrame } from './foot.ts';
import type { CityAssets } from './landDrawers.ts';
import type { Drawer, Overlay } from './scene.ts';
import type { NodeInfo } from './worldData.ts';
import { DUNGEON_MAP, type MapBody } from './dungeonMap/dungeonMap.ts';
import { MapInk } from './dungeonMap/mapInk.ts';
import { PAPER, paperNode } from './dungeonMap/mapPaper.ts';
import { listenToMap } from './dungeonMap/mapPointer.ts';
import { chestsCounted } from './finds.ts';
import { platedPlayers } from './social/social.ts';

/** The door picture of Daggerfall's dungeon doors, where the props' table has not come. */
const PLAIN_DOOR = [56, 2] as const;

/** A passage zone's pieces as they stand for the player now: its plan, the deal's state, whether it is done, and the
 *  key they are laid again by when that changes; null out of a zone. */
export type PiecesNow = () => {
  readonly plan: PassagePlan;
  readonly state: PieceState;
  readonly done: boolean;
  readonly key: string;
} | null;

export class DungeonDrawers {
  private readonly scene: DungeonScene;
  private readonly view: DungeonView;
  private readonly entranceView: EntranceView;
  private readonly figureView: FigureView;
  private readonly gpu: Gpu;
  /** The map's ink, made when the map is first opened. */
  private ink: MapInk | null = null;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly biomeOf: (continent: string) => string | null;
  private shownEntrances: readonly Entrance[] | null = null;
  private shownLooks = 0;
  /** The city's assets, whose props' table a dungeon waits for so no solid prop goes undrawn. */
  private readonly assets: Promise<CityAssets | null>;
  /** The forged props' table, once read. */
  props: PropTable | null = null;
  /** The passage zone shown under ground, its pieces laid from the passages' pack while it has come. */
  private passage: {
    readonly now: PiecesNow;
    readonly pack: ModulePack;
    readonly layout: DungeonLayout;
    readonly climate: Climate;
  } | null = null;

  constructor(
    gpu: Gpu,
    figureView: FigureView,
    assets: Promise<CityAssets | null>,
    biomeOf: (continent: string) => string | null,
    canvas: HTMLCanvasElement | null = null,
  ) {
    this.biomeOf = biomeOf;
    this.gpu = gpu;
    this.canvas = canvas;
    if (canvas) listenToMap(canvas);
    this.scene = new DungeonScene(gpu);
    this.view = new DungeonView(gpu);
    this.entranceView = new EntranceView(gpu);
    this.figureView = figureView;
    this.assets = assets;
    void assets.then((loaded) => (this.props = loaded?.tables.props ?? null));
  }

  /** A patrol's or an Elite Dungeon's node's entrances as a drawer among its land's, set again whenever its room gives
   *  them anew; null anywhere else or before the props' table has come. */
  entrancesOf(foot: Foot): Drawer | null {
    if ((foot.node.kind !== 'patrol' && foot.node.kind !== 'dungeon') || !this.props) return null;
    const { entrances } = foot.held;
    // Laid again as the entrances change, or as more of their dungeons' looks are known for their facades.
    if (entrances.entrances !== this.shownEntrances || entrances.looked !== this.shownLooks) {
      this.shownEntrances = entrances.entrances;
      this.shownLooks = entrances.looked;
      const lookOf = (number: number) => entrances.lookOf(number);
      this.entranceView.set(entrances.entrances, this.props, this.climateOf(foot.node), lookOf);
    }
    return this.entranceView;
  }

  /** A place's island's climate, as its city's pictures take it. */
  private climateOf(node: NodeInfo) {
    return cityClimate(this.biomeOf(node.continent) ?? undefined);
  }

  /** Draws this dungeon of `patrol` from now on, its exit door wearing the door picture its entrance's model wears,
   *  once the packs of the styles it wears and the props' table have come: the room stands its props as solids, so
   *  none may be left undrawn. */
  async show(
    layout: DungeonLayout,
    patrol: NodeInfo,
    entrance: Entrance | undefined,
    pieces?: PiecesNow,
  ): Promise<void> {
    const passages = pieces ? loadStylePack(PASSAGE_PACK) : Promise.resolve(null);
    const [packs, loaded, pack] = await Promise.all([stylePacks(layout), this.assets, passages]);
    const props = loaded?.tables.props ?? this.props ?? {};
    const look = entrance && props[ENTRANCE_MODELS[entrance.model] ?? -1]?.doorLook;
    const climate = this.climateOf(patrol);
    this.passage = pieces && pack ? { now: pieces, pack, layout, climate: climate.climate } : null;
    const first = this.piecesLaid();
    this.view.set(layout, climate, look ? [look[0], look[1]] : PLAIN_DOOR, props, packs, first?.lay);
  }

  /** The passage zone's pieces from their pack as they stand now, the lights they burn, and what they stand as; null
   *  with no pack. */
  private piecesLaid() {
    const now = this.passage?.now();
    if (!this.passage || !now) return null;
    const { pack, layout, climate } = this.passage;
    const lay = passagePiecesLaid(layout, pack, climate, now.plan.pieces, now.state, now.done);
    return { lay, lights: passagePieceLights(now.plan.pieces, now.state), key: now.key };
  }

  /** Whether the passages' pack has come holding `module`, so the piece is drawn from it and not as boxes. */
  hasPassageModule(module: string): boolean {
    return this.passage?.pack.modules.has(module) ?? false;
  }

  /** Lets go of the dungeon last drawn and the scene's targets, once the player is somewhere that is no dungeon. */
  forget(): void {
    DUNGEON_MAP.leave();
    PAPER.node = null;
    this.ink?.release();
    this.view.clear();
    this.passage = null;
    this.scene.release();
    this.entranceView.clear();
    this.shownEntrances = null;
  }

  /** One frame in a dungeon: its floor and cache, the fight's blood under the figures and its marks over them, the
   *  flames of its torches, fixtures and lamps over all of it (its scene draws them), the figures lit by its lights and
   *  the one `carried` in the player's left hand; `after` may draw over the finished picture, in the light where the
   *  eye stands, and all of it drains toward grey by `drain`. The player (`you`, `seconds` since the last frame) is
   *  walked on the dungeon's map, which covers the picture while it is open. */
  draw(
    foot: Foot,
    shown: FootFrame,
    size: { width: number; height: number },
    time: number,
    fight: { under: Drawer; over: Drawer },
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => void,
    drain = 0,
    carried: {
      readonly left: string | null | undefined;
      readonly feet: readonly [number, number, number];
    } | null = null,
    you?: MapBody & { readonly seconds: number },
  ): void {
    this.view.setCarried(carriedLight(carried?.left), carried?.feet ?? [0, 0, 0]);
    const mapped = you ? this.mapFrame(foot, you, size) : null;
    if (mapped) after = mapped;
    this.view.setCache(foot.held.cache);
    this.view.setFinds(foot.finds.drawn);
    const laid = this.piecesLaid();
    this.view.setPieces(laid?.lay ?? null, laid?.key ?? '', laid?.lights);
    this.view.setEncounter(foot.held.encounter);
    const { figures } = shown;
    const light = (point: readonly [number, number, number]) => this.view.lightAt(point, time);
    const drawers: Drawer[] = [
      { drawInto: (pass, fromEye, shot, now) => this.view.drawInto(pass, fromEye, shot.eye, now) },
      fight.under,
      {
        drawInto: (pass, fromEye, shot, _now, shadow) =>
          this.figureView.drawInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow, light),
      },
      fight.over,
    ];
    // What the eye holds is lit as a figure is, held under the sky's 1.2 so a torch beside it does not burn it white.
    const held = light(shown.shot.eye).map((part) => Math.min(1.2, part)) as [number, number, number];
    const over = { width: size.width, height: size.height, light: held };
    // The dungeon's torches light its own shaders; the sky only says it is underground, with no dark to fade into.
    const sky = { look: { ...runSky(time), darkM: 0 }, lamps: [] };
    this.scene.draw(
      shown.shot,
      size,
      time,
      drawers,
      sky,
      after && ((encoder, view) => after(encoder, view, over)),
      drain,
    );
  }

  /** The dungeon's map kept up as the player walks, and while it is open what draws it over the picture. */
  private mapFrame(
    foot: Foot,
    you: MapBody & { readonly seconds: number },
    size: { width: number; height: number },
  ): ((encoder: GPUCommandEncoder, view: GPUTextureView) => void) | null {
    const dungeon = foot.dungeon;
    if (!dungeon) return null;
    DUNGEON_MAP.enter(JSON.stringify(dungeon.ask), dungeon.layout);
    // A fallen player sees the death screen, which the map would cover.
    if (foot.fallen && DUNGEON_MAP.open) DUNGEON_MAP.toggle();
    DUNGEON_MAP.tick(you, you.seconds);
    const paper = { width: this.canvas?.clientWidth || size.width, height: this.canvas?.clientHeight || size.height };
    // The company is gathered only while the map shows them.
    const company = (DUNGEON_MAP.open ? platedPlayers(foot.otherPlayers, you.feet) : [])
      .filter((each) => each.company)
      .map((each) => ({
        feet: each.feet,
        facing: foot.otherPlayers.placed.get(each.id)?.facing ?? 0,
        name: each.plate.name,
      }));
    const shown = DUNGEON_MAP.frame(you.seconds, paper, company);
    PAPER.node =
      shown && paperNode(shown, dungeon.layout.name, chestsCounted(foot.gear?.gear), performance.now() / 1000);
    // The cells' words are counted again as the reveal grows, and written only then: only while the map shows.
    const walked = shown && DUNGEON_MAP.dungeon;
    if (!shown || !walked) return null;
    const ink = (this.ink ??= new MapInk(this.gpu));
    ink.setCells(walked.words, walked.version);
    const { layout, storeys } = walked;
    const frame = {
      view: shown.view,
      ratio: size.width / paper.width,
      size,
      every: shown.every,
      storey: shown.storey,
      storeys: { count: storeys.count, storeyM: storeys.storeyM, top: storeys.floors[0] ?? 0 },
      grid: { cell: layout.cell, columns: layout.columns, rows: layout.rows },
    };
    return (encoder, into) => ink.draw(encoder, into, frame, this.view.mesh);
  }

  /** One frame in a Breach's run: its spaces and pieces as `props` draws them over the dark, the fight's blood under
   *  the figures and its marks over them; all of it under the run's own sky (underground, no sun), lit by the lamps
   *  nearest the eye of those the pieces give (EVENT_LAMPS) and the light `carried`, the figures lit as the stone
   *  round them is; `after` and `drain` as a dungeon's. */
  drawRun(
    shown: FootFrame,
    size: { width: number; height: number },
    time: number,
    fight: { under: Drawer; over: Drawer },
    props: Drawer,
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => void,
    drain = 0,
    carried: {
      readonly left: string | null | undefined;
      readonly feet: readonly [number, number, number];
    } | null = null,
  ): void {
    const { figures } = shown;
    const { eye } = shown.shot;
    const light = carriedLight(carried?.left);
    const held = light && carried ? { light, feet: carried.feet } : null;
    // Underground there is no daylight to put the lamps out.
    const lamps = lampsRound(eye, EVENT_LAMPS.current, held, 0, time);
    const sky = runSky(time);
    const drawers: Drawer[] = [
      props,
      fight.under,
      {
        drawInto: (pass, fromEye, shot, _now, shadow) =>
          this.figureView.drawInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
      },
      fight.over,
    ];
    const over = { width: size.width, height: size.height, light: runLightAt(sky, lamps) };
    const drawn = { look: sky, lamps };
    this.scene.draw(
      shown.shot,
      size,
      time,
      drawers,
      drawn,
      after && ((encoder, view) => after(encoder, view, over)),
      drain,
    );
  }
}

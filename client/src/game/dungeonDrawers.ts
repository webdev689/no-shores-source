// What the game draws of the patrols' dungeons: a patrol's entrances among its land's drawers, and a dungeon as its own
// scene, its figures lit by its torches.
import { cityClimate } from '../city/plan.ts';
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
  private readonly biomeOf: (continent: string) => string | null;
  private shownEntrances: readonly Entrance[] | null = null;
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
  ) {
    this.biomeOf = biomeOf;
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
    const now = foot.held.entrances.entrances;
    if (now !== this.shownEntrances) {
      this.shownEntrances = now;
      this.entranceView.set(now, this.props, this.climateOf(foot.node));
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

  /** Whether a passage zone's pieces are drawn from their pack, so their boxes are not. */
  piecesFromPack(): boolean {
    return this.passage !== null;
  }

  /** Lets go of the dungeon last drawn and the scene's targets, once the player is somewhere that is no dungeon. */
  forget(): void {
    this.view.clear();
    this.passage = null;
    this.scene.release();
    this.entranceView.clear();
    this.shownEntrances = null;
  }

  /** One frame in a dungeon: its floor and cache, the fight's blood under the figures and its marks over them, and
   *  the figures lit by the torches; `after` may draw over the finished picture, in the light where the eye stands,
   *  and all of it drains toward grey by `drain`. */
  draw(
    foot: Foot,
    shown: FootFrame,
    size: { width: number; height: number },
    time: number,
    fight: { under: Drawer; over: Drawer },
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => void,
    drain = 0,
  ): void {
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
    this.scene.draw(shown.shot, size, time, drawers, after && ((encoder, view) => after(encoder, view, over)), drain);
  }
}

// What the game draws of the patrols' dungeons: a patrol's entrances among its land's drawers, and a dungeon as its own
// scene, its figures lit by its torches.
import { cityClimate } from '../city/plan.ts';
import { beforeDoor, ENTRANCE_MODELS, type Entrance } from './entrances.ts';
import { EntranceView } from './entranceView.ts';
import { askDungeon, type DungeonLayout } from './dungeonLayout.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { DungeonScene } from './dungeonScene.ts';
import { DungeonView } from './dungeonView.ts';
import type { Gpu } from '../gpu.ts';
import type { PropTable } from '../models/tables.ts';
import type { FigureView } from './figureView.ts';
import { Foot, type FootContext, type FootFrame } from './foot.ts';
import type { Happening } from './flow.ts';
import type { CityAssets } from './landDrawers.ts';
import type { Drawer } from './scene.ts';
import type { NodeInfo } from './worldData.ts';

/** The door picture of Daggerfall's dungeon doors, where the props' table has not come. */
const PLAIN_DOOR = [56, 2] as const;

/** What going in and out asks of the game: the player's place on foot and the voyage's seas, its way behind the veil,
 *  its way of leaving one place for another, the foot's context and the room's module, and the dungeons' drawers. */
interface Game {
  readonly foot: () => Foot | null;
  readonly seas: () => Difficulty | undefined;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly goInto: (entering: () => Promise<Foot>) => Promise<void>;
  readonly context: FootContext;
  readonly module: Promise<WebAssembly.Module>;
  readonly drawers: DungeonDrawers;
}

/** The ways into a patrol's dungeon and out again: in, behind the veil, at its way in; out, before the door of the
 *  entrance the player went in by, facing away from it. */
export function dungeonTrips(game: Game): { enter(number: number, name: string): void; leave(): void } {
  /** The entrance the player last went in by. */
  let wentIn: Entrance | undefined;
  return {
    enter: (number, name) => {
      const from = game.foot();
      if (!from || from.dungeon) return;
      const [patrol, text, seas] = [from.node, from.text, game.seas()];
      const entrance = from.held.entrances.entrances[number];
      game.travel({ kind: 'enter', node: `${patrol.id}--dungeon-${number}`, name }, async () => {
        const layout = askDungeon(await game.module, patrol.id, patrol.name, number);
        await game.goInto(() => Foot.enterDungeon(game.context, { node: patrol, text }, number, layout, seas));
        game.drawers.show(layout, patrol, entrance);
        wentIn = entrance;
      });
    },
    leave: () => {
      const inside = game.foot()?.dungeon;
      if (!inside) return;
      const { patrol, number, layout } = inside;
      const props = game.drawers.props;
      const before = wentIn && props ? beforeDoor(wentIn, props) : null;
      const arriving = before ? { number, ...before } : undefined;
      const seas = game.seas();
      game.travel({ kind: 'leave', node: patrol.id, name: layout.name }, async () => {
        await game.goInto(() => Foot.enter(game.context, patrol, before?.facing ?? 0, seas, arriving));
        game.drawers.forget();
      });
    },
  };
}

export class DungeonDrawers {
  private readonly scene: DungeonScene;
  private readonly view: DungeonView;
  private readonly entranceView: EntranceView;
  private readonly figureView: FigureView;
  private readonly biomeOf: (continent: string) => string | null;
  private shownEntrances: readonly Entrance[] | null = null;
  /** The forged props' table, once read. */
  props: PropTable | null = null;

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
    void assets.then((loaded) => (this.props = loaded?.tables.props ?? null));
  }

  /** A patrol's entrances as a drawer among its land's, set again whenever its room gives them anew; null off a
   *  patrol or before the props' table has come. */
  entrancesOf(foot: Foot): Drawer | null {
    if (foot.node.kind !== 'patrol' || !this.props) return null;
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

  /** Draws this dungeon of `patrol` from now on, its exit door wearing the door picture its entrance's model wears. */
  show(layout: DungeonLayout, patrol: NodeInfo, entrance: Entrance | undefined): void {
    const look = entrance && this.props?.[ENTRANCE_MODELS[entrance.model] ?? -1]?.doorLook;
    this.view.set(layout, this.climateOf(patrol), look ? [look[0], look[1]] : PLAIN_DOOR, this.props ?? {});
  }

  /** Lets go of the dungeon last drawn, once the player has left it. */
  forget(): void {
    this.view.clear();
  }

  /** One frame in a dungeon: its floor and cache, the fight's blood under the figures and its marks over them, and
   *  the figures lit by the torches; `after` may draw over the finished picture. */
  draw(
    foot: Foot,
    shown: FootFrame,
    size: { width: number; height: number },
    time: number,
    fight: { under: Drawer; over: Drawer },
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void,
  ): void {
    this.view.setCache(foot.held.cache);
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
    this.scene.draw(shown.shot, size, time, drawers, after);
  }
}

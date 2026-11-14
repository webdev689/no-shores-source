import { type Colours, composeFrame } from '../forge/compose.ts';
import type { DyeTable } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Dress, figureOf, rampsOf } from './dressing.ts';
import type { Card, SceneView } from './sceneView.ts';

/** Composed frames kept on the GPU before all are let go and composed again as asked. */
const KEPT_CARDS = 4000;
/** What a move carries in hand: the townsfolk's props, the instruments and a cast's spark. */
const CARRIED = /^(prop_|lute$|flute$|recorder$|tambourine$|spark$)/;

/** Each figure's frames, composed from the forge's strips once and kept as textures; while a frame is being composed,
 *  the figure keeps showing the last one it had. */
export class Cards {
  private readonly kept = new Map<string, Card | null>();
  private readonly composing = new Set<string>();
  private readonly last = new Map<number, Card>();
  private readonly scene: SceneView;
  private readonly store: ForgeStore;
  private readonly looks: ForgeLooks;
  private readonly colours: Colours;
  private readonly dyes: DyeTable;
  /** The last strip that failed to load, for the status line. */
  failure = '';

  constructor(scene: SceneView, store: ForgeStore, looks: ForgeLooks, colours: Colours, dyes: DyeTable) {
    this.scene = scene;
    this.store = store;
    this.looks = looks;
    this.colours = colours;
    this.dyes = dyes;
  }

  /** How many frames are being composed. */
  get pending(): number {
    return this.composing.size;
  }

  /** The frames an animation has on a body. */
  frames(body: string, anim: string): number {
    return this.looks.bodies[body]?.anims[anim]?.frames ?? 1;
  }

  /** Whether a body draws an animation, and the weapon in hand draws it too. */
  draws(body: string, anim: string, held: string | null): boolean {
    const own = this.looks.bodies[body];
    return !!own?.anims[anim] && (!held || !!own.layers[held]?.includes(anim));
  }

  /** A figure's card in a move, a view and a frame, or the last card it showed while this one is composed. A move
   *  carries the props, instrument or spark the forge draws in it. */
  card(id: number, dress: Dress, anim: string, view: number, frame: number): Card | null {
    const layers = this.looks.bodies[dress.body]?.layers ?? {};
    const dressed = figureOf(dress, layers);
    const carried = Object.keys(layers).filter((layer) => CARRIED.test(layer) && layers[layer]?.includes(anim));
    const figure = { ...dressed, gear: [...dressed.gear, ...carried] };
    const key = JSON.stringify([figure, dress.outfit.dyes, anim, view, frame]);
    const kept = this.kept.get(key);
    if (kept) {
      this.last.set(id, kept);
      return kept;
    }
    if (kept === undefined && !this.composing.has(key)) {
      if (this.kept.size > KEPT_CARDS) {
        for (const old of this.kept.values()) old?.texture.destroy();
        this.kept.clear();
        this.last.clear();
      }
      this.composing.add(key);
      const ramps = rampsOf(figure.gear, dress.outfit, this.looks, this.dyes);
      composeFrame(figure, anim, view, frame, this.looks, this.colours, ramps, (path) => this.store.strip(path))
        .then((composed) => {
          this.kept.set(
            key,
            composed && this.scene.card(composed.pixels, composed.width, composed.height, composed.root),
          );
        })
        .catch((error: unknown) => {
          this.failure = error instanceof Error ? error.message : String(error);
        })
        .finally(() => this.composing.delete(key));
    }
    return this.last.get(id) ?? null;
  }
}

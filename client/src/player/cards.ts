import { type Colours, composeFrame } from '../forge/compose.ts';
import type { DyeTable } from '../forge/dyes.ts';
import { type ForgeLooks, mirroredGear } from '../forge/looks.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type Dress, type Wardrobe, figureOf, rampsOf, wardrobeOf } from './dressing.ts';
import type { Picture } from './picture.ts';

/** A figure's picture as a scene draws it: its texture, its size in pixels, and its feet on it. */
export interface Card {
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
  readonly root: readonly [number, number];
}

/** One card to draw: where its feet stand (world metres), whether it is mirrored, and how strongly it flashes,
 *  struck (white, or red for the player's own). */
export interface CardAt {
  readonly card: Card;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly flip: boolean;
  readonly flash?: { readonly share: number; readonly red: boolean };
}

/** Whatever turns a composed picture into a card it can draw: the Test Ground's scene, or the game's figures. */
export interface CardMaker {
  card(pixels: Uint8Array, width: number, height: number, root: readonly [number, number]): Card;
}

/** Composed frames kept on the GPU before all are let go and composed again as asked. */
const KEPT_CARDS = 4000;
/** What a move carries in hand: the townsfolk's props, the instruments and a cast's spark. */
const CARRIED = /^(prop_|lute$|flute$|recorder$|tambourine$|spark$)/;
/** The forge's views of a figure. */
const VIEWS = 5;
/** Warming starts at most this many frames a tick, and none while this many are under way. */
const WARM_A_TICK = 2;
const WARM_UNDER_WAY = 6;

/** Each figure's frames, composed from the forge's strips once and kept as textures; while a frame is being composed,
 *  the figure keeps showing the last one it had. */
export class Cards {
  private readonly kept = new Map<string, Card | null>();
  private readonly composing = new Set<string>();
  private readonly last = new Map<number, Card>();
  private readonly queued: { dress: Dress; anim: string; view: number; frame: number }[] = [];
  private readonly warmed = new Set<string>();
  private readonly scene: CardMaker;
  private readonly store: ForgeStore;
  private readonly looks: ForgeLooks;
  private readonly colours: Colours;
  private readonly dyes: DyeTable;
  /** The last strip that failed to load, for the status line. */
  failure = '';

  constructor(scene: CardMaker, store: ForgeStore, looks: ForgeLooks, colours: Colours, dyes: DyeTable) {
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

  /** A figure's frame as plain pixels, for a page to draw rather than the scene: composed now, never kept. */
  async picture(dress: Dress, anim: string, view: number, frame = 0): Promise<Picture | null> {
    const figure = figureOf(dress, this.looks.bodies[dress.body]?.layers ?? {}, anim);
    const ramps = rampsOf(figure.gear, dress.outfit, this.looks, this.dyes);
    const strip = (path: string) => this.store.strip(path);
    const composed = await composeFrame(figure, anim, view, frame, this.looks, this.colours, ramps, strip);
    return (
      composed && { width: composed.width, height: composed.height, pixels: new Uint8ClampedArray(composed.pixels) }
    );
  }

  /** What a body can wear, as the forge draws it; null for a body it has not. */
  wardrobe(body: string): Wardrobe | null {
    const layers = this.looks.bodies[body]?.layers;
    return layers ? wardrobeOf(body, layers) : null;
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

  /** A figure's frame in a move and a view, composed now if it is not kept or under way; the frame once composed. A
   *  move carries the props, instrument or spark the forge draws in it. */
  private ask(dress: Dress, anim: string, view: number, frame: number, flip = false): Card | null {
    const layers = this.looks.bodies[dress.body]?.layers ?? {};
    const dressed = figureOf(dress, layers, anim);
    const carried = Object.keys(layers).filter((layer) => CARRIED.test(layer) && layers[layer]?.includes(anim));
    const gear = [...dressed.gear, ...carried];
    // A view drawn mirrored keeps each hip piece at its own hip.
    const holding = [dress.outfit.right, dress.outfit.left].some((hand) => !!hand && gear.includes(hand));
    const figure = { ...dressed, gear: (flip && mirroredGear(gear, anim, layers, holding)) || gear };
    const key = JSON.stringify([figure, dress.outfit.dyes, anim, view, frame]);
    const kept = this.kept.get(key);
    if (kept !== undefined || this.composing.has(key)) return kept ?? null;
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
    return null;
  }

  /** A figure's card in a move, a view and a frame, or the last card it showed while this one is composed. */
  card(id: number, dress: Dress, anim: string, view: number, frame: number, flip = false): Card | null {
    const card = this.ask(dress, anim, view, frame, flip);
    if (card) this.last.set(id, card);
    return card ?? this.last.get(id) ?? null;
  }

  /** Queues every view and frame of a dress's moves to be composed ahead of need, once for each dress; they replace
   *  whatever is still queued, as only the newest dress will be shown. */
  warm(dress: Dress, anims: readonly string[]): void {
    const key = JSON.stringify([dress, anims]);
    if (this.warmed.has(key)) return;
    this.warmed.add(key);
    this.queued.length = 0;
    const kept = structuredClone(dress);
    for (const anim of anims) {
      if (!this.looks.bodies[dress.body]?.anims[anim]) continue;
      for (let view = 0; view < VIEWS; view++)
        for (let frame = 0; frame < this.frames(dress.body, anim); frame++)
          this.queued.push({ dress: kept, anim, view, frame });
    }
  }

  /** Starts composing a few queued frames, while few are under way, so warming never holds up a frame. Past the most
   *  kept, every card is let go here, before a frame asks for any: none handed out this frame is destroyed under it. */
  pump(): void {
    if (this.kept.size > KEPT_CARDS) {
      for (const old of this.kept.values()) old?.texture.destroy();
      this.kept.clear();
      this.last.clear();
    }
    for (let started = 0; started < WARM_A_TICK && this.composing.size < WARM_UNDER_WAY; started++) {
      const next = this.queued.shift();
      if (!next) return;
      this.ask(next.dress, next.anim, next.view, next.frame);
    }
  }
}

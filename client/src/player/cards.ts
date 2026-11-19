import { type GlowElement, type GlowField, type GlowLook, glowField, recolourToGlow } from '../elementGlow.ts';
import { type Colours, composeFrame } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import { type ForgeLooks, mirroredGear } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import { type Dress, type Wardrobe, figureOf, rampsOf, wardrobeOf } from './dressing.ts';
import type { Picture } from './picture.ts';

/** A figure's picture as a scene draws it: its texture, its size in pixels, its feet on it, and for a weapon that
 *  glows the outline's field (GLOW_PAD larger on each side) and its element. */
export interface Card {
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
  readonly root: readonly [number, number];
  readonly glow?: { readonly texture: GPUTexture; readonly look: GlowElement };
}

/** One card to draw: where its feet stand (world metres), whether it is mirrored, its flash as it is struck (its
 *  stage, `FLASH` in cardLooks.ts, and colour), how many times life size it stands (1 unless said: a figure aboard a
 *  ship drawn larger than life is drawn as large as she is), its statuses that show (Veiled, Exposed, Charged), how
 *  many pixels it is shaken across, how far it has dissolved as it dies and in which element, the smear its own
 *  swing leaves behind it (figure pixels across the eye's right and up, and its colour; only the Test Ground draws
 *  one), and how hard its weapon's glow surges (1 at rest). */
export interface CardAt {
  readonly card: Card;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly flip: boolean;
  readonly flash?: { readonly stage: number; readonly colour: readonly [number, number, number] };
  readonly scale?: number;
  readonly veiled?: boolean;
  readonly exposed?: boolean;
  readonly charged?: boolean;
  readonly jitter?: number;
  readonly dissolve?: { readonly share: number; readonly look: GlowLook };
  readonly smear?: {
    readonly across: number;
    readonly up: number;
    readonly colour: readonly [number, number, number];
  } | null;
  readonly surge?: number;
}

/** Whatever turns a composed picture into a card it can draw, and an outline's field into a texture: the Test
 *  Ground's scene, or the game's figures. */
export interface CardMaker {
  card(pixels: Uint8Array, width: number, height: number, root: readonly [number, number]): Card;
  glow(field: GlowField): GPUTexture;
}

/** The forge's cards for the figures `maker` draws, read from the forge's published renders, with the store they come
 *  from and its looks and hair colours (a panel's choices). */
export async function openCards(
  maker: CardMaker,
): Promise<{ forge: Cards; store: ForgeStore; looks: ForgeLooks; hair: HairColours }> {
  const store = await ForgeStore.open();
  const [looks, skins, hair, dyes] = await Promise.all([
    store.table<ForgeLooks>('looks'),
    store.table<RaceSkins>('skins'),
    store.table<HairColours>('hair'),
    store.table<DyeTable>('dyes'),
  ]);
  const colours: Colours = { skins, hair, snap: new PaletteSnap(dyes.palette) };
  return { forge: new Cards(maker, store, looks, colours, dyes), store, looks, hair };
}

/** Composed frames kept on the GPU before the least lately asked for are let go, to be composed again as asked. */
const KEPT_CARDS = 4000;
/** How many are kept once the least lately asked for are let go. */
const KEPT_AFTER = 3000;
/** What a move carries in hand: the townsfolk's props, the instruments and a cast's spark. */
const CARRIED = /^(prop_|lute$|flute$|recorder$|tambourine$|spark$)/;
/** The move a cast plays, whose spark glows in its Art's element; the forge draws the spark as what hangs free, so it
 *  is named to count as the weapon. */
const CAST = 'cast';
const SPARK: ReadonlySet<string> = new Set(['spark']);
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
  private readonly queued: { dress: Dress; anim: string; view: number; frame: number; glow: GlowLook }[] = [];
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

  /** A figure's frame as plain pixels, for a page to draw rather than the scene: composed now, never kept. Given
   *  `alone`, one of its layers, that layer is drawn by itself: a weapon in hand whole, with no hand over its grip. */
  async picture(dress: Dress, anim: string, view: number, frame = 0, alone?: string): Promise<Picture | null> {
    const own = this.looks.bodies[dress.body];
    const figure = figureOf(dress, own?.layers ?? {}, anim);
    const ramps = rampsOf(figure.gear, dress.outfit, this.looks, this.dyes);
    const strip = (path: string) => this.store.strip(path);
    // The forge renders each layer by itself; read as a body that draws that layer alone, it stacks nothing else.
    const looks =
      alone && own
        ? { ...this.looks, bodies: { [dress.body]: { ...own, layers: { [alone]: own.layers[alone] ?? [] } } } }
        : this.looks;
    const composed = await composeFrame(figure, anim, view, frame, looks, this.colours, ramps, strip);
    return (
      composed && {
        width: composed.width,
        height: composed.height,
        pixels: new Uint8ClampedArray(composed.pixels),
        root: composed.root,
      }
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
   *  move carries the props, instrument or spark the forge draws in it; a weapon glowing in `glow` its outline, and a
   *  cast's spark recoloured to it. */
  private ask(dress: Dress, anim: string, view: number, frame: number, flip = false, glow: GlowLook = 0): Card | null {
    const layers = this.looks.bodies[dress.body]?.layers ?? {};
    const dressed = figureOf(dress, layers, anim);
    const carried = Object.keys(layers).filter((layer) => CARRIED.test(layer) && layers[layer]?.includes(anim));
    const gear = [...dressed.gear, ...carried];
    // A view drawn mirrored keeps each hip piece at its own hip, and what each fist holds in its own fist.
    const held = [dress.outfit.right, dress.outfit.left, ...carried];
    const figure = { ...dressed, gear: flip ? mirroredGear(gear, anim, layers, held) : gear };
    const key = JSON.stringify([figure, dress.outfit.dyes, anim, view, frame, glow]);
    const kept = this.kept.get(key);
    if (kept !== undefined) {
      // Asked again, it is kept the longest of all.
      this.kept.delete(key);
      this.kept.set(key, kept);
    }
    if (kept !== undefined || this.composing.has(key)) return kept ?? null;
    this.composing.add(key);
    const ramps = rampsOf(figure.gear, dress.outfit, this.looks, this.dyes);
    const strip = (path: string) => this.store.strip(path);
    composeFrame(figure, anim, view, frame, this.looks, this.colours, ramps, strip, anim === CAST ? SPARK : undefined)
      .then((composed) => {
        // A cast's spark takes its Art's colour, as the weapon's glow takes the weapon's.
        if (composed && glow && anim === CAST) recolourToGlow(composed.pixels, glow, composed.held);
        const card = composed && this.scene.card(composed.pixels, composed.width, composed.height, composed.root);
        if (!card || !composed || !glow || !composed.weapon.includes(1)) {
          this.kept.set(key, card);
          return;
        }
        const field = glowField(composed.weapon, composed.width, composed.height, glow);
        this.kept.set(key, { ...card, glow: { texture: this.scene.glow(field), look: glow } });
      })
      .catch((error: unknown) => {
        this.failure = error instanceof Error ? error.message : String(error);
      })
      .finally(() => this.composing.delete(key));
    return null;
  }

  /** A figure's card in a move, a view and a frame, its weapon glowing in `glow`, or the last card it showed while
   *  this one is composed. */
  card(
    id: number,
    dress: Dress,
    anim: string,
    view: number,
    frame: number,
    flip = false,
    glow: GlowLook = 0,
  ): Card | null {
    const card = this.ask(dress, anim, view, frame, flip, glow);
    if (card) this.last.set(id, card);
    return card ?? this.last.get(id) ?? null;
  }

  /** Queues every view and frame of a dress's moves to be composed ahead of need, its weapon glowing in `glow`, once
   *  for each dress; they replace whatever is still queued, as only the newest dress will be shown. */
  warm(dress: Dress, anims: readonly string[], glow: GlowLook = 0): void {
    const key = JSON.stringify([dress, anims, glow]);
    if (this.warmed.has(key)) return;
    this.warmed.add(key);
    this.queued.length = 0;
    const kept = structuredClone(dress);
    for (const anim of anims) {
      if (!this.looks.bodies[dress.body]?.anims[anim]) continue;
      for (let view = 0; view < VIEWS; view++)
        for (let frame = 0; frame < this.frames(dress.body, anim); frame++)
          this.queued.push({ dress: kept, anim, view, frame, glow });
    }
  }

  /** Lets go of a figure that has left: the last card it showed is no longer kept for it. */
  forget(id: number): void {
    this.last.delete(id);
  }

  /** Starts composing a few queued frames, while few are under way, so warming never holds up a frame. Past the most
   *  kept, the cards least lately asked for are let go here, before a frame asks for any, so none handed out this frame
   *  is destroyed under it; a figure whose last card goes shows nothing until its next is composed. */
  pump(): void {
    if (this.kept.size > KEPT_CARDS) {
      const gone = new Set<Card>();
      for (const [key, card] of this.kept) {
        if (this.kept.size <= KEPT_AFTER) break;
        this.kept.delete(key);
        if (card) gone.add(card);
      }
      for (const [id, card] of this.last) if (gone.has(card)) this.last.delete(id);
      for (const card of gone) {
        card.texture.destroy();
        card.glow?.texture.destroy();
      }
    }
    for (let started = 0; started < WARM_A_TICK && this.composing.size < WARM_UNDER_WAY; started++) {
      const next = this.queued.shift();
      if (!next) return;
      this.ask(next.dress, next.anim, next.view, next.frame, false, next.glow);
    }
  }
}

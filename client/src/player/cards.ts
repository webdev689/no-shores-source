import type { GlowElement, GlowField, GlowLook } from '../elementGlow.ts';
import { type Colours, composeFrame } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import { type ForgeLooks, layersOf, mirroredGear } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import { RETRY_AFTER_MS } from '../forge/stripCache.ts';
import type { Haste } from './composeQueue.ts';
import { type Composer, PageComposer, WorkerComposer } from './composer.ts';
import { type Dress, type Wardrobe, figureOf, rampsOf, wardrobeOf } from './dressing.ts';
import { onTheMove } from './playerMoves.ts';
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
 *  ship drawn larger than life is drawn as large as it is), its statuses that show (Veiled, Exposed, Charged), how
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
  // Frames are composed in a worker where one can start, so the page's thread only uploads them.
  const onPage = new PageComposer(looks, colours, (path) => store.strip(path));
  const tables = { looks, skins, hair, palette: dyes.palette };
  const composer = new WorkerComposer(tables, (path) => store.where(path), onPage);
  return { forge: new Cards(maker, store, looks, colours, dyes, KEPT, composer), store, looks, hair };
}

/** Composed frames kept on the GPU before the least lately asked for are let go (`most`), to be composed again as
 *  asked, and how many are kept once they are (`after`). */
export interface KeptCards {
  readonly most: number;
  readonly after: number;
}
const KEPT: KeptCards = { most: 4000, after: 3000 };
/** What a move carries in hand: the townsfolk's props, the instruments and a cast's spark. */
const CARRIED = /^(prop_|lute$|flute$|recorder$|tambourine$|spark$)/;
/** The forge's views of a figure, and those also drawn mirrored for the other side (`viewOf`). */
const VIEWS = 5;
const MIRRORED: ReadonlySet<number> = new Set([1, 2, 3]);
/** Warming starts at most this many frames a tick (`aTick`), and none while this many are under way (`underWay`), on
 *  the page's thread and off it, where it goes as fast as a worker keeps up; it looks at most at this many queued
 *  frames a tick, passing over those kept already, so a dress queued again costs no frame its whole. */
const WARM_ON_PAGE = { aTick: 2, underWay: 6 } as const;
const WARM_OFF_PAGE = { aTick: 4, underWay: 12 } as const;
const WARM_LOOKS = 32;

/** Each figure's frames, composed from the forge's strips once and kept as textures; while a frame is being composed,
 *  the figure keeps showing the last one it had. */
export class Cards {
  private readonly kept = new Map<string, Card | null>();
  private readonly composing = new Set<string>();
  /** When each frame whose compose failed failed, oldest first: it is asked for again only RETRY_AFTER_MS after. */
  private readonly failedAt = new Map<string, number>();
  private readonly last = new Map<number, Card>();
  private readonly queued: {
    dress: Dress;
    anim: string;
    view: number;
    frame: number;
    flip: boolean;
    glow: GlowLook;
    owner: number | string;
    key: string;
  }[] = [];
  private readonly warmed = new Set<string>();
  /** The dress each warmed frame was warmed for, so a warmed frame let go has its dress warmed again. */
  private readonly warmedBy = new Map<string, string>();
  private readonly scene: CardMaker;
  private readonly store: ForgeStore;
  private readonly looks: ForgeLooks;
  private readonly colours: Colours;
  private readonly dyes: DyeTable;
  private readonly limits: KeptCards;
  private readonly composer: Composer;
  /** The last strip that failed to load, for the status line. */
  failure = '';

  /** `composer` composes the frames; on the page's own thread when none is given. */
  constructor(
    scene: CardMaker,
    store: ForgeStore,
    looks: ForgeLooks,
    colours: Colours,
    dyes: DyeTable,
    limits: KeptCards = KEPT,
    composer: Composer | null = null,
  ) {
    this.scene = scene;
    this.store = store;
    this.looks = looks;
    this.colours = colours;
    this.dyes = dyes;
    this.limits = limits;
    this.composer = composer ?? new PageComposer(looks, colours, (path) => store.strip(path));
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

  /** `action`'s own on the move, where `dress` draws it whole: every layer it stacks in the action drawn walking too,
   *  so no piece of it drops out; else null. */
  walking(dress: Dress, action: string): string | null {
    const layers = this.looks.bodies[dress.body]?.layers ?? {};
    const walk = onTheMove(action);
    if (!this.looks.bodies[dress.body]?.anims[walk]) return null;
    const stacked = layersOf(figureOf(dress, layers, action), action, this.looks);
    return stacked.length > 0 && stacked.every((layer) => !!layers[layer]?.includes(walk)) ? walk : null;
  }

  /** Whether a body draws an animation, and the weapon in hand draws it too. */
  draws(body: string, anim: string, held: string | null): boolean {
    const own = this.looks.bodies[body];
    return !!own?.anims[anim] && (!held || !!own.layers[held]?.includes(anim));
  }

  /** The figure a frame of `dress` draws, with what its move carries in hand, and the key it is kept by. */
  private framed(dress: Dress, anim: string, view: number, frame: number, flip: boolean, glow: GlowLook) {
    const layers = this.looks.bodies[dress.body]?.layers ?? {};
    const dressed = figureOf(dress, layers, anim);
    const carried = Object.keys(layers).filter((layer) => CARRIED.test(layer) && layers[layer]?.includes(anim));
    const gear = [...dressed.gear, ...carried];
    // A view drawn mirrored keeps each hip piece at its own hip, and what each fist holds in its own fist.
    const held = [dress.outfit.right, dress.outfit.left, ...carried];
    const figure = { ...dressed, gear: flip ? mirroredGear(gear, anim, layers, held) : gear };
    return { figure, key: JSON.stringify([figure, dress.outfit.dyes, anim, view, frame, glow]) };
  }

  /** A figure's frame in a move and a view, composed `haste` if it is not kept or under way, and hurried if it is
   *  under way and now shown; the frame once composed. A move carries the props, instrument or spark the forge draws
   *  in it; a weapon glowing in `glow` its outline, and a cast's spark recoloured to it. A frame shown before it is
   *  composed has the rest of its move's frames in that view asked for with it, in the order they play, so its loop
   *  plays through once the first comes. */
  private ask(
    dress: Dress,
    anim: string,
    view: number,
    frame: number,
    flip = false,
    glow: GlowLook = 0,
    haste: Haste = 'now',
  ): Card | null {
    const { figure, key } = this.framed(dress, anim, view, frame, flip, glow);
    const kept = this.kept.get(key);
    if (kept !== undefined) {
      // Asked again, it is kept the longest of all.
      this.kept.delete(key);
      this.kept.set(key, kept);
      return kept;
    }
    if (this.composing.has(key)) {
      if (haste === 'now') this.composer.hurry(key);
      return null;
    }
    const failed = this.failedAt.get(key);
    if (failed !== undefined && performance.now() - failed < RETRY_AFTER_MS) return null;
    this.failedAt.delete(key);
    this.composing.add(key);
    const ramps = rampsOf(figure.gear, dress.outfit, this.looks, this.dyes);
    this.composer
      .compose(key, { figure, anim, view, frame, ramps, glow }, haste)
      .then((composed) => {
        const card = composed && this.scene.card(composed.pixels, composed.width, composed.height, composed.root);
        const field = composed?.field;
        this.kept.set(
          key,
          card && field && glow ? { ...card, glow: { texture: this.scene.glow(field), look: glow } } : card,
        );
      })
      .catch((error: unknown) => {
        this.failure = error instanceof Error ? error.message : String(error);
        this.failedAt.set(key, performance.now());
      })
      .finally(() => this.composing.delete(key));
    if (haste === 'now') {
      const frames = this.frames(dress.body, anim);
      for (let ahead = 1; ahead < frames; ahead++)
        this.ask(dress, anim, view, (frame + ahead) % frames, flip, glow, 'ahead');
    }
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

  /** Queues every view and frame of a dress's moves to be composed ahead of need, as drawn and as mirrored, its weapon
   *  glowing in `glow`, once for each dress; they replace whatever is still queued for the same figure (`owner`), as
   *  only its newest dress will be shown, and leave every other figure's queued. The moves (`anims`, the same for the
   *  same dress) are asked for only when the dress is new: a figure warms each frame. */
  warm(dress: Dress, anims: () => readonly string[], glow: GlowLook = 0, owner: number | string = 0): void {
    const key = JSON.stringify([dress, glow]);
    if (this.warmed.has(key)) return;
    this.warmed.add(key);
    // A dress replaced before all of it was composed is warmed again if it is worn again.
    for (const dropped of this.queued) if (dropped.owner === owner) this.warmed.delete(dropped.key);
    const others = this.queued.filter((queued) => queued.owner !== owner);
    this.queued.splice(0, this.queued.length, ...others);
    const kept = structuredClone(dress);
    for (const anim of anims()) {
      if (!this.looks.bodies[dress.body]?.anims[anim]) continue;
      for (let view = 0; view < VIEWS; view++)
        for (let frame = 0; frame < this.frames(dress.body, anim); frame++)
          for (const flip of MIRRORED.has(view) ? [false, true] : [false])
            this.queued.push({ dress: kept, anim, view, frame, flip, glow, owner, key });
    }
  }

  /** Lets go of a figure that has left: the last card it showed is no longer kept for it. */
  forget(id: number): void {
    this.last.delete(id);
  }

  /** Starts composing a few queued frames, while few are under way, so warming never holds up a frame. Warming fills
   *  the kept frames up to the most and never past: only frames asked for go past it, and then the least lately asked
   *  for are let go here, before a frame asks for any, so none handed out this frame is destroyed under it; a figure
   *  whose last card goes shows nothing until its next is composed. A warmed frame let go has its dress warmed again,
   *  into the room let go, the next time its figure warms. */
  pump(): void {
    if (this.kept.size > this.limits.most) {
      const gone = new Set<Card>();
      for (const [key, card] of this.kept) {
        if (this.kept.size <= this.limits.after) break;
        this.kept.delete(key);
        const dress = this.warmedBy.get(key);
        if (dress !== undefined) {
          this.warmed.delete(dress);
          this.warmedBy.delete(key);
        }
        if (card) gone.add(card);
      }
      for (const [id, card] of this.last) if (gone.has(card)) this.last.delete(id);
      for (const card of gone) {
        card.texture.destroy();
        card.glow?.texture.destroy();
      }
    }
    const now = performance.now();
    for (const [key, failed] of this.failedAt) {
      if (now - failed < RETRY_AFTER_MS) break;
      this.failedAt.delete(key);
    }
    const pace = this.composer.offPage ? WARM_OFF_PAGE : WARM_ON_PAGE;
    let started = 0;
    for (let looked = 0; looked < WARM_LOOKS && started < pace.aTick; looked++) {
      if (this.composing.size >= pace.underWay || this.kept.size + this.composing.size >= this.limits.most) return;
      const next = this.queued.shift();
      if (!next) return;
      const { key } = this.framed(next.dress, next.anim, next.view, next.frame, next.flip, next.glow);
      if (this.kept.has(key) || this.composing.has(key) || this.failedAt.has(key)) continue;
      this.warmedBy.set(key, next.key);
      this.ask(next.dress, next.anim, next.view, next.frame, next.flip, next.glow, 'later');
      started += 1;
    }
  }
}

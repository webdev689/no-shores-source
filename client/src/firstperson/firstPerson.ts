import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { FirstPersonView, type ScreenQuad } from './firstPersonView.ts';
import {
  type FrameSource,
  type FramesTable,
  type Picture,
  type Wielded,
  type Worn,
  FramePainter,
  castPicture,
  forgeName,
  runPicture,
  weaponPicture,
  wieldedOf,
} from './fpFrames.ts';
import {
  Bob,
  ChainSwing,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  LOWERED_GONE,
  RUN_FRAMES,
  lowerDrop,
  lowerStep,
  runFrameAt,
  swayFrame,
} from './fpMotion.ts';
import { type AttackInput, type Direction, type MachineEvents, WeaponMachine } from './weaponMachine.ts';

/** What the first person shows this frame, from the one who sees it. `right` and `left` are forge weapon layers
 *  (`sword_iron`, `bow_long_elven`; null for an empty hand), `armour` the sets worn on the hands and feet (`iron`,
 *  `fighters`), `stride` the metres walked, `climbing` how far into a climb (0 to 1), `element` a cast's light. */
export interface FirstPersonState {
  readonly right: string | null;
  readonly left: string | null;
  readonly armour: { readonly gauntlets?: string; readonly boots?: string };
  readonly drawn: boolean;
  readonly moving: boolean;
  readonly running: boolean;
  readonly stride: number;
  readonly casting: boolean;
  readonly climbing: number;
  readonly element?: string;
}

/** What the first person draws with: a texture a picture, and the quads over the scene. */
export type QuadDrawer = Pick<FirstPersonView, 'texture' | 'forget' | 'draw'>;

/** A picture wanted on the screen: what names it, how it is composed, and where it lies once it is. */
interface Wanted {
  readonly key: string;
  readonly ask: () => Promise<Picture | null>;
  readonly place: (picture: Picture) => Omit<ScreenQuad, 'texture'>;
}

/** A flail at rest wears its chain's swing, which the forge drew as record 7. */
const SWAY_RECORD = 7;
const SWAY_FRAMES = 9;
/** The records a weapon in the left hand draws mirrored: at rest (a flail's swing too), and the strikes down and up,
 *  which the forge drew alike for either hand. Every other strike keeps its own side. */
const MIRRORED_RECORDS = new Set([0, 1, 6, SWAY_RECORD]);
/** The casting hands step through their records and back to the first, a step every 0.04 s. */
const CAST_SEQUENCE = [0, 1, 2, 3, 4, 5, 0] as const;
const CAST_STEP = 0.04;
/** The casting hands are laid out on a screen 300 wide; the small records are pushed in to sit where the wide ones
 *  put the hands. */
const CAST_SCREEN_WIDTH = 300;
const CAST_SMALL_INSET = 0.134;
/** Composed pictures kept on the GPU before all are let go and composed again as needed. */
const KEPT_PICTURES = 1500;
const STILL: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };
const NO_EVENTS: MachineEvents = { blow: null, loose: false };

/** A picture placed at its own corner on the design screen, mirrored about the screen's middle for the left hand. */
function atOwnPlace(flip: boolean, drop: number) {
  return (picture: Picture) => ({
    x: flip ? DESIGN_WIDTH - picture.at[0] - picture.width : picture.at[0],
    y: picture.at[1] + drop,
    width: picture.width,
    height: picture.height,
    flip,
  });
}

/** A casting hand placed on the casting screen: the left as drawn at the left edge, the right mirrored at the right. */
function castPlace(record: number, element: string, right: boolean) {
  const small = record === 0 || record === 5 || (element === 'fire' && record === 4);
  const inset = small ? CAST_SMALL_INSET * DESIGN_WIDTH : 0;
  return (picture: Picture) => {
    const width = (picture.width * DESIGN_WIDTH) / CAST_SCREEN_WIDTH;
    const x = right ? DESIGN_WIDTH - inset - width : inset;
    return { x, y: DESIGN_HEIGHT - picture.height, width, height: picture.height, flip: right };
  };
}

/** The first person: the weapon or hands in view, swung by the attack button and drawn over the scene. */
export class FirstPerson {
  private readonly view: QuadDrawer;
  private readonly source: FrameSource;
  private readonly chain = new ChainSwing();
  private readonly bob = new Bob();
  private readonly random: () => number;
  private machine: WeaponMachine | null = null;
  private lower = 0;
  private castClock: number | null = null;
  private wasCasting = false;
  private look = '';
  private wanted: Wanted[] = [];
  private shown: ScreenQuad[] = [];
  private readonly kept = new Map<string, { texture: GPUTexture; picture: Picture } | null>();
  private readonly loading = new Set<string>();

  constructor(view: QuadDrawer, source: FrameSource, random: () => number = Math.random) {
    this.view = view;
    this.source = source;
    this.random = random;
  }

  /** Opens the first person on the forge's published pictures, with their placement and Daggerfall's colours. */
  static async open(gpu: Gpu, store: ForgeStore): Promise<FirstPerson> {
    const [frames, dyes] = await Promise.all([store.table<FramesTable>('frames'), store.table<DyeTable>('dyes')]);
    const painter = new FramePainter(dyes, new PaletteSnap(dyes.palette));
    return new FirstPerson(new FirstPersonView(gpu), {
      strip: (path) => store.strip(path),
      frames,
      dyes,
      painter,
    });
  }

  /** The swing or shot under way: its direction (null for a bow) and how far through it, or null at rest. */
  get swing(): { direction: Direction | null; progress: number } | null {
    const progress = this.machine?.progress ?? null;
    return progress === null ? null : { direction: this.machine?.striking ?? null, progress };
  }

  /** Moves the first person on by `seconds`: the swing, the cast, the bob, the chain and the climb. Answers the blow
   *  that lands now and whether an arrow leaves, so the figure seen from outside can match them. */
  update(seconds: number, input: AttackInput, state: FirstPersonState): MachineEvents {
    const mirrored = state.right === null && state.left !== null;
    const held = mirrored ? state.left : state.right;
    const wielded = state.drawn ? wieldedOf(held) : null;
    const worn: Worn = {
      hands: state.armour.gauntlets ? forgeName(state.armour.gauntlets) : null,
      feet: state.armour.boots ? forgeName(state.armour.boots) : null,
    };
    if (wielded?.kind !== this.machine?.kind)
      this.machine = wielded ? new WeaponMachine(wielded.kind, this.random) : null;

    if (state.casting && !this.wasCasting && !this.machine?.busy) this.castClock = 0;
    this.wasCasting = state.casting;
    if (this.castClock !== null) {
      this.castClock += seconds;
      if (this.castClock >= CAST_SEQUENCE.length * CAST_STEP) this.castClock = null;
    }
    this.lower = lowerStep(this.lower, state.climbing, seconds);
    const free = this.castClock === null && this.lower < 0.5;
    const events = this.machine?.update(seconds, free ? input : STILL) ?? NO_EVENTS;
    const drop = this.bob.step(seconds, state.stride, state.moving, state.running) + lowerDrop(this.lower);
    const sway = this.chain.step(seconds, state.running ? 2 : state.moving ? 1 : 0);

    const lookKey = `${held}|${state.drawn}|${worn.hands}|${worn.feet}`;
    this.wanted = this.wantedNow(state, wielded, worn, mirrored, drop, sway, lookKey);
    // What is wanted now is asked for first, ahead of the rest of a new look's pictures.
    for (const wanted of this.wanted) this.request(wanted);
    if (lookKey !== this.look) {
      this.look = lookKey;
      this.prefetch(wielded, worn, mirrored, lookKey);
    }
    return events;
  }

  private wantedNow(
    state: FirstPersonState,
    wielded: Wielded | null,
    worn: Worn,
    mirrored: boolean,
    drop: number,
    sway: number,
    lookKey: string,
  ): Wanted[] {
    if (this.castClock !== null) {
      const record = CAST_SEQUENCE[Math.floor(this.castClock / CAST_STEP)] ?? 0;
      const element = state.element ?? 'magic';
      const ask = () => castPicture(this.source, element, record);
      const key = `cast|${element}|${record}`;
      return [
        { key, ask, place: castPlace(record, element, false) },
        { key, ask, place: castPlace(record, element, true) },
      ];
    }
    if (this.lower >= LOWERED_GONE) return [];
    const bareHanded = !state.drawn || (wielded?.kind === 'fists' && !this.machine?.busy);
    if (state.running && bareHanded) {
      return [false, true].map((left) => this.runWanted(worn, runFrameAt(state.stride, left), left, drop));
    }
    if (!wielded || !this.machine) return [];
    let { record, frame } = this.machine;
    if (wielded.kind === 'flail' && record === 0) [record, frame] = [SWAY_RECORD, swayFrame(sway, SWAY_FRAMES)];
    const flip = mirrored && (wielded.kind === 'bow' || MIRRORED_RECORDS.has(record));
    return [this.weaponWanted(wielded, worn, record, frame, flip, drop, lookKey)];
  }

  private weaponWanted(
    wielded: Wielded,
    worn: Worn,
    record: number,
    frame: number,
    flip: boolean,
    drop: number,
    lookKey: string,
  ): Wanted {
    return {
      key: `${lookKey}|${record}-${frame}${flip ? '|left' : ''}`,
      ask: () => weaponPicture(this.source, wielded, worn, record, frame, flip),
      place: atOwnPlace(flip, drop),
    };
  }

  private runWanted(worn: Worn, frame: number, left: boolean, drop: number): Wanted {
    return {
      key: `run|${worn.hands}|${frame}`,
      ask: () => runPicture(this.source, worn.hands, frame),
      place: atOwnPlace(left, drop),
    };
  }

  /** Asks for every picture a new look shows, so a swing's frames are ready before it needs them. */
  private prefetch(wielded: Wielded | null, worn: Worn, mirrored: boolean, lookKey: string): void {
    for (let frame = 0; frame < RUN_FRAMES; frame++) this.request(this.runWanted(worn, frame, false, 0));
    if (!wielded) return;
    const records = wielded.kind === 'bow' ? [[0, 7]] : [[0, 1], ...[1, 2, 3, 4, 5, 6].map((record) => [record, 5])];
    if (wielded.kind === 'flail') records.push([SWAY_RECORD, SWAY_FRAMES]);
    for (const [record = 0, count = 0] of records) {
      const flip = mirrored && (wielded.kind === 'bow' || MIRRORED_RECORDS.has(record));
      for (let frame = 0; frame < count; frame++)
        this.request(this.weaponWanted(wielded, worn, record, frame, flip, 0, lookKey));
    }
  }

  private request(wanted: Wanted): void {
    if (this.kept.has(wanted.key) || this.loading.has(wanted.key)) return;
    if (this.kept.size >= KEPT_PICTURES) this.letGo();
    this.loading.add(wanted.key);
    wanted
      .ask()
      .then((picture) => {
        if (!this.loading.delete(wanted.key)) return;
        const texture = picture && this.view.texture(picture.pixels, picture.width, picture.height);
        this.kept.set(wanted.key, picture && texture ? { texture, picture } : null);
      })
      // A picture that would not load is asked again the next time it is wanted.
      .catch(() => this.loading.delete(wanted.key));
  }

  /** Lets every composed picture go, and any still composing, to be composed again as needed. */
  private letGo(): void {
    for (const kept of this.kept.values()) {
      if (!kept) continue;
      this.view.forget(kept.texture);
      kept.texture.destroy();
    }
    this.kept.clear();
    this.loading.clear();
    this.shown = [];
  }

  /** Draws the first person over what `colourView` holds, `width` by `height` pixels. Until every picture wanted is
   *  composed, the last whole set stays on the screen. */
  draw(encoder: GPUCommandEncoder, colourView: GPUTextureView, width: number, height: number): void {
    const quads: ScreenQuad[] = [];
    let ready = true;
    for (const wanted of this.wanted) {
      const kept = this.kept.get(wanted.key);
      if (kept === undefined) ready = false;
      else if (kept) quads.push({ texture: kept.texture, ...wanted.place(kept.picture) });
    }
    if (ready) this.shown = quads;
    this.view.draw(encoder, colourView, width, height, this.shown);
  }
}

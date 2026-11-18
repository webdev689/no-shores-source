import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { gripFrame, gripPicture, gripPlace } from './climbing.ts';
import { FirstPersonView, type ScreenQuad } from './firstPersonView.ts';
import {
  type FrameSource,
  type FramesTable,
  type Picture,
  type Worn,
  FramePainter,
  castPicture,
  forgeName,
  runPicture,
  weaponPicture,
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
import { type HandView, type HandsEvents, Hands, SWAY_FRAMES, SWAY_RECORD, type Swing, everyView } from './hands.ts';
import { type Hand, type HandsPlan, type Holding, handsPlan } from './handsLaw.ts';
import {
  LIGHT_FRAMES,
  SHIELD_FRAMES,
  crossbowPicture,
  gunPicture,
  lightPicture,
  shieldPicture,
} from './heldPictures.ts';
import {
  type Gait,
  type RideShot,
  RIDE_AHEAD,
  RideMotion,
  type Side,
  horsePicture,
  reinPicture,
  ridePlace,
} from './riding.ts';
import type { AttackInput } from './weaponMachine.ts';

/** What the first person shows this frame, from the one who sees it. `right` and `left` are forge layers (`sword_iron`,
 *  `bow_long_elven`, `pistolet_l`, `shield_kite_iron`, `torch_l`, `lantern`; null for an empty hand), `armour` the sets
 *  worn on the hands and feet (`iron`, `fighters`), `stride` the metres walked, `climbing` how far the hands have
 *  closed on a wall (0 to 1), `element` a cast's light, `mounted` riding, `yaw` the look's bearing in radians (rising
 *  to the right), and `blocking` a shield raised for a block. */
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
  readonly mounted?: boolean;
  readonly yaw?: number;
  readonly blocking?: boolean;
  /** A weapon held in a fight's pose, one of its strokes' frames: a guard, a parry's deflect. */
  readonly pose?: { readonly record: number; readonly frame: number } | null;
  /** How far the view is zoomed in (aiming): the hands zoom with it, about the middle of the screen. */
  readonly zoom?: number;
}

/** What the first person draws with: a texture a picture, and the quads over the scene. */
export type QuadDrawer = Pick<FirstPersonView, 'texture' | 'forget' | 'draw'>;

/** A picture wanted on the screen: what names it, how it is composed, where it lies once it is, and where on it a
 *  ranged weapon's muzzle (or its arrow's head) is. */
interface Wanted {
  readonly key: string;
  readonly ask: () => Promise<Picture | null>;
  readonly place: (picture: Picture) => Omit<ScreenQuad, 'texture'>;
  readonly tip?: readonly [number, number];
}

/** Where on each ranged weapon's picture its muzzle is, or its arrow's head drawn, in its own pixels, in the frame its
 *  shot leaves on, kicked up: where a tracer starts. Aiming zooms it with the hands, so it stays where drawn. */
const MUZZLE: Readonly<Record<string, readonly [number, number] | undefined>> = {
  pistolet: [82, 53],
  thunderlock: [77, 42],
  crossbow: [82, 73],
  bow: [107, 150],
};

/** A point on the design screen as a view zoomed `zoom` times about the screen's middle shows it. */
const zoomedOnScreen = (x: number, y: number, zoom: number): [number, number] => [
  DESIGN_WIDTH / 2 + (x - DESIGN_WIDTH / 2) * zoom,
  DESIGN_HEIGHT / 2 + (y - DESIGN_HEIGHT / 2) * zoom,
];

/** The casting hands step through their records and back to the first, a step every 0.04 s. */
const CAST_SEQUENCE = [0, 1, 2, 3, 4, 5, 0] as const;
const CAST_STEP = 0.04;
/** The casting hands are laid out on a screen 300 wide; the small records are pushed in to sit where the wide ones
 *  put the hands. */
const CAST_SCREEN_WIDTH = 300;
const CAST_SMALL_INSET = 0.134;
/** A held light's flame steps a frame this often, and a shield a frame toward its pose this often: our own pace. */
const FLAME_STEP = 0.1;
const SHIELD_STEP = 0.05;
/** A shield at rest is held a frame below raised, and raised whole for a block. */
const SHIELD_REST = 1;
const SHIELD_BLOCK = 0;
/** Composed pictures kept on the GPU before all are let go and composed again as needed. */
const KEPT_PICTURES = 1500;
/** How far below its own place a sword rests, in design pixels, as the owner placed it. Its strikes keep their own
 *  places: lowered as far, they leave the screen. */
const SWORD_DROP = 60;
/** How far right of its own place a sword rests, its blade clear of the crosshair; in the left hand, as far left. */
const SWORD_RIGHT = 40;
const STILL: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };
const SIDES: readonly [Side, Hand][] = [
  ['R', 'right'],
  ['L', 'left'],
];

/** Whether a held thing ducks below the screen while the weapon strikes: a shield or a torch, not a lantern. */
const ducks = (held: Holding | null | undefined) =>
  held?.kind === 'shield' || (held?.kind === 'light' && held.light === 'torch');

/** A picture placed at its own corner on the design screen, mirrored about the screen's middle for the left hand,
 *  dropped `drop` design pixels and `lower` of its own height, and moved `across` design pixels after the mirror. */
function atOwnPlace(flip: boolean, drop: number, lower = 0, across = 0) {
  return (picture: Picture) => ({
    x: (flip ? DESIGN_WIDTH - picture.at[0] - picture.width : picture.at[0]) + across,
    y: picture.at[1] + drop + lower * picture.height,
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

const gaitOf = (state: FirstPersonState): Gait => (!state.moving ? 'stand' : state.running ? 'gallop' : 'walk');
/** Whether a hand holds something other than its own bare fist. */
const holds = (holding: Holding | null | undefined) =>
  !!holding && !(holding.kind === 'weapon' && holding.wielded.kind === 'fists');

/** The first person: the weapons, the held things or the hands in view, swung by the attack button and drawn over the
 *  scene. */
export class FirstPerson {
  private readonly view: QuadDrawer;
  private readonly source: FrameSource;
  private readonly chain = new ChainSwing();
  private readonly bob = new Bob();
  private readonly hands: Hands;
  private readonly ride: RideMotion;
  private plan: HandsPlan | null = null;
  private lower = 0;
  /** How far a shield or a torch has ducked out of a strike's way, 0 held to 1 gone below the screen. */
  private duck = 0;
  private castClock: number | null = null;
  private wasCasting = false;
  private flameClock = 0;
  private shield = SHIELD_REST;
  private shieldClock = 0;
  private look = '';
  private wanted: Wanted[] = [];
  private shown: ScreenQuad[] = [];
  private drawnMuzzle: readonly [number, number] | null = null;
  private zoom = 1;
  private readonly kept = new Map<string, { texture: GPUTexture; picture: Picture } | null>();
  private readonly loading = new Set<string>();
  /** Picks each swing's direction as a share of DFO's six, as each swing begins; a fight's rules may choose it, and
   *  may be set to once the first person is open. */
  strokes: () => number;

  constructor(view: QuadDrawer, source: FrameSource, random: () => number = Math.random, strokes = random) {
    this.view = view;
    this.source = source;
    this.strokes = strokes;
    this.hands = new Hands(() => this.strokes());
    this.ride = new RideMotion(random);
  }

  /** Opens the first person on the forge's published pictures, with their placement and Daggerfall's colours. */
  static async open(gpu: Gpu, store: ForgeStore, strokes: () => number = Math.random): Promise<FirstPerson> {
    const [frames, dyes] = await Promise.all([store.table<FramesTable>('frames'), store.table<DyeTable>('dyes')]);
    const painter = new FramePainter(dyes, new PaletteSnap(dyes.palette));
    const source = { strip: (path: string) => store.strip(path), frames, dyes, painter };
    return new FirstPerson(new FirstPersonView(gpu), source, Math.random, strokes);
  }

  /** The blow or shot under way: its direction (null for a bow, a gun or a crossbow), how far through it, the hand that
   *  threw it and whether the hands take turns as a pair; null at rest. */
  get swing(): Swing | null {
    return this.hands.swing;
  }

  /** Ends any swing or draw under way at once, with no blow and no arrow: the fight's rules ended it (a dodge, a
   *  flinch, a guard, a draw let go too soon to shoot). */
  cancel(): void {
    this.hands.cancel();
  }

  /** Moves the first person on by `seconds`: the swings and shots, the cast, the bob, the chain, the climb, the ride and
   *  the held things. Answers the blow that lands now and whether a shot leaves, and from which hand, so the figure seen
   *  from outside can match them. */
  update(seconds: number, input: AttackInput, state: FirstPersonState): HandsEvents {
    this.plan = state.drawn ? handsPlan(state.right, state.left) : null;
    this.zoom = state.zoom ?? 1;
    const worn: Worn = {
      hands: state.armour.gauntlets ? forgeName(state.armour.gauntlets) : null,
      feet: state.armour.boots ? forgeName(state.armour.boots) : null,
    };
    if (state.casting && !this.wasCasting && !this.hands.busy) this.castClock = 0;
    this.wasCasting = state.casting;
    if (this.castClock !== null) {
      this.castClock += seconds;
      if (this.castClock >= CAST_SEQUENCE.length * CAST_STEP) this.castClock = null;
    }
    this.lower = lowerStep(this.lower, state.climbing, seconds);
    const free = this.castClock === null && this.lower < 0.5;
    const motion = { running: state.running && state.moving && !state.mounted, stride: state.stride };
    const events = this.hands.update(seconds, free ? input : STILL, this.plan, motion);
    this.hands.pose(state.pose ?? null);
    this.duck = lowerStep(this.duck, ducks(this.plan?.held) && this.hands.swing ? 1 : 0, seconds);
    const walking = state.moving && !state.mounted;
    const drop = this.bob.step(seconds, state.stride, walking, state.running) + lowerDrop(this.lower);
    const sway = this.chain.step(seconds, !walking ? 0 : state.running ? 2 : 1);
    this.flameClock += seconds;
    this.stepShield(seconds, !!state.blocking);
    const shot = state.mounted ? this.ride.step(seconds, gaitOf(state), state.yaw ?? null) : null;

    const lookKey = `${state.right}|${state.left}|${state.drawn}|${worn.hands}|${worn.feet}|${!!state.mounted}`;
    this.wanted = this.wantedNow(state, worn, drop, sway, shot);
    // What is wanted now is asked for first, ahead of the rest of a new look's pictures.
    for (const wanted of this.wanted) this.request(wanted);
    if (lookKey !== this.look) {
      this.look = lookKey;
      this.prefetch(worn, !!state.mounted);
    }
    return events;
  }

  private stepShield(seconds: number, blocking: boolean): void {
    const target = blocking ? SHIELD_BLOCK : SHIELD_REST;
    this.shieldClock += seconds;
    while (this.shieldClock >= SHIELD_STEP) {
      this.shieldClock -= SHIELD_STEP;
      this.shield += Math.sign(target - this.shield);
    }
  }

  private wantedNow(state: FirstPersonState, worn: Worn, drop: number, sway: number, shot: RideShot | null): Wanted[] {
    if (this.castClock !== null) {
      const record = CAST_SEQUENCE[Math.floor(this.castClock / CAST_STEP)] ?? 0;
      const element = state.element ?? 'magic';
      const ask = () => castPicture(this.source, element, record, worn.hands);
      const key = `cast|${element}|${record}|${worn.hands}`;
      return [
        { key, ask, place: castPlace(record, element, false) },
        { key, ask, place: castPlace(record, element, true) },
      ];
    }
    const wanted: Wanted[] = shot ? this.rideWanted(shot, worn) : [];
    // On a horse an empty hand holds its rein, not its fist up.
    const views = this.hands.views().filter((view) => !shot || holds(view.holding));
    if (this.lower < LOWERED_GONE) {
      if (state.running && !shot && (!this.plan || this.hands.bareAtRest)) {
        for (const left of [false, true]) wanted.push(this.runWanted(worn, runFrameAt(state.stride, left), left, drop));
      } else {
        if (this.plan?.held) wanted.push(this.heldWanted(this.plan.held, worn, drop));
        wanted.push(...views.map((view) => this.viewWanted(view, worn, drop, sway)));
      }
    }
    if (this.lower > 0.001 && !shot)
      wanted.push(...(['left', 'right'] as const).map((hand) => this.gripWanted(hand, worn)));
    return wanted;
  }

  private viewWanted(view: HandView, worn: Worn, drop: number, sway: number): Wanted {
    const across = view.hand === 'left' ? view.dx : -view.dx;
    const { holding } = view;
    const resting = holding.kind === 'weapon' && holding.wielded.kind === 'sword' && view.record === 0;
    const aside = resting ? (view.flip ? -SWORD_RIGHT : SWORD_RIGHT) : 0;
    const place = atOwnPlace(view.flip, drop + view.dy + (resting ? SWORD_DROP : 0), view.lower, across + aside);
    const kind =
      holding.kind === 'shooter' ? holding.shooter.kind : holding.kind === 'weapon' ? holding.wielded.kind : '';
    const tip = view.hand === 'right' && !this.plan?.pair ? MUZZLE[kind] : undefined;
    if (holding.kind === 'shooter') {
      const { shooter } = holding;
      const key = `shot|${shooter.kind}|${shooter.metal}|${shooter.gilded}|${worn.hands}|${view.record}-${view.frame}|${view.pairArt}`;
      const ask =
        shooter.kind === 'crossbow' && view.record === 0
          ? () => crossbowPicture(this.source, shooter, view.frame, view.pairArt)
          : () => gunPicture(this.source, shooter, worn.hands, view.record, view.frame);
      return { key, ask, place, ...(tip ? { tip } : {}) };
    }
    if (holding.kind !== 'weapon') return this.heldWanted(holding, worn, drop);
    const { wielded } = holding;
    let { record, frame } = view;
    if (wielded.kind === 'flail' && record === 0) [record, frame] = [SWAY_RECORD, swayFrame(sway, SWAY_FRAMES)];
    const key = `weapon|${wielded.kind}|${wielded.make}|${wielded.bow}|${worn.hands}|${worn.feet}|${record}-${frame}|${view.flip}`;
    const ask = () => weaponPicture(this.source, wielded, worn, record, frame, view.flip);
    return { key, ask, place, ...(tip ? { tip } : {}) };
  }

  /** A shield's frame is its pose's, raised to lowered; a light's its flame's. */
  private heldFrame(held: Holding): number {
    if (held.kind === 'shield') return Math.min(SHIELD_FRAMES - 1, Math.max(0, this.shield));
    return Math.floor(this.flameClock / FLAME_STEP) % LIGHT_FRAMES;
  }

  private heldWanted(held: Holding, worn: Worn, drop: number, frame = this.heldFrame(held)): Wanted {
    const place = atOwnPlace(false, ducks(held) ? drop + lowerDrop(this.duck) : drop);
    if (held.kind === 'shield') {
      const key = `shield|${held.archive}|${held.metal}|${worn.hands}|${frame}`;
      return { key, ask: () => shieldPicture(this.source, held.archive, held.metal, worn.hands, frame), place };
    }
    const light = held.kind === 'light' ? held.light : 'torch';
    const key = `light|${light}|${worn.hands}|${frame}`;
    return { key, ask: () => lightPicture(this.source, light, worn.hands, frame), place };
  }

  private runWanted(worn: Worn, frame: number, left: boolean, drop: number): Wanted {
    return {
      key: `run|${worn.hands}|${frame}`,
      ask: () => runPicture(this.source, worn.hands, frame),
      place: atOwnPlace(left, drop),
    };
  }

  private gripWanted(hand: Hand, worn: Worn): Wanted {
    const frame = gripFrame(1 - this.lower);
    const key = `grip|${frame}|${worn.hands}`;
    return { key, ask: () => gripPicture(this.source, frame, worn.hands), place: gripPlace(hand, this.lower) };
  }

  /** The horse from the saddle, and each hand not holding something on its rein: a weapon takes the right hand, and a
   *  weapon, a shield or a light the left. */
  private rideWanted(shot: RideShot, worn: Worn): Wanted[] {
    const busy: Record<Hand, boolean> = {
      right: holds(this.plan?.right),
      left: holds(this.plan?.left) || !!this.plan?.held,
    };
    const horse = { key: `ride|${shot.key}`, ask: () => horsePicture(this.source, shot), place: ridePlace(false) };
    const reins = SIDES.filter(([, hand]) => !busy[hand]).map(([side]) => ({
      key: `rein|${shot.key}|${side}|${worn.hands}`,
      ask: () => reinPicture(this.source, shot, side, worn.hands),
      place: ridePlace(side === 'L'),
    }));
    return [horse, ...reins];
  }

  /** Asks for every picture a new look shows, so a swing's frames are ready before it needs them. */
  private prefetch(worn: Worn, mounted: boolean): void {
    for (let frame = 0; frame < RUN_FRAMES; frame++) this.request(this.runWanted(worn, frame, false, 0));
    if (mounted) for (const shot of RIDE_AHEAD) for (const wanted of this.rideWanted(shot, worn)) this.request(wanted);
    if (!this.plan) return;
    for (const view of everyView(this.plan)) this.request(this.viewWanted(view, worn, 0, 0));
    const { held } = this.plan;
    const frames = held?.kind === 'shield' ? SHIELD_FRAMES : LIGHT_FRAMES;
    if (held) for (let frame = 0; frame < frames; frame++) this.request(this.heldWanted(held, worn, 0, frame));
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

  /** Where the ranged weapon's muzzle is on the design screen as the hands stand this frame, zoomed as they are, so a
   *  shot let go now leaves from where it will be drawn (as last drawn while this frame's picture is still composing);
   *  null with none in hand. */
  get muzzle(): readonly [number, number] | null {
    const sighting = this.wanted.find((wanted) => wanted.tip);
    if (!sighting?.tip) return null;
    const kept = this.kept.get(sighting.key);
    const quad = kept && sighting.place(kept.picture);
    const muzzle = quad ? ([quad.x + sighting.tip[0], quad.y + sighting.tip[1]] as const) : this.drawnMuzzle;
    return muzzle && zoomedOnScreen(muzzle[0], muzzle[1], this.zoom);
  }

  /** Draws the first person over what `colourView` holds, `width` by `height` pixels. Until every picture wanted is
   *  composed, the last whole set stays on the screen. */
  draw(encoder: GPUCommandEncoder, colourView: GPUTextureView, width: number, height: number): void {
    const quads: ScreenQuad[] = [];
    let ready = true;
    let muzzle: readonly [number, number] | null = null;
    for (const wanted of this.wanted) {
      const kept = this.kept.get(wanted.key);
      if (kept === undefined) ready = false;
      else if (kept) {
        const quad = wanted.place(kept.picture);
        quads.push({ texture: kept.texture, ...quad });
        if (wanted.tip) muzzle = [quad.x + wanted.tip[0], quad.y + wanted.tip[1]];
      }
    }
    if (ready) [this.shown, this.drawnMuzzle] = [quads, muzzle];
    const zoom = this.zoom;
    const zoomed = this.shown.map((quad) => {
      const [x, y] = zoomedOnScreen(quad.x, quad.y, zoom);
      return { ...quad, x, y, width: quad.width * zoom, height: quad.height * zoom };
    });
    this.view.draw(encoder, colourView, width, height, zoomed);
  }
}

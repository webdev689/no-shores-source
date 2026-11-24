import { type GlowElement, type GlowLook, glowField } from '../elementGlow.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import { cosmeticRamp, factionRamp } from '../forge/cosmetics.ts';
import type { ForgeStore } from '../forge/store.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { Gpu } from '../gpu.ts';
import { type Climb, ClimbHands, type ClimbShown, GRIP, REACH_HEIGHT } from './climbHands.ts';
import { climbFrame, climbPicture, climbPlace } from './climbing.ts';
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
  Sway,
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
import {
  CAST_SEQUENCE,
  CAST_STEP,
  MUZZLE,
  SWORD_DROP,
  SWORD_RIGHT,
  atOwnPlace,
  castPlace,
  ducks,
  holds,
  swayedQuad,
  zoomedOnScreen,
} from './fpPlaces.ts';
import type { AttackInput, Pace } from './weaponMachine.ts';

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
  /** The climb the hands are on, which they follow; none off the wall. */
  readonly climb?: Climb | null;
  /** How far the view looks down, radians, negative up: the fists on a wall stay on it as the view tilts. */
  readonly pitch?: number;
  /** The view's vertical field, radians: the lens the fists on a wall are pinned to it through. */
  readonly fov?: number;
  readonly element?: string;
  /** The element a cast's light is recoloured to: its Art's. */
  readonly castGlow?: GlowElement | null;
  readonly mounted?: boolean;
  /** The coat and barding the ridden horse wears, by their cosmetics' ids; none for the bay and the bare horse. */
  readonly horse?: { readonly coat: string | null; readonly barding: string | null };
  /** The cosmetic dye worn, by its id, which the gauntlets and boots take; none for their own colours. */
  readonly dye?: string | null;
  /** The faction, by its key, whose own colour the gauntlets, the boots and each hand's weapon wear; none for none. */
  readonly own?: { readonly hands?: string; readonly feet?: string; readonly right?: string; readonly left?: string };
  readonly yaw?: number;
  readonly blocking?: boolean;
  /** A weapon held in a fight's pose, one of its strokes' frames: a guard, a parry's deflect. */
  readonly pose?: { readonly record: number; readonly frame: number } | null;
  /** How far the view is zoomed in (aiming): the hands zoom with it, about the middle of the screen. */
  readonly zoom?: number;
  /** The fight's own timing of the swing it has begun, which a strike begun now keeps; none outside a fight. */
  readonly pace?: Pace | null;
  /** The forge body the player wears, whose sets' light a covering colour is laid by, as the figure's is. */
  readonly body?: string;
  /** What the hands would hold drawing the other loadout, whose pictures are asked for ahead of a swap. */
  readonly spare?: { readonly right: string | null; readonly left: string | null; readonly own?: Armed } | null;
}

/** The faction, by its key, whose own colour each hand's weapon of a loadout wears; none for none. */
type Armed = { readonly right?: string | undefined; readonly left?: string | undefined };
const armedKey = (armed: Armed) => `${armed.right ?? ''}/${armed.left ?? ''}`;

/** What a blow of the player's own met, as the first person shows it: it landed, or it was blocked (or blocked one). */
export type Contact = 'landed' | 'blocked';
/** A landed blow jolts the hands down this many design pixels, a block this many, for this many seconds (three
 *  frames at 60 a second, whatever the screen's rate); a landed blow's white rim lights the weapon for one such frame,
 *  and always for the first frame drawn after it. */
const JOLT = { landed: 2, blocked: 4, seconds: 3 / 60, rim: 1 / 60 } as const;

/** What the first person draws with: a texture a picture or an outline's field, and the quads over the scene. */
export type QuadDrawer = Pick<FirstPersonView, 'texture' | 'glow' | 'forget' | 'draw'>;

/** A picture wanted on the screen: what names it, how it is composed, where it lies once it is, where on it a
 *  ranged weapon's muzzle (or its arrow's head) is, and for a weapon the hand that holds it, which may glow. */
interface Wanted {
  readonly key: string;
  readonly ask: () => Promise<Picture | null>;
  readonly place: (picture: Picture) => Omit<ScreenQuad, 'texture'>;
  readonly tip?: readonly [number, number];
  readonly hand?: Hand;
  /** Held still on the screen, never swayed: a hand on a wall's stone, the horse and its reins. */
  readonly still?: true;
}

/** A composed picture kept on the GPU: its texture, and its outline's field in each element it has glowed in. */
interface Kept {
  readonly texture: GPUTexture;
  readonly picture: Picture;
  readonly glows: Partial<Record<GlowElement, GPUTexture>>;
}

/** A held light's flame steps a frame this often, and a shield a frame toward its pose this often: our own pace. */
const FLAME_STEP = 0.1;
const SHIELD_STEP = 0.05;
/** What the horse's picture from the saddle is kept by begins so: it never takes a dye. */
const HORSE_KEY = 'ride|';
/** A shield at rest is held a frame below raised, and raised whole for a block. */
const SHIELD_REST = 1;
const SHIELD_BLOCK = 0;
/** Composed pictures kept on the GPU before all are let go and composed again as needed. */
const KEPT_PICTURES = 1500;
const STILL: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };
const SIDES: readonly [Side, Hand][] = [
  ['R', 'right'],
  ['L', 'left'],
];

const gaitOf = (state: FirstPersonState): Gait => (!state.moving ? 'stand' : state.running ? 'gallop' : 'walk');
/** The first person: the weapons, the held things or the hands in view, swung by the attack button and drawn over the
 *  scene. */
export class FirstPerson {
  private readonly view: QuadDrawer;
  private source: FrameSource;
  /** The cosmetic dye and the factions' colours the pictures were composed in. */
  private dye = '';
  private readonly chain = new ChainSwing();
  private readonly bob = new Bob();
  /** The weapon's sway as it is held (`Sway`), design pixels across and down; none on a wall or a horse. */
  private readonly sway = new Sway();
  private swayed: readonly [number, number] = [0, 0];
  private readonly hands: Hands;
  private readonly ride: RideMotion;
  private plan: HandsPlan | null = null;
  private lower = 0;
  private readonly climbHands = new ClimbHands();
  private climbShown: ClimbShown = { grips: [], reach: null };
  /** The screen's width over its height when last drawn with a size, the lens the hands on a wall are pinned through. */
  private aspect = DESIGN_WIDTH / DESIGN_HEIGHT;
  /** How far a shield or a torch has ducked out of a strike's way, 0 held to 1 gone below the screen. */
  private duck = 0;
  private castClock: number | null = null;
  private wasCasting = false;
  private flameClock = 0;
  private shield = SHIELD_REST;
  private shieldClock = 0;
  private look = '';
  /** The coat and barding the ridden horse wears. */
  private horse: { readonly coat: string | null; readonly barding: string | null } = { coat: null, barding: null };
  /** The other loadout's hands whose pictures were last asked for ahead of a swap. */
  private spareLook = '';
  /** The factions' colours the drawn loadout's weapons wear, which each of their pictures is kept by. */
  private armed: Armed = {};
  private wanted: Wanted[] = [];
  private shown: ScreenQuad[] = [];
  private drawnMuzzle: readonly [number, number] | null = null;
  private zoom = 1;
  private readonly kept = new Map<string, Kept | null>();
  private readonly loading = new Set<string>();
  /** How many times every picture was let go: one composing from before then is out of date when it lands. */
  private lettings = 0;
  /** Picks each swing's direction as a share of DFO's six, as each swing begins; a fight's rules may choose it, and
   *  may be set to once the first person is open. */
  strokes: () => number;
  /** The element each hand's weapon glows in (the right, then the left), as the one who sees it sets it. */
  glow: readonly [GlowLook, GlowLook] = [0, 0];
  /** How hard the weapons' glow surges (1 at rest), as the one who sees it sets it each frame. */
  surge = 1;
  /** The hands' jolt from the last contact (design pixels, and when it came, page seconds), whether the weapon's rim
   *  is still to be drawn once, and when a landed blow last threw the element off the blade. */
  private jolt = { pixels: 0, at: -Infinity };
  private rimOwed = false;
  private burstAt: number | null = null;

  constructor(view: QuadDrawer, source: FrameSource, random: () => number = Math.random, strokes = random) {
    this.view = view;
    this.source = source;
    this.strokes = strokes;
    this.hands = new Hands(() => this.strokes());
    this.ride = new RideMotion(random);
  }

  /** Opens the first person on the forge's published pictures, with their placement and Daggerfall's colours. */
  static async open(gpu: Gpu, store: ForgeStore, strokes: () => number = Math.random): Promise<FirstPerson> {
    const [frames, dyes, looks] = await Promise.all([
      store.table<FramesTable>('frames'),
      store.table<DyeTable>('dyes'),
      store.table<ForgeLooks>('looks'),
    ]);
    const painter = new FramePainter(dyes, new PaletteSnap(dyes.palette));
    const source = { strip: (path: string) => store.strip(path), frames, dyes, painter, looks };
    return new FirstPerson(new FirstPersonView(gpu), source, Math.random, strokes);
  }

  /** The blow or shot under way: its direction (null for a bow, a gun or a crossbow), how far through it, the hand that
   *  threw it and whether the hands take turns as a pair; null at rest. */
  get swing(): Swing | null {
    return this.hands.swing;
  }

  /** A blow of the player's own met something: landed, the weapon takes a white rim for a frame and throws its
   *  element off as a burst, and the hands jolt down 2 design pixels for 3 frames; blocked, they jolt 4. Never a
   *  trail: the first person strikes without one. */
  contact(kind: Contact): void {
    const now = performance.now() / 1000;
    this.jolt = { pixels: JOLT[kind], at: now };
    if (kind === 'landed') [this.rimOwed, this.burstAt] = [true, now];
  }

  /** Ends any swing or draw under way at once, with no blow and no arrow: the fight's rules ended it (a dodge, a
   *  flinch, a guard, a draw let go too soon to shoot). */
  cancel(): void {
    this.hands.cancel();
  }

  /** Ends every reload under way at once: the fight's rules are not reloading, so the next shot they let go plays. */
  loaded(): void {
    this.hands.loaded();
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
    const look = { yaw: state.yaw ?? 0, pitch: state.pitch ?? 0, fov: state.fov ?? 0, aspect: this.aspect };
    this.climbShown = this.climbHands.step(seconds, state.climb ?? null, look, this.lower);
    const free = this.castClock === null && this.lower < 0.5;
    const motion = { running: state.running && state.moving && !state.mounted, stride: state.stride };
    const events = this.hands.update(seconds, free ? input : STILL, this.plan, motion, state.pace ?? null);
    this.hands.pose(state.pose ?? null);
    this.duck = lowerStep(this.duck, ducks(this.plan?.held) && this.hands.swing ? 1 : 0, seconds);
    const walking = state.moving && !state.mounted;
    const drop = this.bob.step(seconds, state.stride, walking, state.running) + lowerDrop(this.lower);
    const held = this.lower < 0.001 && !state.mounted;
    const looked = held ? { yaw: state.yaw ?? 0, pitch: state.pitch ?? 0 } : null;
    this.swayed = this.sway.step(seconds, looked, state.stride, walking, state.running);
    const sway = this.chain.step(seconds, !walking ? 0 : state.running ? 2 : 1);
    this.flameClock += seconds;
    this.stepShield(seconds, !!state.blocking);
    const shot = state.mounted ? this.ride.step(seconds, gaitOf(state), state.yaw ?? null) : null;

    this.horse = state.horse ?? this.horse;
    // A new dye, a faction's colour on the gauntlets or the boots, or a new body (whose sets' light a covering colour
    // is laid by) recolours every hand and foot: what was composed in the old is let go, but the horse. The weapons'
    // colours are in their own pictures' keys, so a swap keeps them.
    const { hands, feet, right, left } = state.own ?? {};
    this.armed = { right, left };
    const dyed = [state.dye ?? '', hands, feet, state.body].join('|');
    if (dyed !== this.dye) {
      this.dye = dyed;
      const { palette } = this.source.dyes;
      const own = { hands: factionRamp(hands, palette), feet: factionRamp(feet, palette) };
      const body = state.body ?? this.source.body;
      this.source = { ...this.source, dye: cosmeticRamp(state.dye, palette), own, ...(body ? { body } : {}) };
      this.letGo((key) => key.startsWith(HORSE_KEY));
      [this.look, this.spareLook] = ['', ''];
    }
    const lookKey = `${state.right}|${state.left}|${state.drawn}|${worn.hands}|${worn.feet}|${!!state.mounted}|${this.horse.coat}|${this.horse.barding}`;
    this.wanted = this.wantedNow(state, worn, drop, sway, shot);
    // What is wanted now is asked for first, ahead of the rest of a new look's pictures.
    for (const wanted of this.wanted) this.request(wanted);
    if (lookKey !== this.look) {
      this.look = lookKey;
      this.prefetch(worn, !!state.mounted);
    }
    const spare = state.spare ?? null;
    const spareKey = spare
      ? `${spare.right}|${spare.left}|${worn.hands}|${worn.feet}|${armedKey(spare.own ?? {})}`
      : '';
    if (spare && spareKey !== this.spareLook)
      this.prefetchHands(handsPlan(spare.right, spare.left), worn, spare.own ?? {});
    this.spareLook = spareKey;
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
      const glow = state.castGlow ?? null;
      const ask = () => castPicture(this.source, element, record, worn.hands, glow);
      const key = `cast|${element}|${glow}|${record}|${worn.hands}`;
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
    if (this.lower > 0.001 && !shot) wanted.push(...this.climbWanted(worn));
    return wanted;
  }

  /** The source a loadout's weapons are painted from: each in its faction's colour. */
  private sourceFor(armed: Armed): FrameSource {
    const { palette } = this.source.dyes;
    const weapons = { right: factionRamp(armed.right, palette), left: factionRamp(armed.left, palette) };
    return { ...this.source, own: { ...this.source.own, ...weapons } };
  }

  private viewWanted(view: HandView, worn: Worn, drop: number, sway: number, armed = this.armed): Wanted {
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
      return { key, ask, place, hand: view.hand, ...(tip ? { tip } : {}) };
    }
    if (holding.kind !== 'weapon') return this.heldWanted(holding, worn, drop, this.heldFrame(holding), armed);
    const { wielded } = holding;
    let { record, frame } = view;
    if (wielded.kind === 'flail' && record === 0) [record, frame] = [SWAY_RECORD, swayFrame(sway, SWAY_FRAMES)];
    const key = `weapon|${wielded.kind}|${wielded.make}|${wielded.bow}|${worn.hands}|${worn.feet}|${record}-${frame}|${view.flip}|${view.hand}|${armedKey(armed)}`;
    const left = view.hand === 'left';
    const ask = () => weaponPicture(this.sourceFor(armed), wielded, worn, record, frame, view.flip, left);
    const hand = wielded.kind === 'fists' ? {} : { hand: view.hand };
    return { key, ask, place, ...hand, ...(tip ? { tip } : {}) };
  }

  /** A shield's frame is its pose's, raised to lowered; a light's its flame's. */
  private heldFrame(held: Holding): number {
    if (held.kind === 'shield') return Math.min(SHIELD_FRAMES - 1, Math.max(0, this.shield));
    return Math.floor(this.flameClock / FLAME_STEP) % LIGHT_FRAMES;
  }

  private heldWanted(
    held: Holding,
    worn: Worn,
    drop: number,
    frame = this.heldFrame(held),
    armed = this.armed,
  ): Wanted {
    const place = atOwnPlace(false, ducks(held) ? drop + lowerDrop(this.duck) : drop);
    if (held.kind === 'shield') {
      const key = `shield|${held.archive}|${held.metal}|${worn.hands}|${frame}|${armedKey(armed)}`;
      const ask = () => shieldPicture(this.sourceFor(armed), held.archive, held.metal, worn.hands, frame, held.layer);
      return { key, ask, place };
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

  /** The hands on a wall as the climb places them: each fist, opening as it reaches or lets go, and the arm reaching
   *  out while the look is away from the wall. */
  private climbWanted(worn: Worn): Wanted[] {
    const wanted: Wanted[] = this.climbShown.grips.map((grip) => {
      const frame = climbFrame(grip.open);
      return {
        key: `grip|${frame}|${worn.hands}`,
        ask: () => climbPicture(this.source, frame, worn.hands),
        place: climbPlace('grip', grip.hand, grip.x, grip.y, GRIP.height),
        still: true,
      } as const;
    });
    const { reach } = this.climbShown;
    if (!reach) return wanted;
    const frame = climbFrame(reach.open, 'reach');
    wanted.push({
      key: `reach|${frame}|${worn.hands}`,
      ask: () => climbPicture(this.source, frame, worn.hands, 'reach'),
      place: climbPlace('reach', reach.hand, reach.x, reach.y, REACH_HEIGHT),
      still: true,
    });
    return wanted;
  }

  /** The horse from the saddle, and each hand not holding something on its rein: a weapon takes the right hand, and a
   *  weapon, a shield or a light the left. */
  private rideWanted(shot: RideShot, worn: Worn): Wanted[] {
    const busy: Record<Hand, boolean> = {
      right: holds(this.plan?.right),
      left: holds(this.plan?.left) || !!this.plan?.held,
    };
    const { coat, barding } = this.horse;
    const horse = {
      key: `${HORSE_KEY}${shot.key}|${coat}|${barding}`,
      ask: () => horsePicture(this.source, shot, coat, barding),
      place: ridePlace(false),
      still: true as const,
    };
    const reins = SIDES.filter(([, hand]) => !busy[hand]).map(([side]) => ({
      key: `rein|${shot.key}|${side}|${worn.hands}`,
      ask: () => reinPicture(this.source, shot, side, worn.hands),
      place: ridePlace(side === 'L'),
      still: true as const,
    }));
    return [horse, ...reins];
  }

  /** Asks for every picture a new look shows, so a swing's frames are ready before it needs them. */
  private prefetch(worn: Worn, mounted: boolean): void {
    for (let frame = 0; frame < RUN_FRAMES; frame++) this.request(this.runWanted(worn, frame, false, 0));
    if (mounted) for (const shot of RIDE_AHEAD) for (const wanted of this.rideWanted(shot, worn)) this.request(wanted);
    if (this.plan) this.prefetchHands(this.plan, worn);
  }

  /** Asks for every picture the hands of `plan` show: the loadout drawn, or the other, so a swap shows it at once. */
  private prefetchHands(plan: HandsPlan, worn: Worn, armed = this.armed): void {
    for (const view of everyView(plan)) this.request(this.viewWanted(view, worn, 0, 0, armed));
    const { held } = plan;
    const frames = held?.kind === 'shield' ? SHIELD_FRAMES : LIGHT_FRAMES;
    if (held) for (let frame = 0; frame < frames; frame++) this.request(this.heldWanted(held, worn, 0, frame, armed));
  }

  private request(wanted: Wanted): void {
    if (this.kept.has(wanted.key) || this.loading.has(wanted.key)) return;
    if (this.kept.size >= KEPT_PICTURES) this.letGo();
    this.loading.add(wanted.key);
    const lettings = this.lettings;
    wanted
      .ask()
      .then((picture) => {
        if (lettings !== this.lettings || !this.loading.delete(wanted.key)) return;
        const texture = picture && this.view.texture(picture.pixels, picture.width, picture.height);
        this.kept.set(wanted.key, picture && texture ? { texture, picture, glows: {} } : null);
      })
      // A picture that would not load is asked again the next time it is wanted.
      .catch(() => lettings === this.lettings && this.loading.delete(wanted.key));
  }

  /** Lets the composed pictures go, but those `keeps` names, and every one still composing, to be composed again as
   *  needed. */
  private letGo(keeps: (key: string) => boolean = () => false): void {
    for (const [key, kept] of this.kept) {
      if (keeps(key)) continue;
      this.kept.delete(key);
      if (!kept) continue;
      for (const texture of [kept.texture, ...Object.values(kept.glows)]) {
        this.view.forget(texture);
        texture.destroy();
      }
    }
    this.loading.clear();
    this.lettings += 1;
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
    const placed = quad && swayedQuad(quad, this.swayed, sighting.still);
    const muzzle = placed ? ([placed.x + sighting.tip[0], placed.y + sighting.tip[1]] as const) : this.drawnMuzzle;
    return muzzle && zoomedOnScreen(muzzle[0], muzzle[1], this.zoom);
  }

  /** A kept weapon picture's outline field in `look`, made the first time it glows in it: its blade where a blade is
   *  laid over its hand, else all it draws; a picture standing on the screen's foot has no rim along it. */
  private glowOf(kept: Kept, look: GlowElement): GPUTexture {
    const made = kept.glows[look];
    if (made) return made;
    const { picture } = kept;
    const mask =
      picture.weapon ??
      Uint8Array.from({ length: picture.width * picture.height }, (_unused, texel) =>
        picture.pixels[texel * 4 + 3] ? 1 : 0,
      );
    const bottom = picture.at[1] + picture.height >= DESIGN_HEIGHT;
    const texture = this.view.glow(glowField(mask, picture.width, picture.height, look, { bottom }));
    kept.glows[look] = texture;
    return texture;
  }

  /** Draws the first person over what `colourView` holds, `width` by `height` pixels, in `light` (a clear afternoon's
   *  is 1). Until every picture wanted is composed, the last whole set stays on the screen. */
  draw(
    encoder: GPUCommandEncoder,
    colourView: GPUTextureView,
    { width, height, light }: { width: number; height: number; light: readonly [number, number, number] },
  ): void {
    if (width > 0 && height > 0) this.aspect = width / height;
    const quads: ScreenQuad[] = [];
    let ready = true;
    let muzzle: readonly [number, number] | null = null;
    const now = performance.now() / 1000;
    const rim = this.rimOwed || (this.burstAt !== null && now - this.burstAt < JOLT.rim);
    this.rimOwed = false;
    const burst = this.burstAt === null ? null : now - this.burstAt;
    for (const wanted of this.wanted) {
      const kept = this.kept.get(wanted.key);
      if (kept === undefined) ready = false;
      else if (kept) {
        const quad = swayedQuad(wanted.place(kept.picture), this.swayed, wanted.still);
        const look = wanted.hand ? this.glow[wanted.hand === 'right' ? 0 : 1] : 0;
        // A plain weapon takes a blow's rim on an outline measured round, as Cosmic's is.
        const lit = !!wanted.hand && (look !== 0 || rim);
        const glow = lit ? { texture: this.glowOf(kept, look || 3), look, surge: this.surge, rim, burst } : null;
        quads.push({ texture: kept.texture, ...quad, ...(glow ? { glow } : {}) });
        if (wanted.tip) muzzle = [quad.x + wanted.tip[0], quad.y + wanted.tip[1]];
      }
    }
    if (ready) [this.shown, this.drawnMuzzle] = [quads, muzzle];
    const zoom = this.zoom;
    const jolt = now - this.jolt.at < JOLT.seconds ? this.jolt.pixels : 0;
    const zoomed = this.shown.map((quad) => {
      const [x, y] = zoomedOnScreen(quad.x, quad.y + jolt, zoom);
      return { ...quad, x, y, width: quad.width * zoom, height: quad.height * zoom };
    });
    this.view.draw(encoder, colourView, width, height, zoomed, light);
  }
}

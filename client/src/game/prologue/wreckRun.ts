import { QUIET, pushedIn, showAnimaEdge } from '../../combat/animaMoment.ts';
import { Arrivals } from '../../combat/arrivals.ts';
import { AttackFeel, type DrawnFigure } from '../../combat/attackFeel.ts';
import { FightEffects } from '../../combat/fightEffects.ts';
import { Fighting } from '../../combat/fighting.ts';
import { crosshairOf } from '../../combat/reticle.ts';
import { FoeFigures } from '../../combat/foeFigures.ts';
import { PlayerFight } from '../../combat/playerFight.ts';
import { veiledIn } from '../../combat/spellLooks.ts';
import type { Vector } from '../../combat/swingArcs.ts';
import { figureMuzzle, screenMuzzle } from '../../combat/tracers.ts';
import { WorldSounds } from '../../combat/worldSounds.ts';
import { FIELD_OF_VIEW } from '../../editor/orbit.ts';
import type { Gpu } from '../../gpu.ts';
import type { GearState } from '../../network/gearMessages.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import { crosshairPoint, shotBodies } from '../../player/crosshair.ts';
import { CARD_NEAREST_M } from '../../player/figures.ts';
import { handsZoom } from '../../player/playerCamera.ts';
import type { Dress } from '../../player/dressing.ts';
import { IDLE, type InputFrame } from '../../player/input.ts';
import { newPlayer, playerCamera, shownBody } from '../../player/player.ts';
import type { Walker } from '../../player/walker.ts';
import { type CombatRules, startCombatRules } from '../../rules/combatRules.ts';
import type { FighterView } from '../../rules/fighters.ts';
import type { Block, MovementRules } from '../../rules/movementRules.ts';
import { rosterOf } from '../../rules/roster.ts';
import { type Shot, shotOfOrbit } from '../camera.ts';
import type { FootFight, FootFrame } from '../foot.ts';
import { footHints, onFoot } from '../hints.ts';
import { worldOutput } from '../uiSounds.ts';
import type { GearHere } from '../gearScreen.ts';
import { louder, STORY_FIGHT_GAIN } from './fightSound.ts';
import type { Arms, Boarder } from './tutorial.ts';
import { WreckCrew } from './wreckCrew.ts';
import { courseOf, titheCrew, topAt, type WreckLayout } from './wreckLayout.ts';
import { type Outcome, type Standing, WreckProgress } from './wreckProgress.ts';
import type { WreckDrawn, WreckScenery } from './wreckScenery.ts';
import { armsOf, BOARDER, boarderAt, holdingArms, LyingArms } from './wreckTeaching.ts';

/** What the wreck needs of the game: the movement rules, the walker, the forge's cards, the room's compiled module,
 *  the ground as the scene draws it, the GPU, and the wreck's mesh and baked light, fetched the first time they are
 *  asked for. */
export interface WreckContext {
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly gpu: Gpu;
  readonly drawn: () => Promise<WreckDrawn>;
}

/** Thule's place in the roster, the rank he comes in, and how many levels over the player he fights. */
const THULE = { type: 12, rank: 5, over: 3 } as const;
/** How far over a figure's feet its head's mark stands, metres. */
const OVER_THE_HEAD_M = 2.1;
const LENS = { fov: FIELD_OF_VIEW, near: 0.1, far: 60_000 } as const;
const CAMERA_CLEARANCE_M = 0.3;

/**
 * The wreck played, as `Foot` plays a node: the player on both ships' decks in a room of the page's own on the
 * layout's blocks, fighting through its zones to the arena, where Thule cannot be beaten. Its progress (checkpoints,
 * waves, the heaps across the way, the sea, the fight's end) is `WreckProgress`'s; this asks the room for it, and the
 * scenery stands or clears each heap as the room does.
 */
export class WreckRun {
  private readonly context: WreckContext;
  private readonly layout: WreckLayout;
  private room: LocalRoom | null;
  /** The fight, the blocks its blood lies on and the place it stands for, as the view on foot reads a node's: the
   *  wreck's blood is measured from its origin. A room in the page is never joined again. */
  readonly fight: Fighting;
  readonly node: {
    readonly spawns: readonly (readonly [number, number])[];
    readonly centre: readonly [number, number];
  };
  readonly rejoining = false;
  private readonly combat: CombatRules;
  private readonly player: PlayerFight;
  private readonly steps: MovementRules;
  /** The wreck's ground; the heaps standing are added to it. */
  private readonly base: readonly Block[];
  private course: Block[];
  readonly boxes: readonly Block[];
  private readonly foes: FoeFigures;
  private readonly effects = new FightEffects();
  /** The player raised at a checkpoint arrives there as one respawning does on foot. */
  private readonly arrivals = new Arrivals();
  private readonly feel: AttackFeel;
  private readonly sounds = new WorldSounds(louder(worldOutput, STORY_FIGHT_GAIN));
  private readonly scenery: WreckScenery;
  private readonly progress: WreckProgress;
  /** The player's gear as the room last sent it. */
  private readonly gearHeld: { value: GearState | null };
  /** The player's sword and shield lying on the deck, drawn while they lie there; and whether the room has been asked
   *  for them and has not yet sent word of them in the pack. */
  private readonly lying: LyingArms;
  private asked = false;
  /** The boarder met one on one, by its number in the room, once one stands. */
  private boarderId = 0;
  /** Thule's number in the room, once he stands. */
  private thule = 0;
  /** The foes stood that no snapshot has shown yet: counted alive, so a wave never outruns the room's word. */
  private readonly unseen = new Set<number>();
  /** Every foe the run has stood, by its number in the room: its wave's foe and zone. */
  private readonly stood = new Map<number, Standing>();
  private readonly crew = new WreckCrew();

  private constructor(
    context: WreckContext,
    layout: WreckLayout,
    parts: { room: LocalRoom; fight: Fighting; combat: CombatRules; module: WebAssembly.Module },
    drawn: { scenery: WreckScenery; gear: { value: GearState | null }; origin: readonly [number, number] },
  ) {
    this.context = context;
    this.layout = layout;
    [this.room, this.fight, this.combat] = [parts.room, parts.fight, parts.combat];
    this.player = new PlayerFight(parts.fight, parts.combat, context.walker);
    this.steps = parts.fight.steps(context.movement);
    this.base = courseOf(layout);
    this.course = [...this.base];
    this.foes = new FoeFigures(rosterOf(parts.module));
    this.feel = new AttackFeel(parts.combat, context.movement.tickSeconds);
    [this.scenery, this.gearHeld] = [drawn.scenery, drawn.gear];
    this.lying = new LyingArms(layout, context.forge);
    this.progress = new WreckProgress(layout);
    this.boxes = this.base;
    this.node = { spawns: [drawn.origin], centre: drawn.origin };
    for (const zone of this.scenery.standing) this.standGate(zone);
  }

  /** Opens the wreck laid in the world (`layout`, its blocks measured from `origin`): its room in the page on the
   *  layout's blocks, every heap standing across the way, the player waking where it says, drawn by `scenery`. */
  static async open(
    context: WreckContext,
    layout: WreckLayout,
    origin: readonly [number, number],
    scenery: WreckScenery,
  ): Promise<WreckRun> {
    const { movement, walker } = context;
    const module = await context.roomModule;
    const course = courseOf(layout);
    const combat = startCombatRules(module);
    // The open sea under the decks: only the blocks, held round their edge as the room holds them, for the walk and
    // the fight's own steps alike (in a fight the fight's prediction steps the player's body).
    for (const rules of [movement, combat]) rules.setRim(course);
    const [x, y] = layout.wake.at;
    const { facing } = layout.wake;
    // On the deck under the wake, as the room stands them: the rim's own ground is the sea below it, so the shot the
    // wake's flight ends on would stand inside the hull.
    const woke = newPlayer(movement, x, y);
    const body = { ...woke.body, z: topAt(course, x, y) };
    walker.player = { ...woke, body, previous: body, view: walker.player.view, yaw: facing, facing };
    const gear: { value: GearState | null } = { value: null };
    let fight: Fighting | null = null;
    const room = LocalRoom.openOverSea(
      module,
      { x, y },
      course,
      (snapshot) => fight?.receive(snapshot),
      (sent) => (gear.value = sent),
    );
    // The prologue's player has no Art yet (one comes after it, with the factions), wakes hurt without the sword and
    // shield the story dressed them in, and meets the boarders as one side.
    room.storyWreck();
    fight = new Fighting(combat, room);
    return new WreckRun(context, layout, { room, fight, combat, module }, { scenery, gear, origin });
  }

  /** The room, while the run is played. */
  private get openRoom(): LocalRoom {
    if (!this.room) throw new Error('the wreck has been left');
    return this.room;
  }

  /** The course as it stands now, laid on the room, the page's own movement and the fight's rules alike. */
  private relay(): void {
    const gates = [...this.scenery.standing].flatMap((zone) => this.layout.zones[zone]?.gate ?? []);
    this.course = [...this.base, ...gates];
    for (const rules of [this.context.movement, this.combat]) rules.setCourse(this.course);
  }

  /** A zone's heap stands across the way on from it. The foes' routes were laid without it: a foe that runs at it
   *  stops there until it clears. */
  private standGate(zone: number): void {
    const gate = this.layout.zones[zone]?.gate;
    if (!gate) return;
    this.scenery.standing.add(zone);
    this.openRoom.standBlock(gate);
    this.relay();
  }

  /** A zone's heap is cleared: its wave has fallen. */
  private openGate(zone: number): void {
    const gate = this.layout.zones[zone]?.gate;
    if (!gate || !this.scenery.standing.delete(zone)) return;
    this.openRoom.takeBlock(gate);
    this.relay();
  }

  /** Whether the player has entered the arena. */
  get arena(): boolean {
    return this.progress.arena;
  }

  /** How the boss fight ended, or null while it has not. */
  get outcome(): Outcome | null {
    return this.progress.outcome;
  }

  /** The player's level, as the room last sent it. */
  private get level(): number {
    return this.gearHeld.value?.level ?? 1;
  }

  /** The player's gear in the room and the way to ask of it, for the menu, the figure drawn in `dress`. */
  gearHere(dress: Dress): GearHere {
    const { fight } = this;
    return { gear: this.gearHeld.value, ask: (ask) => fight.askGear(ask), forge: this.context.forge, dress };
  }

  /** `dress` holding the arms the player wears, as their gear has them. */
  armedDress(dress: Dress): Dress {
    return holdingArms(dress, this.gearHeld.value, this.context.forge);
  }

  /** Where the player's sword and shield are. */
  get arms(): Arms {
    return armsOf(this.gearHeld.value);
  }

  /** Holds the wreck's waves back, or lets them come. */
  holdWaves(held: boolean): void {
    this.progress.held = held;
  }

  /** The boarder met one on one stands at the far end of the quiet deck from the player, facing them, and comes for
   *  them at once, wherever on the wreck they stand. */
  standBoarder(): void {
    const { body } = this.context.walker.player;
    const { at, facing } = boarderAt(this.layout, body.x, body.y);
    const room = this.openRoom;
    const id = room.standFoe(BOARDER.type, BOARDER.rank, ...at, facing, this.level);
    if (id === 0) return;
    room.storyHunt(id);
    this.boarderId = id;
    this.unseen.add(id);
    this.stood.set(id, { ...BOARDER, at, facing, zone: 0 });
  }

  /** The boarder as the room last showed it, while it stands. */
  get boarderView(): FighterView | null {
    const kept = this.fight.foes.get(this.boarderId);
    return kept && kept.view.health > 0 ? kept.view : null;
  }

  /** The boarder: not yet come, standing, or fallen. */
  get boarder(): Boarder {
    if (this.boarderId === 0) return 'none';
    return this.unseen.has(this.boarderId) || this.boarderView ? 'standing' : 'fallen';
  }

  /** Whether the arms lie on the deck: neither in the pack nor asked for. */
  private get armsLie(): boolean {
    return this.arms === 'lying' && !this.asked;
  }

  /** `marks` with the arms lying on the deck laid after them, while they lie. */
  private lyingMarks(marks: number[], clock: number, eye: readonly [number, number, number]): number[] {
    if (this.armsLie) this.lying.mark(marks, clock, eye);
    return marks;
  }

  /** The arms lying on the deck are taken up once the player walks over them: the room puts them in the pack. Should
   *  they leave the pack (dismantled), they lie on the deck again to be taken up. */
  private takeArms(): void {
    if (this.arms !== 'lying') this.asked = false;
    if (!this.armsLie) return;
    const { body } = this.context.walker.player;
    if (this.lying.reached([body.x, body.y, body.z]) && this.openRoom.storyTakeArms()) this.asked = true;
  }

  /** The boss fight begins: the heap closes the way into the arena behind the player, every other foe is sent away,
   *  and Thule stands where the layout puts him, facing the player, three levels over them. */
  beginBoss(): void {
    if (this.progress.fighting) return;
    this.standGate(this.layout.arena.zone - 1);
    const room = this.openRoom;
    room.clearFoes();
    this.unseen.clear();
    this.progress.beginBoss();
    const [x, y] = this.layout.arena.thule;
    const { body } = this.context.walker.player;
    const facing = Math.atan2(body.x - x, -(body.y - y));
    this.thule = room.standFoe(THULE.type, THULE.rank, x, y, facing, this.level + THULE.over);
  }

  /** Thule's health, once he stands. */
  get boss(): { readonly health: number; readonly healthMax: number } | null {
    const kept = this.fight.foes.get(this.thule);
    return kept ? { health: kept.view.health, healthMax: kept.view.healthMax } : null;
  }

  /** World points over heads, for barks: Thule's as 'thule', each wave's foe's by its crew and number,
   *  'tithe-<number>' or 'pirate-<number>', and each of the Brig's crew's as 'crew-<number>'. */
  heads(): ReadonlyMap<string, readonly [number, number, number]> {
    const heads = new Map<string, readonly [number, number, number]>();
    for (const [id, placed] of this.foes.placed) {
      const foe = this.stood.get(id);
      const side = this.crew.has(id) ? 'crew' : foe && titheCrew(foe.type) ? 'tithe' : 'pirate';
      const name = id === this.thule ? 'thule' : `${side}-${id}`;
      heads.set(name, [placed.x, placed.y, placed.z + OVER_THE_HEAD_M]);
    }
    return heads;
  }

  /** The foes alive now by the zone whose wave they came in: those a snapshot shows standing, and those stood that
   *  none has shown yet. */
  private aliveByZone(): number[] {
    const alive: number[] = this.layout.zones.map(() => 0);
    const count = (id: number) => {
      const foe = this.stood.get(id);
      if (foe) alive[foe.zone] = (alive[foe.zone] ?? 0) + 1;
    };
    for (const id of this.fight.foes.keys()) this.unseen.delete(id);
    for (const kept of this.fight.foes.values()) if (kept.view.health > 0) count(kept.id);
    for (const id of this.unseen) count(id);
    return alive;
  }

  /** The level's progress this frame: heaps cleared, checkpoints kept, waves stood, a fall into the sea brought
   *  back. */
  private advance(seconds: number): void {
    const room = this.openRoom;
    const { body } = this.context.walker.player;
    const dead = this.fight.own?.action.kind === 'dead';
    const alive = this.aliveByZone();
    const asks = this.progress.frame({ x: body.x, y: body.y, z: body.z, dead, alive, thule: this.boss }, seconds);
    for (const zone of asks.open) this.openGate(zone);
    if (asks.checkpoint) room.setSpawn(...asks.checkpoint);
    if (asks.bringBack) room.putPlayer(...asks.bringBack);
    const crewRun = { room, figures: this.foes, foes: this.fight.foes, layout: this.layout, level: this.level };
    this.crew.stand(asks.stand, crewRun);
    // The crew still standing regroup at each zone the player reaches, but the arena's: the boss fight is one on one.
    if (asks.checkpoint && this.progress.zone < this.layout.arena.zone) this.crew.regroup(this.progress.zone, crewRun);
    for (const foe of asks.stand) {
      const id = room.standFoe(foe.type, foe.rank, ...foe.at, foe.facing, this.level);
      if (id === 0) continue;
      this.unseen.add(id);
      this.stood.set(id, foe);
    }
  }

  /** The shot the run's camera takes of the player standing still: where a cutscene hands play over from. */
  restingShot(): Shot {
    const { walker, movement, groundAt } = this.context;
    return shotOfOrbit(playerCamera(walker.player, movement, this.course), LENS, groundAt, CAMERA_CLEARANCE_M);
  }

  /** One frame: the player plays and fights (nothing pressed while `paused`, the fight's buttons only while
   *  `hands`), or while `held` everything stands still for a cutscene; the camera follows; every figure and mark is
   *  placed for an eye there. While `frozen` the fight stands as it was, its room's clock, the player's body and every
   *  figure stopped, `clock` held by the caller. */
  frame(
    controls: InputFrame,
    elapsed: number,
    clock: number,
    {
      paused,
      hands,
      aspect,
      held,
      frozen = false,
    }: { paused: boolean; hands: boolean; aspect: number; held: boolean; frozen?: boolean },
  ): FootFrame {
    const { walker, movement, forge, groundAt } = this.context;
    const { fight, foes, effects, feel } = this;
    const seconds = frozen ? 0 : elapsed;
    const still = paused || held || frozen;
    if (!held && !frozen) {
      this.advance(seconds);
      this.takeArms();
    }
    const bodies = [...foes.placed.values()].map((placed) => [placed.x, placed.y, placed.z] as const);
    const aimed = () => playerCamera(walker.player, movement, this.course);
    const camera = () => pushedIn(aimed(), effects.anima.push);
    const shown = this.player.frame(still ? IDLE : { ...controls, locked: true }, this.steps, seconds, clock, {
      running: !held && !frozen,
      hands: hands && !still,
      markOf: () => crosshairPoint(camera(), aspect, this.course, shotBodies(foes.placed, fight.foes), groundAt),
      zoomOf: () => handsZoom(camera(), walker.player.view),
      handsSeconds: feel.shownSeconds(fight.player, seconds),
    });
    effects.ownLook = walker.glowing[0];
    const events = effects.events(fight, seconds, (id, look) => foes.dissolveFoe(id, look, clock));
    this.arrivals.told(events, clock);
    const ownWeapon = effects.flashes.ownOf(fight.own);
    walker.fought(ownWeapon.surge, ownWeapon.contact);
    feel.frame(events, fight.own, fight.player, seconds, new Set());
    const firstPerson = walker.inFirstPerson;
    const sights = shown.aiming || (shown.rangedDrawn && firstPerson);
    const kicked = pushedIn(feel.camera(aimed(), fight.player, fight.own, firstPerson, sights), effects.anima.push);
    const shot = shotOfOrbit(kicked, LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
    // Through the player's own eyes no other figure stands so near that it fills the view.
    const nearest = firstPerson ? CARD_NEAREST_M : 0;
    const frameTicks = seconds / movement.tickSeconds;
    const shift = (id: number, view: FighterView | null): Vector => feel.shift(id, view, shot.yaw);
    const right = [Math.cos(shot.yaw), Math.sin(shot.yaw)] as const;
    const smear = (id: number) => feel.smearOf(id, right);
    const drawnAt = new Map<number, DrawnFigure>();
    const figures: CardAt[] = [];
    const body = shownBody(walker.player);
    const ownShift = shift(fight.player, fight.own);
    const own = walker.figure(eyeX, eyeY, effects.flashes.flashOf(fight.player), ownShift);
    const statuses = fight.own?.statuses;
    const [charged, exposed] = [(statuses?.charge ?? 0) > 0, (statuses?.expose ?? 0) > 0];
    if (own) {
      const arrival = this.arrivals.ownShareOf(fight.player, clock);
      const looks = { veiled: veiledIn(fight, fight.player), charged, exposed, smear: smear(fight.player), arrival };
      figures.push({ ...own, ...looks });
      const feet: Vector = [body.x + ownShift[0], body.y + ownShift[1], body.z + ownShift[2]];
      drawnAt.set(fight.player, { feet, anim: walker.look.anim, flip: own.flip });
    }
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: drawnAt, smear };
    const { tickSeconds } = movement;
    figures.push(
      ...foes.cards(
        fight,
        forge,
        { x: eyeX, y: eyeY, nearest },
        clock,
        frameTicks,
        tickSeconds,
        effects.flashes,
        foeFeel,
      ),
    );
    const lying = this.armsLie ? this.lying.figure(walker.you.dress) : null;
    if (lying) figures.push(lying);
    const muzzle = walker.muzzle;
    const marks = effects.marks(fight, seconds, {
      eye: shot.eye,
      blocks: this.course,
      bodies,
      muzzleOf: () =>
        muzzle ? screenMuzzle(kicked, aspect, muzzle) : figureMuzzle([body.x, body.y, body.z], walker.you.facing),
      origin: shot.eye,
      groundAt,
      drawn: { foes: foes.placed, others: new Map() },
      more: this.lyingMarks(foes.overheads(shot.eye, clock), clock, shot.eye),
    });
    this.sounds.frame({
      seconds,
      quiet: still,
      fight,
      events,
      shots: effects.shotsHeard,
      eye: shot.eye,
      yaw: shot.yaw,
      walker: {
        feet: [body.x, body.y, body.z],
        walked: walker.walked,
        drawn: walker.you.dress.outfit.drawn,
        mounted: walker.player.mounted,
        look: effects.ownLook,
        pulled: shown.pulled,
      },
      others: new Map(),
      foes: foes.placed,
      ground: { blocks: this.course, groundAt },
      landed: [],
      crates: null,
    });
    const handsOf = (dress: Dress | null | undefined) => ({
      right: dress?.outfit.right ?? null,
      left: dress?.outfit.left ?? null,
    });
    const strikers = [
      { id: fight.player, player: true, view: fight.own, ...handsOf(walker.you.dress), looks: walker.glowing },
      ...[...fight.foes.values()].map((kept) => ({ id: kept.id, view: kept.view, ...handsOf(foes.dressOf(kept)) })),
    ];
    const swings = feel.arcsMesh(clock, strikers, drawnAt, shot.eye, firstPerson, shot.eye);
    showAnimaEdge(effects.anima);
    const ownView = fight.own;
    const where = (id: number): readonly [number, number, number] | null => {
      if (id === fight.player && ownView) return [ownView.x, ownView.y, ownView.z];
      const figure = foes.placed.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    const fought: FootFight = {
      own: ownView,
      foes: foes.marked(fight),
      where,
      events,
      blocks: this.course,
      player: fight.player,
      firstPerson,
      pressed: shown.pressed,
      parryOpen: fight.parryOpen,
      abilities: fight.abilities,
      ammo: sights ? (ownView?.ammo ?? null) : null,
      ammoMost: null,
      crosshair: crosshairOf(shown.reticle, sights, ownView, fight.reach),
    };
    // The room raises a fallen player at the last checkpoint by itself: there is no edge to stray past, nothing
    // to press, and the story says what happens.
    const dead = ownView?.action.kind === 'dead';
    // The story has no menu, so its keys leave the menu's out.
    const hints = dead
      ? []
      : footHints(onFoot(walker, shown, fight, !controls.locked && !still)).filter(([key]) => key !== 'menu');
    return {
      shot,
      figures,
      standing: { kind: 'inside' },
      marks,
      swings,
      fight: fought,
      hints,
      dark: this.arrivals.darkOf(fight.player, clock),
    };
  }

  /** Leaves the wreck: the Anima's edge is taken down, as leaving a node does, the wreck's rim taken from the page's
   *  movement, and the room let go of. */
  leave(): void {
    showAnimaEdge(QUIET);
    this.lying.leave();
    this.context.movement.setHeights(null);
    this.room = null;
  }
}

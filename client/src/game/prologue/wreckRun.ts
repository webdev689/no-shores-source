import { QUIET, pushedIn, showAnimaEdge } from '../../combat/animaMoment.ts';
import { AttackFeel, type DrawnFigure } from '../../combat/attackFeel.ts';
import { FightEffects } from '../../combat/fightEffects.ts';
import { Fighting } from '../../combat/fighting.ts';
import { FoeFigures } from '../../combat/foeFigures.ts';
import { PlayerFight } from '../../combat/playerFight.ts';
import { veiledIn } from '../../combat/spellLooks.ts';
import type { Vector } from '../../combat/swingArcs.ts';
import { figureMuzzle, screenMuzzle } from '../../combat/tracers.ts';
import { WorldSounds } from '../../combat/worldSounds.ts';
import { FIELD_OF_VIEW } from '../../editor/orbit.ts';
import type { Gpu } from '../../gpu.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import type { CardAt, Cards } from '../../player/cards.ts';
import { crosshairPoint } from '../../player/crosshair.ts';
import type { Dress } from '../../player/dressing.ts';
import type { InputFrame } from '../../player/input.ts';
import { newPlayer, playerCamera, shownBody } from '../../player/player.ts';
import type { Walker } from '../../player/walker.ts';
import { type CombatRules, startCombatRules } from '../../rules/combatRules.ts';
import type { FighterView } from '../../rules/fighters.ts';
import type { Block, MovementRules } from '../../rules/movementRules.ts';
import { rosterOf } from '../../rules/roster.ts';
import { loadShip } from '../../ships/shipMesh.ts';
import { shotOfOrbit } from '../camera.ts';
import { IDLE, type FootFight, type FootFrame } from '../foot.ts';
import { HINTS, footHints } from '../hints.ts';
import { standingOf } from '../hudLaw.ts';
import type { Drawer } from '../scene.ts';
import { worldOutput } from '../uiSounds.ts';
import { courseOf, layoutAt, type WreckLayout } from './wreckLayout.ts';
import { type Outcome, WreckProgress } from './wreckProgress.ts';
import { WreckScenery } from './wreckScenery.ts';

/** What the wreck needs of the game: the movement rules, the walker, the forge's cards, the room's compiled module,
 *  the ground as the scene draws it, and the GPU to draw the ships and what shows on them. */
export interface WreckContext {
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly gpu: Gpu;
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
 * waves, the sea, the fight's end) is `WreckProgress`'s; this asks the room for it and draws it.
 */
export class WreckRun {
  private readonly context: WreckContext;
  private readonly layout: WreckLayout;
  private readonly room: LocalRoom;
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
  private readonly course: Block[];
  readonly boxes: readonly Block[];
  private readonly foes: FoeFigures;
  private readonly effects = new FightEffects();
  private readonly feel: AttackFeel;
  private readonly sounds = new WorldSounds(worldOutput);
  private readonly scenery: WreckScenery;
  private readonly progress: WreckProgress;
  private readonly level: { value: number };
  /** Thule's number in the room, once he stands. */
  private thule = 0;
  /** The foes stood that no snapshot has shown yet: counted alive, so a wave never outruns the room's word. */
  private readonly unseen = new Set<number>();

  private constructor(
    context: WreckContext,
    layout: WreckLayout,
    parts: { room: LocalRoom; fight: Fighting; combat: CombatRules; module: WebAssembly.Module },
    drawn: { scenery: WreckScenery; level: { value: number }; origin: readonly [number, number] },
  ) {
    this.context = context;
    this.layout = layout;
    [this.room, this.fight, this.combat] = [parts.room, parts.fight, parts.combat];
    this.player = new PlayerFight(parts.fight, parts.combat, context.walker);
    this.steps = parts.fight.steps(context.movement);
    this.course = courseOf(layout);
    this.foes = new FoeFigures(rosterOf(parts.module));
    this.feel = new AttackFeel(parts.combat, context.movement.tickSeconds);
    [this.scenery, this.level] = [drawn.scenery, drawn.level];
    this.progress = new WreckProgress(layout);
    this.boxes = this.course;
    this.node = { spawns: [drawn.origin], centre: drawn.origin };
  }

  /** Opens the wreck at `origin` (x, y) in the world: its room in the page on the layout's blocks, the player waking
   *  where it says, both ships and what shows on them made to draw. */
  static async open(context: WreckContext, local: WreckLayout, origin: readonly [number, number]): Promise<WreckRun> {
    const { movement, walker } = context;
    const [module, hull] = await Promise.all([context.roomModule, loadShip('brig')]);
    const layout = layoutAt(local, origin);
    const course = courseOf(layout);
    const combat = startCombatRules(module);
    // The open sea under the decks: no land's window, only the blocks.
    for (const rules of [movement, combat]) {
      rules.setCourse(course);
      rules.setGround(null);
    }
    const [x, y] = layout.wake.at;
    const { facing } = layout.wake;
    walker.player = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: facing, facing };
    const level = { value: 1 };
    let fight: Fighting | null = null;
    const room = LocalRoom.open(
      module,
      { x, y },
      course,
      (snapshot) => fight?.receive(snapshot),
      (gear) => (level.value = gear.level),
    );
    fight = new Fighting(combat, room);
    const scenery = new WreckScenery(context.gpu, hull, layout, origin);
    return new WreckRun(context, layout, { room, fight, combat, module }, { scenery, level, origin });
  }

  /** The zone the player has reached; -1 before the first. */
  get zone(): number {
    return this.progress.zone;
  }

  /** Whether the player has reached a zone. */
  readonly reached = (zone: number): boolean => this.progress.reached(zone);

  /** Whether the player has entered the arena. */
  get arena(): boolean {
    return this.progress.arena;
  }

  /** How the boss fight ended, or null while it has not. */
  get outcome(): Outcome | null {
    return this.progress.outcome;
  }

  /** The boss fight begins: the way into the arena closes behind the player, every other foe is sent away, and Thule
   *  stands where the layout puts him, facing the player, three levels over them. */
  beginBoss(): void {
    if (this.progress.fighting) return;
    const { gate } = this.layout.arena;
    this.room.standBlock(gate);
    for (const rules of [this.context.movement, this.combat]) rules.setCourse([...this.course, gate]);
    this.course.push(gate);
    this.scenery.gateStands = true;
    this.room.clearFoes();
    this.unseen.clear();
    this.progress.beginBoss();
    const [x, y] = this.layout.arena.thule;
    const { body } = this.context.walker.player;
    const facing = Math.atan2(body.x - x, -(body.y - y));
    this.thule = this.room.standFoe(THULE.type, THULE.rank, x, y, facing, this.level.value + THULE.over);
  }

  /** Thule's health and phase, once he stands. */
  get boss(): { readonly health: number; readonly healthMax: number; readonly phase: number } | null {
    const kept = this.fight.foes.get(this.thule);
    return kept ? { health: kept.view.health, healthMax: kept.view.healthMax, phase: kept.phase } : null;
  }

  /** World points over heads, for barks and emotes: Thule's as 'thule', every other foe's as 'foe-<number>'. */
  heads(): ReadonlyMap<string, readonly [number, number, number]> {
    const heads = new Map<string, readonly [number, number, number]>();
    for (const [id, placed] of this.foes.placed)
      heads.set(id === this.thule ? 'thule' : `foe-${id}`, [placed.x, placed.y, placed.z + OVER_THE_HEAD_M]);
    return heads;
  }

  /** The level's progress this frame: checkpoints kept, waves stood, a fall into the sea brought back. */
  private advance(seconds: number): void {
    const { body } = this.context.walker.player;
    for (const id of this.fight.foes.keys()) this.unseen.delete(id);
    const seen = [...this.fight.foes.values()].filter((kept) => kept.view.health > 0).length;
    const alive = seen + this.unseen.size;
    const dead = this.fight.own?.action.kind === 'dead';
    const asks = this.progress.frame({ x: body.x, y: body.y, z: body.z, dead, alive, thule: this.boss }, seconds);
    if (asks.checkpoint) this.room.setSpawn(...asks.checkpoint);
    if (asks.bringBack) this.room.putPlayer(...asks.bringBack);
    for (const foe of asks.stand)
      this.unseen.add(this.room.standFoe(foe.type, foe.rank, ...foe.at, foe.facing, this.level.value));
    this.unseen.delete(0);
  }

  /** One frame: the player plays and fights (nothing pressed while `paused`, the fight's buttons only while
   *  `hands`), or while `held` everything stands still for a cutscene; the camera follows; every figure and mark is
   *  placed for an eye there. */
  frame(
    controls: InputFrame,
    seconds: number,
    clock: number,
    { paused, hands, aspect, held }: { paused: boolean; hands: boolean; aspect: number; held: boolean },
  ): FootFrame {
    const { walker, movement, forge, groundAt } = this.context;
    const { fight, foes, effects, feel } = this;
    const still = paused || held;
    if (!held) this.advance(seconds);
    const bodies = [...foes.placed.values()].map((placed) => [placed.x, placed.y, placed.z] as const);
    const aimed = () => playerCamera(walker.player, movement, this.course);
    const camera = () => pushedIn(aimed(), effects.anima.push);
    const shown = this.player.frame(still ? IDLE : { ...controls, locked: true }, this.steps, seconds, clock, {
      running: !held,
      hands: hands && !still,
      markOf: () => crosshairPoint(camera(), aspect, this.course, bodies, groundAt),
      zoomOf: () => camera().zoom ?? 1,
      handsSeconds: feel.shownSeconds(fight.player, seconds),
    });
    effects.ownLook = walker.glowing[0];
    const events = effects.events(fight, seconds, (id, look) => foes.dissolveFoe(id, look, clock));
    const ownWeapon = effects.flashes.ownOf(fight.own);
    walker.fought(ownWeapon.surge, ownWeapon.contact);
    feel.frame(events, fight.own, fight.player, seconds, new Set());
    const firstPerson = walker.inFirstPerson;
    const sights = shown.aiming || (shown.rangedDrawn && firstPerson);
    const kicked = pushedIn(feel.camera(aimed(), fight.player, fight.own, firstPerson, sights), effects.anima.push);
    const shot = shotOfOrbit(kicked, LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
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
      figures.push({ ...own, veiled: veiledIn(fight, fight.player), charged, exposed, smear: smear(fight.player) });
      const feet: Vector = [body.x + ownShift[0], body.y + ownShift[1], body.z + ownShift[2]];
      drawnAt.set(fight.player, { feet, anim: walker.look.anim, flip: own.flip });
    }
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: drawnAt, smear };
    const { tickSeconds } = movement;
    figures.push(
      ...foes.cards(fight, forge, { x: eyeX, y: eyeY }, clock, frameTicks, tickSeconds, effects.flashes, foeFeel),
    );
    const muzzle = walker.muzzle;
    const marks = effects.marks(fight, seconds, {
      eye: shot.eye,
      blocks: this.course,
      bodies,
      muzzleOf: (fired) =>
        muzzle
          ? screenMuzzle(kicked, aspect, muzzle)
          : figureMuzzle([body.x, body.y, body.z], Math.atan2(fired.velocity[0], -fired.velocity[1])),
      origin: shot.eye,
      groundAt,
      drawn: { foes: foes.placed, others: new Map() },
      more: foes.overheads(shot.eye, clock),
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
      { id: fight.player, view: fight.own, ...handsOf(walker.you.dress), looks: walker.glowing },
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
      crosshair: sights ? { charge: null } : null,
    };
    const dead = ownView?.action.kind === 'dead';
    const standing = standingOf(dead ? 'dead' : 'inside', 0);
    const hints = dead ? HINTS.dead : footHints(fight.arts?.art ?? 0);
    return { shot, figures, standing, marks, swings, fight: fought, hints };
  }

  /** The drawer of both ships and what shows on them, drawn with the figures. */
  get drawer(): Drawer {
    return this.scenery.drawer;
  }

  /** Leaves the wreck: the Anima's edge is taken down, as leaving a node does. */
  leave(): void {
    showAnimaEdge(QUIET);
  }
}

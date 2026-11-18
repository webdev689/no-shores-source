import { Fighting } from '../combat/fighting.ts';
import { Flashes } from '../combat/flashes.ts';
import { Hud } from '../combat/hud.ts';
import { type TelegraphMark, marksMesh } from '../combat/marks.ts';
import { Sparks } from '../combat/sparks.ts';
import { IMPACT_SPARKS, type ShotStops, Tracers, figureMuzzle, othersArrows } from '../combat/tracers.ts';
import type { FightEvent } from '../network/messages.ts';
import type { RoomLink } from '../network/roomConnection.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { type GroundAt, crosshairPoint, screenMuzzle, shotStop } from '../player/crosshair.ts';
import { FIGHT_TICKS, type FightHands, fightButtons, fightHands } from '../player/fightMoves.ts';
import type { Placed } from '../player/figures.ts';
import { FoeFigures } from '../player/foeFigures.ts';
import type { InputFrame } from '../player/input.ts';
import { playerCamera, shownBody } from '../player/player.ts';
import type { Walker, WalkerFightFrame } from '../player/walker.ts';
import { type CombatRules, startCombatRules } from '../rules/combatRules.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import { type Shot, fromEyeMatrix } from './camera.ts';
import { FightMarks } from './fightMarks.ts';
import type { GameScene } from './scene.ts';

type Point = readonly [number, number, number];

/** The fight's rules, one instance of each compiled room module for the page's life. */
const rulesKept = new WeakMap<WebAssembly.Module, CombatRules>();

/** The fight's rules from the compiled room module: the combat crate's player tick, as the rooms take it. */
export function combatRulesOf(module: WebAssembly.Module): CombatRules {
  const kept = rulesKept.get(module) ?? startCombatRules(module);
  rulesKept.set(module, kept);
  return kept;
}

/** A shot's view through the camera as one matrix for world points: the view from the eye, the eye taken off, in
 *  64-bit floats, since a place far out in the world is not exact enough in 32. */
export function worldMatrix(shot: Shot, aspect: number): Float64Array {
  const matrix = Float64Array.from(fromEyeMatrix(shot, aspect));
  const [eastM, southM, upM] = shot.eye;
  for (let row = 0; row < 4; row++) {
    const moved = (matrix[row] ?? 0) * eastM + (matrix[4 + row] ?? 0) * southM + (matrix[8 + row] ?? 0) * upM;
    matrix[12 + row] = (matrix[12 + row] ?? 0) - moved;
  }
  return matrix;
}

/** What a fight on foot needs of the page: the fight's rules (on the node's ground), the link to the node's room,
 *  the player, the forge's cards, the movement rules, the scene (its GPU and its ground), every other player's
 *  figure, and the element the fight's display is drawn in. */
export interface FootFightContext {
  readonly rules: CombatRules;
  readonly link: RoomLink;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly movement: MovementRules;
  readonly scene: GameScene;
  readonly others: readonly Placed[];
  readonly root: HTMLElement;
}

/**
 * The player's fight in a node's room, as the Test Ground plays it: their fighter predicted by the combat rules and
 * set by the room's word, the fight's buttons pressed from the controls and the arms taken from the hands; each foe
 * drawn in its kind's dress, gliding between snapshots; struck figures flashing, sparks where blows meet a guard, the
 * shots' tracers, the telegraphed blows' marks on the ground, and the fight's display over the view.
 */
export class FootFight {
  readonly fight: Fighting;
  readonly marks: FightMarks;
  private readonly context: FootFightContext;
  private readonly hud: Hud;
  private readonly flashes = new Flashes();
  private readonly sparks = new Sparks();
  private readonly tracers = new Tracers();
  private readonly foes: FoeFigures;
  private readonly ground: GroundAt;
  private hands: FightHands | null = null;
  private armsKey = '';

  constructor(context: FootFightContext) {
    this.context = context;
    this.fight = new Fighting(context.rules, context.link);
    this.marks = new FightMarks(context.scene.gpu);
    this.foes = new FoeFigures(context.forge);
    // Where the land is not known, nothing stops a shot.
    this.ground = (x, y) => context.scene.groundAt(x, y) ?? Number.NEGATIVE_INFINITY;
    context.root.replaceChildren();
    context.root.hidden = false;
    this.hud = new Hud(context.root);
  }

  /** The view's width over its height. */
  private get aspect(): number {
    const { root } = this.context;
    return root.clientWidth / Math.max(1, root.clientHeight);
  }

  /** Every body a shot or the crosshair may meet, by its feet: each foe and each other player as drawn. */
  private bodies(): Point[] {
    const placed = [...this.foes.placed.values(), ...this.context.others];
    return placed.map((figure) => [figure.x, figure.y, figure.z] as const);
  }

  /** Presses the fight's buttons for the ticks the walker is about to step, from `controls` and the hands as they
   *  stand; a ranged weapon aimed lays its shot on the crosshair's point over the node's ground and among `boxes`.
   *  Answers what the walker plays the frame with. */
  press(controls: InputFrame, boxes: readonly Block[]): WalkerFightFrame {
    const { walker, movement } = this.context;
    const { outfit } = walker.you.dress;
    const hands = fightHands(controls, walker.player, outfit.drawn, outfit.right);
    const camera = playerCamera(walker.player, movement, boxes);
    const mark = hands.aiming ? crosshairPoint(camera, this.aspect, boxes, this.bodies(), this.ground) : null;
    this.fight.press(fightButtons(controls, hands, walker.player.pitch, mark));
    this.hands = hands;
    return { fight: this.fight, hands };
  }

  /** After the walker's frame: the arms and the look the room is told next, the fight's events shown, and the marks
   *  and the display laid for `shot`. Answers every foe's card. */
  frame(controls: InputFrame, seconds: number, clock: number, shot: Shot, boxes: readonly Block[]): CardAt[] {
    const { walker, movement, rules } = this.context;
    const { fight, flashes, sparks, tracers } = this;
    const { outfit } = walker.dressShown;
    const handsKey = `${outfit.right}|${outfit.left}|${outfit.drawn}`;
    if (handsKey !== this.armsKey) {
      this.armsKey = handsKey;
      fight.arms = rules.armsCode(outfit.right, outfit.left, outfit.drawn);
    }
    fight.look = walker.look;
    fight.dress = walker.lookDress;
    const events = fight.takeEvents();
    flashes.update(events, seconds);
    sparks.update(seconds);
    sparks.struck(events, (id) => {
      const fighter = id === fight.player ? fight.own : (fight.foes.get(id)?.view ?? fight.others.get(id)?.body);
      return fighter ? [fighter.x, fighter.y, fighter.z] : null;
    });
    const [eyeX, eyeY] = shot.eye;
    const { tickSeconds } = movement;
    const time = { clock, roomTick: fight.roomTick, frameTicks: seconds / tickSeconds, tickSeconds };
    const cards = this.foes.cards(fight.foes.values(), { x: eyeX, y: eyeY }, time, (id) => flashes.shareOf(id));
    const telegraphs = [...fight.foes.values()].flatMap((kept): TelegraphMark[] =>
      kept.view.action.kind === 'telegraph' ? [kept.view.action] : [],
    );
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const camera = playerCamera(walker.player, movement, boxes);
    const muzzle = walker.inFirstPerson ? walker.muzzle : null;
    const body = shownBody(walker.player);
    tracers.fired(fight.fired.splice(0), (fired) =>
      muzzle
        ? screenMuzzle(camera, this.aspect, muzzle)
        : figureMuzzle([body.x, body.y, body.z], Math.atan2(fired.velocity[0], -fired.velocity[1])),
    );
    tracers.seen(fight.takeShots(), fight.player);
    const bodies = this.bodies();
    const stops: ShotStops = (from, along) => shotStop(from, along, boxes, bodies, this.ground);
    for (const impact of tracers.update(seconds, stops)) sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    const traced = tracers.mesh(shot.eye, fight.shots, fight.player);
    const arrows = othersArrows(fight.shots, fight.player);
    this.marks.set(marksMesh(telegraphs, arrows, sparks.flying, traced, shot.eye));
    this.display(controls, seconds, shot, events);
    return cards;
  }

  /** How strongly fighter `id`'s figure flashes, struck. */
  flashOf(id: number): number {
    return this.flashes.shareOf(id);
  }

  /** How strongly the player's own figure flashes, struck. */
  get ownFlash(): { readonly share: number; readonly red: boolean } {
    return { share: this.flashes.shareOf(this.fight.player), red: true };
  }

  /** The fight's display: the player's bars, the locked foe's, each foe's mark and the words over the fight. */
  private display(controls: InputFrame, seconds: number, shot: Shot, events: readonly FightEvent[]): void {
    const { walker, root } = this.context;
    const { fight } = this;
    const own = fight.own;
    const hands = this.hands ?? { armed: false, shooter: false, ranged: false, aiming: false, guards: false };
    const where = (id: number): [number, number, number] | null => {
      if (id === fight.player && own) return [own.x, own.y, own.z];
      const figure = this.foes.placed.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    // A bow's draw charges as it is held.
    const action = own?.action;
    const bow = walker.you.dress.outfit.right?.startsWith('bow') ?? false;
    const charge = bow && action?.kind === 'draw' ? Math.min(1, action.elapsed / FIGHT_TICKS.drawFull) : null;
    const swung = hands.armed && !hands.shooter && controls.pressed('swing');
    this.hud.update(
      {
        own,
        foes: this.foes.marked(fight.foes.values()),
        where,
        matrix: worldMatrix(shot, this.aspect),
        width: root.clientWidth,
        height: root.clientHeight,
        events,
        player: fight.player,
        firstPerson: walker.inFirstPerson,
        pressed: swung || (controls.locked && controls.pressed('dodge')),
        // The game says the room was lost in its own words, and plays on alone.
        lost: null,
        parryOpen: fight.parryOpen,
        crosshair: hands.aiming || (hands.ranged && walker.inFirstPerson) ? { charge } : null,
      },
      seconds,
    );
  }

  /** Leaves the fight: its display is emptied and put away, and its marks let go. */
  leave(): void {
    this.context.root.replaceChildren();
    this.context.root.hidden = true;
    this.marks.release();
  }
}

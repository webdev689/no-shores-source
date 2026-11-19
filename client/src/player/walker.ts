import type { GlowLook } from '../elementGlow.ts';
import type { Contact, FirstPerson } from '../firstperson/firstPerson.ts';
import { ART_LIGHTS } from '../firstperson/fpFrames.ts';
import type { Pace } from '../firstperson/weaponMachine.ts';
import type { Look } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { CardAt, Cards } from './cards.ts';
import type { Dress } from './dressing.ts';
import { FIGHT_TICKS, fightOf } from './fightMoves.ts';
import { cardStand, type Placed, viewOf } from './figures.ts';
import type { InputFrame } from './input.ts';
import { RUNNING } from './others.ts';
import { CAST_SECONDS, type Player, shownBody, updatePlayer } from './player.ts';
import { likelyMoves, Loop, type Shown, shownMove } from './playerMoves.ts';

/** Nearer than this, the third-person camera is inside the figure, so it is not drawn. */
export const HIDE_FIGURE_M = 0.6;
/** Faster than a horse's walk is a gallop. */
export const GALLOP = 10;
/** The weapon's button, untouched: what the first person's weapon gets while it may not swing. */
export const STILL = { attackHeld: false, attackPressed: false, attackReleased: false };
/** The weapons that shoot: their button draws or fires, as the fight's rules take a shot. */
export const SHOOTERS = /^(bow|crossbow|pistolet|thunderlock)(_|$)/;
/** The first person's guard, a weapon's own stroke frame held upright across the middle of the view, and a parry's
 *  deflect, the next stroke's middle frames played through. */
const GUARD_POSE = { record: 3, frame: 2 } as const;
const PARRY_RECORD = 4;
const guardPose = (action: Action) => {
  if (action.kind === 'guard') return GUARD_POSE;
  if (action.kind !== 'parry') return null;
  return { record: PARRY_RECORD, frame: 1 + Math.min(2, Math.floor((action.elapsed / FIGHT_TICKS.parry) * 3)) };
};
/** The fight's own timing of a swing under way, seconds, ticks `tick` seconds long; null for any other action. */
export function paceOf(action: Action, tick: number): Pace | null {
  if (action.kind !== 'attack') return null;
  return { strike: action.strike * tick, end: action.end * tick, at: action.elapsed * tick };
}
/** What the fight holds the player to, when their weapon neither swings nor shoots. */
const HELD = new Set(['flinch', 'staggered', 'down', 'dead', 'dodge', 'guard', 'parry', 'telegraph', 'overreach']);

/** What a fight holds the player to this frame, for the walker to show: their fighter as the page predicts it, whether
 *  the rules began a swing or lowered an aimed weapon unfired since the last frame, whether a ranged weapon aims, and
 *  how far the first person's hands move on this frame (less while a page's attack feel holds a blow landing). */
export interface FightShown {
  readonly own: FighterView | null;
  readonly begun: boolean;
  readonly dropped: boolean;
  readonly aiming: boolean;
  readonly handsSeconds?: number;
}

/** The strokes struck so far after this frame's swing: a swing begins where there was none, or where the last one
 *  ended and the next began within the frame (its progress went back). */
export function strokesAfter(strokes: number, swingWas: number | null, progress: number | null): number {
  return progress !== null && (swingWas === null || progress < swingWas) ? strokes + 1 : strokes;
}

/** Neither hand glows. */
const NO_GLOW = [0, 0] as const;

/** The dress the figure shows: on a wall or a ledge the hands hold on, so the weapon is worn, not held. */
export function shownDress(dress: Dress, holding: boolean): Dress {
  return holding ? dress : { ...dress, outfit: { ...dress.outfit, drawn: false } };
}

/**
 * The player as they play, frame by frame, wherever they stand: the body stepped by the movement rules under DFO's
 * controls, the weapon in first person, and the move the figure shows from outside. The Test Ground and the game
 * each hold one; the page draws the scene and the hands, and may set `player` (a room's correction, a panel's move).
 */
export class Walker {
  player: Player;
  /** The player's figure: where it stands and what it wears. */
  readonly you: Placed;
  /** The element each hand's weapon glows in (the right, then the left), as the page reads it from the gear. */
  glow: readonly [GlowLook, GlowLook] = NO_GLOW;
  /** The element the last cast glows in: its Art's. */
  castGlow: GlowLook = 0;
  /** What the figure showed last frame, and its dress as text, as a room is told with each tick. */
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  lookDress: string;
  private readonly firstPerson: FirstPerson;
  private readonly forge: Cards;
  /** How hard the weapon's glow surges (1 at rest), on the figure and in first person, as the page last said. */
  private surge = 1;
  /** How far the player has walked, for the first person's bob and stride; and the swings struck, each the other
   *  stroke. */
  private stride = 0;
  private strokes = 0;
  private swingWas: number | null = null;
  private dress: Dress;
  private shown: Shown = { anim: 'idle', frame: null, frameSeconds: 0.25 };
  private readonly loop = new Loop();
  /** Whether the weapon was out before this frame's step: the click that readies it does not swing. */
  private drawnBefore = false;
  /** The seconds a tick of the rules lasts, as the last step took them. */
  private tickSeconds = 1 / 60;

  constructor(player: Player, you: Placed, firstPerson: FirstPerson, forge: Cards) {
    this.player = player;
    this.you = you;
    this.firstPerson = firstPerson;
    this.forge = forge;
    this.dress = you.dress;
    this.lookDress = JSON.stringify(you.dress);
  }

  /** Where the first person's weapon fires from on the design screen while the view is the player's own eyes, or
   *  null. */
  get muzzle(): readonly [number, number] | null {
    return this.inFirstPerson ? this.firstPerson.muzzle : null;
  }

  /** The metres walked on the ground so far, which the first person's bob and the footsteps keep time by. */
  get walked(): number {
    return this.stride;
  }

  /** Whether the camera is in the head, so the hands are drawn and the figure is not. */
  get inFirstPerson(): boolean {
    return this.player.view.shown <= HIDE_FIGURE_M;
  }

  /** What glows this frame: each hand's element while its weapon is drawn, else nothing. */
  get glowing(): readonly [GlowLook, GlowLook] {
    return this.dress.outfit.drawn ? this.glow : NO_GLOW;
  }

  /** The dress the figure shows this frame: the weapon worn while the hands hold a wall or a ledge. */
  get shownDress(): Dress {
    return this.dress;
  }

  /** How the player's own weapon fights this frame: its glow surging by `surge`, and what their blow met (`contact`,
   *  null for nothing), which the first person shows. */
  fought(surge: number, contact: Contact | null): void {
    this.surge = surge;
    this.firstPerson.surge = surge;
    if (contact) this.firstPerson.contact(contact);
  }

  /** Plays a cast in `glow`, its Art's element: the figure's cast move, its spark in that colour, and the first
   *  person's casting hands, lit by the Art's light. None on horseback, or while one plays. */
  beginCast(glow: GlowLook): void {
    if (this.player.mounted || this.player.cast !== null) return;
    this.castGlow = glow;
    this.player = { ...this.player, cast: 0 };
  }

  /** One frame of play: the body stepped by `rules` while the pointer is held, the first person's weapon swung, and
   *  the move the figure shows chosen. `clock` is the page's seconds, where the figure's first loop starts. */
  frame(controls: InputFrame, rules: MovementRules, seconds: number, clock: number): void {
    this.step(controls, rules, seconds);
    this.show(controls, seconds, clock);
  }

  /** Steps the body by `rules` while the pointer is held, under DFO's controls: facing the bearing `toward` while a
   *  soft lock holds a foe, and held to an aim's pace while `aiming`. */
  step(
    controls: InputFrame,
    rules: MovementRules,
    seconds: number,
    toward: number | null = null,
    aiming = false,
  ): void {
    const { you, firstPerson } = this;
    const wasDrawn = you.dress.outfit.drawn;
    this.drawnBefore = wasDrawn;
    this.tickSeconds = rules.tickSeconds;
    if (!controls.locked) return;
    const swinging = firstPerson.swing !== null;
    this.player = updatePlayer({ ...this.player, drawn: wasDrawn }, controls, rules, seconds, swinging, toward, aiming);
    if (this.player.drawn !== wasDrawn)
      you.dress = { ...you.dress, outfit: { ...you.dress.outfit, drawn: this.player.drawn } };
  }

  /** Shows the frame stepped: the first person's weapon, and the move the figure shows. In a fight (`fight`), both
   *  follow the fight's rules: a swing as the rules begin one, a shot while they let one go, the guard and the parry
   *  posed, and the figure held to what the fight holds it to, facing where its arms point. The hands zoom with the
   *  view by `zoom`. */
  show(controls: InputFrame, seconds: number, clock: number, fight: FightShown | null = null, zoom = 1): void {
    const { you, forge, firstPerson, player } = this;
    const body = shownBody(player);
    const own = fight?.own ?? null;
    const fighting = own !== null && own.action.kind !== 'idle' && own.action.kind !== 'dead';
    Object.assign(you, { x: body.x, y: body.y, z: body.z, facing: fighting ? own.aim : player.facing });
    const holding = player.mounted || body.mode === 'ground' || body.mode === 'air';
    const dress = shownDress(you.dress, holding);
    const { outfit } = dress;
    const speed = Math.hypot(body.vx, body.vy);
    if (body.moving && body.mode === 'ground') this.stride += speed * seconds;
    // The weapon swings only once it is out, on foot, with the hands free; the click that readies it does not swing.
    const swings = controls.locked && this.drawnBefore && outfit.drawn && holding && !player.mounted;
    const shooter = SHOOTERS.test(outfit.right ?? '');
    // A swing the rules end early (a dodge, a flinch, a guard) ends in the first person too, as does a bow's draw let
    // go too soon to shoot.
    if (fight && ((own && !shooter && own.action.kind !== 'attack') || (shooter && fight.dropped)))
      firstPerson.cancel();
    const free = swings && !(own && HELD.has(own.action.kind));
    firstPerson.glow = outfit.drawn ? this.glow : NO_GLOW;
    firstPerson.update(fight?.handsSeconds ?? seconds, this.button(controls, free, shooter, fight), {
      right: outfit.right,
      left: outfit.left,
      armour: { gauntlets: outfit.armour.gauntlets, boots: outfit.armour.boots },
      drawn: outfit.drawn,
      moving: body.moving,
      running: speed > (player.mounted ? GALLOP : RUNNING),
      stride: this.stride,
      casting: player.cast !== null,
      ...(this.castGlow ? { element: ART_LIGHTS[this.castGlow], castGlow: this.castGlow } : {}),
      climbing: holding ? 0 : 1,
      mounted: player.mounted,
      yaw: player.yaw,
      blocking: own?.action.kind === 'guard' || own?.action.kind === 'parry',
      pose: own ? guardPose(own.action) : null,
      zoom,
      pace: own ? paceOf(own.action, this.tickSeconds) : null,
    });
    const swing = firstPerson.swing;
    this.strokes = strokesAfter(this.strokes, this.swingWas, swing?.progress ?? null);
    this.swingWas = swing?.progress ?? null;
    const held = own ? fightOf(own) : null;
    this.shown = shownMove(
      {
        mode: body.mode,
        moving: body.moving,
        running: speed > RUNNING,
        crouched: body.crouched,
        mounted: player.mounted,
        speed,
        vz: body.vz,
        over: body.over?.progress ?? 0,
        drawn: outfit.drawn,
        right: outfit.right,
        left: outfit.left,
        grip: outfit.grip ?? null,
        blow: swing && {
          direction: swing.direction,
          reload: swing.reload,
          // A pair's blows are its two hands' strokes; one weapon's alternate.
          second: swing.paired ? swing.hand === 'left' : this.strokes % 2 === 0,
          progress: swing.progress,
          lands: swing.lands,
        },
        cast: player.cast === null ? null : player.cast / CAST_SECONDS,
        act: player.act && { anim: player.act.anim, progress: player.act.elapsed / player.act.seconds },
        // A bow's draw plays with the first person's, and a shot's frames over a gun's aim pose.
        fight: held?.kind === 'draw' && (outfit.right?.startsWith('bow') || swing) ? null : held,
      },
      (anim) => forge.frames(dress.body, anim),
      (anim, drawn) => forge.draws(dress.body, anim, drawn),
      (action) => forge.walking(dress, action),
    );
    const hands = outfit.drawn ? [outfit.right, outfit.left] : [null, null];
    forge.warm(
      dress,
      likelyMoves(
        hands[0] ?? null,
        hands[1] ?? null,
        (anim, drawn) => forge.draws(dress.body, anim, drawn),
        outfit.drawn ? (outfit.grip ?? null) : null,
      ),
      outfit.drawn ? this.glow[0] : 0,
    );
    forge.pump();
    const frames = forge.frames(dress.body, this.shown.anim);
    const index = this.loop.frame(this.shown, frames, seconds, clock);
    this.look = { anim: this.shown.anim, frame: index, facing: you.facing };
    this.dress = dress;
    this.lookDress = JSON.stringify(dress);
  }

  /** The first person's weapon button: the swing's own while it may swing; in a fight, a swing as the rules begin one,
   *  or a ranged weapon's trigger and aim (aiming, the rules fire only on a fresh pull, so a trigger held through a
   *  reload fires nothing). */
  private button(controls: InputFrame, swings: boolean, shooter: boolean, fight: FightShown | null) {
    if (!swings) return STILL;
    if (!fight)
      return {
        attackHeld: controls.held('swing'),
        attackPressed: controls.pressed('swing'),
        attackReleased: controls.released('swing'),
      };
    if (!shooter) return { attackHeld: false, attackPressed: fight.begun, attackReleased: false };
    return {
      attackHeld: !fight.aiming && controls.held('guard'),
      attackPressed: controls.pressed('guard'),
      attackReleased: controls.released('guard'),
      aimHeld: fight.aiming,
    };
  }

  /** The player's own figure as an eye at (eyeX, eyeY) sees it, or null in first person or before its first frame is
   *  composed. Its card stands a body's radius toward the eye. */
  figure(
    eyeX: number,
    eyeY: number,
    flash?: CardAt['flash'],
    shift: readonly [number, number, number] = [0, 0, 0],
  ): CardAt | null {
    if (this.inFirstPerson) return null;
    const { you, player } = this;
    const body = shownBody(player);
    const [x, y, z] = [body.x + shift[0], body.y + shift[1], body.z + shift[2]];
    const { view, flip } = viewOf(you.facing, x, y, eyeX, eyeY);
    const glow = this.look.anim === 'cast' ? this.castGlow : this.glowing[0];
    const card = this.forge.card(you.id, this.dress, this.look.anim, view, this.look.frame, flip, glow);
    return card && { card, ...cardStand(x, y, eyeX, eyeY), z, flip, surge: this.surge, ...(flash ? { flash } : {}) };
  }
}

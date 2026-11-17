import type { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Look } from '../network/messages.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { CardAt, Cards } from './cards.ts';
import type { Dress } from './dressing.ts';
import { cardStand, type Placed, viewOf } from './figures.ts';
import type { InputFrame } from './input.ts';
import { RUNNING } from './others.ts';
import { CAST_SECONDS, type Player, shownBody, updatePlayer } from './player.ts';
import { likelyMoves, type Shown, shownMove } from './playerMoves.ts';

/** Nearer than this, the third-person camera is inside the figure, so it is not drawn. */
export const HIDE_FIGURE_M = 0.6;
/** Faster than a horse's walk is a gallop. */
export const GALLOP = 10;
/** The weapon's button, untouched: what the first person's weapon gets while it may not swing. */
export const STILL = { attackHeld: false, attackPressed: false, attackReleased: false };

/** The strokes struck so far after this frame's swing: a swing begins where there was none, or where the last one
 *  ended and the next began within the frame (its progress went back). */
export function strokesAfter(strokes: number, swingWas: number | null, progress: number | null): number {
  return progress !== null && (swingWas === null || progress < swingWas) ? strokes + 1 : strokes;
}

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
  /** What the figure showed last frame, and its dress as text, as a room is told with each tick. */
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  lookDress: string;
  private readonly firstPerson: FirstPerson;
  private readonly forge: Cards;
  /** How far the player has walked, for the first person's bob and stride; and the swings struck, each the other
   *  stroke. */
  private stride = 0;
  private strokes = 0;
  private swingWas: number | null = null;
  private dress: Dress;
  private shown: Shown = { anim: 'idle', frame: null, frameSeconds: 0.25 };

  constructor(player: Player, you: Placed, firstPerson: FirstPerson, forge: Cards) {
    this.player = player;
    this.you = you;
    this.firstPerson = firstPerson;
    this.forge = forge;
    this.dress = you.dress;
    this.lookDress = JSON.stringify(you.dress);
  }

  /** Whether the camera is in the head, so the hands are drawn and the figure is not. */
  get inFirstPerson(): boolean {
    return this.player.view.shown <= HIDE_FIGURE_M;
  }

  /** One frame of play: the body stepped by `rules` while the pointer is held, the first person's weapon swung, and
   *  the move the figure shows chosen. `clock` is the page's seconds, which loops a move's frames. */
  frame(controls: InputFrame, rules: MovementRules, seconds: number, clock: number): void {
    const { you, forge, firstPerson } = this;
    const wasDrawn = you.dress.outfit.drawn;
    if (controls.locked) {
      const swinging = firstPerson.swing !== null;
      this.player = updatePlayer({ ...this.player, drawn: wasDrawn }, controls, rules, seconds, swinging);
      if (this.player.drawn !== wasDrawn)
        you.dress = { ...you.dress, outfit: { ...you.dress.outfit, drawn: this.player.drawn } };
    }
    const { player } = this;
    const body = shownBody(player);
    Object.assign(you, { x: body.x, y: body.y, z: body.z, facing: player.facing });
    const holding = player.mounted || body.mode === 'ground' || body.mode === 'air';
    const dress = shownDress(you.dress, holding);
    const { outfit } = dress;
    const speed = Math.hypot(body.vx, body.vy);
    if (body.moving && body.mode === 'ground') this.stride += speed * seconds;
    // The weapon swings only once it is out, on foot, with the hands free; the click that readies it does not swing.
    const swings = controls.locked && wasDrawn && outfit.drawn && holding && !player.mounted;
    const button = swings
      ? {
          attackHeld: controls.held('swing'),
          attackPressed: controls.pressed('swing'),
          attackReleased: controls.released('swing'),
        }
      : STILL;
    firstPerson.update(seconds, button, {
      right: outfit.right,
      left: outfit.left,
      armour: { gauntlets: outfit.armour.gauntlets, boots: outfit.armour.boots },
      drawn: outfit.drawn,
      moving: body.moving,
      running: speed > (player.mounted ? GALLOP : RUNNING),
      stride: this.stride,
      casting: player.cast !== null,
      climbing: holding ? 0 : 1,
      mounted: player.mounted,
      yaw: player.yaw,
    });
    const swing = firstPerson.swing;
    this.strokes = strokesAfter(this.strokes, this.swingWas, swing?.progress ?? null);
    this.swingWas = swing?.progress ?? null;
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
        blow: swing && {
          direction: swing.direction,
          reload: swing.reload,
          // A pair's blows are its two hands' strokes; one weapon's alternate.
          second: swing.paired ? swing.hand === 'left' : this.strokes % 2 === 0,
          progress: swing.progress,
        },
        cast: player.cast === null ? null : player.cast / CAST_SECONDS,
        act: player.act && { anim: player.act.anim, progress: player.act.elapsed / player.act.seconds },
      },
      (anim) => forge.frames(dress.body, anim),
      (anim, held) => forge.draws(dress.body, anim, held),
    );
    const hands = outfit.drawn ? [outfit.right, outfit.left] : [null, null];
    forge.warm(
      dress,
      likelyMoves(hands[0] ?? null, hands[1] ?? null, (anim, held) => forge.draws(dress.body, anim, held)),
    );
    forge.pump();
    const frames = forge.frames(dress.body, this.shown.anim);
    const index = this.shown.frame ?? Math.floor(clock / Math.max(this.shown.frameSeconds, 0.01)) % frames;
    this.look = { anim: this.shown.anim, frame: index, facing: player.facing };
    this.dress = dress;
    this.lookDress = JSON.stringify(dress);
  }

  /** The player's own figure as an eye at (eyeX, eyeY) sees it, or null in first person or before its first frame is
   *  composed. Its card stands a body's radius toward the eye. */
  figure(eyeX: number, eyeY: number): CardAt | null {
    if (this.inFirstPerson) return null;
    const { you, player } = this;
    const body = shownBody(player);
    const { view, flip } = viewOf(player.facing, body.x, body.y, eyeX, eyeY);
    const card = this.forge.card(you.id, this.dress, this.look.anim, view, this.look.frame, flip);
    return card && { card, ...cardStand(body.x, body.y, eyeX, eyeY), z: body.z, flip };
  }
}

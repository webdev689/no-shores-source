import type { GlowLook } from '../elementGlow.ts';
import type { Contact, FirstPerson, FirstPersonState } from '../firstperson/firstPerson.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import { widened } from './playerCamera.ts';
import type { Climb } from '../firstperson/climbHands.ts';
import { ART_LIGHTS } from '../firstperson/fpFrames.ts';
import type { Pace } from '../firstperson/weaponMachine.ts';
import type { Look } from '../network/messages.ts';
import { type Action, type FighterView } from '../rules/fighters.ts';
import type { Body, MovementRules } from '../rules/movementRules.ts';
import type { CardAt, Cards } from './cards.ts';
import type { Dress } from './dressing.ts';
import type { GearState } from '../network/gearMessages.ts';
import { MOUNT_SLOT, worn } from './gear.ts';
import type { Outfit } from '../forge/outfit.ts';
import { FIGHT_TICKS, dodgeFacing, fightOf } from './fightMoves.ts';
import { cardStand, type Placed, viewOf } from './figures.ts';
import type { Action as Control, InputFrame } from './input.ts';
import { RUNNING } from './others.ts';
import { CAST_SECONDS, type Player, shownBody, updatePlayer } from './player.ts';
import { drinkMoves, likelyMoves, Loop, type Shown, shownMove, steadyMoves } from './playerMoves.ts';

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
 *  the rules began a swing, lowered an aimed weapon unfired or let a shot go since the last frame, whether a ranged
 *  weapon aims, and how far the first person's hands move on this frame (less while a page's attack feel holds a blow
 *  landing). */
export interface FightShown {
  readonly own: FighterView | null;
  readonly begun: boolean;
  readonly dropped: boolean;
  readonly loosed: boolean;
  readonly aiming: boolean;
  readonly handsSeconds?: number;
  /** Whether the rules hold the arms `outfit` holds, as they do once they take them up at rest. */
  readonly holds?: (outfit: Outfit) => boolean;
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

/** The same dress with its weapon the other way, drawn or put away, so the figure is warmed both ways; null with
 *  nothing in either hand, which draws the same either way. */
export function otherHand(dress: Dress): Dress | null {
  const { outfit } = dress;
  return outfit.right === null && outfit.left === null
    ? null
    : { ...dress, outfit: { ...outfit, drawn: !outfit.drawn } };
}

/** Whether the figure and the hands hold the weapon out in a fight this frame. While the rules are busy they keep the
 *  weapon the frame before held (`kept`): they take up another only at rest. The drink's flask takes the hands, so it is
 *  put away while a drink lasts; and the frame after one (`drank`) it comes from the player's own dress (`worn`), as
 *  the frame before had it put away only for the drink. */
export function drawnInFight(hands: {
  readonly holding: boolean;
  readonly kept: boolean;
  readonly worn: boolean;
  readonly drinking: boolean;
  readonly drank: boolean;
}): boolean {
  return hands.holding && !hands.drinking && (hands.drank ? hands.worn : hands.kept);
}

/** The faction, by its key, whose own colour each part of the first person wears: the gauntlets, the boots and each
 *  hand's weapon, as the outfit names it for the layer it is drawn with (gearLooks.ts). */
export function ownColours(outfit: Outfit): NonNullable<FirstPersonState['own']> {
  const named = (layer: string | null | undefined) => (layer ? outfit.dyes[layer] : undefined);
  const { gauntlets, boots } = outfit.armour;
  const own = {
    hands: named(gauntlets && `gauntlets_${gauntlets}`),
    feet: named(boots && `boots_${boots}`),
    right: named(outfit.right),
    left: named(outfit.left),
  };
  return Object.fromEntries(Object.entries(own).filter(([, key]) => key !== undefined));
}

/** The climb a body is on, as the first person's hands follow it; null off a wall. */
export function climbOf(body: Body): Climb | null {
  if (body.mode !== 'hang' && body.mode !== 'climb' && body.mode !== 'mantle' && body.mode !== 'vault') return null;
  const { over } = body;
  return {
    mode: body.mode,
    feet: [body.x, body.y, body.z],
    wall: body.facing,
    over: over?.progress ?? 0,
    rise: over ? over.to[2] - over.from[2] : 0,
  };
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
  /** What the other loadout dresses the hands in, as the page reads it from the gear: composed ahead of a swap. */
  spare: Outfit | null = null;
  /** The element the other loadout's weapon glows in, as its figure is composed ahead of a swap. */
  spareGlow: GlowLook = 0;
  /** The element the last cast glows in: its Art's. */
  castGlow: GlowLook = 0;
  /** Whether a horse is worn in the Mount slot, as the page reads it from the gear the room sends (`ridesIn`). */
  rides = false;
  /** Set when the mount key was pressed with no horse to ride, until the page has said so. */
  noHorse = false;
  /** What the figure showed last frame, and its dress as text, as a room is told with each tick. */
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  /** A fall the player died of, as the figure shows it: tumbling down or lying where it landed, facing `facing`; null
   *  for none. */
  fall: { readonly tumbling: boolean; readonly facing: number } | null = null;
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
  /** The dress worn as the page last dressed the player, and the glow the figure shows: the weapon the rules hold. */
  private worn: Dress;
  private shownGlow: readonly [GlowLook, GlowLook] = NO_GLOW;
  private shown: Shown = { anim: 'idle', frame: null, frameSeconds: 0.25 };
  private readonly loop = new Loop();
  /** Whether the weapon was out before this frame's step: the click that readies it does not swing. */
  /** Whether the fight held the player to a drink last frame, which put the shown weapon away. */
  private drank = false;
  /** The seconds a tick of the rules lasts, as the last step took them. */
  private tickSeconds = 1 / 60;
  /** The stroke (1 to 6) of the fight's swing under way, which the first person draws its swing with; out of a fight's
   *  swing, none, and the hands choose their own. */
  private fightStroke: number | null = null;

  constructor(player: Player, you: Placed, firstPerson: FirstPerson, forge: Cards) {
    this.player = player;
    this.you = you;
    this.firstPerson = firstPerson;
    const own = firstPerson.strokes;
    // The first person's share of DFO's six ways naming the stroke: the six are the combat crate's strokes in order.
    firstPerson.strokes = () => (this.fightStroke === null ? own() : (this.fightStroke - 0.5) / 6);
    this.forge = forge;
    this.dress = you.dress;
    this.worn = you.dress;
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

  /** Whether the camera is in the head, so the hands are drawn and the figure is not: never while a fall is watched
   *  from where the camera was held, the body seen dropping away from it. */
  get inFirstPerson(): boolean {
    return this.player.view.shown <= HIDE_FIGURE_M && this.fall === null;
  }

  /** What glows this frame: each hand's element while its weapon is drawn, else nothing. */
  get glowing(): readonly [GlowLook, GlowLook] {
    return this.dress.outfit.drawn ? this.shownGlow : NO_GLOW;
  }

  /** The dress the figure shows this frame: the weapon worn while the hands hold a wall or a ledge. */
  get shownDress(): Dress {
    return this.dress;
  }

  /** The dress the player wears as last shown, held weapon or not: the arms the fight is asked to take up. */
  get wornDress(): Dress {
    return this.worn;
  }

  /** How the player's own weapon fights this frame: its glow surging by `surge`, and what their blow met (`contact`,
   *  null for nothing), which the first person shows. */
  fought(surge: number, contact: Contact | null): void {
    this.surge = surge;
    this.firstPerson.surge = surge;
    if (contact) this.firstPerson.contact(contact);
  }

  /** Reads from the gear whether a horse is worn in the Mount slot; one taken off under its rider sets them on foot,
   *  as the room has them. */
  ridesIn(gear: GearState): void {
    this.rides = worn(gear, MOUNT_SLOT) !== undefined;
    if (!this.rides && this.player.mounted) this.player = { ...this.player, mounted: false };
  }

  /** Whether the mount key was pressed with no horse since last asked; asking clears it, so it is said once. */
  takeNoHorse(): boolean {
    const refused = this.noHorse;
    this.noHorse = false;
    return refused;
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
    this.tickSeconds = rules.tickSeconds;
    if (!controls.locked) return;
    const swinging = firstPerson.swing !== null;
    const mount = mountAsked(controls, this.player.mounted, this.rides);
    if (mount.refused) this.noHorse = true;
    const asked = mount.controls;
    this.player = updatePlayer({ ...this.player, drawn: wasDrawn }, asked, rules, seconds, swinging, toward, aiming);
    if (this.player.drawn !== wasDrawn)
      you.dress = { ...you.dress, outfit: { ...you.dress.outfit, drawn: this.player.drawn } };
  }

  /** Shows the frame stepped: the first person's weapon, and the move the figure shows. In a fight (`fight`), both
   *  follow the fight's rules: a swing as the rules begin one, a shot while they let one go, the guard and the parry
   *  posed, and the figure held to what the fight holds it to, facing where its arms point, or a dodge the way it
   *  goes. The hands zoom with the view by `zoom`. */
  show(controls: InputFrame, seconds: number, clock: number, fight: FightShown | null = null, zoom = 1): void {
    const { you, forge, firstPerson, player } = this;
    const body = shownBody(player);
    const own = fight?.own ?? null;
    const fighting = own !== null && own.action.kind !== 'idle' && own.action.kind !== 'dead';
    // The aim held faces the look even in the rules' idle ticks (a swap, a reload's end), as it does drawn.
    const facing =
      this.fall?.facing ?? (fighting || (own && fight?.aiming) ? (dodgeFacing(own.action) ?? own.aim) : player.facing);
    Object.assign(you, { x: body.x, y: body.y, z: body.z, facing });
    const holding = player.mounted || body.mode === 'ground' || body.mode === 'air';
    const worn = shownDress(you.dress, holding);
    // The weapon the frame before held, unless the rules already hold the one worn: drawn by a swing's own click.
    const kept = fighting && fight?.holds?.(worn.outfit) ? worn.outfit : this.dress.outfit;
    const drinking = own?.action.kind === 'drink';
    const drawn = drawnInFight({ holding, kept: kept.drawn, worn: worn.outfit.drawn, drinking, drank: this.drank });
    this.drank = drinking;
    const dress = fighting
      ? { ...worn, outfit: { ...worn.outfit, right: kept.right, left: kept.left, grip: kept.grip, drawn } }
      : worn;
    if (!fighting) this.shownGlow = this.glow;
    const { outfit } = dress;
    const speed = Math.hypot(body.vx, body.vy);
    if (body.moving && body.mode === 'ground') this.stride += speed * seconds;
    // The weapon swings only while it is out, on foot, with the hands free; the click that draws it swings too.
    const swings = controls.locked && outfit.drawn && holding && !player.mounted;
    const shooter = SHOOTERS.test(outfit.right ?? '');
    // A swing the rules end early (a dodge, a flinch, a guard) ends in the first person too, as does a bow's draw let
    // go too soon to shoot.
    if (fight && ((own && !shooter && own.action.kind !== 'attack') || (shooter && fight.dropped)))
      firstPerson.cancel();
    // A ranged weapon is loaded whenever the rules are not reloading it, which a quicker reload or a kill makes sooner
    // than the hands' own clock: the next shot they let go plays.
    if (fight && own && shooter && own.action.kind !== 'reload') firstPerson.loaded();
    const free = swings && !(own && HELD.has(own.action.kind));
    this.fightStroke = own?.action.kind === 'attack' ? own.action.stroke : null;
    firstPerson.glow = outfit.drawn ? this.shownGlow : NO_GLOW;
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
      climb: climbOf(body),
      mounted: player.mounted,
      horse: { coat: outfit.coat ?? null, barding: outfit.barding ?? null },
      dye: outfit.dye ?? null,
      own: ownColours(outfit),
      body: dress.body,
      yaw: player.yaw,
      pitch: player.pitch,
      // The lens as first person sees it, widened, so the fists on a wall stand where it shows them.
      fov: 2 * Math.atan(Math.tan(FIELD_OF_VIEW / 2) / widened(player.view.shown)),
      blocking: own?.action.kind === 'guard' || own?.action.kind === 'parry',
      pose: own ? guardPose(own.action) : null,
      zoom,
      pace: own ? paceOf(own.action, this.tickSeconds) : null,
      drinking: own?.action.kind === 'drink' ? own.action.elapsed / FIGHT_TICKS.drink : null,
      spare: this.spare && {
        right: this.spare.right,
        left: this.spare.left,
        // The other loadout's factions' colours, where its weapons wear any, so they are composed ahead in them.
        ...(this.spare.dyes[this.spare.right ?? ''] || this.spare.dyes[this.spare.left ?? '']
          ? { own: ownColours(this.spare) }
          : {}),
      },
    });
    const swing = firstPerson.swing;
    this.strokes = strokesAfter(this.strokes, this.swingWas, swing?.progress ?? null);
    this.swingWas = swing?.progress ?? null;
    const fought = own ? fightOf(own) : null;
    // A look the quaff drops a layer of drinks standing or walking as it is, rather than lose a piece.
    const held = fought?.kind === 'drink' && !forge.drawsWhole(dress, 'quaff') ? null : fought;
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
        fight: this.fall
          ? { kind: this.fall.tumbling ? 'tumble' : 'down', progress: 1 }
          : held?.kind === 'draw' && (outfit.right?.startsWith('bow') || swing)
            ? null
            : held,
      },
      (anim) => forge.frames(dress.body, anim),
      (anim, drawn) => forge.draws(dress.body, anim, drawn),
      (action) => forge.walking(dress, action),
    );
    const warm = (shown: Dress, glow: GlowLook, owner: number | string, steady = false) => {
      const { drawn, right, left, grip } = shown.outfit;
      const draws = (anim: string, held: string | null) => forge.draws(shown.body, anim, held);
      const walking = (action: string) => forge.walking(shown, action);
      const [inRight, inLeft] = [drawn ? right : null, drawn ? left : null];
      const likely = () =>
        steady
          ? steadyMoves(inRight, inLeft, draws, walking)
          : [
              ...likelyMoves(inRight, inLeft, draws, drawn ? (grip ?? null) : null, walking),
              ...drinkMoves(inRight, inLeft, draws, walking),
            ];
      forge.warm(shown, likely, glow, owner);
    };
    warm(dress, outfit.drawn ? this.shownGlow[0] : 0, you.id);
    // The weapon the other way too, standing and on the move, so drawing it or putting it away shows at once; only
    // those, as a whole second dress warmed would crowd the kept cards.
    const other = otherHand(dress);
    if (other) warm(other, other.outfit.drawn ? this.shownGlow[0] : 0, `${you.id} other hand`, true);
    // The other loadout's too, so a swap shows it at once.
    if (this.spare) warm({ ...dress, outfit: { ...this.spare, drawn: true } }, this.spareGlow, `${you.id} spare`);
    forge.pump();
    const frames = forge.frames(dress.body, this.shown.anim);
    const index = this.loop.frame(this.shown, frames, seconds, clock);
    this.look = { anim: this.shown.anim, frame: index, facing: you.facing };
    this.dress = dress;
    this.worn = worn;
    // Sent with the element the weapon glows in, so other players' pages draw it glowing too.
    this.lookDress = JSON.stringify(this.shownGlow.some(Boolean) ? { ...dress, glow: this.shownGlow } : dress);
  }

  /** The first person's weapon button: the swing's own while it may swing; in a fight, a swing as the rules begin one,
   *  or a ranged weapon's aim and a shot as the rules let one go, so a pull they refuse (no ammunition, a reload, a
   *  swap) plays nothing. */
  private button(controls: InputFrame, swings: boolean, shooter: boolean, fight: FightShown | null) {
    if (!swings) return STILL;
    if (!fight)
      return {
        attackHeld: controls.held('swing'),
        attackPressed: controls.pressed('swing'),
        attackReleased: controls.released('swing'),
      };
    if (!shooter) return { attackHeld: false, attackPressed: fight.begun, attackReleased: false };
    return { attackHeld: false, attackPressed: fight.loosed, attackReleased: false, aimHeld: fight.aiming };
  }

  /** The player's own figure as an eye at (eyeX, eyeY) sees it, or null before its first frame is composed, and in
   *  first person unless `watched` (a cutscene's camera sees them whatever their own view). Its card stands a body's
   *  radius toward the eye. */
  figure(
    eyeX: number,
    eyeY: number,
    flash?: CardAt['flash'],
    shift: readonly [number, number, number] = [0, 0, 0],
    watched = false,
  ): CardAt | null {
    if (this.inFirstPerson && !watched) return null;
    const { you, player } = this;
    const body = shownBody(player);
    const [x, y, z] = [body.x + shift[0], body.y + shift[1], body.z + shift[2]];
    const { view, flip } = viewOf(you.facing, x, y, eyeX, eyeY);
    const glow = this.look.anim === 'cast' ? this.castGlow : this.glowing[0];
    const card = this.forge.card(you.id, this.dress, this.look.anim, view, this.look.frame, flip, glow);
    return card && { card, ...cardStand(x, y, eyeX, eyeY), z, flip, surge: this.surge, ...(flash ? { flash } : {}) };
  }
}

/** The controls with the mount key's press dropped while there is no horse to ride (`rides`), as the room drops it
 *  (`may_ride`); `refused` says a press was dropped, which the page tells. Getting down is never refused. */
export function mountAsked<Controls extends { pressed(action: Control): boolean }>(
  controls: Controls,
  mounted: boolean,
  rides: boolean,
): { readonly controls: Controls; readonly refused: boolean } {
  if (mounted || rides || !controls.pressed('mount')) return { controls, refused: false };
  return {
    controls: { ...controls, pressed: (action: Control) => action !== 'mount' && controls.pressed(action) },
    refused: true,
  };
}

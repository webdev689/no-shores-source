import { type Wielded, forgeName, wieldedOf } from './fpFrames.ts';
import type { ShooterKind } from './shotMachine.ts';
import { type Direction, RECORD_OF, takesBothHands } from './weaponMachine.ts';

/** A hand, by the side of the body it is on. */
export type Hand = 'right' | 'left';
export const otherHand = (hand: Hand): Hand => (hand === 'left' ? 'right' : 'left');

/** A gun or a crossbow in the hand: its kind, its metal (`Iron`; null for a gun) and whether it is gilded. */
export interface Shooter {
  readonly kind: ShooterKind;
  readonly metal: string | null;
  readonly gilded: boolean;
}

/** What a hand holds in first person: a weapon that swings (bare hands and a bow among them), one that fires, a
 *  shield of a kind (`archive`, the forge's) in a metal (null for the plain wooden one), or a light. */
export type Holding =
  | { readonly kind: 'weapon'; readonly wielded: Wielded }
  | { readonly kind: 'shooter'; readonly shooter: Shooter }
  | { readonly kind: 'shield'; readonly archive: number; readonly metal: string | null }
  | { readonly kind: 'light'; readonly light: 'torch' | 'lantern' };

/** The forge's archive for each kind of shield. */
const SHIELD_ARCHIVE: Readonly<Record<string, number>> = {
  buckler: 112360,
  round: 112361,
  kite: 112362,
  tower: 112363,
};
const SHOOTERS: ReadonlySet<string> = new Set(['thunderlock', 'pistolet', 'crossbow']);

/** What a forge layer (`pistolet_gilded_l`, `crossbow_iron`, `shield_kite_plain`, `torch_l`, `lantern`, `sword_iron`)
 *  is in the hand, or null for a layer the first person does not draw. */
export function holdingOf(layer: string): Holding | null {
  const [head = '', ...rest] = layer.replace(/_l$/, '').split('_');
  if (SHOOTERS.has(head)) {
    const metal = rest.find((part) => part !== 'gilded');
    const shooter = {
      kind: head as ShooterKind,
      metal: metal ? forgeName(metal) : null,
      gilded: rest.includes('gilded'),
    };
    return { kind: 'shooter', shooter };
  }
  if (head === 'shield') {
    const archive = SHIELD_ARCHIVE[rest[0] ?? ''];
    const metal = rest[1] && rest[1] !== 'plain' ? forgeName(rest[1]) : null;
    return archive === undefined ? null : { kind: 'shield', archive, metal };
  }
  if (head === 'torch' || head === 'lantern') return { kind: 'light', light: head };
  const wielded = wieldedOf(layer);
  return wielded && wielded.kind !== 'fists' ? { kind: 'weapon', wielded } : null;
}

export const BARE_HANDS: Holding = { kind: 'weapon', wielded: { kind: 'fists', metal: null, make: null, bow: null } };

const fights = (holding: Holding | null) => holding?.kind === 'weapon' || holding?.kind === 'shooter';
const oneHanded = (holding: Holding) =>
  holding.kind === 'weapon'
    ? !takesBothHands(holding.wielded.kind)
    : holding.kind !== 'shooter' || holding.shooter.kind !== 'thunderlock';
const shooterKind = (holding: Holding) => (holding.kind === 'shooter' ? holding.shooter.kind : null);

/** How the hands are held: what each fighting hand holds (the left drawn mirrored), whether the two take turns at
 *  blows (`pair`) or fire as they are loaded (`volley`), and what the other hand holds that does not fight. */
export interface HandsPlan {
  readonly right: Holding | null;
  readonly left: Holding | null;
  readonly pair: boolean;
  readonly volley: boolean;
  readonly held: Holding | null;
}

/**
 * The hands as DFO holds them: two one-handed weapons are a pair, and two guns or crossbows of one kind a volley; a
 * gun and a crossbow, or anything beside a two-handed weapon, leave the right hand alone at it. Empty hands are both
 * fists up. A weapon in the left hand alone is drawn there; a shield or a light beside a one-handed weapon or a fist is
 * held in the left.
 */
export function handsPlan(rightLayer: string | null, leftLayer: string | null): HandsPlan {
  const rightHolding = rightLayer ? holdingOf(rightLayer) : null;
  const leftHolding = leftLayer ? holdingOf(leftLayer) : null;
  const right = fights(rightHolding) ? rightHolding : null;
  const left = fights(leftHolding) ? leftHolding : null;
  const held = fights(leftHolding) ? null : leftHolding;
  if (right && !oneHanded(right)) return { right, left: null, pair: false, volley: false, held: null };
  if (right && left) {
    const [rightShoots, leftShoots] = [shooterKind(right), shooterKind(left)];
    if (!oneHanded(left) || (rightShoots && leftShoots && rightShoots !== leftShoots))
      return { right, left: null, pair: false, volley: false, held: null };
    return { right, left, pair: true, volley: !!rightShoots && rightShoots === leftShoots, held: null };
  }
  if (left) return { right: null, left, pair: false, volley: false, held: null };
  if (right) return { right, left: null, pair: false, volley: false, held };
  if (held) return { right: BARE_HANDS, left: null, pair: false, volley: false, held };
  return { right: BARE_HANDS, left: BARE_HANDS, pair: true, volley: false, held: null };
}

/** A strike begun within this many seconds of the last one ending is the next blow of the same exchange: the other
 *  hand throws it, already raised. */
export const FLURRY_WINDOW = 0.75;
/** A flurry's blow starts this many frames into its swing. */
export const FLURRY_FROM_FRAME = 1;

/** The hand that throws the next blow of a pair: the lead opens, and a blow begun while the last is under way or
 *  within the flurry's window of its end is the other hand's. */
export function strikeHandOf(
  last: Hand | null,
  sinceLast: number,
  lead: Hand = 'right',
): { hand: Hand; flurry: boolean } {
  const flurry = last !== null && sinceLast <= FLURRY_WINDOW;
  return { hand: flurry ? otherHand(last) : lead, flurry };
}

/** A left hand is a right hand in the mirror: its sweep to the right is the right hand's sweep to the left, mirrored.
 *  The straight strikes are their own mirror. */
const MIRROR_STRIKE: Readonly<Partial<Record<Direction, Direction>>> = {
  left: 'right',
  right: 'left',
  downLeft: 'downRight',
  downRight: 'downLeft',
};
export const mirrorStrike = (direction: Direction): Direction => MIRROR_STRIKE[direction] ?? direction;

/** Which arm Daggerfall painted in each record of the bare hands' art, the right coming in from the right of the view:
 *  its rest and three strikes paint the right arm, its other three the left. Every weapon paints the right arm. */
const BARE_PAINTED: readonly Hand[] = ['right', 'left', 'right', 'left', 'right', 'right', 'left'];

/** The record a hand of a pair draws a strike from (or its rest, `direction` null), and whether mirrored: the arm on
 *  the screen is the hand that throws the blow, on its own side, going the way across the screen the strike asked. */
export function strikePicture(
  hand: Hand,
  direction: Direction | null,
  bare: boolean,
): { record: number; mirror: boolean } {
  const recordOf = (way: Direction | null) => (way === null ? 0 : RECORD_OF[way]);
  const painted = (way: Direction | null) => (bare ? (BARE_PAINTED[recordOf(way)] ?? 'right') : 'right');
  if (painted(direction) === hand) return { record: recordOf(direction), mirror: false };
  const mirrored = direction === null ? null : mirrorStrike(direction);
  return { record: recordOf(mirrored), mirror: painted(mirrored) !== hand };
}

/** The guard: while one hand strikes the other draws in, eased in fast and back out slower. A resting weapon lowers by
 *  a share of its own height, straight down, so the side it is cut on stays off the screen; a fist tucks in toward the
 *  middle and down, and at rest bounces gently, only ever down, the two fists out of step. */
export const GUARD = { in: 10, down: 9, lower: 0.12, inTau: 0.05, outTau: 0.14, bounce: 1.6, bounceHz: 1.15 } as const;

/** The guard's weight after `seconds`, toward 1 while the other hand strikes. */
export function guardStep(weight: number, otherStriking: boolean, seconds: number): number {
  const tau = otherStriking ? GUARD.inTau : GUARD.outTau;
  return weight + ((otherStriking ? 1 : 0) - weight) * (1 - Math.exp(-Math.max(0, seconds) / tau));
}

/** A fist's guard in design pixels at weight `weight`: in toward the middle and down, and its bounce at `time`. */
export function fistGuard(weight: number, hand: Hand, time: number, bouncing: boolean): { dx: number; dy: number } {
  const phase = hand === 'left' ? Math.PI : 0;
  const bounce = bouncing ? (1 - Math.cos(time * 2 * Math.PI * GUARD.bounceHz + phase)) * GUARD.bounce : 0;
  return { dx: GUARD.in * weight, dy: GUARD.down * weight + bounce };
}

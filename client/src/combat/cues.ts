import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';

/** The room's events by their numbers (crates/room/src/judging.rs EventKind), and how a blow was struck (How). */
export const EVENT = {
  hit: 1,
  blocked: 2,
  parried: 3,
  guardBroken: 4,
  dodged: 5,
  perfect: 6,
  staggered: 7,
  killed: 8,
  feinted: 10,
} as const;
export const HOW = { riposte: 2, counter: 3, shot: 6 } as const;

/** A word's tone: a great or a good turn for the player, the player's own damage, a bad turn for them, a warning, or
 *  one of no side of theirs. */
export type Tone = 'great' | 'good' | 'dealt' | 'taken' | 'warn' | 'plain';

/** What each event says, and whether it goes the striker's way (else the defender's) and how loudly when it is the
 *  player's: a great turn or a good one. */
const SAYS: Readonly<
  Record<number, { readonly text: string; readonly striker: boolean; readonly great: boolean } | undefined>
> = {
  [EVENT.blocked]: { text: 'Blocked', striker: false, great: false },
  [EVENT.parried]: { text: 'Parry!', striker: false, great: true },
  [EVENT.guardBroken]: { text: 'Guard broken', striker: true, great: true },
  [EVENT.dodged]: { text: 'Dodged', striker: false, great: false },
  [EVENT.perfect]: { text: 'Perfect dodge!', striker: false, great: true },
  [EVENT.staggered]: { text: 'Staggered', striker: true, great: true },
  [EVENT.killed]: { text: 'Slain', striker: true, great: true },
};

/** A word for what an event came to and its tone, by whether it is good or bad for the player: null for one nothing is
 *  said of. Another's fight is plain. */
export function wordOf(event: FightEvent, player: number): { readonly text: string; readonly tone: Tone } | null {
  const side = event.striker === player ? 'striker' : event.defender === player ? 'defender' : null;
  const toneOf = (strikerWins: boolean, good: Tone): Tone => {
    if (side === null) return 'plain';
    return strikerWins === (side === 'striker') ? good : 'taken';
  };
  if (event.kind === EVENT.feinted) return { text: 'Feint', tone: 'plain' };
  if (event.kind === EVENT.hit) {
    const amount = Math.max(1, Math.round(event.amount));
    const special = event.how === HOW.riposte ? 'Riposte' : event.how === HOW.counter ? 'Counter' : null;
    const text = special ? `${special} ${amount}` : String(amount);
    return { text, tone: toneOf(true, special ? 'great' : 'dealt') };
  }
  const says = SAYS[event.kind];
  if (!says) return null;
  // The player's own blow parried is told as theirs.
  const text = event.kind === EVENT.parried && side === 'striker' ? 'Parried' : says.text;
  return { text, tone: toneOf(says.striker, says.great ? 'great' : 'good') };
}

/** Whether a fighter is at a blow or a shot meant for the player: a swing, a telegraphed blow or a draw, with the
 *  player its target. */
export function threatens(view: FighterView, player: number): boolean {
  const kind = view.action.kind;
  return view.target === player && (kind === 'attack' || kind === 'telegraph' || kind === 'draw');
}

/** A press of the guard parries a blow landing within this many ticks of it (crates/combat/src/tuning.rs). */
const PARRY_WINDOW = 12;

/** The parry ring over a foe at a blow the player can parry: the share of its wind-up still to come (1 as it begins,
 *  0 as it lands) and whether a press now would parry it, which it never does while `open` is false (the player's
 *  guard could open no window). An iron blow must be dodged, so it shows no ring to time; a shot is never parried.
 *  Null for none. */
export function parryCue(
  view: FighterView,
  player: number,
  open = true,
): { share: number; now: boolean } | 'iron' | null {
  const { action } = view;
  if (view.target !== player) return null;
  if (action.kind === 'telegraph' && action.iron) return 'iron';
  const [left, lead] =
    action.kind === 'attack'
      ? [action.strike - action.elapsed, action.strike]
      : action.kind === 'telegraph' && action.shape !== 'aimed'
        ? [action.windup - action.elapsed, action.windup]
        : [0, 0];
  if (left <= 0 || lead <= 0) return null;
  return { share: left / lead, now: open && left < PARRY_WINDOW };
}

/** Where on the screen's edge an arrow points to a point off the screen, and its angle (0 to the right, a quarter turn
 *  down), from the point's clip coordinates (x, y up, w); null for a point on the screen. A point behind the camera
 *  points the way it lies to either side, or down when it is straight behind. `inset` keeps the arrow off the edge. */
export function edgeArrow(
  clip: readonly [number, number, number],
  width: number,
  height: number,
  inset: number,
): { readonly x: number; readonly y: number; readonly angle: number } | null {
  const [clipX, clipY, clipW] = clip;
  if (clipW > 1e-6 && Math.abs(clipX) <= clipW && Math.abs(clipY) <= clipW) return null;
  let [across, down] = [clipX, -clipY];
  if (Math.hypot(across, down) < 1e-9) [across, down] = [0, 1];
  const halfWidth = Math.max(0, width / 2 - inset);
  const halfHeight = Math.max(0, height / 2 - inset);
  const scale = Math.min(
    Math.abs(across) > 1e-9 ? halfWidth / Math.abs(across) : Infinity,
    Math.abs(down) > 1e-9 ? halfHeight / Math.abs(down) : Infinity,
  );
  return { x: width / 2 + across * scale, y: height / 2 + down * scale, angle: Math.atan2(down, across) };
}

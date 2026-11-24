import type { GlowLook } from '../elementGlow.ts';
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
  respawned: 9,
  feinted: 10,
  shielded: 12,
  shieldBroken: 13,
  healed: 14,
  /** Every player in an Abyss run fell at once: told to each, the run starting over. */
  wiped: 15,
  publicBegun: 16,
  publicStage: 17,
  shardTaken: 18,
  shardSet: 19,
  heroicMet: 20,
  heroicMissed: 21,
  publicWon: 22,
  publicFailed: 23,
  storePlundered: 24,
  chestOpened: 25,
  /** An Elite Dungeon's moments, each told to every player (crates/room/src/encounters.rs). */
  sealBroken: 26,
  runeWrong: 27,
  wardRaised: 28,
  wardBroken: 29,
  reckoningLanded: 30,
  bossWoke: 31,
  relicDrained: 32,
  /** An Ascent's drowned floor harmed the player, told to them alone; the warded Boss's slam landed. */
  drowned: 33,
  bossSlammed: 34,
  /** A fallen player stood up by an ally (the striker), an activity's checkpoint reached, and a company all down in
   *  a darkness zone fallen back to its checkpoint (crates/room/src/revive.rs). */
  revived: 35,
  checkpoint: 36,
  fellBack: 37,
} as const;
export const HOW = { riposte: 2, counter: 3, shot: 6, spell: 7, leap: 8, burst: 9, bite: 10 } as const;

/** Whether a blow lands as a spell's does, no weapon's swing behind it: a spell, or an Atheric's leap or burst. */
export const landsAsSpell = (event: FightEvent): boolean =>
  event.how === HOW.spell || event.how === HOW.leap || event.how === HOW.burst;

/** The fighter a blow came from, which way it pushes its defender and throws its motes: a leap's or a burst's source
 *  foe, else its striker. */
export const cameFrom = (event: FightEvent): number =>
  (event.how === HOW.leap || event.how === HOW.burst) && event.from ? event.from : event.striker;

/** Whether a blow is no weapon's own swing or shot on its foe: a shot, a blow that lands as a spell's, or an Atheric's
 *  bite back on a block, which flashes on the foe bitten but neither kicks the view, holds the fight nor flares the arc. */
export const notABlow = (event: FightEvent): boolean =>
  event.how === HOW.shot || event.how === HOW.bite || landsAsSpell(event);

/** The element a blow burns in where it lands: a spell's in its caster's Art's, an Atheric's leap or burst in its
 *  perk's own, the player's own blow or shot in their weapon's glow as their page shows it, and any other in what the
 *  room says it carried. */
export function blowLook(
  event: FightEvent,
  {
    player,
    own,
    spellLook,
  }: { readonly player: number; readonly own: GlowLook; readonly spellLook?: (id: number) => GlowLook },
): GlowLook {
  const carried = event.element === 1 || event.element === 2 || event.element === 3 ? event.element : 0;
  if (event.how === HOW.spell) return carried || (spellLook?.(event.striker) ?? 0);
  if (event.how === HOW.leap || event.how === HOW.burst) return carried;
  if (event.striker === player && own) return own;
  return carried;
}

/** A word's tone: a great or a good turn for the player, the player's own damage, a bad turn for them, a warning, one
 *  of no side of theirs, a shield's, or the health a drink gave the player back. */
export type Tone = 'great' | 'good' | 'dealt' | 'taken' | 'warn' | 'plain' | 'shield' | 'healed';

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
  [EVENT.shieldBroken]: { text: 'Shield broken', striker: true, great: true },
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
  // A drink's heal says what it gave back, in green over the player who drank.
  if (event.kind === EVENT.healed)
    return { text: `+${Math.max(1, Math.round(event.amount))}`, tone: side === null ? 'plain' : 'healed' };
  const special = event.how === HOW.riposte ? 'Riposte' : event.how === HOW.counter ? 'Counter' : null;
  const numbered = (amount: number) => (special ? `${special} ${amount}` : String(amount));
  // What a shield takes is said in its element's colour, for the player's own blows; a blow it held whole reaches no
  // health to number.
  if (event.kind === EVENT.shielded && event.amount > 0)
    return { text: numbered(Math.max(1, Math.round(event.amount))), tone: side === null ? 'plain' : 'shield' };
  if (event.kind === EVENT.shielded || (event.kind === EVENT.hit && event.amount <= 0)) return null;
  if (event.kind === EVENT.hit)
    return { text: numbered(Math.max(1, Math.round(event.amount))), tone: toneOf(true, special ? 'great' : 'dealt') };
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

/** The parry ring over a foe at a blow the player can parry: the share of its wind-up still to come (1 as it begins,
 *  0 as it lands), whether a press now would parry it, and the share at which the parry window opens (its band on the
 *  ring), the window being `window` ticks as the rules give a player's (`CombatRules.parryWindow`); a press never
 *  parries, and there is no window, while `open` is false (the player's guard could open none).
 *  An iron blow must be dodged, so it shows no ring to time; a shot is never parried. Null for none. */
export function parryCue(
  view: FighterView,
  player: number,
  window: number,
  open = true,
): { share: number; now: boolean; window: number } | 'iron' | null {
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
  return { share: left / lead, now: open && left < window, window: open ? Math.min(1, window / lead) : 0 };
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

// The figures on foot that are neither the player's nor the foes': other players, gliding to where the room last saw
// them, and a social space's people, each keeping a step of its own.
import type { DrawnFigure } from '../combat/attackFeel.ts';
import type { FightEffects } from '../combat/fightEffects.ts';
import type { Fighting } from '../combat/fighting.ts';
import { castLookOf, veiledIn } from '../combat/spellLooks.ts';
import type { Vector } from '../combat/swingArcs.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import type { Glides } from '../player/glide.ts';
import type { OtherPlayers } from '../player/others.ts';
import { PlacedLoop } from '../player/playerMoves.ts';
import type { FighterView } from '../rules/fighters.ts';

/** Other players' figures loop a move at this many frames a second where their screen gave no frame. */
const OTHERS_FPS = 6;
/** How far apart in time two figures' steps are, by their numbers, in seconds: a crowd never walks in step. */
const STRIDE_APART_S = 0.37;

/** Who stands on foot beside the player, and what draws them. */
export interface FootFolk {
  readonly forge: Cards;
  readonly fight: Fighting;
  readonly effects: FightEffects;
  readonly otherPlayers: OtherPlayers;
  readonly otherGlides: Glides;
  readonly folk: readonly Placed[];
  readonly folkLoops: WeakMap<Placed, PlacedLoop>;
  readonly tickSeconds: number;
}

/** Every other player's figure, gliding toward where the room last saw them, drawn off it by the attack `feel` (and
 *  kept as drawn there), flashing as it is struck, faint while Veiled, and its cast's spark in its Art's colour; then
 *  a social space's people. Each is seen from the eye at (`eyeX`, `eyeY`). */
export function otherCards(
  folk: FootFolk,
  [eyeX, eyeY]: readonly [number, number],
  clock: number,
  frameTicks: number,
  feel: {
    shift: (id: number, view: FighterView | null) => Vector;
    drawnAt: Map<number, DrawnFigure>;
    otherViews: ReadonlyMap<number, FighterView>;
  },
): CardAt[] {
  const { forge, fight, effects, otherGlides } = folk;
  const cards: CardAt[] = [];
  for (const [number, placed] of folk.otherPlayers.placed) {
    const seen = fight.others.get(number)?.body;
    if (seen)
      [placed.x, placed.y, placed.z] = otherGlides.follow(number, [seen.x, seen.y, seen.z], fight.roomTick, frameTicks);
    const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eyeX, eyeY);
    const frames = forge.frames(placed.dress.body, placed.anim);
    const frame = placed.frame === null ? frameAt(clock, frames, OTHERS_FPS) : Math.min(placed.frame, frames - 1);
    // A cast's spark glows in the caster's Art, as the player's own does.
    const glow = placed.anim === 'cast' ? castLookOf(fight, number) : 0;
    const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip, glow);
    const flash = effects.flashes.flashOf(number);
    const veiled = veiledIn(fight, number);
    const moved = feel.shift(number, feel.otherViews.get(number) ?? null);
    const atFeet: Vector = [placed.x + moved[0], placed.y + moved[1], placed.z + moved[2]];
    feel.drawnAt.set(number, { feet: atFeet, anim: placed.anim, flip });
    if (card) cards.push({ card, ...cardStand(atFeet[0], atFeet[1], eyeX, eyeY), z: atFeet[2], flip, flash, veiled });
  }
  otherGlides.keep(new Set(folk.otherPlayers.placed.keys()));
  // Each keeps a step of its own, their walk's frames at the pace they walk.
  const seconds = frameTicks * folk.tickSeconds;
  for (const one of folk.folk) {
    const { view, flip } = viewOf(one.facing, one.x, one.y, eyeX, eyeY);
    const frames = forge.frames(one.dress.body, one.anim);
    const loop = folk.folkLoops.get(one) ?? new PlacedLoop();
    folk.folkLoops.set(one, loop);
    const frame = loop.frame(one, frames, seconds, clock + one.id * STRIDE_APART_S, OTHERS_FPS);
    const card = forge.card(one.id, one.dress, one.anim, view, frame, flip);
    if (card) cards.push({ card, ...cardStand(one.x, one.y, eyeX, eyeY), z: one.z, flip });
  }
  return cards;
}

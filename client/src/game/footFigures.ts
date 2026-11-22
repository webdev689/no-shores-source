// The figures on foot that are neither the player's nor the foes': other players, gliding to where the room last saw
// them, and a social space's people (`folkCards`); and the player's own figure dressed in their gear.
import type { Arrivals } from '../combat/arrivals.ts';
import type { DrawnFigure } from '../combat/attackFeel.ts';
import type { FightEffects } from '../combat/fightEffects.ts';
import type { Fighting } from '../combat/fighting.ts';
import { castLookOf, veiledIn } from '../combat/spellLooks.ts';
import type { Vector } from '../combat/swingArcs.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { heldElements } from '../player/gear.ts';
import { gearOutfit, otherLoadout, spareOutfit } from '../player/gearLooks.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import type { Glides } from '../player/glide.ts';
import type { OtherPlayers } from '../player/others.ts';
import type { PlacedLoop } from '../player/playerMoves.ts';
import type { Walker } from '../player/walker.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { OTHERS_FPS, folkCards } from './footRoom.ts';

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
  /** Players arriving, by their numbers (`arrivals.ts`): one first met after the player arrived arrives. */
  readonly arrivals: Arrivals;
}

/** Every other player's figure, gliding toward where the room last saw them, drawn off it by the attack `feel` (and
 *  kept as drawn there), flashing as it is struck, faint while Veiled, built as it arrives, and its cast's spark in
 *  its Art's colour; then
 *  a social space's people. Each is seen from the eye at (`eyeX`, `eyeY`), and another player's figure no nearer than
 *  `feel.nearest`. */
export function otherCards(
  folk: FootFolk,
  [eyeX, eyeY]: readonly [number, number],
  clock: number,
  frameTicks: number,
  feel: {
    shift: (id: number, view: FighterView | null) => Vector;
    drawnAt: Map<number, DrawnFigure>;
    otherViews: ReadonlyMap<number, FighterView>;
    nearest: number;
  },
): CardAt[] {
  const { forge, fight, effects, otherGlides } = folk;
  const cards: CardAt[] = [];
  for (const [number, placed] of folk.otherPlayers.placed) {
    folk.arrivals.meet(number, clock);
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
    // One dead of a fall leans to face the eye, so it shows whole seen from the ledge above.
    const theirs = fight.others.get(number)?.standing;
    const facesEye = theirs?.kind === 'dead' && theirs.fell;
    const stand = cardStand(atFeet[0], atFeet[1], eyeX, eyeY, feel.nearest);
    const arrival = folk.arrivals.shareOf(number, clock);
    if (card) cards.push({ card, ...stand, z: atFeet[2], flip, flash, veiled, facesEye, arrival });
  }
  otherGlides.keep(new Set(folk.otherPlayers.placed.keys()));
  const seconds = frameTicks * folk.tickSeconds;
  return [...cards, ...folkCards(folk.folk, folk.folkLoops, forge, [eyeX, eyeY], clock, seconds)];
}

/** What the player's figure was last dressed in: their gear and the loadout drawn. */
export interface Dressed {
  gear: GearState | null;
  loadout: number;
}

/** Dresses the player's figure in their gear as their room last sent it, its hands the loadout drawn, once either
 *  changes from what it was `dressed` in, its weapons glowing in their element. */
export function dressInGear(walker: Walker, forge: Cards, gear: GearState | null, dressed: Dressed): void {
  const { loadout } = walker.player;
  if (!gear || (gear === dressed.gear && loadout === dressed.loadout)) return;
  [dressed.gear, dressed.loadout] = [gear, loadout];
  const wardrobe = forge.wardrobe(walker.you.dress.body);
  if (wardrobe) {
    const outfit = gearOutfit(gear, wardrobe, walker.you.dress.outfit, loadout);
    walker.you.dress = { ...walker.you.dress, outfit };
    walker.spare = spareOutfit(gear, wardrobe, outfit, loadout);
  }
  walker.glow = heldElements(gear, loadout);
  walker.spareGlow = heldElements(gear, otherLoadout(loadout))[0];
}

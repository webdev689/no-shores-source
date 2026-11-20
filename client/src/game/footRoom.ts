// What a place on foot needs of its room before the player stands there: the fight's rules made once for the room's
// module, and every other player's figure in it, numbered for the forge, kept from each of its snapshots; and a social
// space's people drawn, each keeping a step of its own.
import type { FootContext } from './foot.ts';
import type { Fighting } from '../combat/fighting.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { cardStand, type Placed, viewOf } from '../player/figures.ts';
import { OtherPlayers } from '../player/others.ts';
import { PlacedLoop } from '../player/playerMoves.ts';
import { type CombatRules, startCombatRules } from '../rules/combatRules.ts';
import { type FoeType, rosterOf } from '../rules/roster.ts';

/** Other players' figures loop a move at this many frames a second where their screen gave no frame. */
export const OTHERS_FPS = 6;
/** How far apart in time two figures' steps are, by their numbers, in seconds: a crowd never walks in step. */
const STRIDE_APART_S = 0.37;

/** Other players' figures are numbered from here, clear of the player's own, and never twice in the page's life: the
 *  forge keeps each figure's last card by its number, so a number used again would first show another node's figure. */
let otherIds = 100;

/** The next other player's figure's number. */
export function nextOtherId(): number {
  otherIds += 1;
  return otherIds - 1;
}

/** The fight's rules and roster on the room's module, made once. */
const fightRules = new WeakMap<WebAssembly.Module, { combat: CombatRules; roster: readonly FoeType[] }>();

/** The fight's rules and roster on the context's room module, made once for it. */
export async function rulesOf(context: FootContext): Promise<{ combat: CombatRules; roster: readonly FoeType[] }> {
  const module = await context.roomModule;
  const rules = fightRules.get(module) ?? { combat: startCombatRules(module), roster: rosterOf(module) };
  fightRules.set(module, rules);
  return rules;
}

/** Every other player's figure in a room, and what each of its snapshots shows of them and of the player's fight
 *  once `heard.fight` stands: before it there is no own number to tell the player from the others. */
export function hearing(forge: Cards) {
  const players = new OtherPlayers({
    place: (dress, x, y, facing) => ({
      id: nextOtherId(),
      x,
      y,
      z: 0,
      facing,
      dress,
      anim: 'idle',
      frame: null,
      spin: false,
    }),
    remove: () => undefined,
  });
  const heard: { fight: Fighting | null } = { fight: null };
  const received = (snapshot: Snapshot) => {
    players.takeDresses(snapshot.dressed);
    heard.fight?.receive(snapshot);
    if (heard.fight) players.seen(snapshot.players, heard.fight.player, forge);
  };
  return { players, heard, received };
}

/** A social space's people seen from the eye at `clock`, `seconds` after the last frame, each keeping a step of its
 *  own, its walk's frames at the pace it walks, by the loop `loops` keeps for it. */
export function folkCards(
  folk: readonly Placed[],
  loops: WeakMap<Placed, PlacedLoop>,
  forge: Cards,
  [eyeX, eyeY]: readonly [number, number],
  clock: number,
  seconds: number,
): CardAt[] {
  const cards: CardAt[] = [];
  for (const one of folk) {
    const { view, flip } = viewOf(one.facing, one.x, one.y, eyeX, eyeY);
    const frames = forge.frames(one.dress.body, one.anim);
    const loop = loops.get(one) ?? new PlacedLoop();
    loops.set(one, loop);
    const frame = loop.frame(one, frames, seconds, clock + one.id * STRIDE_APART_S, OTHERS_FPS);
    const card = forge.card(one.id, one.dress, one.anim, view, frame, flip);
    if (card) cards.push({ card, ...cardStand(one.x, one.y, eyeX, eyeY), z: one.z, flip });
  }
  return cards;
}

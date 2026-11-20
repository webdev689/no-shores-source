// What a place on foot needs of its room before the player stands there: the fight's rules made once for the room's
// module, and every other player's figure in it, numbered for the forge, kept from each of its snapshots.
import type { FootContext } from './foot.ts';
import type { Fighting } from '../combat/fighting.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { OtherPlayers } from '../player/others.ts';
import { type CombatRules, startCombatRules } from '../rules/combatRules.ts';
import { type FoeType, rosterOf } from '../rules/roster.ts';

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

// Going to a member of the player's company where they play, from the Roster: on foot at their node, or into their
// dungeon or run, at their seas, on any landmass, as Destiny's join brings a player into the other's game. A landmass
// not open is opened behind the join's veil first, as a trip to the hub opens Overlook's; the ship stays where it lies.
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { Happening } from './flow.ts';
import { nodeOfRoom, passageRoom, startedAtSea } from './rooms.ts';
import { onOtherLand } from './tripBack.ts';
import { type NodeInfo, type WorldData, arrivalAt } from './worldData.ts';

/** Why the player cannot go now to their company's member who plays in the room `place`: something else under way, a
 *  fight at sea, the player fallen, or the member in the passages, which are gone into at a mouth; null for none. */
export function notYet(
  place: string,
  now: { readonly free: boolean; readonly fighting: boolean; readonly fallen: boolean },
): string | null {
  if (!now.free) return 'You are in their company. Choose Go to them once nothing else is under way.';
  // As other games keep travel out of a fight, and the fallen respawn before they go anywhere.
  if (now.fighting) return 'You are in their company. Go to them once the fight is over.';
  if (now.fallen) return 'You are in their company. Go to them once you respawn.';
  return passageRoom(place) ? 'They are in the passages: go in at a mouth on your company’s route.' : null;
}

/** A join's work made from what it does with the member's node as its landmass lays it, once that landmass is open. */
export type Opened = (onIt: (laid: NodeInfo) => Promise<void>) => () => Promise<void>;

/** What a join reaches: the landmass open, the world's nodes and cities, whether the player may go now, a landmass
 *  opened in place of the one open and the one left put back, the veil (`travel`), and the ways onto foot and into a
 *  member's dungeon or run. */
export interface JoinGame<Land extends { readonly id: string; readonly nodes: readonly NodeInfo[] }> {
  readonly landmass: () => Land;
  readonly world: Pick<WorldData, 'nodes' | 'cities'>;
  readonly now: () => { readonly free: boolean; readonly fighting: boolean; readonly fallen: boolean };
  readonly open: (continent: string) => Promise<void>;
  readonly put: (landmass: Land) => void;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly goFoot: (node: NodeInfo, seas: Difficulty, guild: string | null) => Promise<void>;
  readonly intoDungeon: (node: NodeInfo, place: string, opened: Opened) => void;
}

/** Goes to the company's member who plays in the room `place`; answers why not, or null once on the way. */
export function companyJoin<Land extends { readonly id: string; readonly nodes: readonly NodeInfo[] }>(
  game: JoinGame<Land>,
): (place: string) => string | null {
  return (place) => {
    const yet = notYet(place, game.now());
    if (yet) return yet;
    const where = nodeOfRoom(place);
    // A run started at sea leads back out to the sea, so no landmass is opened for it.
    const atSea = startedAtSea(place);
    const find = (nodes: readonly NodeInfo[]) => nodes.find((each) => each.id === where?.id);
    const site = where && (atSea ? find(game.world.nodes) : arrivalAt(game.world, where.id));
    const shown = find(game.landmass().nodes) ?? find(game.world.nodes);
    if (!where || !site)
      return place === 'sea' ? 'They are at sea: meet them where they land.' : 'They are across the sea.';
    const laid = () => {
      const node = find(atSea ? game.world.nodes : game.landmass().nodes);
      if (!node) throw new Error(`${site.name} is not on its landmass`);
      return node;
    };
    const lands = { now: game.landmass, open: () => game.open(site.continent), put: game.put };
    const opened: Opened = (onIt) => () => (atSea ? onIt(laid()) : onOtherLand(lands, () => onIt(laid())));
    if ((where.dungeon !== null || where.run !== null) && shown) game.intoDungeon(shown, place, opened);
    else {
      const happening = { kind: 'join', node: where.id, name: shown?.name ?? site.name } as const;
      game.travel(
        happening,
        opened((node) => game.goFoot(node, where.seas, where.guild)),
      );
    }
    return null;
  };
}

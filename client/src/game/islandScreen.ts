// The island's tiles as the game shows them while a landing is chosen: what the panel reads off the game, what its
// tiles do (landing at a place, opening the Outposts tile's sites or a patrol zone's map of its landing zones), and
// what Enter and Escape do there (`islandPanel.ts` draws them).
import type { Interface } from '../ui/ui.ts';
import type { Node } from '../ui/node.ts';
import {
  type IslandEntry,
  type IslandFacts,
  type IslandPanel,
  type OutpostSlot,
  type OutpostsEntry,
  entriesOf,
  islandPanelOf,
} from './islandWords.ts';
import { islandPanelNode, litSlot, outpostsNode } from './islandPanel.ts';
import { landingsNode, landsByMap } from './landingZones.ts';
import type { Landmass } from './landmass.ts';
import type { Sea } from './sea.ts';
import type { NodeInfo } from './worldData.ts';

/** What the island's panel reads off the game, and what its entries do. */
export interface IslandGame {
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'nodes' | 'outline' | 'regions'>;
  readonly sea: () => Pick<Sea, 'position' | 'view'> | null;
  readonly chosen: () => string | null;
  readonly facts: () => Omit<IslandFacts, 'named'> | null;
  readonly named: (id: string) => string;
  /** The sites the player's guild holds outposts at. */
  readonly ours: () => readonly string[];
  readonly choose: (id: string) => void;
  readonly back: () => void;
  readonly does: {
    /** Lands at a node, at its landing zone `zone` where its map chose one. */
    readonly land: (id: string, zone?: number) => void;
    readonly dungeon: (node: NodeInfo) => void;
    readonly playlist: (city: string) => void;
  };
}

/** The island's tiles as the game shows them while a landing is chosen, and what Enter does: the lit tile's press,
 *  the first place's while none is lit. */
export function islandScreen(game: IslandGame): {
  readonly node: (ui: Interface) => Node | null;
  readonly act: (id: string | null) => void;
  readonly back: () => boolean;
} {
  /** The Outposts tile whose slots stand open, by its id; none while the tiles show. */
  let picking: string | null = null;
  /** The patrol zone whose map stands open to choose a landing zone on, by its id, and the zone lit for Enter. */
  let zoning: string | null = null;
  let zone = 0;
  const panelNow = (): IslandPanel | null => {
    const sea = game.sea();
    if (!sea) return null;
    const facts = game.facts();
    const read = {
      ...{ activities: facts?.activities ?? null, gates: facts?.gates ?? null },
      ...{ named: game.named, ours: game.ours() },
    };
    return islandPanelOf(game.landmass(), sea.view.docked, read, sea.position);
  };
  // The open slots' tile as the panel is now: none once the ship lies off another region.
  const pickedOf = (panel: IslandPanel | null): OutpostsEntry | undefined =>
    picking === null
      ? undefined
      : (panel?.groups.flatMap((group) => group.entries).find((entry) => entry.id === picking) as
          OutpostsEntry | undefined);
  // The flow lands only at the node chosen, so a landing chooses its node first.
  const landAt = (id: string, chose?: number) => (
    (picking = zoning = null),
    game.choose(id),
    game.does.land(id, chose)
  );
  // Closing the slots or the zone's map lights its tile again, so Enter on the tiles never holds an id no tile has.
  const close = () => {
    if (picking !== null) game.choose(picking);
    if (zoning !== null) game.choose(zoning);
    picking = zoning = null;
  };
  const zoned = () => (zoning === null ? undefined : game.landmass().nodes.find((node) => node.id === zoning));
  const land = (slot: OutpostSlot) => void (slot.shut === null && landAt(slot.id));
  const act = (entry: IslandEntry) => {
    if (entry.shut !== null) return;
    const landmass = game.landmass();
    if (entry.act.does === 'land') {
      // A patrol zone with landing zones opens its map to choose one on.
      const node = landmass.nodes.find((each) => each.id === entry.id);
      if (!landsByMap(node)) return landAt(entry.id);
      [zoning, zone] = [entry.id, 0];
      return;
    }
    if (entry.act.does === 'outposts') return void (picking = entry.id);
    if (entry.act.does === 'playlist') return landmass.plan && game.does.playlist(landmass.plan.id);
    const node = landmass.nodes.find((each) => each.id === entry.id);
    if (node) game.does.dungeon(node);
  };
  return {
    node: (ui) => {
      const [panel, sea] = [panelNow(), game.sea()];
      if (!panel || !sea) return null;
      const landmass = game.landmass();
      const harbour = landmass.plan && !landmass.plan.ruined ? landmass.plan.harbour : null;
      const chart = { id: landmass.id, outline: landmass.outline, harbour, ship: sea.position };
      const picked = pickedOf(panel);
      if (picked) {
        return outpostsNode(ui, picked, game.chosen(), chart, { choose: game.choose, land, close });
      }
      const node = zoned();
      if (node) {
        const acts = {
          choose: (lit: number) => void (zone = lit),
          land: (chose: number) => landAt(node.id, chose),
          close,
        };
        return landingsNode(ui, node, zone, acts);
      }
      return islandPanelNode(ui, panel, game.chosen(), chart, {
        choose: game.choose,
        act,
        back: game.back,
      });
    },
    act: (id) => {
      const panel = panelNow();
      const picked = pickedOf(panel);
      if (picked) {
        const slot = litSlot(picked, id);
        return void (slot && land(slot));
      }
      const node = zoned();
      if (node) return landAt(node.id, zone);
      const entries = panel ? entriesOf(panel) : [];
      const entry = entries.find((each) => each.id === id) ?? (id === null ? entries[0] : undefined);
      if (entry) act(entry);
    },
    // Escape and the pad's B close the slots or the zone's map first, back to the tiles.
    back: () => {
      const open = pickedOf(panelNow()) !== undefined || zoned() !== undefined;
      close();
      return open;
    },
  };
}

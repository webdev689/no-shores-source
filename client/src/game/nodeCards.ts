// The resource nodes as the forge draws them (tools/forge/tools/sprite-forge/items/nodes.py): each island resource's
// picture as it stands and as it lies gathered, read from the forge's published pictures, stood as a card where a
// layout stands each node, before the place its resource comes from. The picture alone marks a node; one not
// published yet leaves its place to the layout's own dressing.
import type { Texels } from '../combat/forgedBirds.ts';
import type { LaidSite } from '../layout/layouts.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Card, CardAt } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';

/** How wide each resource's picture stands, metres: every resource at one scale, 1.2 m to each unit of the span its
 *  picture holds (tools/forge/tools/sprite-forge/specs/pictures/nodes.json), so a node stands about knee high beside a
 *  body. Keyed by the resources' ids (content/gear/resources.json). */
export const NODE_WIDTH_M: Readonly<Record<string, number>> = {
  brineglass: 1.27,
  cairn_iron: 1.16,
  heartwood_resin: 1.22,
  sunstone: 1.28,
  goldgrass_seed: 1.48,
  mistbloom: 1.33,
  windthistle: 1.27,
  bog_pearl: 1.31,
  rimecrystal: 1.22,
};

/** Where the forge publishes a resource's picture, standing or gathered. */
export const nodePicturePath = (resource: string, spent: boolean) =>
  `forge/nodes/${resource}${spent ? '-spent' : ''}.png`;

const cards = new Map<string, Card>();

/** Reads every resource's two pictures through `strip`, and makes each a card with `make` as it comes. */
export function loadNodeCards(
  strip: (path: string) => Promise<Texels | null>,
  make: (pixels: Uint8Array, width: number, height: number, root: readonly [number, number]) => Card,
): void {
  for (const resource of Object.keys(NODE_WIDTH_M))
    for (const spent of [false, true]) {
      const path = nodePicturePath(resource, spent);
      strip(path)
        .then((texels) => {
          if (!texels || cards.has(path)) return;
          const { width, height } = texels;
          cards.set(path, make(Uint8Array.from(texels.data), width, height, [width / 2, height]));
        })
        .catch(() => undefined);
    }
}

/** The cards of a layout's nodes: each its island resource's picture (what its place holds) at its place (`places`,
 *  numbered as the room numbers its nodes) on `floor`, standing where the room stands it for the player (`gear`'s
 *  `nodes`), and as it lies gathered until it stands again (a node the player gathered, or one resting its turn); none
 *  where the room stands no node at all (a mission's places), nor for one whose picture has not come. */
export function nodeCardsAt(
  places: readonly Pick<LaidSite, 'at' | 'holds'>[],
  gear: Pick<GearState, 'nodes' | 'spent'> | null,
  floor: (x: number, y: number) => number,
): CardAt[] {
  const standing = new Set(gear?.nodes.map((node) => node.index));
  // A room that stands none, nor has any spent, has no nodes here: before its first word, or a mission's places.
  if (standing.size === 0 && (gear?.spent.length ?? 0) === 0) return [];
  return places.flatMap((place, index): CardAt[] => {
    const width = place.holds === undefined ? undefined : NODE_WIDTH_M[place.holds];
    const card = width && place.holds && cards.get(nodePicturePath(place.holds, !standing.has(index)));
    if (!card || !width) return [];
    const [x, y] = place.at;
    return [{ card, x, y, z: floor(x, y), flip: false, scale: (width * PX_PER_M) / card.width }];
  });
}

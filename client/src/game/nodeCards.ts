// The material nodes as the forge draws them (tools/forge/tools/sprite-forge/items/nodes.py): each kind's picture as
// it stands and as it lies gathered, read from the forge's published pictures, stood as a card at each resource place
// of a patrol's layout beside its ring and beam (`footGear.ts`). A picture not published yet leaves its node to its
// ring, its beam and the layout's own dressing.
import type { Texels } from '../combat/forgedBirds.ts';
import type { LaidSite } from '../layout/layouts.ts';
import type { Card, CardAt } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';

/** The kinds of node, by what their places hold. */
export const NODE_KINDS = ['ore', 'herbs', 'timber', 'salvage'] as const;
type NodeKind = (typeof NODE_KINDS)[number];
/** How wide a node's picture stands, metres: about as wide as the dressing it stands among. */
export const NODE_WIDTH_M = 3.2;

/** Where the forge publishes a kind's picture, standing or gathered. */
export const nodePicturePath = (kind: NodeKind, spent: boolean) => `forge/nodes/${kind}${spent ? '-spent' : ''}.png`;

const cards = new Map<string, Card>();

/** Reads every kind's two pictures through `strip`, and makes each a card with `make` as it comes. */
export function loadNodeCards(
  strip: (path: string) => Promise<Texels | null>,
  make: (pixels: Uint8Array, width: number, height: number, root: readonly [number, number]) => Card,
): void {
  for (const kind of NODE_KINDS)
    for (const spent of [false, true]) {
      const path = nodePicturePath(kind, spent);
      strip(path)
        .then((texels) => {
          if (!texels || cards.has(path)) return;
          const { width, height } = texels;
          cards.set(path, make(Uint8Array.from(texels.data), width, height, [width / 2, height]));
        })
        .catch(() => undefined);
    }
}

/** The cards of a patrol's resource places: each its kind's picture where it stands on `floor`, standing where the
 *  room stands its node for the player (`standing`), else gathered; none for a place whose picture has not come. */
export function nodeCardsAt(
  places: readonly Pick<LaidSite, 'at' | 'holds'>[],
  standing: (at: readonly [number, number]) => boolean,
  floor: (x: number, y: number) => number,
): CardAt[] {
  return places.flatMap((place): CardAt[] => {
    const kind = NODE_KINDS.find((each) => each === place.holds);
    const card = kind && cards.get(nodePicturePath(kind, !standing(place.at)));
    if (!card) return [];
    const [x, y] = place.at;
    return [{ card, x, y, z: floor(x, y), flip: false, scale: (NODE_WIDTH_M * PX_PER_M) / card.width }];
  });
}

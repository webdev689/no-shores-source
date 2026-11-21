// The material nodes as the forge draws them (tools/forge/tools/sprite-forge/items/nodes.py): each kind's picture as
// it stands and as it lies gathered, read from the forge's published pictures, stood as a card where a patrol's layout
// stands each node, before its dressing. The picture alone marks a node; one not published yet leaves its place to
// the layout's own dressing.
import type { Texels } from '../combat/forgedBirds.ts';
import type { LaidSite } from '../layout/layouts.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Card, CardAt } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';

/** The kinds of node, by what their places hold. */
export const NODE_KINDS = ['ore', 'herbs', 'timber', 'salvage'] as const;
type NodeKind = (typeof NODE_KINDS)[number];
/** How wide each kind's picture stands, metres: every kind at one scale, 1.2 m to each unit of the span its picture
 *  holds (tools/forge/tools/sprite-forge/specs/pictures/nodes.json), so a heap stands about knee high beside a body. */
export const NODE_WIDTH_M: Readonly<Record<NodeKind, number>> = { ore: 1.2, herbs: 1.4, timber: 1.6, salvage: 1.5 };

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

/** The cards of a patrol's nodes: each its kind's picture at its place (`places`, numbered as the room numbers its
 *  nodes) on `floor`, standing where the room stands it for the player (`gear`'s `nodes`), gathered where they gathered
 *  it this turn (its `spent`); none at a place resting this turn, nor for one whose picture has not come. */
export function nodeCardsAt(
  places: readonly Pick<LaidSite, 'at' | 'holds'>[],
  gear: Pick<GearState, 'nodes' | 'spent'> | null,
  floor: (x: number, y: number) => number,
): CardAt[] {
  const [standing, spent] = [new Set(gear?.nodes.map((node) => node.index)), new Set(gear?.spent)];
  return places.flatMap((place, index): CardAt[] => {
    const kind = NODE_KINDS.find((each) => each === place.holds);
    const shown = standing.has(index) || spent.has(index);
    const card = kind && shown && cards.get(nodePicturePath(kind, !standing.has(index)));
    if (!card) return [];
    const [x, y] = place.at;
    return [{ card, x, y, z: floor(x, y), flip: false, scale: (NODE_WIDTH_M[kind] * PX_PER_M) / card.width }];
  });
}

// A patrol zone's landing zones, chosen on its map as its island tile opens it, in the tiles' place: its section, its
// ways and its places, and a beacon fire at each landing zone; a click on a fire, or Enter on the one lit, lands there
// (the decision "The Saltgrass Downs Plays as Destiny 2's EDZ, Its Three Landing Zones Spread Across It").
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { boundWord, noKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { hudPress, said } from './hudParts.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number];

/** Where the panel stands, as the tiles do (in from each side, under the place's name), the room it leaves under the
 *  map for its words and presses, and the map's widest, pixels. */
const ROOM = { side: 24, top: 104, foot: 190, widest: 720 } as const;
/** The map's land, its edge, its ways and places, and a fire's cairn and flame. */
const INK = {
  land: '#2a3527',
  edge: '#8a6a3a',
  way: 'rgba(214,196,150,0.45)',
  place: '#7d8794',
  cairn: '#9a9488',
  flame: '#ff9a3c',
} as const;
/** A fire's press across, pixels. */
const MARK_PX = 30;

/** What the landing zones' panel does: light a zone for Enter, land at one, and close it back to the tiles. */
export interface ZoneActs {
  readonly choose: (zone: number) => void;
  readonly land: (zone: number) => void;
  readonly close: () => void;
}

/** Whether a node is landed at from its map, at one of its landing zones: a patrol zone with more than one. */
export const landsByMap = (node: Pick<NodeInfo, 'landings'> | undefined): boolean => (node?.landings?.length ?? 0) > 1;

/** The bounds of a ring, west, north, east, south. */
function boundsOf(ring: readonly Point[]): readonly [number, number, number, number] {
  const [eastings, southings] = [ring.map((point) => point[0]), ring.map((point) => point[1])];
  return [Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)];
}

/** The zone's map over the view: its name, the map with a fire's press at each landing zone (`lit` ringed in brass),
 *  the lit zone's name, and the presses to land there and to go back to the tiles. */
export function landingsNode(ui: Interface, node: NodeInfo, lit: number, acts: ZoneActs): Node {
  const zones = node.landings ?? [];
  const [west, north, east, south] = boundsOf(node.ring.length > 2 ? node.ring : zones.map((zone) => zone.at));
  const [spanX, spanY] = [Math.max(east - west, 1), Math.max(south - north, 1)];
  const widest = Math.min(ROOM.widest, ui.size.width - 2 * ROOM.side - 40);
  const scale = Math.min(widest / spanX, Math.max(160, ui.size.height - ROOM.top - ROOM.foot) / spanY);
  const [width, height] = [Math.round(spanX * scale), Math.round(spanY * scale)];
  const onMap = ([x, y]: Point): [number, number] => [((x - west) / spanX) * width, ((y - north) / spanY) * height];
  const keyed = ui.keyFocused && zones.some((_zone, number) => ui.focused(`landing-zone:${number}`));
  const fires = zones.map((zone, number): Node => {
    const id = `landing-zone:${number}`;
    if (ui.clicked(id) || (ui.focused(id) && !ui.keyFocused)) ui.focusOn(null);
    if (ui.clicked(id)) acts.land(number);
    if ((keyed ? ui.focused(id) : ui.hovered(id)) && number !== lit) acts.choose(number);
    const [x, y] = onMap(zone.at);
    return {
      id,
      press: true,
      label: `${zone.name}. Land here`,
      width: MARK_PX,
      height: MARK_PX,
      float: { to: 'parent', x: Math.round(x - MARK_PX / 2), y: Math.round(y - MARK_PX / 2) },
    };
  });
  const draw = (context: OffscreenCanvasRenderingContext2D) => {
    context.beginPath();
    node.ring.forEach((point, place) => context[place ? 'lineTo' : 'moveTo'](...onMap(point)));
    context.closePath();
    context.fillStyle = INK.land;
    context.fill();
    context.strokeStyle = INK.edge;
    context.lineWidth = 1.5;
    context.stroke();
    context.strokeStyle = INK.way;
    context.lineWidth = 2;
    for (const path of node.paths ?? []) {
      context.beginPath();
      path.forEach((point, place) => context[place ? 'lineTo' : 'moveTo'](...onMap(point)));
      context.stroke();
    }
    context.fillStyle = INK.place;
    for (const place of node.places ?? []) {
      const [x, y] = onMap(place.at);
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fill();
    }
    zones.forEach((zone, number) => {
      const [x, y] = onMap(zone.at);
      // A low cairn, a flame over it, and the lit one ringed.
      context.fillStyle = INK.cairn;
      context.fillRect(x - 6, y + 1, 12, 5);
      context.fillStyle = INK.flame;
      context.beginPath();
      context.moveTo(x, y - 9);
      context.lineTo(x + 5, y + 1);
      context.lineTo(x - 5, y + 1);
      context.fill();
      if (number !== lit) return;
      context.strokeStyle = TONES.brass;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y - 1, 13, 0, Math.PI * 2);
      context.stroke();
    });
  };
  return {
    id: 'landings-panel',
    solid: true,
    modal: true,
    label: `${node.name}. Choose where to land`,
    float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: ROOM.top },
    direction: 'column',
    gap: 14,
    padding: 20,
    fill: 'rgba(10,14,22,0.94)',
    outline: { width: 1, colour: 'rgba(192,138,62,0.45)' },
    children: [
      said(node.name, { size: 2, colour: TONES.brass }),
      said('Choose where to land', { colour: DIM }),
      {
        width,
        height,
        children: [
          { width, height, picture: { key: `landing zones ${node.id} ${lit} ${width}x${height}`, source: { draw } } },
          ...fires,
        ],
      },
      {
        width: 'grow',
        gap: 14,
        alignY: 'center',
        children: [
          said(zones[lit]?.name ?? '', { colour: TONES.brass }),
          { width: 'grow' },
          hudPress(ui, 'landings-land', `Land  ${boundWord('confirm')}`, () => acts.land(lit)),
          hudPress(ui, 'landings-back', `Back  ${noKey()}`, acts.close),
        ],
      },
    ],
  };
}

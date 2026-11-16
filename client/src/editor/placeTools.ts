import { DRAWN, type LandTool } from './landPanel.ts';
import type { Places } from './marks.ts';
import { nextId, placeAt, snapPoint, type Spot } from './placeDrawing.ts';
import {
  distinctPoints,
  movedCity,
  newNode,
  type NodeKind,
  spawnAt,
  withNodeFields,
  withoutLastSpawn,
  withoutSpawn,
  withSpawn,
} from './sites.ts';

type Drawn = 'river' | 'road' | 'town' | 'node';
type Edits = Record<string, unknown[]>;

/** What the place tools need from the editor: the open landmass's places as they stand, a change to them (one undo
 *  step, `mutate` seeing the edits as they stand when it runs), and a line for the status when a press does nothing. */
export interface PlaceHost {
  places(): Places;
  change(mutate: (edits: Edits) => void): void;
  say(text: string): void;
}

/** The Land mode's place tools: rivers, roads, towns and nodes drawn point by point; ports, spawns and the port city
 *  placed with a click; and Remove. */
export class PlaceTools {
  draft: { kind: Drawn; points: Spot[] } | null = null;
  /** A new river's and road's width, and a new river's depth, metres. */
  readonly width = { river: 40, road: 8 };
  depth = 4;
  /** The kind and name of the next node drawn; `chosen` is the node the panel's fields change as well. */
  nodeKind: NodeKind = 'patrol';
  nodeName = '';
  chosen: string | null = null;
  private readonly host: PlaceHost;

  constructor(host: PlaceHost) {
    this.host = host;
  }

  /** A press of `tool` at a world spot; `reachM` is how near a click finds a place, or a road's point snaps. */
  press(tool: LandTool, [x, y]: Spot, reachM: number): void {
    const places = this.host.places();
    const spot: Spot = [Math.round(x), Math.round(y)];
    if (DRAWN.includes(tool)) {
      const kind = tool as Drawn;
      const point = kind === 'road' ? snapPoint(places, spot, reachM) : spot;
      // A new node drawn while another was chosen starts with a blank name, so it never takes that one's.
      if (kind === 'node' && this.draft?.kind !== 'node' && this.chosen) [this.chosen, this.nodeName] = [null, ''];
      this.draft =
        this.draft?.kind === kind ? { kind, points: [...this.draft.points, point] } : { kind, points: [point] };
    } else if (tool === 'port') {
      // The id is taken from the edits as they stand when the change runs, so quick clicks never share one.
      this.host.change(
        (edits) => (edits['ports'] = [...(edits['ports'] ?? []), { id: nextId(edits, 'port'), at: spot }]),
      );
    } else if (tool === 'spawn') {
      if (!withSpawn(places.nodes, spot)) this.host.say('A spawn goes inside a node: click inside one.');
      else this.changeNodes((nodes) => withSpawn(nodes, spot));
    } else if (tool === 'city') {
      // A landmass's city, its id and its motif come in its file: the editor moves it, never makes one up.
      if (!places.city) this.host.say('This landmass’s file has no port city to move.');
      else
        this.host.change((edits) => {
          const { city } = edits as Places;
          if (city) Object.assign(edits, { city: movedCity(city, spot) });
        });
    } else if (tool === 'remove') this.remove(places, spot, reachM);
  }

  /** Changes the nodes as they stand when the change runs; `change` answers null for no change. */
  private changeNodes(change: (nodes: Places['nodes']) => Places['nodes'] | null): void {
    this.host.change((edits) => {
      const nodes = change((edits as Places).nodes);
      if (nodes) Object.assign(edits, { nodes });
    });
  }

  /** Removes the spawn within reach, else the nearest place within reach or the area holding the spot. */
  private remove(places: Places, spot: Spot, reachM: number): void {
    if (spawnAt(places.nodes, spot, reachM)) {
      this.changeNodes((nodes) => {
        const found = spawnAt(nodes, spot, reachM);
        return found && withoutSpawn(nodes, found);
      });
      return;
    }
    const found = placeAt(places, spot, reachM);
    const keep = (place: unknown) => (place as { id?: string }).id !== found?.id;
    if (found) this.host.change((edits) => (edits[found.list] = (edits[found.list] ?? []).filter(keep)));
  }

  /** Ends the drawing: a course needs two points, an area three; repeated points count once. */
  finish(): void {
    if (!this.draft) return;
    const { kind } = this.draft;
    const area = kind === 'town' || kind === 'node';
    const points = distinctPoints(this.draft.points, area);
    this.draft = null;
    if (points.length < (area ? 3 : 2)) return;
    if (kind === 'node') {
      const [nodeKind, name] = [this.nodeKind, this.nodeName];
      this.host.change((edits) => {
        const node = newNode(edits as Places, nodeKind, name, points);
        [this.chosen, this.nodeName] = [node.id, node.name];
        edits['nodes'] = [...(edits['nodes'] ?? []), node];
      });
      return;
    }
    const shape =
      kind === 'town'
        ? { outline: points }
        : kind === 'road'
          ? { width_m: this.width.road, points }
          : { width_m: this.width.river, depth_m: this.depth, points };
    this.host.change((edits) => {
      const place = { id: nextId(edits, kind), ...shape };
      edits[`${kind}s`] = [...(edits[`${kind}s`] ?? []), place];
    });
  }

  /** Backspace: takes back the drawing's last point, or with the Spawn tool the last spawn of the node at `spot`. */
  back(tool: LandTool, spot: Spot | null): void {
    if (this.draft) this.draft = { ...this.draft, points: this.draft.points.slice(0, -1) };
    else if (tool === 'spawn' && spot) {
      if (!withoutLastSpawn(this.host.places().nodes, spot)) this.host.say('Point at a node with a spawn to take one.');
      else this.changeNodes((nodes) => withoutLastSpawn(nodes, spot));
    }
  }

  /** The node fields as the panel shows them: the chosen node's own while it stands, else the next node's. */
  nodeFields(): { kind: NodeKind; name: string; chosen: string | null } {
    const node = this.host.places().nodes?.find(({ id }) => id === this.chosen);
    return node
      ? { kind: node.kind, name: node.name, chosen: node.id }
      : { kind: this.nodeKind, name: this.nodeName, chosen: null };
  }

  /** The panel's kind or name: the next node's, and the chosen node's too while it stands. */
  setNode(fields: { readonly kind?: NodeKind; readonly name?: string }): void {
    if (fields.kind) this.nodeKind = fields.kind;
    if (fields.name !== undefined) this.nodeName = fields.name;
    const id = this.nodeFields().chosen;
    if (id) this.changeNodes((nodes) => withNodeFields(nodes, id, fields));
    else this.chosen = null;
  }

  /** Chooses a node for the panel's fields to change. */
  choose(id: string): void {
    const node = this.host.places().nodes?.find((each) => each.id === id);
    if (node) [this.chosen, this.nodeKind, this.nodeName, this.draft] = [id, node.kind, node.name, null];
  }

  /** The port city's name or motif; a blank name is refused, so the city keeps its own. */
  setCity(fields: { readonly name?: string; readonly motif?: string }): void {
    const name = fields.name?.trim();
    this.host.change((edits) => {
      const { city } = edits as Places;
      if (city)
        Object.assign(edits, {
          city: { ...city, ...(name ? { name } : {}), ...(fields.motif ? { motif: fields.motif } : {}) },
        });
    });
  }
}

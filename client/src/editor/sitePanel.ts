import type { Interface } from '../ui/ui.ts';
import { type Block, chooser, heading, INK, listRow, paragraph, swatch, textField, words } from './panelKit.ts';
import { MOTIFS, NODE_COLOURS, NODE_KINDS, type NodeKind } from './sites.ts';
/** What the panel shows of the open landmass's port city and nodes. */
export interface SitePanelView {
  readonly tool: string;
  /** The kind and name of the node the Node tool draws next, or of the chosen node it changes. */
  readonly nodeKind: NodeKind;
  readonly nodeName: string;
  readonly chosen: string | null;
  readonly city: { readonly name: string; readonly motif: string } | null;
  readonly sites: readonly { readonly id: string; readonly name: string; readonly kind: NodeKind | 'city' }[];
}

/** What the sites' controls ask for. */
export interface SitePanelHandlers {
  nodeKind(kind: NodeKind): void;
  nodeName(name: string): void;
  cityName(name: string): void;
  cityMotif(motif: string): void;
  /** Shows a site on the map and chooses it: the city for the City tool, a node for the Node tool. */
  chooseSite(id: string): void;
}

/** The port city's colour, as the map marks it. */
const CITY_COLOUR = '#fff1c2';

/** A labelled control in its own line, 10 px under what is above it. */
const labelled = (label: string, control: Block['node']): Block => ({
  node: { gap: 4, alignY: 'center', children: [words(label), control] },
  top: 10,
});

/** The Node tool's fields (the next node's kind and name, or the chosen node's), or the City tool's (its name and
 *  motif), as blocks of the Land panel. */
export function siteFields(ui: Interface, view: SitePanelView, handlers: SitePanelHandlers): Block[] {
  if (view.tool === 'node') {
    const kind = chooser(
      ui,
      'node-kind',
      view.nodeKind,
      NODE_KINDS.map((each) => ({ value: each, words: each })),
    );
    if (kind.chosen !== view.nodeKind) handlers.nodeKind(kind.chosen as NodeKind);
    const name = textField(ui, 'node-name', view.nodeName, (text) => handlers.nodeName(text), {
      placeholder: view.chosen ? '' : 'named after its id if left blank',
    });
    return [
      { node: paragraph(view.chosen ? `Node ${view.chosen}:` : 'The next node drawn:'), top: 11, bottom: 11 },
      labelled('Kind', kind.node),
      labelled('Name', name),
    ];
  }
  if (view.tool !== 'city' || !view.city) return [];
  const city = view.city;
  const motif = chooser(
    ui,
    'city-motif',
    city.motif,
    MOTIFS.map((each) => ({ value: each, words: each })),
  );
  if (motif.chosen !== city.motif) handlers.cityMotif(motif.chosen);
  return [
    labelled(
      'Name',
      textField(ui, 'city-name', city.name, (text) => handlers.cityName(text)),
    ),
    labelled('Motif', motif.node),
  ];
}

/** The landmass's port city and nodes, each a row that shows it and chooses it. */
export function siteList(ui: Interface, view: SitePanelView, handlers: SitePanelHandlers): Block[] {
  const chosen = view.tool === 'city' ? view.sites.find((site) => site.kind === 'city')?.id : view.chosen;
  const rows = view.sites.map(({ id, name, kind }) =>
    listRow(ui, `site:${id}`, name, id === chosen, () => handlers.chooseSite(id), {
      gap: 8,
      children: [
        swatch(kind === 'city' ? CITY_COLOUR : NODE_COLOURS[kind], kind === 'city' ? '◆' : ''),
        {
          width: 'grow',
          direction: 'column',
          gap: 2,
          children: [words(name), words(kind === 'city' ? 'port city' : kind, INK.dim), { height: 0 }],
        },
      ],
    }),
  );
  return [
    { node: heading('Port city and nodes'), top: 16, bottom: 6 },
    {
      node: {
        width: 'grow',
        direction: 'column',
        children: rows.length ? rows : [{ padding: [5, 6], children: [words('None yet.')] }],
      },
    },
  ];
}

import { make } from './dom.ts';
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

/** A labelled control in its own line. */
function field<K extends 'select' | 'input'>(root: HTMLElement, label: string, name: K): HTMLElementTagNameMap[K] {
  const row = make('label', label, 'brush');
  const control = make(name);
  row.append(control);
  root.append(row);
  return control;
}

function select(root: HTMLElement, label: string, options: readonly string[], onChange: (value: string) => void) {
  const control = field(root, label, 'select');
  control.append(...options.map((option) => Object.assign(make('option', option), { value: option })));
  control.addEventListener('change', () => onChange(control.value));
  return control;
}

/** A text field that reports its value when it is committed (Enter or leaving it), so each edit is one undo step. */
function text(root: HTMLElement, label: string, onChange: (value: string) => void) {
  const control = field(root, label, 'input');
  Object.assign(control, { type: 'text', maxLength: 48, size: 24 });
  control.addEventListener('change', () => onChange(control.value));
  return control;
}

/** Shows a value in a control unless the owner is in it, so a frame never overwrites what they are typing. */
function show(control: HTMLInputElement | HTMLSelectElement, value: string) {
  if (document.activeElement !== control && control.value !== value) control.value = value;
}

/** Builds the Node and City tools' fields into `fields` and the list of the landmass's sites into `list`. */
export function buildSitePanel(fields: HTMLElement, list: HTMLElement, handlers: SitePanelHandlers) {
  const nodeFields = make('div');
  const nodeCaption = make('p', '', 'hint');
  nodeFields.append(nodeCaption);
  const kind = select(nodeFields, 'Kind ', NODE_KINDS, (value) => handlers.nodeKind(value as NodeKind));
  const nodeName = text(nodeFields, 'Name ', (value) => handlers.nodeName(value));
  const cityFields = make('div');
  const cityName = text(cityFields, 'Name ', (value) => handlers.cityName(value));
  const motif = select(cityFields, 'Motif ', MOTIFS, (value) => handlers.cityMotif(value));
  fields.append(nodeFields, cityFields);

  list.append(make('h2', 'Port city and nodes'));
  const rows = make('ol', '', 'slots');
  list.append(rows);
  let shownSites = '';
  let shownRows: { id: string; row: HTMLLIElement }[] = [];

  return {
    update(view: SitePanelView): void {
      nodeFields.hidden = view.tool !== 'node';
      nodeCaption.textContent = view.chosen ? `Node ${view.chosen}:` : 'The next node drawn:';
      show(kind, view.nodeKind);
      show(nodeName, view.nodeName);
      nodeName.placeholder = view.chosen ? '' : 'named after its id if left blank';
      cityFields.hidden = view.tool !== 'city' || !view.city;
      show(cityName, view.city?.name ?? '');
      show(motif, view.city?.motif ?? '');
      const sites = view.sites.map(({ id, name, kind: siteKind }) => `${id}\t${name}\t${siteKind}`).join('\n');
      if (sites !== shownSites) {
        shownSites = sites;
        shownRows = view.sites.map(({ id, name, kind: siteKind }) => {
          const row = make('li');
          const swatch = make('span', siteKind === 'city' ? '◆' : '', 'swatch');
          swatch.style.background = siteKind === 'city' ? '#fff1c2' : NODE_COLOURS[siteKind];
          row.append(
            swatch,
            make('span', name, 'name'),
            make('span', siteKind === 'city' ? 'port city' : siteKind, 'area'),
          );
          row.addEventListener('click', () => handlers.chooseSite(id));
          return { id, row };
        });
        rows.replaceChildren(...shownRows.map(({ row }) => row));
        if (view.sites.length === 0) rows.append(make('li', 'None yet.'));
      }
      const chosen = view.tool === 'city' ? view.sites.find((site) => site.kind === 'city')?.id : view.chosen;
      for (const { id, row } of shownRows) row.classList.toggle('active', id === chosen);
    },
  };
}

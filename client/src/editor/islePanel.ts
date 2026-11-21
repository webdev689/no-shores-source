// The World Editor's Islands panel: the island's seed and climate, the presses that step the seed and move the
// camera, and what the island and the last frame were.
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { chooser, heading, press, row, said, stacked, textField, words } from './panelKit.ts';

/** The seed's field, narrower than the panel's others, as a seed is at most 20 digits. */
const SEED_WIDTH = 153;

/** Everything the Islands panel shows. */
export interface IslePanelView {
  readonly seed: string;
  readonly climate: string;
  readonly climates: readonly string[];
  /** What the island is, or why none was built. */
  readonly status: string;
  /** What the last frame drew and where the camera stands. */
  readonly counts: string;
}

/** What the Islands panel's controls ask for. */
export interface IslePanelHandlers {
  /** A seed typed and handed over (Enter, or the focus leaving the field). */
  seed(text: string): void;
  climate(climate: string): void;
  /** Steps the seed on by one, or on to the next isle's. */
  step(isle: boolean): void;
  /** Moves the camera close over the middle, or 3 km off. */
  look(afar: boolean): void;
}

/** A control after its words, on a line of its own. */
const labelled = (label: string, control: Node): Node => ({
  gap: 4,
  alignY: 'center',
  children: [words(label), control],
});

/** The Islands panel's nodes. */
export function islePanel(ui: Interface, view: IslePanelView, handlers: IslePanelHandlers): Child[] {
  const seed = textField(ui, 'isle-seed', view.seed, (text) => handlers.seed(text), { width: SEED_WIDTH });
  const climate = chooser(
    ui,
    'isle-climate',
    view.climate,
    view.climates.map((each) => ({ value: each, words: each })),
  );
  if (climate.chosen !== view.climate) handlers.climate(climate.chosen);
  return stacked([
    { node: heading('Island'), top: 16, bottom: 6 },
    {
      node: {
        width: 'grow',
        direction: 'column',
        gap: 6,
        children: [labelled('Seed', seed), labelled('Climate', climate.node)],
      },
    },
    {
      node: row([
        press(ui, 'isle-next-seed', 'Next seed', () => handlers.step(false)),
        press(ui, 'isle-next-isle', 'Next isle', () => handlers.step(true)),
      ]),
    },
    {
      node: row([
        press(ui, 'isle-close', 'Close up', () => handlers.look(false)),
        press(ui, 'isle-afar', 'From 3 km', () => handlers.look(true)),
      ]),
    },
    said(view.status),
    said(view.counts),
    said('Drag to turn, right-drag to pan, wheel to zoom.'),
  ]);
}

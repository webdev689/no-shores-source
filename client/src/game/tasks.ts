// The task tracker: one window at the right of the view naming the quest the player is on, its task now, and the
// steps of it, each ticked off as it is met or counting what is left. A quest hands it data alone (`Quest`), so any
// quest after the prologue uses it as it is. It reads what the player does, never a press of its own, so it serves
// keys and touch alike.
import { TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import { cubicBezier } from '../ui/ease.ts';
import type { Node } from '../ui/node.ts';
import { edges, header, keycap } from './hudParts.ts';

/** One step of a task: its words, the keys that do it (each on a keycap), what is left of it, and whether it is met. */
export interface Step {
  readonly text: string;
  readonly keys?: readonly string[];
  readonly count?: number;
  readonly done?: boolean;
}

/** A quest as the tracker shows it: its name, the task now, and that task's steps. */
export interface Quest {
  readonly name: string;
  readonly task: string;
  readonly steps: readonly Step[];
}

/** The steps of `after` met since `before` showed them unmet, by their place: a step of a new task is never counted as
 *  just met, so a task begins without a flash. */
export function justMet(before: Quest | null, after: Quest | null): number[] {
  if (!before || !after || before.name !== after.name || before.task !== after.task) return [];
  return after.steps.flatMap((step, index) => {
    const was = before.steps.find((each) => each.text === step.text);
    return step.done && was && !was.done ? [index] : [];
  });
}

export class TaskTracker {
  private shown: Quest | null = null;
  private written = '';
  /** When the task now came (seconds), and when its steps just met were met. */
  private freshAt = Number.NEGATIVE_INFINITY;
  private metAt = Number.NEGATIVE_INFINITY;
  private met: number[] = [];

  /** Shows `quest`, or hides the tracker for none. Called every frame, it takes note only when the quest's words
   *  change; a new task slides in, and a step just met flashes as its box is ticked. */
  show(quest: Quest | null, now = performance.now() / 1000): void {
    const written = JSON.stringify(quest);
    if (written === this.written) return;
    this.written = written;
    const before = this.shown;
    const met = justMet(before, quest);
    const fresh = quest !== null && (this.shown?.task !== quest.task || this.shown.name !== quest.name);
    this.shown = quest;
    if (met.length > 0) [this.met, this.metAt] = [met, now];
    if (fresh) {
      this.freshAt = now;
      this.met = [];
      announce(`${quest.name}: ${quest.task}`);
    } else if (quest && before) {
      // As the page's status region told each change: a step met or its count changed.
      for (const step of quest.steps) {
        const was = before.steps.find((each) => each.text === step.text);
        if (was && was.done === step.done && was.count === step.count) continue;
        announce(`${step.text}${step.count === undefined ? '' : ` ${step.count}`}${step.done ? ', done' : ''}`);
      }
    }
  }

  /** The quest shown now, if any. */
  get quest(): Quest | null {
    return this.shown;
  }

  /** The tracker in a view `width` by `height` CSS pixels at `now` (seconds): at the right, under the place's name,
   *  its words a step larger where the view is 1500 by 900 or more; still when `still`. */
  node(view: { readonly width: number; readonly height: number }, now: number, still: boolean): Node | null {
    const quest = this.shown;
    if (!quest) return null;
    const big = view.width >= 1500 && view.height >= 900;
    const narrow = view.width <= 900;
    const size = big ? 2 : 1;
    const width = big ? 396 : narrow ? Math.min(264, view.width - 56) : 264;
    const top = narrow ? Math.max(0.32 * view.height, 220) : Math.max(0.24 * view.height, 168);
    const came = still ? 1 : cubicBezier(0.16, 1, 0.3, 1, Math.min(1, Math.max(0, (now - this.freshAt) / FRESH_S)));
    // Four hard steps from lit to settled, as `steps(4, end)` takes them.
    const flash = still ? 0 : 1 - Math.floor(Math.min(1, Math.max(0, (now - this.metAt) / MET_S)) * 4) / 4;
    return {
      role: 'window',
      direction: 'column',
      through: true,
      width,
      opacity: came,
      offset: [Math.round((1 - came) * 14), 0],
      float: { to: 'screen', at: [1, 0], anchor: [1, 0], x: -28, y: Math.round(top) },
      padding: 2,
      children: [
        {
          width: 'grow',
          padding: [4, 11, 3, 11],
          ...header(came),
          children: [{ text: { words: quest.name.toUpperCase(), size, colour: TONES.brassHi, tracking: 3 } }],
        },
        {
          width: 'grow',
          padding: [8, 11, 4, 11],
          children: [{ text: { words: quest.task, size: 2, colour: '#fbf8f0', balance: true } }],
        },
        quest.steps.length > 0 && {
          width: 'grow',
          direction: 'column',
          gap: 4,
          padding: [4, 11, 11, 11],
          children: quest.steps.map((step, index) => stepNode(step, size, this.met.includes(index) ? flash : 0)),
        },
      ],
    };
  }
}

/** How long a new task slides in, and a step just met flashes, seconds. */
const FRESH_S = 0.35;
const MET_S = 0.7;

/** A step's row: its box, ticked once met, its words, its keys and what is left of it; lit by `flash`, 1 to 0. */
function stepNode(step: Step, size: number, flash: number): Node {
  const box = size === 2 ? 16 : 11;
  const colour = flash > 0 ? '#fbf8f0' : step.done ? '#9a9079' : '#e2dccd';
  return {
    width: 'grow',
    gap: 6,
    alignY: 'center',
    minHeight: size === 2 ? 30 : 20,
    fill: flash > 0 ? `rgba(243,207,134,${(0.32 * flash).toFixed(3)})` : undefined,
    children: [
      step.done
        ? { width: box, height: box, fill: TONES.brass, draw: edges(BRASS_EDGE) }
        : { width: box, height: box, role: 'well', bevel: 1 },
      { padding: [0, 2, 0, 0], children: [{ text: { words: step.text, size, colour } }] },
      ...(step.keys ?? []).map((key) => keycap(key, size)),
      step.count !== undefined && { width: 'grow' },
      step.count !== undefined && { text: { words: String(step.count), size: 2, colour: TONES.brassHi, wrap: false } },
    ],
  };
}

/** A ticked box's brass bevel, a pixel deep. */
const BRASS_EDGE = {
  top: [1, '#f3cf86'],
  right: [1, '#7a5424'],
  bottom: [1, '#5c3f1a'],
  left: [1, '#c08a3e'],
} as const;

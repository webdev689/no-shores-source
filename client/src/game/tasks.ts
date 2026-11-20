// The task tracker: one window at the right of the view naming the quest the player is on, its task now, and the
// steps of it, each ticked off as it is met or counting what is left. A quest hands it data alone (`Quest`), so any
// quest after the prologue uses it as it is. It reads what the player does, never a press of its own, so it serves
// keys and touch alike.
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';

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
  private readonly root = make('section', '', `tasks ${ROLES.window}`);
  private readonly quest = make('div', '', `tasks-quest ${ROLES.header}`);
  private readonly task = make('div', '', 'tasks-task');
  private readonly steps = make('ul', '', 'tasks-steps');
  private shown: Quest | null = null;
  private written = '';

  constructor(parent: HTMLElement) {
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-label', 'Quest');
    this.root.append(this.quest, this.task, this.steps);
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Shows `quest`, or hides the tracker for none. Called every frame, it writes the page only when the quest's words
   *  change; a new task slides in, and a step just met flashes as its box is ticked. */
  show(quest: Quest | null): void {
    const written = JSON.stringify(quest);
    if (written === this.written) return;
    this.written = written;
    const met = justMet(this.shown, quest);
    const fresh = quest !== null && (this.shown?.task !== quest.task || this.shown.name !== quest.name);
    this.shown = quest;
    this.root.hidden = quest === null;
    if (!quest) return;
    this.quest.textContent = quest.name;
    this.task.textContent = quest.task;
    this.steps.hidden = quest.steps.length === 0;
    this.steps.replaceChildren(
      ...quest.steps.map((step, index) => {
        const row = make('li', '', `tasks-step${step.done ? ' done' : ''}${met.includes(index) ? ' met' : ''}`);
        row.append(make('span', '', `tasks-box ${ROLES.well}`), make('span', step.text, 'tasks-text'));
        for (const key of step.keys ?? []) row.append(make('kbd', key, 'gear-key'));
        if (step.count !== undefined) row.append(make('span', String(step.count), 'tasks-count'));
        return row;
      }),
    );
    if (fresh) {
      // Taken off and put back, so the slide plays again for each new task.
      this.root.classList.remove('fresh');
      void this.root.offsetWidth;
      this.root.classList.add('fresh');
    }
  }

  remove(): void {
    this.root.remove();
  }
}

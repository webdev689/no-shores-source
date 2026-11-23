// Work done a step at a time: a generator that yields between small steps, so a frame can take as many as its
// budget allows and leave the rest for the next, or run them all through at once. Either way it makes the same thing.

/** Runs steps through to their end in one go, and answers what they make. */
export function finished<Made>(steps: Generator<void, Made>): Made {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** Takes steps until they end or `budgetMs` has passed on `clock`, at least one: what they made once they end, or
 *  null while steps are left. */
export function stepWithin<Made>(
  steps: Generator<void, Made>,
  budgetMs: number,
  clock: () => number = () => performance.now(),
): { readonly made: Made } | null {
  const started = clock();
  do {
    const step = steps.next();
    if (step.done) return { made: step.value };
  } while (clock() - started < budgetMs);
  return null;
}

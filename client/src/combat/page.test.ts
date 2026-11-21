// What the display's tests share of the page: whether less motion is asked for.

/** Asks for reduced motion, or not, while `run` goes. */
export function withMotionReduced<Result>(reduced: boolean, run: () => Result): Result {
  const holder = globalThis as { matchMedia?: unknown };
  const was = holder.matchMedia;
  holder.matchMedia = () => ({ matches: reduced });
  try {
    return run();
  } finally {
    holder.matchMedia = was;
  }
}

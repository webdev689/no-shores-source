// A start-up that takes parts of the page and the GPU one at a time, and gives back all it took when it cannot finish,
// so a story that fails to begin leaves the game's page and GPU as they were before it.

/** Runs `build`, which hands `took` the way to give back each part as it takes it. If `build` throws, every part
 *  taken is given back, the last first, each even when one before it fails, and `build`'s own error goes on. */
export function takeOrGiveBack<Built>(build: (took: (giveBack: () => void) => void) => Built): Built {
  const taken: (() => void)[] = [];
  try {
    return build((giveBack) => taken.push(giveBack));
  } catch (error) {
    for (const giveBack of taken.reverse()) {
      try {
        giveBack();
      } catch (alsoFailed) {
        // The start-up's own failure is the one that says why; one in the giving back is only told.
        console.error('a part the story took could not be given back:', alsoFailed);
      }
    }
    throw error;
  }
}

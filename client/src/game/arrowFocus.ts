// The arrow keys' way round a screen of tiles, shared by the Art's, the Appearance and the keepers' screens: each
// arrow moves the focus to the tile nearest that way, favouring those straight on, as a gamepad's stick would.

/** Each arrow key's way across the screen, right and down. */
export const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The control nearest `from` the way an arrow points, favouring those straight on; null if none lies that way. */
export function nearest(
  from: HTMLElement,
  among: readonly HTMLElement[],
  [right, down]: readonly [number, number],
): HTMLElement | null {
  const centre = (node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2] as const;
  };
  const [fromX, fromY] = centre(from);
  let best: { node: HTMLElement; score: number } | null = null;
  for (const node of among) {
    const [nodeX, nodeY] = centre(node);
    const along = (nodeX - fromX) * right + (nodeY - fromY) * down;
    const across = Math.abs((nodeX - fromX) * down - (nodeY - fromY) * right);
    const score = along + across * 2;
    if (node !== from && along > 1 && (!best || score < best.score)) best = { node, score };
  }
  return best?.node ?? null;
}

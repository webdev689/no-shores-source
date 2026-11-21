// The interface's layers: each part of the interface (the HUD, the fight's plates, a screen) adds a layer, a function
// of the interface answering its nodes each frame; every layer is drawn over the whole view, later layers over earlier
// ones, so no part lays itself out against another.
import type { Child, Node } from './node.ts';
import type { Interface } from './ui.ts';

/** A part of the interface: its nodes this frame, or nothing. */
export type Layer = (ui: Interface) => Child;

export class Stack {
  private readonly layers: Layer[] = [];

  /** Adds `layer` over those added before it; answers what takes it away again. */
  add(layer: Layer): () => void {
    this.layers.push(layer);
    return () => {
      const index = this.layers.indexOf(layer);
      if (index >= 0) this.layers.splice(index, 1);
    };
  }

  /** Adds `layer` under every layer, as a display over the world stands under the game's own windows; answers what
   *  takes it away again. */
  under(layer: Layer): () => void {
    this.layers.unshift(layer);
    return () => {
      const index = this.layers.indexOf(layer);
      if (index >= 0) this.layers.splice(index, 1);
    };
  }

  /** The whole interface this frame: each layer over the whole view. */
  node(ui: Interface): Node {
    return {
      width: 'grow',
      height: 'grow',
      children: this.layers.map((layer) => {
        const shown = layer(ui);
        return shown && { width: 'grow', height: 'grow', float: { to: 'screen' }, children: [shown] };
      }),
    };
  }
}

// The words the editor lays over its views (the names of places, a ruler's length, a reference's name), laid by the
// interface in the face: each a node set against the screen with its baseline where the view put it.
import type { Node } from '../ui/node.ts';
import { baselineOf } from '../ui/text.ts';

/** A name over a view: its baseline's point, CSS pixels of the view, centred there or starting there, ringed by a dark
 *  halo unless `halo` is null. */
export interface Label {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly colour: string;
  readonly anchor?: 'start' | 'middle';
  readonly halo?: string | null;
}

/** `label` as a node over the screen, the view `left` of the interface's pixels in from the screen's edge, `inward` of
 *  them a CSS pixel; the pointer passes it. */
export function labelNode(label: Label, left: number, inward: number): Node {
  return {
    float: {
      to: 'screen',
      anchor: [label.anchor === 'start' ? 0 : 0.5, 0],
      x: left + label.x * inward,
      y: label.y * inward + 1 - baselineOf(1),
    },
    through: true,
    text: {
      words: label.text,
      colour: label.colour,
      wrap: false,
      ...(label.halo === null
        ? {}
        : {
            edge: 'halo',
            edgeColour: label.halo ?? 'rgba(0, 0, 0, 0.667)',
          }),
    },
  };
}

/** `node`, whose pieces float against the screen, laid over the view instead, in the view's own box: `width` by
 *  `height` CSS pixels, `left` of the interface's pixels in from the screen's edge, `inward` of them a CSS pixel; the
 *  pointer passes it. Its pieces stand over what else floats over the view (names, plates). */
export const inView = (node: Node, left: number, width: number, height: number, inward: number): Node => ({
  float: { to: 'screen', x: left },
  width: width * inward,
  height: height * inward,
  through: true,
  children: [
    {
      ...node,
      children: node.children?.map((child) =>
        child && child.float ? { ...child, float: { ...child.float, to: 'parent', z: undefined } } : child,
      ),
    },
  ],
});

/** `node`, set against the view's corner in CSS pixels, set against the screen's: the view `left` of the interface's
 *  pixels in from its edge, `inward` of them a CSS pixel. */
export const onScreen = (node: Node, left: number, inward: number): Node => ({
  ...node,
  float: {
    ...node.float,
    to: 'screen',
    x: left + (node.float?.x ?? 0) * inward,
    y: (node.float?.y ?? 0) * inward,
  },
});

// The interface as a tree of plain nodes, built afresh each frame and laid out by `layout.ts`: each node a box that
// sizes to its content, a fixed size, a share of its parent or what room is left, lays its children in a row or a
// column, and shows a paint, words or a picture. Lengths are CSS pixels; the renderer draws each at the interface's
// whole scale. Nothing here touches a page, so the tree is built wherever the game runs.
import type { PaintedRole, State } from './paint.ts';
import type { Box } from './quads.ts';
import type { UiRenderer } from './uiRenderer.ts';

/** How long a side is: fixed pixels, as its content needs (`fit`), all the room left (`grow`), or a share of the
 *  parent's room (`'50%'`). */
export type Size = number | 'fit' | 'grow' | `${number}%`;

/** Where children stand along a side with room to spare. */
export type Align = 'start' | 'center' | 'end';

/** Padding as CSS writes it: all sides, vertical and horizontal, or top, right, bottom, left. */
export type Padding = number | readonly [number, number] | readonly [number, number, number, number];

/** A run of words in a colour of its own, inside a text. */
export interface Span {
  readonly words: string;
  readonly colour?: string;
}

/** Words shown in the face: at `size` steps of its 11 px grid, wrapped to the box unless `wrap` is false. */
export interface Text {
  readonly words: string | readonly Span[];
  readonly size?: number;
  readonly colour?: string;
  /** A hard shadow a step down and right (`shadow`), or a step all round (`halo`), as the sheets write them. */
  readonly edge?: 'shadow' | 'halo';
  readonly edgeColour?: string;
  readonly wrap?: boolean;
  /** Kept to one line, cut short with '...' where it does not fit, as CSS's `text-overflow: ellipsis`. */
  readonly ellipsis?: boolean;
  /** A letter's spacing in 22nds of the size, 1 unless said, as a sheet's `letter-spacing: calc(3em / 22)` writes 3. */
  readonly tracking?: number;
  /** Wrapped lines are evened in length, as CSS's `text-wrap: balance` evens them. */
  readonly balance?: boolean;
  readonly align?: Align;
}

/** Where a picture's pixels come from: a file, SVG markup, RGBA pixels at its size, 2D drawing at its size, or a
 *  live image whose `version` says when it changed. */
export type PictureSource =
  | { readonly url: string }
  | { readonly svg: string }
  | { readonly pixels: () => Uint8Array }
  | { readonly draw: (context: OffscreenCanvasRenderingContext2D, width: number, height: number) => void }
  | { readonly image: ImageBitmap | OffscreenCanvas | HTMLCanvasElement; readonly version: number };

/** A picture: one `key` for one look, drawn `width` by `height` pixels. `pixel` keeps its own texels, each a whole
 *  block of screen pixels, as pixel art wants; otherwise it is drawn at the screen's own pixels, smoothed. */
export interface Picture {
  readonly key: string;
  readonly source: PictureSource;
  readonly pixel?: { readonly width: number; readonly height: number };
  readonly tint?: string;
  /** Turned this many degrees clockwise about its middle. */
  readonly turn?: number;
}

/** A node lifted out of its parent's flow and set against its parent or the screen: its own point at `anchor` (0 to
 *  1 across and down) put on the target's point at `at`, moved by `x`, `y`; drawn and hit over lower `z`. */
export interface Float {
  readonly to?: 'parent' | 'screen';
  readonly anchor?: readonly [number, number];
  readonly at?: readonly [number, number];
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  /** Clipped as its parent's children are; otherwise it shows past them, as a tooltip does. */
  readonly clipped?: boolean;
}

/** A text field: what shows while it is empty, and whether its words are hidden. */
export interface Field {
  readonly placeholder?: string;
  readonly secret?: boolean;
  readonly size?: number;
  readonly most?: number;
}

/** Draws inside a node's box, for what boxes and words cannot say: a bar's strips, a dial's ticks. `box` is in device
 *  pixels, at `scale` device pixels a CSS pixel. */
export type Drawing = (ui: UiRenderer, box: Box, scale: number, clip: Box) => void;

/** One node of the interface. */
export interface Node {
  /** Names it across frames: for hits, focus, its scroll and its age. Unique in a frame. */
  readonly id?: string;
  readonly width?: Size;
  readonly height?: Size;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly direction?: 'row' | 'column';
  readonly gap?: number;
  readonly padding?: Padding;
  readonly alignX?: Align;
  readonly alignY?: Align;
  /** A row's children run on into more lines when they reach its end. */
  readonly wrap?: boolean;
  readonly children?: readonly Child[];
  readonly text?: Text;
  readonly picture?: Picture;
  /** Painted as the kit's role, in the state its presses give it unless `state` says. */
  readonly role?: PaintedRole;
  readonly state?: State;
  /** The role's bevel depth, 2 unless said. */
  readonly bevel?: number;
  readonly fill?: string;
  readonly outline?: { readonly width: number; readonly colour: string };
  readonly opacity?: number;
  /** Drawn moved by this much, its room left where it was, as CSS's `transform: translate` does. */
  readonly offset?: readonly [number, number];
  readonly clip?: boolean;
  /** Its children scroll up and down inside it, clipped. */
  readonly scroll?: boolean;
  readonly float?: Float;
  /** Pressed by the pointer, Enter, Space or the pad's A; focusable. */
  readonly press?: boolean;
  readonly focusable?: boolean;
  readonly disabled?: boolean;
  readonly field?: Field;
  /** What a screen reader hears when it takes focus. */
  readonly label?: string;
  /** Keys it takes itself while focused (a slider's arrows), not moving focus: read with `keysOn`. */
  readonly keys?: readonly string[];
  /** Takes the pointer even with nothing to press, so a click on it does not fall through to the world. */
  readonly solid?: boolean;
  /** Lets the pointer through, it and all it holds, to what lies under it, as words laid over the world do: nothing
   *  in it is pressed, hovered or scrolled. */
  readonly through?: boolean;
  readonly draw?: Drawing;
}

/** A child as a component writes it: a node, or nothing (`null`, `undefined` or `false`) for one not shown. */
export type Child = Node | null | undefined | false;

/** A node as laid: its box and the box it is clipped to, in CSS pixels, its draw order, its words broken into lines,
 *  how faded it is with its parents' opacity, and its parent; for a scrolled node, the height of what it holds. */
export interface Laid {
  readonly node: Node;
  readonly box: Box;
  readonly clip: Box;
  readonly z: number;
  readonly lines: readonly (readonly Span[])[];
  readonly content: number;
  readonly fade: number;
  readonly parent: Laid | null;
}

// What the interface hears and hands back, as plain data: the page's input (`canvasEvents.ts`, or a worker's relay)
// as events, and the field being typed in, for the page's typing.
import type { FieldState } from './field.ts';
import type { Laid } from './node.ts';
import type { Box } from './quads.ts';

/** A pad's button as a window hears it: the cross, A, B, the bumpers (which turn a window's tabs), Y (the right
 *  button at the pad's cursor) and X (a press there with Shift). */
export type PadButton =
  'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'previous' | 'next' | 'secondary' | 'quick';

/** One happening the interface hears: the pointer moved, left, pressed or let go a button (with Shift held, to grow a
 *  field's selection), or turned the wheel (the page's CSS pixels on the canvas); a key; words typed or pasted; the
 *  browser's typing replacing words (`EditContext`, its key already done when `typed`); a pad's button pressed, or A
 *  let go (`up`); or the pad's sticks, the left's lean each way and the right's down, as they lean and once at rest. */
export type UiEvent =
  | {
      readonly kind: 'pointer';
      readonly x: number;
      readonly y: number;
      /** Not the mouse moving: the page's own move as the pointer is let go, or one that went nowhere. */
      readonly still?: boolean;
    }
  | { readonly kind: 'leave' }
  | {
      readonly kind: 'down' | 'up';
      readonly x: number;
      readonly y: number;
      readonly button: number;
      /** Pressed by a finger or a pen, not a mouse. */
      readonly touch?: boolean;
      readonly shift?: boolean;
    }
  | { readonly kind: 'wheel'; readonly x: number; readonly y: number; readonly dy: number }
  | {
      readonly kind: 'key';
      readonly key: string;
      readonly shift?: boolean;
      readonly ctrl?: boolean;
      readonly typed?: boolean;
    }
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'edit';
      readonly from: number;
      readonly to: number;
      readonly text: string;
      readonly caret: number;
      readonly anchor: number;
    }
  | { readonly kind: 'pad'; readonly button: PadButton; readonly up?: boolean }
  | { readonly kind: 'stick'; readonly x: number; readonly y: number; readonly scroll: number };

/** The field being typed in, for the page's typing: its words, caret and selection, and its box in the page's CSS
 *  pixels. */
export interface Typing {
  readonly id: string;
  readonly state: FieldState;
  readonly secret: boolean;
  readonly box: Box;
  /** Typed on the keys the game draws, not the page's own typing. */
  readonly onScreen?: boolean;
}

/** Field `laid`, holding `state`, as the page's typing reads it: its box in the page's CSS pixels, `inward` the
 *  interface's pixels a CSS pixel. */
export function typingOf(laid: Laid, state: FieldState, inward: number, onScreen: boolean): Typing {
  const { x, y, width, height } = laid.box;
  const box = { x: x / inward, y: y / inward, width: width / inward, height: height / inward };
  return { id: laid.node.id ?? '', state, secret: Boolean(laid.node.field?.secret), box, onScreen };
}

// What the interface hears and hands back, as plain data: the page's input (`canvasEvents.ts`, or a worker's relay)
// as events, and the field being typed in, for the page's typing.
import type { FieldState } from './field.ts';
import type { Box } from './quads.ts';

/** One happening the interface hears: the pointer moved, left, pressed or let go a button (with Shift held, to grow a
 *  field's selection), or turned the wheel (the page's CSS pixels on the canvas); a key; words typed or pasted; the
 *  browser's typing replacing words (`EditContext`, its key already done when `typed`); or a pad's button. */
export type UiEvent =
  | { readonly kind: 'pointer'; readonly x: number; readonly y: number }
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
  | { readonly kind: 'pad'; readonly button: 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' };

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

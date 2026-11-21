// What the page and the game's worker say to each other (`pageHost.ts` on the page, `pageAway.ts` in the worker): the
// page hands over its canvas, its storage, its address, its size and what the player does; the worker asks for what
// only a page can do.
import type { KeptSignIn } from '../ui/page.ts';
import type { Typing, UiEvent } from '../ui/ui.ts';
import type { AudioOp, AudioReply } from './audioOps.ts';

/** The canvas on the page: its size and place in CSS pixels, and device pixels a CSS pixel. */
export interface View {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly ratio: number;
}

/** Where on the canvas the pointer is, as the page's interface input last heard it; null off it. */
export type Pointer = { readonly x: number; readonly y: number } | null;

/** The queries the game asks of the page's media, answered at the start and as they change. */
export const MEDIA = ['(prefers-reduced-motion: reduce)', '(pointer: coarse)'] as const;

/** Every event the game listens for, heard on the page and sent on as it comes. */
export const HEARD = [
  'keydown',
  'keyup',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'lostpointercapture',
  'mousedown',
  'mouseup',
  'mousemove',
  'auxclick',
  'click',
  'contextmenu',
  'wheel',
  'blur',
  'pagehide',
] as const;

/** What of an event the game reads, where the event has it. */
export const EVENT_FIELDS = [
  'key',
  'code',
  'repeat',
  'isComposing',
  'shiftKey',
  'ctrlKey',
  'altKey',
  'metaKey',
  'button',
  'buttons',
  'clientX',
  'clientY',
  'offsetX',
  'offsetY',
  'movementX',
  'movementY',
  'deltaX',
  'deltaY',
  'deltaZ',
  'deltaMode',
  'pointerId',
  'pointerType',
  'isPrimary',
  'detail',
] as const;

/** A pad as the page's Gamepad API read it this frame, for the game's worker, which has no Gamepad API of its own. */
export interface PadRead {
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

/** The hooks the game puts out for a tool taking pictures of it (`game/qaViews.ts`), reached from the page. */
export const QA_HOOKS = ['__qaView', '__qaWhere'] as const;

export interface Start {
  readonly kind: 'start';
  readonly canvas: OffscreenCanvas;
  readonly href: string;
  readonly local: readonly (readonly [string, string])[];
  readonly session: readonly (readonly [string, string])[];
  readonly view: View;
  readonly media: Readonly<Record<string, boolean>>;
  readonly hidden: boolean;
}

/** From the page to the game. */
export type ToGame =
  | Start
  | { readonly kind: 'view'; readonly view: View }
  | { readonly kind: 'media'; readonly query: string; readonly matches: boolean }
  | {
      readonly kind: 'event';
      /** Where on the page it happened: on the canvas, elsewhere in the page (the body), or to the window itself. */
      readonly on: 'canvas' | 'page' | 'window';
      readonly type: string;
      readonly fields: Readonly<Record<string, unknown>>;
      readonly pointer: Pointer;
    }
  | { readonly kind: 'ui'; readonly events: readonly UiEvent[]; readonly pointer: Pointer }
  | { readonly kind: 'lock'; readonly locked: boolean }
  | { readonly kind: 'hidden'; readonly hidden: boolean }
  | { readonly kind: 'audio'; readonly reply: AudioReply }
  | { readonly kind: 'svg'; readonly id: number; readonly picture: ImageBitmap | null }
  | { readonly kind: 'tick' }
  /** The pads as the page read them this frame, sent each frame while one is connected and once as the last goes. */
  | { readonly kind: 'pads'; readonly pads: readonly PadRead[] }
  /** The browser's answer: the sign-in it keeps, or null with none or once one offered is taken. */
  | { readonly kind: 'signIn'; readonly id: number; readonly kept: KeptSignIn | null }
  /** A tool driving the page asks one of the game's hooks for pictures (`QA_HOOKS`). */
  | { readonly kind: 'qa'; readonly id: number; readonly hook: string; readonly args: readonly unknown[] };

/** From the game to the page. */
export type ToPage =
  | { readonly kind: 'audio'; readonly ops: readonly AudioOp[] }
  | {
      readonly kind: 'store';
      readonly area: 'local' | 'session';
      /** Null clears the whole area. */
      readonly key: string | null;
      /** Null removes the key. */
      readonly value: string | null;
    }
  | {
      readonly kind: 'go';
      readonly how: 'reload' | 'assign' | 'replace' | 'open' | 'replaceState' | 'pushState';
      readonly url: string;
    }
  | { readonly kind: 'lock'; readonly locked: boolean }
  | { readonly kind: 'capture'; readonly pointer: number; readonly held: boolean }
  | { readonly kind: 'focus' }
  | { readonly kind: 'sync'; readonly typing: Typing | null; readonly cursor: string }
  | { readonly kind: 'touch'; readonly held: boolean }
  | { readonly kind: 'say'; readonly words: string }
  | { readonly kind: 'svg'; readonly id: number; readonly svg: string; readonly width: number; readonly height: number }
  /** The worker has no frames of its own: the page sends a tick each of its frames. */
  | { readonly kind: 'ticks' }
  | { readonly kind: 'qa'; readonly id: number; readonly answer: unknown }
  /** A sign-in to offer the browser to keep, or, with none, the one it keeps asked for. */
  | { readonly kind: 'signIn'; readonly id: number; readonly keep: KeptSignIn | null }
  /** The game has started: an error after this is the game's to bear, not a reason to stop the page. */
  | { readonly kind: 'started' }
  | { readonly kind: 'stopped'; readonly message: string };

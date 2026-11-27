// What a cutscene lays over the picture: a fade to black or white, the letterbox's bars, a flash, a darkening for
// waking, an insert held over the view, the game's title and a prompt that breathes, drawn by the game as a layer of
// its interface over every other;
// and a blur on the view, which the scene draws into its own picture under the interface (game/blur.ts). Each eases by
// its own time as the page's transitions eased, but the darkening and the blur, which the story drives frame by frame.
// While it stands, a touch on the view is the story's alone: no drag pans the page or pulls it to reload, so a held
// touch is never cut short.
import { motionReduced } from '../plus/kit.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node, PictureSource } from '../ui/node.ts';
import { touchesHeld } from '../ui/page.ts';
import type { Layer, Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { ease } from '../ui/ease.ts';
import { breath, dropped, Eased, pageClock, ruleOf } from './cinemaParts.ts';
import { loadingNode, logoNode, logoScale } from './logo.ts';

/** The title as the screen shows it. */
export const TITLE = 'No Shores';

/** Whether the page is played by touch, so its prompts say tap and hold rather than name keys. */
export const playedByTouch = (): boolean => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** How the screen stands over every other layer of the interface, the HUD's and the menu's. */
export const SCREEN_Z = 30;
const BLACK = '#020305';
const WHITE = '#f4f1ea';
const TITLE_RULE = ruleOf('cinema rule', [
  [0.18, '#b8975a'],
  [0.5, '#e9d8a6'],
  [0.82, '#b8975a'],
]);

/** What an insert shows: its look's key, what it is to a screen reader, and its drawing at the size it is laid. */
export interface Insert {
  readonly key: string;
  readonly label: string;
  readonly draw: Extract<PictureSource, { draw: unknown }>['draw'];
}

/** The screen's layers, drawn as a layer of `stack` over the game's interface. */
export class Screen {
  private readonly canvas: HTMLCanvasElement;
  private readonly clock: () => number;
  private readonly black = new Eased(0);
  private readonly white = new Eased(0);
  private readonly barred = new Eased(0);
  private readonly titled = new Eased(0);
  private readonly prompted = new Eased(0);
  private readonly skipShown = new Eased(0, ease);
  private readonly loading = new Eased(0);
  private readonly inserted = new Eased(0);
  private insert: Insert | null = null;
  private dark = 0;
  private blurred = 0;
  private prompt = '';
  private skipShare = 0;
  private readonly touched: boolean;
  private skipKey = 'Space';
  private readonly removeLayer: () => void;

  constructor(stack: Stack, canvas: HTMLCanvasElement, clock: () => number = pageClock) {
    this.canvas = canvas;
    this.clock = clock;
    this.touched = playedByTouch();
    touchesHeld(canvas, true);
    const layer: Layer = (ui) => this.node(ui);
    this.removeLayer = stack.add(layer);
  }

  /** Fades to black (or white) at `opacity` over `seconds`. */
  fade(opacity: number, seconds: number, colour: 'black' | 'white' = 'black'): void {
    const veil = colour === 'black' ? this.black : this.white;
    veil.set(Math.min(1, Math.max(0, opacity)), seconds, this.clock());
  }

  /** A white flash: up at once and seen whole for a frame, then down over `seconds`. */
  flash(seconds: number): void {
    const now = this.clock();
    this.white.set(1, 0, now);
    this.white.set(0, seconds, now, 1 / 60);
  }

  /** The letterbox's bars, in or out. */
  bars(shown: boolean): void {
    this.barred.set(shown ? 1 : 0, motionReduced() ? 0 : 1.2, this.clock());
  }

  /** The view darkened, 0 clear to 1 black, as the story sets it each frame for a waking: under the fades. */
  darken(dark: number): void {
    this.dark = Math.min(1, Math.max(0, dark));
  }

  /** The view blurred by `pixels`, as eyes that cannot yet focus see it. */
  blur(pixels: number): void {
    this.blurred = Math.max(0, pixels);
  }

  /** How far the view is blurred now, CSS pixels: the scene draws it into its picture. */
  get blurPixels(): number {
    return this.blurred > 0.05 ? this.blurred : 0;
  }

  /** The game's title over the view, or not. */
  showTitle(shown: boolean): void {
    this.titled.set(shown ? 1 : 0, 2.4, this.clock());
  }

  /** An insert held over the middle of the view, as a film cuts to a chart or a letter, or none. */
  showInsert(insert: Insert | null): void {
    if (insert) this.insert = insert;
    this.inserted.set(insert ? 1 : 0, 0.6, this.clock());
  }

  /** A prompt that breathes under the title, or none. */
  showPrompt(text: string | null): void {
    if (text !== null) this.prompt = text;
    this.prompted.set(text === null ? 0 : 1, 0.8, this.clock());
  }

  /** The skip's hint, faint while a cutscene can be skipped and bright while the hold fills its `share`, naming the
   *  `key` held for it; null hides it where there is nothing to skip. */
  showSkip(share: number | null, key = this.skipKey): void {
    this.skipShare = share ?? 0;
    this.skipKey = key;
    this.skipShown.set(share === null ? 0 : share > 0 ? 0.9 : 0.45, 0.4, this.clock(), 0);
  }

  /** The logo and a breathing "Loading" over the black, while the next scene is still coming, or not. */
  showLoading(shown: boolean): void {
    const target = shown ? 1 : 0;
    if (this.loading.target === target) return;
    this.loading.set(target, 0.4, this.clock());
    // Drawn, not written into the page: a screen reader is told as it shows.
    if (shown) announce('Loading');
  }

  /** Lets every layer go: the view back as it was. */
  clear(): void {
    this.fade(0, 0.6);
    this.fade(0, 0.6, 'white');
    this.bars(false);
    this.darken(0);
    this.blur(0);
    this.showTitle(false);
    this.showInsert(null);
    this.showPrompt(null);
    this.showSkip(null);
    this.showLoading(false);
  }

  /** Takes the screen away, giving the canvas back its own touches. */
  remove(): void {
    this.blur(0);
    touchesHeld(this.canvas, false);
    this.removeLayer();
  }

  /** The screen this frame, over the whole view. */
  node(ui: Interface): Node {
    const now = this.clock();
    const { width, height } = ui.size;
    const still = motionReduced();
    const barTall = Math.round(height * 0.11);
    const barred = this.barred.value(now);
    const bar = (top: boolean): Child =>
      barred > 0 && {
        width,
        height: barTall,
        fill: BLACK,
        float: {
          to: 'screen',
          at: [0, top ? 0 : 1],
          anchor: [0, top ? 0 : 1],
          y: Math.round((top ? -1 : 1) * (1 - barred) * barTall),
        },
      };
    const veil = (eased: Eased, colour: string): Child => {
      const shown = eased.value(now);
      return shown > 0 && { width, height, fill: colour, opacity: shown, float: { to: 'screen' } };
    };
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      clip: true,
      float: { to: 'screen', z: SCREEN_Z },
      children: [
        bar(true),
        bar(false),
        this.dark > 0 && { id: 'cinema-dark', width, height, fill: BLACK, opacity: this.dark, float: { to: 'screen' } },
        this.insetNode(width, height, now),
        this.titleNode(width, height, now),
        this.promptNode(width, height, now, still),
        this.skipNode(now),
        veil(this.white, WHITE),
        veil(this.black, BLACK),
        this.loadingNode(width, height, now, still),
      ],
    };
  }

  private loadingNode(width: number, height: number, now: number, still: boolean): Child {
    const shown = this.loading.value(now);
    if (shown <= 0) return null;
    return {
      width,
      height,
      alignX: 'center',
      alignY: 'center',
      opacity: shown,
      label: 'Loading',
      float: { to: 'screen' },
      children: [loadingNode(width, now, still)],
    };
  }

  /** The insert, three wide to two tall, across 60% of the view's width or height at most, in its middle. */
  private insetNode(width: number, height: number, now: number): Child {
    const [shown, insert] = [this.inserted.value(now), this.insert];
    if (shown <= 0 || !insert) return null;
    const wide = Math.round(Math.min(640, width * 0.6, height * 0.9));
    const tall = Math.round((wide * 2) / 3);
    return {
      id: 'cinema-insert',
      width: wide,
      height: tall,
      opacity: shown,
      label: insert.label,
      float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5] },
      picture: { key: `${insert.key} ${wide}x${tall}`, source: { draw: insert.draw } },
    };
  }

  private titleNode(width: number, height: number, now: number): Child {
    const shown = this.titled.value(now);
    if (shown <= 0) return null;
    return {
      width,
      direction: 'column',
      alignX: 'center',
      gap: 22,
      opacity: shown,
      label: TITLE,
      float: { to: 'screen', y: Math.round(height * 0.3) },
      children: [
        // The logo across half the view at most, three times its cells at most.
        logoNode(logoScale(width * 0.5, 3)),
        { width: Math.min(440, Math.round(width * 0.7)), height: 4, picture: TITLE_RULE },
      ],
    };
  }

  private promptNode(width: number, height: number, now: number, still: boolean): Child {
    const shown = this.prompted.value(now);
    if (shown <= 0 || this.prompt === '') return null;
    const breathing = still || this.prompted.target === 0 ? 1 : breath(now);
    return {
      width,
      alignX: 'center',
      opacity: shown * breathing,
      float: { to: 'screen', anchor: [0, 1], at: [0, 1], y: -Math.round(height * 0.18) },
      children: [
        dropped({ words: this.prompt.toUpperCase(), size: 2, colour: '#efe6cf', tracking: 5, wrap: false }, '#000', 2),
      ],
    };
  }

  private skipNode(now: number): Child {
    const shown = this.skipShown.value(now);
    if (shown <= 0) return null;
    return {
      direction: 'column',
      gap: 6,
      opacity: shown,
      float: { to: 'screen', anchor: [1, 1], at: [1, 1], x: -33, y: -33 },
      children: [
        dropped(
          {
            words: (this.touched ? 'Hold to skip' : `Hold ${this.skipKey} to skip`).toUpperCase(),
            size: 1,
            colour: '#efe6cf',
            tracking: 2,
            wrap: false,
          },
          '#000',
          1,
        ),
        {
          width: 'grow',
          height: 2,
          children: [
            this.skipShare > 0 && { width: `${Math.round(this.skipShare * 100)}%`, height: 2, fill: '#e9d8a6' },
          ],
        },
      ],
    };
  }
}

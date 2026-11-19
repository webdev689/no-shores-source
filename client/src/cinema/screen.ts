// What a cutscene lays over the picture: a fade to black or white, the letterbox's bars, a flash, eyelids for waking,
// a blur on the view, the game's title and a prompt that breathes. Plain elements over the canvas; each eases by its
// own transition, so the page never steps them frame by frame except the eyelids and the blur, which the story drives.

const STYLE_ID = 'cinema-screen';

/** The title as the screen shows it. */
export const TITLE = 'Overlook';

function screenCss(): string {
  return `
.cinema { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 30; }
.cinema-veil { position: absolute; inset: 0; opacity: 0; transition-property: opacity; transition-timing-function: ease-in-out; }
.cinema-black { background: #020305; }
.cinema-white { background: #f4f1ea; }
.cinema-bar { position: absolute; left: 0; right: 0; height: 11vh; background: #020305;
  transition: transform 1.2s ease-in-out; }
.cinema-bar.top { top: 0; transform: translateY(-100%); }
.cinema-bar.bottom { bottom: 0; transform: translateY(100%); }
.cinema.barred .cinema-bar { transform: none; }
.cinema-lid { position: absolute; left: -5%; right: -5%; height: 52%; background: #050403; }
.cinema-lid.top { top: 0; border-radius: 0 0 50% 50% / 0 0 22% 22%; }
.cinema-lid.bottom { bottom: 0; border-radius: 50% 50% 0 0 / 22% 22% 0 0; }
.cinema-title { position: absolute; left: 0; right: 0; top: 30%; text-align: center; opacity: 0;
  transition: opacity 2.4s ease-in-out; }
.cinema-title.shown { opacity: 1; }
.cinema-name { display: inline-block; font-size: 99px; line-height: 1; letter-spacing: round(up, calc(8em / 22), 1px);
  text-transform: uppercase; color: #e9d8a6;
  text-shadow: 0 4px 0 #3a2c14, 0 0 22px rgba(0, 0, 0, 0.85), 0 0 4px rgba(0, 0, 0, 0.9); }
.cinema-rule { width: 440px; max-width: 70vw; height: 4px; margin: 22px auto 0;
  background: linear-gradient(90deg, transparent, #b8975a 18%, #e9d8a6 50%, #b8975a 82%, transparent); }
.cinema-prompt { position: absolute; left: 0; right: 0; bottom: 18%; text-align: center; font-size: 22px;
  letter-spacing: round(up, calc(5em / 22), 1px); text-transform: uppercase; color: #efe6cf; opacity: 0;
  text-shadow: 0 2px 0 #000, 0 0 11px rgba(0, 0, 0, 0.9); transition: opacity 0.8s ease-in-out; }
.cinema-prompt.shown { opacity: 1; animation: cinema-breathe 2.2s ease-in-out infinite; }
@keyframes cinema-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.cinema-skip { position: absolute; right: 33px; bottom: 33px; font-size: 11px; letter-spacing: 1px; color: #efe6cf;
  text-transform: uppercase; opacity: 0; transition: opacity 0.4s; text-shadow: 0 1px 0 #000; }
.cinema-skip.shown { opacity: 0.85; }
.cinema-skip i { display: block; height: 2px; margin-top: 6px; background: #e9d8a6; transform-origin: left;
  transform: scaleX(0); }
@media (max-width: 900px) { .cinema-name { font-size: 66px; } }
@media (prefers-reduced-motion: reduce) {
  .cinema-prompt.shown { animation: none; }
  .cinema-bar { transition: none; }
}
`;
}

function made(page: Document, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const element = page.createElement('div');
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

/** The screen's layers over a canvas, laid into `root`. */
export class Screen {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLElement;
  private readonly black: HTMLElement;
  private readonly white: HTMLElement;
  private readonly lidTop: HTMLElement;
  private readonly lidBottom: HTMLElement;
  private readonly title: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly skip: HTMLElement;
  private readonly skipFill: HTMLElement;

  constructor(root: HTMLElement, canvas: HTMLElement) {
    const page = root.ownerDocument;
    if (!page.getElementById(STYLE_ID)) {
      const sheet = page.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = screenCss();
      page.head.append(sheet);
    }
    this.canvas = canvas;
    this.root = made(page, 'cinema', root);
    made(page, 'cinema-bar top', this.root);
    made(page, 'cinema-bar bottom', this.root);
    this.lidTop = made(page, 'cinema-lid top', this.root);
    this.lidBottom = made(page, 'cinema-lid bottom', this.root);
    this.title = made(page, 'cinema-title', this.root);
    made(page, 'cinema-name', this.title, TITLE);
    made(page, 'cinema-rule', this.title);
    this.prompt = made(page, 'cinema-prompt', this.root);
    this.skip = made(page, 'cinema-skip', this.root, 'Hold Space to skip');
    this.skipFill = page.createElement('i');
    this.skip.append(this.skipFill);
    this.white = made(page, 'cinema-veil cinema-white', this.root);
    this.black = made(page, 'cinema-veil cinema-black', this.root);
    this.lids(0);
  }

  /** Fades to black (or white) at `opacity` over `seconds`. */
  fade(opacity: number, seconds: number, colour: 'black' | 'white' = 'black'): void {
    const veil = colour === 'black' ? this.black : this.white;
    veil.style.transitionDuration = `${Math.max(0, seconds)}s`;
    veil.style.opacity = String(Math.min(1, Math.max(0, opacity)));
  }

  /** A white flash: up at once, then down over `seconds`. */
  flash(seconds: number): void {
    this.fade(1, 0, 'white');
    // The next frame's change starts the fade, so the white is seen whole first.
    requestAnimationFrame(() => this.fade(0, seconds, 'white'));
  }

  /** The letterbox's bars, in or out. */
  bars(on: boolean): void {
    this.root.classList.toggle('barred', on);
  }

  /** The eyelids, 0 open to 1 shut. */
  lids(shut: number): void {
    const share = Math.min(1, Math.max(0, shut));
    this.lidTop.style.transform = `translateY(${(share - 1) * 104}%)`;
    this.lidBottom.style.transform = `translateY(${(1 - share) * 104}%)`;
  }

  /** The view blurred by `pixels`, as eyes that cannot yet focus see it. */
  blur(pixels: number): void {
    this.canvas.style.filter = pixels > 0.05 ? `blur(${pixels.toFixed(1)}px)` : '';
  }

  /** The game's title over the view, or not. */
  showTitle(shown: boolean): void {
    this.title.classList.toggle('shown', shown);
  }

  /** A prompt that breathes under the title, or none. */
  showPrompt(text: string | null): void {
    if (text !== null) this.prompt.textContent = text;
    this.prompt.classList.toggle('shown', text !== null);
  }

  /** The skip's hold: its share filled, shown while a cutscene can be skipped. */
  showSkip(share: number | null): void {
    this.skip.classList.toggle('shown', share !== null);
    this.skipFill.style.transform = `scaleX(${share ?? 0})`;
  }

  /** Lets every layer go: the view back as it was. */
  clear(): void {
    this.fade(0, 0.6);
    this.fade(0, 0.6, 'white');
    this.bars(false);
    this.lids(0);
    this.blur(0);
    this.showTitle(false);
    this.showPrompt(null);
    this.showSkip(null);
  }

  remove(): void {
    this.blur(0);
    this.root.remove();
  }
}

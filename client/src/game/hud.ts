import { button, make } from '../editor/dom.ts';
import { countdownText, KIND_WORDS, type MarkKind, type Standing, vignette } from './hudLaw.ts';

/** A mark on the screen: a node, a port or a ship, where it stands in pixels. */
export interface ScreenMark {
  readonly id: string;
  readonly kind: MarkKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly note: string;
  readonly chosen: boolean;
}

/** One choice of a menu. */
export interface Choice {
  readonly label: string;
  readonly run: () => void;
}

const GLYPHS: Record<MarkKind, string> = {
  social: '⌂',
  patrol: '◇',
  mission: '◆',
  dungeon: '▼',
  boss: '☠',
  port: '⚓',
};

/** The game's heads-up display: plain elements over the canvas, nothing drawn on the GPU. */
export class Hud {
  private readonly placeTitle = make('div', '', 'title');
  private readonly placeKind = make('div', '', 'kind');
  private readonly warning = make('div', '', 'warning');
  private readonly count = make('div', '', 'count');
  private readonly shade = make('div', '', 'vignette');
  private readonly death = make('div', '', 'death');
  private readonly respawn: HTMLButtonElement;
  private readonly hintList = make('div', '', 'hints');
  private readonly veilText = make('div', '', 'veil-text');
  private readonly veilNode = make('div', '', 'veil');
  private readonly markLayer = make('div', '', 'marks');
  private readonly menuNode = make('div', '', 'menu');
  private readonly status = make('div', '', 'status');
  private respawnWanted: () => void = () => undefined;
  private markChosen: (id: string) => void = () => undefined;

  constructor(root: HTMLElement) {
    root.classList.add('hud');
    const place = make('div', '', 'place');
    place.append(this.placeTitle, this.placeKind);
    this.warning.append(make('div', 'Return to the area', 'warning-words'), this.count);
    this.respawn = button('Respawn', () => this.respawnWanted());
    this.death.append(
      make('div', 'You died', 'death-words'),
      make('div', 'You strayed too far from the area.', 'death-why'),
      this.respawn,
    );
    this.veilNode.append(this.veilText);
    root.append(
      this.shade,
      place,
      this.warning,
      this.markLayer,
      this.hintList,
      this.status,
      this.menuNode,
      this.death,
      this.veilNode,
    );
    this.reach({ kind: 'inside' }, 10);
    this.menu(null);
  }

  /** Names the place the player stands in. */
  place(title: string, kind: string): void {
    this.placeTitle.textContent = title;
    this.placeKind.textContent = kind;
  }

  /** Shows the player's standing against their section's edge: the warning and its count, or death. */
  reach(standing: Standing, warningSeconds: number): void {
    this.shade.style.opacity = String(vignette(standing, warningSeconds));
    this.warning.hidden = standing.kind !== 'warned';
    if (standing.kind === 'warned') this.count.textContent = countdownText(standing.secondsLeft);
    this.death.hidden = standing.kind !== 'dead';
    if (standing.kind === 'dead') {
      this.respawn.disabled = !standing.canRespawn;
      this.respawn.textContent = standing.canRespawn ? 'Respawn' : 'Respawn…';
    }
  }

  /** What Respawn does. */
  onRespawn(respawn: () => void): void {
    this.respawnWanted = respawn;
  }

  /** The keys the player can press now, one a line. */
  hints(lines: readonly string[]): void {
    this.hintList.replaceChildren(...lines.map((line) => make('div', line)));
  }

  /** A line of what is happening (a voyage, a connection), or none. */
  note(text: string): void {
    this.status.textContent = text;
    this.status.hidden = text === '';
  }

  /** Covers the view with words while a place loads, or lifts the cover. */
  veil(text: string | null): void {
    this.veilNode.classList.toggle('shown', text !== null);
    if (text !== null) this.veilText.textContent = text;
  }

  /** Places the marks on the screen; choosing one calls what `onMark` set. */
  marks(marks: readonly ScreenMark[]): void {
    this.markLayer.replaceChildren(
      ...marks.map((mark) => {
        const node = make('button', '', `mark ${mark.kind}${mark.chosen ? ' chosen' : ''}`);
        node.type = 'button';
        node.style.transform = `translate(${mark.x.toFixed(1)}px, ${mark.y.toFixed(1)}px)`;
        node.append(
          make('span', GLYPHS[mark.kind], 'glyph'),
          make('span', mark.name, 'name'),
          make('span', `${KIND_WORDS[mark.kind]} · ${mark.note}`, 'note'),
        );
        node.addEventListener('click', () => this.markChosen(mark.id));
        return node;
      }),
    );
  }

  /** What choosing a mark does. */
  onMark(chosen: (id: string) => void): void {
    this.markChosen = chosen;
  }

  /** Opens a menu with a title and its choices, or closes it. */
  menu(content: { readonly title: string; readonly choices: readonly Choice[] } | null): void {
    this.menuNode.hidden = content === null;
    if (!content) return;
    this.menuNode.replaceChildren(
      make('div', content.title, 'menu-title'),
      ...content.choices.map((choice) => button(choice.label, choice.run)),
    );
  }

  get menuOpen(): boolean {
    return !this.menuNode.hidden;
  }
}

import { button, make } from '../editor/dom.ts';
import { countdownText, KIND_WORDS, type MarkKind, type Standing, vignette, WARNING_SECONDS } from './hudLaw.ts';
import type { Landfall } from './seaLaw.ts';

/** A button of the heads-up display: let go of once pressed, so Space or Enter, which the game itself answers, never
 *  press it again. */
function hudButton(text: string, run: () => void): HTMLButtonElement {
  const node = button(text, () => {
    node.blur();
    run();
  });
  return node;
}

/** A mark on the screen: a node or a port, where it stands in CSS pixels, its size there, and what it says. */
export interface ScreenMark {
  readonly id: string;
  readonly kind: MarkKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
  readonly note: string;
  readonly chosen: boolean;
  /** Whether its name and note show: off where they would print over a nearer mark's. */
  readonly named: boolean;
  /** Held at the picture's edge: the way its arrow points, degrees clockwise from up. */
  readonly arrowDegrees: number | null;
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

/** A mark's elements, kept from frame to frame so a click on one lands on the same element it went down on. */
interface MarkNode {
  readonly root: HTMLButtonElement;
  readonly glyph: HTMLElement;
  readonly name: HTMLElement;
  readonly note: HTMLElement;
  readonly arrow: HTMLElement;
}

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
  private readonly veilNode = make('div', '', 'veil shown');
  private readonly markLayer = make('div', '', 'marks');
  private readonly marksShown = new Map<string, MarkNode>();
  private readonly menuNode = make('div', '', 'menu');
  private readonly status = make('div', '', 'status');
  private readonly sea = make('div', '', 'sea-bar');
  private readonly paceValue = make('span', '', 'pace');
  private readonly voyage: HTMLButtonElement;
  private readonly landfall: HTMLButtonElement;
  private respawnWanted: () => void = () => undefined;
  private markChosen: (id: string) => void = () => undefined;
  private paceWanted: (direction: number) => void = () => undefined;
  private voyageWanted: () => void = () => undefined;
  private landfallWanted: () => void = () => undefined;

  constructor(root: HTMLElement) {
    root.classList.add('hud');
    const place = make('div', '', 'place');
    place.append(this.placeTitle, this.placeKind);
    this.warning.append(make('div', 'Return to the area', 'warning-words'), this.count);
    this.respawn = hudButton('Respawn', () => this.respawnWanted());
    this.death.append(
      make('div', 'You died', 'death-words'),
      make('div', 'You strayed too far from the area.', 'death-why'),
      this.respawn,
    );
    this.veilNode.append(this.veilText);
    this.voyage = hudButton('', () => this.voyageWanted());
    this.landfall = hudButton('', () => this.landfallWanted());
    this.landfall.classList.add('landfall');
    this.sea.append(
      make('span', 'Navigation', 'pace-label'),
      this.voyage,
      make('span', 'Pace', 'pace-label'),
      hudButton('−  [', () => this.paceWanted(-1)),
      this.paceValue,
      hudButton(']  +', () => this.paceWanted(1)),
    );
    root.append(
      this.shade,
      this.markLayer,
      place,
      this.warning,
      this.hintList,
      this.status,
      this.sea,
      this.landfall,
      this.menuNode,
      this.death,
      this.veilNode,
    );
    this.reach({ kind: 'inside' });
    this.menu(null);
    this.seaBar(null);
    this.note('');
  }

  /** Names the place the player is in. */
  place(title: string, kind: string): void {
    this.placeTitle.textContent = title;
    this.placeKind.textContent = kind;
  }

  /** Shows the player's standing against their section's edge: the warning and its count, or death. */
  reach(standing: Standing): void {
    this.shade.style.opacity = String(vignette(standing, WARNING_SECONDS));
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
    const text = lines.join('\n');
    if (this.hintList.dataset['text'] === text) return;
    this.hintList.dataset['text'] = text;
    this.hintList.replaceChildren(...lines.map((line) => make('div', line)));
  }

  /** A line of what is happening (a voyage, a connection), or none. */
  note(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.hidden = text === '';
  }

  /** Covers the view with words while a place loads, or lifts the cover. */
  veil(text: string | null): void {
    this.veilNode.classList.toggle('shown', text !== null);
    if (text !== null) this.veilText.textContent = text;
  }

  /** Places the marks on the screen; choosing one calls what `onMark` set. */
  marks(marks: readonly ScreenMark[]): void {
    const kept = new Set<string>();
    marks.forEach((mark, order) => {
      kept.add(mark.id);
      const shown = this.marksShown.get(mark.id) ?? this.markNode(mark.id);
      shown.root.className = `mark ${mark.kind}${mark.chosen ? ' chosen' : ''}${mark.arrowDegrees === null ? '' : ' held'}${mark.named ? '' : ' unnamed'}`;
      shown.root.style.transform = `translate(${mark.x.toFixed(1)}px, ${mark.y.toFixed(1)}px)`;
      shown.root.style.zIndex = String(order + 1);
      shown.root.style.setProperty('--size', `${Math.round(mark.sizePx)}px`);
      shown.glyph.textContent = GLYPHS[mark.kind];
      shown.name.textContent = mark.name;
      const note = `${KIND_WORDS[mark.kind]} · ${mark.note}`;
      if (shown.note.textContent !== note) shown.note.textContent = note;
      shown.arrow.hidden = mark.arrowDegrees === null;
      if (mark.arrowDegrees !== null)
        shown.arrow.style.transform = `rotate(${mark.arrowDegrees.toFixed(0)}deg) translateY(calc(var(--size) / -2 - 9px))`;
    });
    for (const [id, shown] of this.marksShown) {
      if (kept.has(id)) continue;
      shown.root.remove();
      this.marksShown.delete(id);
    }
  }

  private markNode(id: string): MarkNode {
    const root = make('button');
    root.type = 'button';
    const [glyph, name, note] = [make('span', '', 'glyph'), make('span', '', 'name'), make('span', '', 'note')];
    const arrow = make('span', '▲', 'arrow');
    root.append(arrow, glyph, name, note);
    root.addEventListener('click', (event) => {
      event.stopPropagation();
      this.markChosen(id);
    });
    const shown = { root, glyph, name, note, arrow };
    this.markLayer.append(root);
    this.marksShown.set(id, shown);
    return shown;
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
      ...content.choices.map((choice) => hudButton(choice.label, choice.run)),
    );
  }

  /** The navigation panel at sea: stopping or resuming the voyage and the pace dial; over it, the offer to dock or go
   *  ashore while one is open. Null hides both. */
  seaBar(
    state: {
      readonly pace: number;
      readonly sailing: boolean;
      readonly resumable: boolean;
      readonly landfall: Landfall;
    } | null,
  ): void {
    this.sea.hidden = state === null;
    this.landfall.hidden = !state?.landfall;
    if (!state) return;
    const pace = `×${state.pace}`;
    if (this.paceValue.textContent !== pace) this.paceValue.textContent = pace;
    this.voyage.hidden = !state.sailing && !state.resumable;
    const voyage = state.sailing ? 'Stop  Space' : 'Resume voyage  Space';
    if (this.voyage.textContent !== voyage) this.voyage.textContent = voyage;
    const offer = state.landfall?.kind === 'dock' ? `Dock at ${state.landfall.port}  Enter` : 'Go ashore  Enter';
    if (state.landfall && this.landfall.textContent !== offer) this.landfall.textContent = offer;
  }

  /** What the pace buttons do: -1 slower, +1 faster. */
  onPace(step: (direction: number) => void): void {
    this.paceWanted = step;
  }

  /** What Stop and Resume voyage do. */
  onVoyage(toggle: () => void): void {
    this.voyageWanted = toggle;
  }

  /** What the offer to dock or go ashore does. */
  onLandfall(take: () => void): void {
    this.landfallWanted = take;
  }
}

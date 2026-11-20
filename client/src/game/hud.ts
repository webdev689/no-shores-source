import { button, make } from '../editor/dom.ts';
import { type CameraPose, projectPoint } from '../overworld/overworldCamera.ts';
import { type ShipBar, ShipPlates } from '../ships/shipBars.ts';
import { Compass, type ShipMark, wearCompass } from '../plus/compass.ts';
import { ROLES, type Role, wearKit } from '../plus/kit.ts';
import { NoticeStack } from '../plus/notices.ts';
import { SeaFightReadout, type SeaFightModel, wearSeaFight } from '../plus/seaFight.ts';
import { countdownText, KIND_WORDS, type MarkKind, type Standing, vignette, WARNING_SECONDS } from './hudLaw.ts';
import type { HostileLook } from './seaHostiles.ts';
import { type Landfall, landfallWords } from './seaLaw.ts';
import type { ShipPanel } from './shipPanel.ts';

/** A button of the heads-up display, in the role it plays: let go of once pressed, so Space or Enter, which the game
 *  itself answers, never press it again. */
function hudButton(text: string, run: () => void, role: Role = 'button'): HTMLButtonElement {
  const node = button(text, () => {
    node.blur();
    run();
  });
  node.classList.add(ROLES[role]);
  return node;
}

/** A labelled group of the sea bar's controls. */
function seaGroup(label: string, ...controls: HTMLElement[]): HTMLElement {
  const group = make('div', '', 'sea-group');
  group.append(make('span', label, 'pace-label'), ...controls);
  return group;
}

/** A mark on the screen: a node, a port or a hostile ship, where it stands in CSS pixels, its size there, and what its
 *  says. */
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
  /** A hostile ship's emblem, rank colour and rank mark. */
  readonly hostile?: HostileLook;
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
  port: '⚓\uFE0E',
  hostile: '',
};

/** A mark's elements, kept from frame to frame so a click on one lands on the same element it went down on. */
interface MarkNode {
  readonly root: HTMLButtonElement;
  readonly glyph: HTMLElement;
  readonly name: HTMLElement;
  readonly note: HTMLElement;
  readonly arrow: HTMLElement;
  readonly badge: HTMLElement;
  /** The hostile look the mark was last dressed in ('' for none). */
  readonly dress: { worn: string };
}

/** Dresses a mark as a hostile ship, or undresses it: its rank's colour on its ring and arrow, its faction's emblem in
 *  it, and over it a Miniboss's mark, the plates' own. */
function dressHostile(shown: MarkNode, look: HostileLook | undefined): void {
  // A mark keeps its dress from frame to frame: it is laid again only when the ship's look changes.
  const dress = look ? `${look.colour} ${look.emblem ?? ''} ${look.badge ?? ''}` : '';
  shown.badge.hidden = !look?.badge;
  if (shown.dress.worn === dress) return;
  shown.dress.worn = dress;
  shown.root.style.setProperty('--kind', look?.colour ?? '');
  shown.glyph.style.background = look?.emblem
    ? `url("${look.emblem}") center / 62% no-repeat, rgba(10, 13, 17, 0.6)`
    : '';
  shown.glyph.style.imageRendering = look ? 'pixelated' : '';
  shown.badge.style.background = look?.badge ? `url("${look.badge}") center / contain no-repeat` : '';
}

/** Writes words only when they change: called every frame, the HUD would otherwise rebuild its text each time. */
function say(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
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
  /** The compass at sea, heading its column at the top; on foot the fight's display stands its own there. */
  private readonly compassColumn = make('div', '', 'compass-column');
  private readonly seaCompass = new Compass(this.compassColumn);
  /** Each captain's bar over its ship in a fight, drawn afresh each frame. */
  private readonly shipLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly shipPlates = new ShipPlates();
  private readonly marksShown = new Map<string, MarkNode>();
  private readonly menuNode = make('div', '', `menu ${ROLES.window}`);
  private readonly status = make('div', '', `status ${ROLES.chip}`);
  private readonly sea = make('div', '', `sea-bar ${ROLES.window}`);
  private readonly paceValue = make('span', '', 'pace');
  private readonly voyage: HTMLButtonElement;
  private readonly landfall: HTMLButtonElement;
  private readonly leave: HTMLButtonElement;
  private readonly manageButton = hudButton('Manage  B', () => this.manageWanted());
  private readonly wheel: HTMLButtonElement;
  private readonly panel = make('div', '', `ship-panel ${ROLES.window}`);
  /** The sea fight's readout: the ship's plate and rose, the card and the tally, made in the root. */
  private readonly fight: SeaFightReadout;
  /** What happened, as DFO's toasts say it, at the top right. */
  private readonly noticeStack: NoticeStack;
  /** The shape Manage's panel was last built to, and the place each of its values is written. */
  private panelShape = '';
  private panelValues: HTMLElement[] = [];
  private respawnWanted: () => void = () => undefined;
  private markChosen: (id: string) => void = () => undefined;
  private paceWanted: (direction: number) => void = () => undefined;
  private voyageWanted: () => void = () => undefined;
  private mapWanted: () => void = () => undefined;
  private landfallWanted: () => void = () => undefined;
  private manageWanted: () => void = () => undefined;
  private leaveWanted: () => void = () => undefined;
  private wheelWanted: () => void = () => undefined;

  constructor(root: HTMLElement) {
    root.classList.add('hud');
    wearKit(root.ownerDocument);
    wearCompass(root.ownerDocument);
    wearSeaFight(root.ownerDocument);
    const place = make('div', '', 'place');
    place.append(this.placeTitle, this.placeKind);
    this.warning.append(make('div', 'Return to the area', 'warning-words'), this.count);
    this.respawn = hudButton('Respawn', () => this.respawnWanted(), 'primary');
    this.death.append(
      make('div', 'You died', 'death-words'),
      make('div', 'You strayed too far from the area.', 'death-why'),
      this.respawn,
    );
    this.veilNode.append(this.veilText);
    this.voyage = hudButton('', () => this.voyageWanted());
    this.landfall = hudButton('', () => this.landfallWanted(), 'primary');
    this.landfall.classList.add('landfall');
    this.leave = hudButton('Leave the helm  H', () => this.leaveWanted());
    this.wheel = hudButton('Take the helm  E', () => this.wheelWanted(), 'primary');
    this.wheel.classList.add('landfall');
    const groups = [
      seaGroup(
        'Navigation',
        hudButton('Map  N', () => this.mapWanted()),
        this.voyage,
      ),
      seaGroup(
        'Pace',
        hudButton('−  [', () => this.paceWanted(-1)),
        this.paceValue,
        hudButton(']  +', () => this.paceWanted(1)),
      ),
      seaGroup('Ship', this.manageButton, this.leave),
    ];
    // Each group after the first stands behind an engraved rail.
    for (const group of groups.slice(1)) group.classList.add(ROLES.rail);
    this.sea.append(...groups);
    Object.assign(this.shipLayer.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    root.append(
      this.shade,
      this.shipLayer,
      this.markLayer,
      this.compassColumn,
      place,
      this.warning,
      this.hintList,
      this.status,
      this.sea,
      this.landfall,
      this.wheel,
      this.panel,
      this.menuNode,
      this.death,
      this.veilNode,
    );
    // Under the menu, the death screen and the veil, which cover it.
    this.fight = new SeaFightReadout(root);
    root.insertBefore(this.fight.root, this.menuNode);
    this.fight.update(null);
    this.noticeStack = new NoticeStack(root);
    root.insertBefore(this.noticeStack.root, this.menuNode);
    this.noticeStack.show([]);
    this.reach({ kind: 'inside' });
    this.menu(null);
    this.seaBar(null);
    this.shipPanel(null);
    this.wheelOffer(false);
    this.compass(null);
    this.note('');
  }

  /** Names the place the player is in. */
  place(title: string, kind: string): void {
    say(this.placeTitle, title);
    say(this.placeKind, kind);
  }

  /** Shows the player's standing against their section's edge: the warning and its count, or death. */
  reach(standing: Standing): void {
    const shade = String(vignette(standing, WARNING_SECONDS));
    if (this.shade.style.opacity !== shade) this.shade.style.opacity = shade;
    this.warning.hidden = standing.kind !== 'warned';
    if (standing.kind === 'warned') say(this.count, countdownText(standing.secondsLeft));
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

  /** Turns the compass to `view`'s heading (turns from north) and marks its ships round the player at `from`; null
   *  hides it. */
  compass(
    view: {
      readonly heading: number;
      readonly from: readonly [number, number];
      readonly ships: readonly ShipMark[];
    } | null,
  ): void {
    this.compassColumn.hidden = view === null;
    if (view) this.seaCompass.update(view.heading, view.from, view.ships);
  }

  /** Shows the sea fight's readout, or hides it for none. */
  seaFight(model: SeaFightModel | null): void {
    this.fight.update(model);
    // The ships' plates keep under the card, as under the compass.
    this.shipPlates.top = this.fight.under;
  }

  /** The notices standing now (DFO's toasts), the newest last; none for no notice. */
  notices(lines: readonly string[]): void {
    this.noticeStack.show(lines);
  }

  /** Covers the view with words while a place loads, or lifts the cover. */
  veil(text: string | null): void {
    this.veilNode.classList.toggle('shown', text !== null);
    if (text !== null) this.veilText.textContent = text;
  }

  /** Each captain's bar over its ship (world metres) as `pose` sees the picture; none out of a fight. */
  shipBars(bars: readonly ShipBar[], pose: CameraPose): void {
    this.shipLayer.replaceChildren();
    if (bars.length === 0) return;
    const viewport = { width: this.shipLayer.clientWidth, height: this.shipLayer.clientHeight };
    const spot = (point: readonly [number, number, number]) => {
      const seen = projectPoint(pose, viewport, [...point]);
      return seen.front ? seen : null;
    };
    this.shipPlates.draw(this.shipLayer, bars, spot, viewport.width, performance.now() / 1000);
  }

  /** Places the marks on the screen; choosing one calls what `onMark` set. */
  marks(marks: readonly ScreenMark[]): void {
    const kept = new Set<string>();
    marks.forEach((mark, order) => {
      kept.add(mark.id);
      const shown = this.marksShown.get(mark.id) ?? this.markNode(mark.id);
      shown.root.className = `mark ${mark.kind}${mark.chosen ? ' chosen' : ''}${mark.arrowDegrees === null ? '' : ' held'}${mark.named ? '' : ' unnamed'}`;
      shown.root.style.transform = `translate(${Math.round(mark.x)}px, ${Math.round(mark.y)}px)`;
      shown.root.style.zIndex = String(order + 1);
      shown.root.style.setProperty('--size', `${Math.round(mark.sizePx)}px`);
      shown.glyph.textContent = GLYPHS[mark.kind];
      dressHostile(shown, mark.hostile);
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
    const badge = make('span', '', 'badge');
    Object.assign(badge.style, {
      position: 'absolute',
      left: '-7px',
      top: 'calc(var(--size) / -2 - 12px)',
      width: '14px',
      height: '8px',
      imageRendering: 'pixelated',
    });
    root.append(arrow, glyph, name, note, badge);
    root.addEventListener('click', (event) => {
      event.stopPropagation();
      this.markChosen(id);
    });
    const shown = { root, glyph, name, note, arrow, badge, dress: { worn: '' } };
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
      make('div', content.title, `menu-title ${ROLES.header}`),
      ...content.choices.map((choice) => hudButton(choice.label, choice.run)),
    );
  }

  /** The navigation panel at sea: the map, stopping or resuming the voyage and the pace dial; over it, the offer to
   *  dock or go ashore while one is open. Null hides both. */
  seaBar(
    state: {
      readonly pace: number;
      readonly sailing: boolean;
      readonly resumable: boolean;
      readonly landfall: Landfall;
      /** Whether the helm may be left (the ship is in the sea room, out of a fight) and it may be managed (out of
       *  a fight). */
      readonly canLeave: boolean;
      readonly canManage: boolean;
    } | null,
  ): void {
    this.sea.hidden = state === null;
    this.landfall.hidden = !state?.landfall;
    if (!state) return;
    this.leave.disabled = !state.canLeave;
    this.manageButton.disabled = !state.canManage;
    const pace = `×${state.pace}`;
    if (this.paceValue.textContent !== pace) this.paceValue.textContent = pace;
    this.voyage.hidden = !state.sailing && !state.resumable;
    const voyage = state.sailing ? 'Stop  Space' : 'Resume voyage  Space';
    if (this.voyage.textContent !== voyage) this.voyage.textContent = voyage;
    const offer = state.landfall ? `${landfallWords(state.landfall)}  Enter` : '';
    if (state.landfall && this.landfall.textContent !== offer) this.landfall.textContent = offer;
  }

  /** What the pace buttons do: -1 slower, +1 faster. */
  onPace(step: (direction: number) => void): void {
    this.paceWanted = step;
  }

  /** What Map does. */
  onMap(open: () => void): void {
    this.mapWanted = open;
  }

  /** What Stop and Resume voyage do. */
  onVoyage(toggle: () => void): void {
    this.voyageWanted = toggle;
  }

  /** Manage's panel over its deck: its name, and each part of it; null hides it.
   *  It is built again only when its shape changes, its values written in place, so a press on it is never lost. */
  shipPanel(panel: ShipPanel | null): void {
    this.panel.hidden = panel === null;
    if (!panel) return;
    const shape = JSON.stringify([panel.title, panel.parts.map((part) => [part.heading, part.rows.length])]);
    if (shape !== this.panelShape) {
      this.panelShape = shape;
      this.panelValues = [];
      const parts = panel.parts.map((part) => {
        const node = make('div', '', 'ship-part');
        node.append(make('div', part.heading, `ship-part-heading ${ROLES.rule}`));
        for (const [label] of part.rows) {
          const [row, value] = [make('div', '', 'ship-row'), make('span', '', 'ship-value')];
          row.append(make('span', label, 'ship-label'), value);
          this.panelValues.push(value);
          node.append(row);
        }
        return node;
      });
      const footer = make('div', '', `ship-footer ${ROLES.footer}`);
      footer.append(hudButton('Back to the sea  B', () => this.manageWanted()));
      this.panel.replaceChildren(make('div', panel.title, `ship-title ${ROLES.header}`), ...parts, footer);
    }
    panel.parts
      .flatMap((part) => part.rows)
      .forEach(([, value], index) => {
        const shown = this.panelValues[index];
        if (shown && shown.textContent !== value) shown.textContent = value;
      });
  }

  /** Offers the helm at its wheel, or takes the offer away. */
  wheelOffer(shown: boolean): void {
    this.wheel.hidden = !shown;
  }

  /** What Manage, and the panel's way back, do. */
  onManage(toggle: () => void): void {
    this.manageWanted = toggle;
  }

  /** What Leave the helm does. */
  onLeaveHelm(leave: () => void): void {
    this.leaveWanted = leave;
  }

  /** What the offer of the helm at its wheel does. */
  onTakeHelm(take: () => void): void {
    this.wheelWanted = take;
  }

  /** What the offer to dock or go ashore does. */
  onLandfall(take: () => void): void {
    this.landfallWanted = take;
  }
}

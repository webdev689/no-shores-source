import { hudLayout } from '../combat/hudLayout.ts';
import type { BannerTone } from '../combat/publicBanner.ts';
import { SeaFightReadout } from '../combat/seaReadout.ts';
import { type CameraPose, projectPoint } from '../overworld/overworldCamera.ts';
import { compassNode } from './compassNode.ts';
import type { ShipMark } from '../plus/compass.ts';
import { motionReduced } from '../plus/kit.ts';
import { NoticeStack } from '../plus/notices.ts';
import type { SeaFightModel } from '../plus/seaFight.ts';
import { type ShipBar, ShipPlates } from '../ships/shipBars.ts';
import { shipPlateNodes } from './shipPlates.ts';
import { announce } from '../ui/announce.ts';
import { ease, easeInOut } from '../ui/ease.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import type { Interface } from '../ui/ui.ts';
import type { Hint } from './gearNodes.ts';
import { countdownText, deathWords, type Standing, vignette, WARNING_SECONDS } from './hudLaw.ts';
import { markNodes, type ScreenMark } from './hudMarks.ts';
import { Tween } from './hudParts.ts';
import {
  type Choice,
  deathNode,
  DIM,
  type HudView,
  hintsNode,
  menuNode,
  noticesNode,
  offerNode,
  placeNode,
  type SeaBarState,
  seaBarNode,
  shipPanelNode,
  statusNode,
  warningNode,
} from './hudPieces.ts';
import { type Landfall, landfallWords } from './seaLaw.ts';
import { SeaSight, type Sight } from './seaSight.ts';
import type { ShipPanel } from './shipPanel.ts';
import { TaskTracker } from './tasks.ts';
import { drawToasts, keptToasts, layToasts, type Toast } from './toasts.ts';
import { UsePrompt } from './usePrompt.ts';

export type { Choice } from './hudPieces.ts';
export type { ScreenMark } from './hudMarks.ts';

/** What else holds the screen beside the display, which it gives way to: the fight's display on foot and its boss's
 *  bar, the dialogue box while someone speaks, and the held map while it is up. */
export interface Besides {
  readonly fight: boolean;
  readonly bossed: boolean;
  /** The tone a public event's banner shows in under the compass, none while it shows none. */
  readonly banner?: BannerTone | null;
  readonly speaking: boolean;
  readonly map: boolean;
}

/** How long the edge's darkening and the veil take to change, seconds, and the veil's words' breath. */
const SHADE_S = 0.4;
export const VEIL_S = 0.7;
const BREATH_S = 2.4;

/** The screen's edge darkened toward black, as a radial gradient over the whole view clear to 35% of the way out: drawn
 *  small and stretched, its steps too fine to see. */
const VIGNETTE: Picture = {
  key: 'hud vignette',
  pixel: { width: 320, height: 180 },
  source: {
    draw: (context, width, height) => {
      const pixels = context.createImageData(width, height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const [across, down] = [((x + 0.5) / width) * 2 - 1, ((y + 0.5) / height) * 2 - 1];
          const out = Math.hypot(across, down) / Math.SQRT2;
          pixels.data[(y * width + x) * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (out - 0.35) / 0.65)));
        }
      context.putImageData(pixels, 0, 0);
    },
  },
};

/** The game's heads-up display, drawn by the game as a layer of its interface (`node`): the place's name, the edge's
 *  warning and death, the key strip, the quests, the toasts, the status line, the notices, the compass, the marks and
 *  the ships' plates at sea, the sea fight's readout, the sea bar and its offers, Manage's panel, a menu, and the veil
 *  while a place loads. The game tells it what to show each frame through its methods and hears its presses through
 *  the `on` callbacks. */
export class Hud {
  readonly tasks = new TaskTracker();
  /** What E does where the player stands, low in the middle of the view. */
  readonly usePrompt = new UsePrompt();
  /** The sea fight's readout: the ship's plate and rose, the card and the tally; and what it shows now. */
  private readonly fight = new SeaFightReadout();
  private fightModel: SeaFightModel | null = null;
  /** The sight while the guns are laid, its aim line while a lay is held. */
  private readonly seaSight = new SeaSight();
  /** What happened, as DFO's toasts say it, at the top right. */
  private readonly noticeStack = new NoticeStack();
  private title = '';
  private kind = '';
  private standing: Standing = { kind: 'inside' };
  private readonly shade = new Tween(0, SHADE_S, ease);
  private hintsShown: readonly Hint[] = [];
  /** The toasts said now, which the game draws. */
  private toasts: Toast[] = [];
  private status = '';
  private compassView: { heading: number; from: readonly [number, number]; ships: readonly ShipMark[] } | null = null;
  private veilWords: string | null = null;
  private readonly veilShade = new Tween(1, VEIL_S, ease);
  private bars: readonly ShipBar[] = [];
  private pose: CameraPose | null = null;
  private readonly shipPlates = new ShipPlates();
  private marksShown: readonly ScreenMark[] = [];
  private menuShown: { readonly title: string; readonly choices: readonly Choice[] } | null = null;
  private sea: (SeaBarState & { readonly landfall: Landfall }) | null = null;
  private panel: ShipPanel | null = null;
  private passage: string | null = null;
  private wheel = false;
  private besides: () => Besides = () => ({ fight: false, bossed: false, speaking: false, map: false });
  private respawnWanted: () => void = () => undefined;
  private markChosen: (id: string) => void = () => undefined;
  private paceWanted: (direction: number) => void = () => undefined;
  private voyageWanted: () => void = () => undefined;
  private mapWanted: () => void = () => undefined;
  private landfallWanted: () => void = () => undefined;
  private manageWanted: () => void = () => undefined;
  private leaveWanted: () => void = () => undefined;
  private wheelWanted: () => void = () => undefined;
  private passageWanted: () => void = () => undefined;

  /** Names the place the player is in. */
  place(title: string, kind: string): void {
    [this.title, this.kind] = [title, kind];
  }

  /** Shows the player's standing against their section's edge: the warning and its count, or death once it is told,
   *  saying how they died. */
  reach(standing: Standing): void {
    this.standing = standing;
    this.shade.set(vignette(standing, WARNING_SECONDS), now());
  }

  /** What Respawn does. */
  onRespawn(respawn: () => void): void {
    this.respawnWanted = respawn;
  }

  /** The keys the player can press now, each on its keycap beside what it does; none hides the strip. */
  hints(hints: readonly Hint[]): void {
    this.hintsShown = hints;
  }

  /** Shows the sea fight's readout, or hides it for none. */
  seaFight(model: SeaFightModel | null): void {
    // shortcut: a view too narrow for the bars beside the compass (under 908 px) runs them under it; stand the
    // compass under them, as on foot, if the sea is played that narrow.
    this.fightModel = model;
    this.fight.update(model, now());
    // The ships' plates keep under the card, as under the compass.
    this.shipPlates.top = this.fight.under;
  }

  /** Shows the sight at the view's middle while `aiming`, with `line` under it; hides both otherwise. */
  sight(aiming: boolean, line: Sight | null): void {
    this.seaSight.show(aiming, line);
  }

  /** The notices standing now (DFO's toasts), the newest last; none for no notice. */
  notices(lines: readonly string[]): void {
    this.noticeStack.show(lines, now(), announce);
  }

  /** The short messages over the middle of the view now, the newest few: the caller says each every frame it holds,
   *  as long as its own clock keeps it, so a toast never outlives what it tells. */
  toast(...texts: string[]): void {
    const kept = keptToasts(this.toasts, texts, now());
    for (const toast of kept) if (!this.toasts.some((shown) => shown.text === toast.text)) announce(toast.text);
    this.toasts = kept;
  }

  /** A line of what is happening (a voyage, a connection), or none. */
  note(text: string): void {
    this.status = text;
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
    this.compassView = view;
  }

  /** Covers the view with words while a place loads, or lifts the cover. */
  veil(text: string | null): void {
    if (text !== null) this.veilWords = text;
    if ((text !== null) !== this.veilShown) this.veilShade.set(text === null ? 0 : 1, now());
    this.veilShown = text !== null;
  }
  private veilShown = true;

  /** Each captain's bar over its ship (world metres) as `pose` sees the picture; none out of a fight. */
  shipBars(bars: readonly ShipBar[], pose: CameraPose): void {
    [this.bars, this.pose] = [bars, pose];
  }

  /** Places the marks on the screen; choosing one calls what `onMark` set. */
  marks(marks: readonly ScreenMark[]): void {
    this.marksShown = marks;
  }

  /** What choosing a mark does. */
  onMark(chosen: (id: string) => void): void {
    this.markChosen = chosen;
  }

  /** Opens a menu with a title and its choices, or closes it. */
  menu(content: { readonly title: string; readonly choices: readonly Choice[] } | null): void {
    this.menuShown = content;
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
    this.sea = state;
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

  /** Manage's panel over its deck: its name, and each part of it; null hides it. */
  shipPanel(panel: ShipPanel | null): void {
    this.panel = panel;
  }

  /** Offers the way through the gate the player stands in (its words), or takes the offer away (null). */
  passageOffer(words: string | null): void {
    this.passage = words;
  }

  /** What the offer of a way through a gate does. */
  onPassage(take: () => void): void {
    this.passageWanted = take;
  }

  /** Offers the helm at its wheel, or takes the offer away. */
  wheelOffer(shown: boolean): void {
    this.wheel = shown;
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

  /** How the display reads what else holds the screen, each frame. */
  onBesides(read: () => Besides): void {
    this.besides = read;
  }

  /** Where the key strip was laid last frame (CSS pixels), which the fight's display keeps clear of; none while it
   *  does not show. */
  hintsBox(ui: Interface): Box | null {
    return ui.boxOf('hud:hints');
  }

  /** The display as the game draws it this frame: each piece over the view, in the order the page stacked them. */
  node(ui: Interface): Node {
    const clock = now();
    const still = motionReduced();
    const { width, height } = ui.size;
    const besides = this.besides();
    if (this.fightModel) this.fight.lay(hudLayout(width, height));
    const fight = this.fight.node();
    const plates = this.platesNode(width, height, clock);
    const view: HudView = {
      width,
      height,
      big: width >= 1500 && height >= 900,
      doubled: width >= 2400 && height >= 1300,
      ...besides,
      plates: plates.length > 0,
      seaFight: this.fightModel !== null,
    };
    const shade = this.shade.value(clock);
    const sea = this.sea;
    const standing = this.standing;
    const children: Child[] = [
      shade > 0 && {
        width: 'grow',
        height: 'grow',
        through: true,
        float: { to: 'screen' },
        opacity: shade,
        picture: VIGNETTE,
      },
      ...plates,
      this.compassView &&
        !besides.fight && {
          width: 'grow',
          alignX: 'center',
          through: true,
          float: { to: 'screen', y: 18 },
          children: [compassNode(width, this.compassView.heading, this.compassView.from, this.compassView.ships)],
        },
      placeNode(view, this.title, this.kind),
      standing.kind === 'warned' && warningNode(view, countdownText(standing.secondsLeft)),
      hintsNode(view, this.hintsShown, sea !== null, Boolean(sea?.landfall)),
      // In a view too narrow for the tracker to stand clear of the compass's column, it gives way to a public event's
      // banner, which holds the same objective; the next event's line holds none, so the tracker stands beside it.
      !(besides.banner && besides.banner !== 'next' && width < 1024) && this.tasks.node(view, clock, still),
      {
        width: 'grow',
        height: 'grow',
        float: { to: 'screen' },
        draw: (renderer, box, scale) => {
          const shown = { width: box.width / scale, height: box.height / scale };
          drawToasts(renderer, layToasts(renderer.face, this.toasts, shown, clock, still), scale);
        },
      },
      statusNode(view, this.status),
      sea &&
        seaBarNode(ui, sea, {
          map: () => this.mapWanted(),
          voyage: () => this.voyageWanted(),
          pace: (direction) => this.paceWanted(direction),
          manage: () => this.manageWanted(),
          leave: () => this.leaveWanted(),
        }),
      sea?.landfall &&
        offerNode(ui, 'sea:landfall', `${landfallWords(sea.landfall)}  Enter`, () => this.landfallWanted()),
      this.wheel && offerNode(ui, 'hud:wheel', 'Take the helm  E', () => this.wheelWanted()),
      this.passage !== null && offerNode(ui, 'hud:passage', this.passage, () => this.passageWanted()),
      this.panel && shipPanelNode(ui, this.panel, () => this.manageWanted()),
      // Under the menu, death's words and the veil, which cover them.
      fight,
      noticesNode(ui, view, this.noticeStack.rows, clock, still),
      this.menuShown && menuNode(ui, this.menuShown.title, this.menuShown.choices),
      standing.kind === 'dead' &&
        standing.told &&
        deathNode(ui, deathWords(standing.fell), standing.canRespawn, () => this.respawnWanted()),
      this.veilNode(clock, still),
      this.usePrompt.node(view),
      this.seaSight.node(),
      // The page raised each mark over the rest of the display, so they stand over it here too.
      ...markNodes(ui, this.marksShown, (id) => this.markChosen(id)),
    ];
    return { width: 'grow', height: 'grow', children };
  }

  /** The ships' plates over their ships as the picture is seen now. */
  private platesNode(width: number, height: number, clock: number): Node[] {
    const pose = this.pose;
    if (this.bars.length === 0 || !pose) return [];
    const viewport = { width, height };
    const spot = (point: readonly [number, number, number]) => {
      const seen = projectPoint(pose, viewport, [...point]);
      return seen.front ? seen : null;
    };
    return shipPlateNodes(this.shipPlates.place(this.bars, spot, width, clock));
  }

  /** The veil over the view while a place loads, its words breathing; it takes the pointer while it stands. */
  private veilNode(clock: number, still: boolean): Node | null {
    // Reduced motion stills the words' breath, never the veil's fade, which only shows and hides it.
    const shown = this.veilShade.value(clock);
    if (shown <= 0) return null;
    const breath = still ? 1 : 1 - 0.55 * easeInOut(1 - Math.abs(((clock / BREATH_S) % 1) * 2 - 1));
    return {
      width: 'grow',
      height: 'grow',
      float: { to: 'screen' },
      fill: '#05070a',
      opacity: shown,
      solid: this.veilShown,
      through: !this.veilShown,
      alignX: 'center',
      alignY: 'center',
      children: [
        {
          opacity: breath,
          text: {
            words: (this.veilWords ?? '').toUpperCase(),
            size: 2,
            colour: DIM,
            edge: 'shadow',
            edgeColour: '#000',
            tracking: 5,
          },
        },
      ],
    };
  }
}

/** The display's clock, seconds. */
const now = () => performance.now() / 1000;

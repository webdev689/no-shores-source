import { hudLayout } from '../combat/hudLayout.ts';
import type { BannerTone } from '../combat/publicBanner.ts';
import { SeaFightReadout } from '../combat/seaReadout.ts';
import { type CameraPose, projectPoint } from '../overworld/overworldCamera.ts';
import { loadingNode } from '../cinema/logo.ts';
import { compassNode } from './compassNode.ts';
import { ControlsSheet } from './controlsSheet.ts';
import type { ShipMark } from '../plus/compass.ts';
import { motionReduced } from '../plus/kit.ts';
import { NoticeStack } from '../plus/notices.ts';
import type { SeaFightModel } from '../plus/seaFight.ts';
import { type ShipBar, ShipPlates } from '../ships/shipBars.ts';
import { shipPlateNodes } from './shipPlates.ts';
import { announce } from '../ui/announce.ts';
import { ease } from '../ui/ease.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import type { Interface } from '../ui/ui.ts';
import { BINDS } from '../player/input.ts';
import { boundWord } from './controls.ts';
import { type Strip, type StripRow, hintsFor } from './hints.ts';
import { stripFit, stripFoot, stripNode } from './keyStrip.ts';
import { FEED_RISE } from './acquiredFeed.ts';
import { LeaveHold } from './leaveHold.ts';
import { countdownText, DEAD_SHADE, deathWords, type Standing, vignette, WARNING_SECONDS } from './hudLaw.ts';
import type { Fallen } from './footRevive.ts';
import { markNodes, type ScreenMark } from './hudMarks.ts';
import { capFace, Tween } from './hudParts.ts';
import {
  deathNode,
  fallenNode,
  type HudView,
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
import { gearScreenOpen } from './gearScreen.ts';
import { TRACKER_ID, TaskTracker } from './tasks.ts';
import { drawToasts, keptToasts, layToasts, type Toast } from './toasts.ts';
import { PROMPT_ID, UsePrompt } from './usePrompt.ts';

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

/** How long the edge's darkening and the veil take to change, seconds. */
const SHADE_S = 0.4;
export const VEIL_S = 0.7;
/** The most entries the key strip holds, the key to every control last among them. */
const HINTS_MOST = 8;
/** `rows` cut to `most`, those just before the last giving way. */
const atMost = (rows: readonly StripRow[], most: number): readonly StripRow[] =>
  rows.length > most ? [...rows.slice(0, most - 1), ...rows.slice(-1)] : rows;
/** What stands at the view's foot that the key strip stands over where it would cover it, by id: the prompt in the
 *  middle only on a view narrow enough for the two to meet. */
const UNDER_STRIP = ['fight-arms', 'sea:bar', 'sea:landfall', 'hud:wheel', 'hud:passage', PROMPT_ID];

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
 *  the ships' plates at sea, the sea fight's readout, the sea bar and its offers, Manage's panel, the leave held, the
 *  veil while a place loads, and the sheet of every control. The game tells it what to show each frame through its
 *  methods and hears its presses through the `on` callbacks. */
export class Hud {
  readonly tasks = new TaskTracker();
  /** What E does where the player stands, low in the middle of the view. */
  readonly usePrompt = new UsePrompt();
  /** The leave held on foot, back to the ship, where the use prompt stands. */
  readonly leaving = new LeaveHold();
  /** Every control, opened with K over everything else. */
  readonly controls = new ControlsSheet();
  /** The sea fight's readout: the ship's plate and its abilities' bar, the card and the tally; and what it shows now. */
  private readonly fight = new SeaFightReadout(capFace);
  private fightModel: SeaFightModel | null = null;
  /** The sight while the guns are laid, its aim line while a lay is held. */
  private readonly seaSight = new SeaSight();
  /** What happened, as DFO's toasts say it, at the top right. */
  private readonly noticeStack = new NoticeStack();
  private title = '';
  private kind = '';
  private standing: Standing = { kind: 'inside' };
  /** The player's fall in the fight, as the death screen tells it (`footRevive.ts`); null while they stand. */
  private fallen: Fallen | null = null;
  private readonly shade = new Tween(0, SHADE_S, ease);
  private stripShown: Strip | null = null;
  /** The toasts said now, which the game draws. */
  private toasts: Toast[] = [];
  private status = '';
  private compassView: {
    heading: number;
    from: readonly [number, number];
    ships: readonly ShipMark[];
    quest?: readonly [number, number] | null;
  } | null = null;
  private veilWords: string | null = null;
  private readonly veilShade = new Tween(1, VEIL_S, ease);
  private bars: readonly ShipBar[] = [];
  private pose: CameraPose | null = null;
  private readonly shipPlates = new ShipPlates();
  private marksShown: readonly ScreenMark[] = [];
  private sea: (SeaBarState & { readonly landfall: Landfall }) | null = null;
  private panel: ShipPanel | null = null;
  private passage: string | null = null;
  /** While a cutscene holds the view: the use prompt, the toasts and a gate's offer stand aside. */
  quiet = false;
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
   *  saying how they died; and their fall in the fight, darkened as a death told. */
  reach(standing: Standing, fallen: Fallen | null = null): void {
    [this.standing, this.fallen] = [standing, fallen];
    this.shade.set(fallen && standing.kind === 'inside' ? DEAD_SHADE : vignette(standing, WARNING_SECONDS), now());
  }

  /** What Respawn does. */
  onRespawn(respawn: () => void): void {
    this.respawnWanted = respawn;
  }

  /** The moment's name and the keys the player can press now, each on its keycap beside what it does, the most needed
   *  first; null, or none, hides the strip. Past eight shown on the device played, those nearest the last give way to
   *  it, the key to every control. */
  strip(strip: Strip | null): void {
    this.stripShown = strip;
  }

  /** Whether the key strip shows keys now, the sheet of every control's among them: it gives way while someone
   *  speaks. */
  get keysOffered(): boolean {
    return (this.stripShown?.hints.length ?? 0) > 0 && !this.besides().speaking;
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
      readonly quest?: readonly [number, number] | null;
    } | null,
  ): void {
    this.compassView = view;
  }

  /** Covers the view with the loading screen and `text` (the trip's words) while a place loads, or lifts the cover;
   *  not `loading`, the words stand alone, as a trip that failed and waits on the player. */
  veil(text: string | null, loading = true): void {
    // Said as it comes up, and again as its words change; a trip with the words of the last is said too.
    if (text !== null && (!this.veilShown || text !== this.veilWords || loading !== this.veilLoading)) announce(text);
    if (text !== null) [this.veilWords, this.veilLoading] = [text, loading];
    if ((text !== null) !== this.veilShown) this.veilShade.set(text === null ? 0 : 1, now());
    this.veilShown = text !== null;
  }
  private veilLoading = true;
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
          children: [
            compassNode(
              width,
              this.compassView.heading,
              this.compassView.from,
              this.compassView.ships,
              this.compassView.quest ?? null,
            ),
          ],
        },
      placeNode(view, this.title, this.kind),
      standing.kind === 'warned' && warningNode(view, countdownText(standing.secondsLeft)),
      this.stripNode(ui, view),
      // In a view too narrow for the tracker to stand clear of the compass's column, it gives way to a public event's
      // banner, which holds the same objective; the next event's line holds none, so the tracker stands beside it.
      !(besides.banner && besides.banner !== 'next' && width < 1024) &&
        this.tasks.node(view, clock, still, gearScreenOpen() ? ui.boxOf('gear-foot') : null),
      {
        width: 'grow',
        height: 'grow',
        float: { to: 'screen' },
        draw: (renderer, box, scale) => {
          const shown = { width: box.width / scale, height: box.height / scale };
          drawToasts(renderer, layToasts(renderer.face, this.quiet ? [] : this.toasts, shown, clock, still), scale);
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
        offerNode(ui, 'sea:landfall', `${landfallWords(sea.landfall)}  ${boundWord('confirm')}`, () =>
          this.landfallWanted(),
        ),
      this.wheel && offerNode(ui, 'hud:wheel', `Take the helm  ${boundWord('use')}`, () => this.wheelWanted()),
      !this.quiet && this.passage !== null && offerNode(ui, 'hud:passage', this.passage, () => this.passageWanted()),
      this.panel && shipPanelNode(ui, this.panel, () => this.manageWanted()),
      // Under the menu, death's words and the veil, which cover them.
      fight,
      noticesNode(ui, view, this.noticeStack.rows, clock, still),
      standing.kind === 'dead' &&
        standing.told &&
        deathNode(ui, deathWords(standing.fell), standing.canRespawn, () => this.respawnWanted()),
      standing.kind !== 'dead' && this.fallen && fallenNode(ui, this.fallen, () => this.respawnWanted()),
      this.veilNode(width, clock, still),
      !this.quiet && (this.leaving.node(view, this.title) ?? this.usePrompt.node(view)),
      this.seaSight.node(),
      // The page raised each mark over the rest of the display, so they stand over it here too.
      ...markNodes(ui, this.marksShown, (id) => this.markChosen(id)),
      this.controls.node(ui, view),
    ];
    return { width: 'grow', height: 'grow', children };
  }

  /** The key strip at the bottom right, over what stood at the view's foot under it last frame: the fight's Arts and
   *  weapons, the sea bar, the ship's bar in a sea fight and the offers; gone while someone speaks. */
  private stripNode(ui: Interface, view: HudView): Node | null {
    const strip = this.stripShown;
    if (!strip || view.speaking) return null;
    const zoom = view.doubled ? 2 : 1;
    const shown = atMost(hintsFor(strip.hints, BINDS.device, BINDS.now), HINTS_MOST);
    const reach = this.fight.reach;
    const shipBar = reach && { x: 0, y: view.height - reach.up, width: reach.right, height: reach.up };
    const was = ui.boxOf('hud:hints');
    const foot = stripFoot(view, was, [...UNDER_STRIP.map((id) => ui.boxOf(id)), shipBar], zoom);
    // Over it the Acquired feed's foot, where gains come in (so the strip keeps under it whether or not they show),
    // and the tracker where it stands across from it.
    const tracker = ui.boxOf(TRACKER_ID);
    const left = was?.x ?? view.width;
    const across = tracker && tracker.x + tracker.width > left ? tracker.y + tracker.height : 0;
    const ceiling = Math.max(view.height - Math.round(view.height * FEED_RISE), across) + 8 * zoom;
    const fit = stripFit(shown.length, view.height - foot - ceiling, zoom);
    const rows = atMost(shown, fit.most);
    const held = { names: 'leave', share: this.leaving.held };
    return stripNode({ title: fit.titled ? strip.title : '', rows, held, zoom }, foot);
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

  /** The veil over the view while a place loads: the loading screen with the trip's words. It takes the pointer while
   *  it stands. */
  private veilNode(width: number, clock: number, still: boolean): Node | null {
    const shown = this.veilShade.value(clock);
    if (shown <= 0) return null;
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
      children: [loadingNode(width, clock, still, this.veilWords ?? '', this.veilLoading)],
    };
  }
}

/** The display's clock, seconds. */
const now = () => performance.now() / 1000;

// The held map at the helm: the parchment raised in the player's gauntlets, the discovered world on it, panned,
// zoomed and clicked to choose where to sail; lowered with or without a destination. The forge's art is the owner's
// own; its rules are DFO's held map's (heldMapLaw.ts).
import { TONES } from '../plus/tones.ts';
import type { Gpu } from '../gpu.ts';
import { forgeName } from '../firstperson/fpFrames.ts';
import { WORLD_FRAME } from '../overworld/discovery.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type CoastField } from './coastField.ts';
import {
  CLOSE_S,
  nearestMark,
  OPEN_S,
  PAN_PX,
  raised,
  type Rect,
  routeOf,
  stageOf,
  toInk,
  toWorld,
  type View,
  viewOn,
  wheelFactor,
  zoomAt,
} from './heldMapLaw.ts';
import { type HeldMapFrame, HeldMapView, ROUTE_POINTS } from './heldMapView.ts';
import { button } from '../ui/controls.ts';
import type { Child, Drawing, Node, Picture } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import type { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';

/** The world's frame, metres. */
const WORLD = { width: WORLD_FRAME.widthM, height: WORLD_FRAME.heightM } as const;
/** The forge's held-map art: the parchment, and the gauntlets' strips of 17 frames, one a set and one bare. */
const SHEET_PATH = '@art/held-map-forge-sheet.png';
const HANDS_FRAMES = 17;
const handsPath = (gauntlets: string | null) =>
  `@art/held-map-forge-hands${gauntlets ? `-${forgeName(gauntlets)}` : ''}.png`;
/** The gauntlets' fidget: the fingers of each hand flex in turn, every few seconds, a frame each twelfth of a second. */
const FIDGET = { every: 6, frameS: 1 / 12 } as const;

/** Something the map shows, once discovered: a port or a node, where it lies, what it is, and where a ship sails for
 *  it (a node's nearest coast). */
export interface MapPlace {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly at: Point2;
  readonly sail: Point2;
}

/** A route as the map inks it, or why there is none. */
export type Course =
  { readonly ok: true; readonly points: readonly Point2[] } | { readonly ok: false; readonly why: string };

/** What the map is asked each frame: where the ship lies and heads, what is discovered, and the course sailed now. */
export interface HeldMapScene {
  readonly ship: Point2;
  readonly heading: number;
  readonly places: readonly MapPlace[];
  readonly knownIslands: number;
  readonly course: readonly Point2[];
}

type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'opening'; readonly t: number }
  | { readonly kind: 'open' }
  | { readonly kind: 'closing'; readonly t: number; readonly from: number; readonly sail: Point2 | null };

type Choice = { readonly at: Point2; readonly name: string; readonly course: Course; readonly place: string | null };

/** The difficulty a voyage sets out at: its island's foes as they are, or raised, paying more. */
export type Difficulty = 'calm' | 'rough' | 'storm';
const DIFFICULTY_WORDS: readonly (readonly [Difficulty, string, string])[] = [
  ['calm', 'Calm', 'The island’s foes as they are.'],
  ['rough', 'Rough', 'Foes two levels higher; half again the XP, Aurem and Vestiges.'],
  ['storm', 'Storm', 'Foes three levels higher; twice the XP, Aurem and Vestiges.'],
];

export class HeldMap {
  private readonly view: HeldMapView;
  private readonly store: ForgeStore;
  private readonly plan: (to: Point2) => Course;
  /** How far up the map stands and how far down its lowering it is drawn, CSS pixels, while its marks show. */
  private shownAt: { readonly lift: number; readonly drop: number } | null = null;
  private shipAt: { readonly x: number; readonly y: number; readonly heading: number } | null = null;
  private phase: Phase = { kind: 'closed' };
  private mapView: View = { left: 0, top: 0, scale: 1 };
  private ink: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private press: { x: number; y: number; view: View; panning: boolean } | null = null;
  private choice: Choice | null = null;
  /** The difficulty the voyage set out at: what the card showed when the player set sail. */
  difficulty: Difficulty = 'calm';
  /** The difficulty chosen on the card, kept only once the player sets sail with it. */
  private picked: Difficulty = 'calm';
  private placed: { readonly place: MapPlace; readonly x: number; readonly y: number }[] = [];
  private gauntlets: string | null | undefined = undefined;
  private clock = 0;
  private lowered: (sail: Point2 | null) => void = () => undefined;

  constructor(gpu: Gpu, field: CoastField, store: ForgeStore, plan: (to: Point2) => Course, stack: Stack) {
    this.view = new HeldMapView(gpu, field);
    this.store = store;
    this.plan = plan;
    stack.add((ui) => this.node(ui));
  }

  /** Whether the map is up, rising or lowering: the sea's own input waits while it is. */
  get shown(): boolean {
    return this.phase.kind !== 'closed';
  }

  /** What happens once the map is lowered: the ship sets sail for its destination, or none was chosen. */
  onLowered(then: (sail: Point2 | null) => void): void {
    this.lowered = then;
  }

  /** Raises the map in the player's gauntlets (`null` bare hands), centred on the ship, the sea charted so far laid on
   *  it. */
  open(
    viewport: { readonly width: number; readonly height: number },
    ship: Point2,
    gauntlets: string | null,
    charted: Uint8Array,
  ): void {
    if (this.phase.kind !== 'closed') return;
    if (gauntlets !== this.gauntlets) this.load(gauntlets);
    this.view.setCharted(charted);
    this.ink = stageOf(viewport).ink;
    this.mapView = viewOn(ship, this.ink, WORLD);
    this.choice = null;
    this.phase = { kind: 'opening', t: 0 };
  }

  /** Lowers the map from wherever it is in its rise; `sail` is the destination set, or null. */
  close(sail: Point2 | null = null): void {
    const phase = this.phase;
    if (phase.kind === 'closed' || phase.kind === 'closing') return;
    const from = phase.kind === 'opening' ? raised(phase.t / OPEN_S) : 1;
    this.phase = { kind: 'closing', t: 0, from, sail };
  }

  /** Reads the art for a set of gauntlets. Art that will not come lets the map go, and is asked for again the next
   *  time the map is raised. */
  private load(gauntlets: string | null): void {
    this.gauntlets = gauntlets;
    const failed = (why: unknown) => {
      console.error('the held map could not be read:', why);
      this.gauntlets = undefined;
      this.close();
    };
    void Promise.all([this.store.strip(SHEET_PATH), this.store.strip(handsPath(gauntlets))])
      .then(async ([sheet, hands]) => {
        // A set the forge drew no hands for holds the map in bare hands.
        const held = hands ?? (gauntlets ? await this.store.strip(handsPath(null)) : null);
        if (this.gauntlets !== gauntlets) return;
        if (sheet && held) this.view.setPictures(sheet, held, HANDS_FRAMES);
        else failed('the forge has no held-map art');
      })
      .catch(failed);
  }

  /** A press that ends anywhere else is forgotten. */
  pointerCancel(): void {
    this.press = null;
  }

  pointerDown(x: number, y: number): void {
    if (this.phase.kind === 'open') this.press = { x, y, view: this.mapView, panning: false };
  }

  pointerMove(x: number, y: number): void {
    const press = this.press;
    if (!press) return;
    if (!press.panning && Math.abs(x - press.x) + Math.abs(y - press.y) <= PAN_PX) return;
    press.panning = true;
    const moved = {
      ...press.view,
      left: press.view.left - (x - press.x) / press.view.scale,
      top: press.view.top - (y - press.y) / press.view.scale,
    };
    this.mapView = zoomAt(moved, 0, 0, 1, this.ink, WORLD);
  }

  /** A press let go: a click picks the nearest discovered place, or the point of the sea under it. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    if (!press || press.panning || this.phase.kind !== 'open') return;
    const [inkX, inkY] = [x - this.ink.x, y - this.ink.y];
    if (inkX < 0 || inkY < 0 || inkX > this.ink.width || inkY > this.ink.height) return;
    const mark = nearestMark(this.placed, inkX, inkY);
    const point = mark ? mark.place.sail : (toWorld(this.mapView, inkX, inkY) as Point2);
    this.choice = {
      at: point,
      name: mark ? mark.place.name : 'This stretch of sea',
      course: this.plan(point),
      place: mark?.place.id ?? null,
    };
  }

  /** The wheel at a point on the screen: the map zooms about it. */
  wheel(x: number, y: number, deltaY: number, deltaMode: number): void {
    if (this.phase.kind !== 'open') return;
    const factor = wheelFactor(deltaY, deltaMode, this.ink.height);
    this.mapView = zoomAt(this.mapView, x - this.ink.x, y - this.ink.y, factor, this.ink, WORLD);
  }

  /** Sets sail for the destination chosen, if it has a course. */
  setSail(): void {
    if (!this.choice?.course.ok) return;
    this.difficulty = this.picked;
    this.close(this.choice.at);
  }

  /** Escape: the choice is let go first, with the seas picked on its card, then the map lowered. */
  escape(): void {
    if (this.choice) {
      this.choice = null;
      this.picked = this.difficulty;
    } else this.close();
  }

  /** One frame, `dt` seconds on: the map's rise, its view and its marks laid out, and what its view draws, device
   *  pixels (`dpr` a CSS pixel). Null while it is down or its art has not come. */
  frame(
    dt: number,
    viewport: { readonly width: number; readonly height: number },
    dpr: number,
    scene: HeldMapScene,
  ): HeldMapFrame | null {
    this.clock += dt;
    // The rise waits for the art the first time it is asked for; lowering never waits.
    const waiting = !this.view.ready && this.phase.kind === 'opening';
    const lift = this.advance(waiting ? 0 : dt);
    this.shownAt = null;
    if (lift === null || !this.view.ready) return null;
    const stage = stageOf(viewport);
    if (stage.ink.width !== this.ink.width || stage.ink.height !== this.ink.height)
      this.mapView = zoomAt(this.mapView, 0, 0, 1, stage.ink, WORLD);
    const drop = (1 - lift) * stage.sprite.height;
    this.ink = stage.ink;
    this.layout(scene, drop, lift);
    const scaled = (rect: Rect, down: number): Rect => ({
      x: rect.x * dpr,
      y: (rect.y + down) * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    });
    return {
      screen: { width: viewport.width * dpr, height: viewport.height * dpr },
      sprite: scaled(stage.sprite, drop),
      ink: scaled(stage.ink, drop),
      view: { left: this.mapView.left, top: this.mapView.top, scale: this.mapView.scale * dpr },
      handsFrame: this.fidget(),
      knownIslands: scene.knownIslands,
      route: routeOf(this.choice?.course.ok ? this.choice.course.points : scene.course, ROUTE_POINTS),
    };
  }

  /** Draws what `frame` worked out over the finished picture. */
  draw(encoder: GPUCommandEncoder, target: GPUTextureView, frame: HeldMapFrame): void {
    this.view.draw(encoder, target, frame);
  }

  /** Moves the rise on; answers how far up the map is, or null once it is down. */
  private advance(dt: number): number | null {
    const phase = this.phase;
    if (phase.kind === 'closed') return null;
    if (phase.kind === 'open') return 1;
    const t = phase.t + dt;
    if (phase.kind === 'opening') {
      this.phase = t >= OPEN_S ? { kind: 'open' } : { kind: 'opening', t };
      return raised(t / OPEN_S);
    }
    if (t >= CLOSE_S) {
      this.phase = { kind: 'closed' };
      this.press = null;
      this.lowered(phase.sail);
      return null;
    }
    this.phase = { ...phase, t };
    return phase.from * raised(1 - t / CLOSE_S);
  }

  /** The gauntlets' frame now: at rest, but for a flex of each hand's fingers every few seconds. */
  private fidget(): number {
    const into = this.clock % FIDGET.every;
    const frame = Math.floor(into / FIDGET.frameS);
    return frame < HANDS_FRAMES ? frame : 0;
  }

  /** Where the names and the ship's arrow stand on the parchment, `drop` pixels down its lowering. */
  private layout(scene: HeldMapScene, drop: number, lift: number): void {
    this.shownAt = { lift, drop };
    const onSheet = (x: number, y: number) => x >= 0 && y >= 0 && x <= this.ink.width && y <= this.ink.height;
    this.placed = [];
    for (const place of scene.places) {
      const [x, y] = toInk(this.mapView, place.at[0], place.at[1]);
      if (onSheet(x, y)) this.placed.push({ place, x, y });
    }
    const [shipX, shipY] = toInk(this.mapView, scene.ship[0], scene.ship[1]);
    this.shipAt = onSheet(shipX, shipY) ? { x: shipX, y: shipY, heading: scene.heading } : null;
  }

  /** The names, the ship's arrow and the card over the parchment the GPU draws, written in its ink: drawn by the game
   *  as a layer of its interface while the map is up. */
  node(ui: Interface): Child {
    const shown = this.shownAt;
    if (!shown) return null;
    const { x, y } = this.ink;
    const pinned = (left: number, top: number) => ({
      to: 'screen' as const,
      x: Math.round(x + left),
      y: Math.round(y + top + shown.drop),
    });
    const ship = this.shipAt;
    return {
      width: 'grow',
      height: 'grow',
      opacity: shown.lift,
      children: [
        ...this.placed.map(({ place, x: left, y: top }) =>
          markNode(place, this.choice?.place === place.id, pinned(left, top)),
        ),
        ship && {
          width: 12,
          height: 16,
          // Turned to the ship's heading about its middle, a pixel from where the sheet turned it.
          picture: { ...SHIP_ARROW, turn: (ship.heading * 180) / Math.PI },
          through: true,
          float: { to: 'screen', x: Math.round(x + ship.x - 6), y: Math.round(y + ship.y + shown.drop - 9) },
        },
        this.cardNode(ui, shown.drop),
      ],
    };
  }

  /** The card over the parchment's top: where the course is set for, the seas to sail it in, and the press to sail. */
  private cardNode(ui: Interface, drop: number): Child {
    const choice = this.choice;
    if (!choice) return null;
    const ok = choice.course.ok;
    const words = ok ? `Set a course for ${choice.name}` : choice.course.why;
    const said = (text: string): Node => ({ text: { words: text, colour: TONES.ink, wrap: false }, through: true });
    return {
      id: 'held-card',
      alignY: 'center',
      gap: 14,
      padding: [8, 14],
      // Drawn, not filled, so only its presses take the pointer and a click beside them reaches the map.
      draw: cardGround,
      float: {
        to: 'screen',
        anchor: [0.5, 1],
        x: Math.round(this.ink.x + this.ink.width / 2),
        y: Math.round(this.ink.y + drop - 12),
      },
      children: [
        said(words),
        ok && {
          gap: 0,
          children: DIFFICULTY_WORDS.map(([difficulty, label, told]) =>
            button(ui, `held-seas:${difficulty}`, label, () => (this.picked = difficulty), {
              role: difficulty === this.picked ? 'primary' : 'button',
              padding: [7, 14],
              label: `${label}: ${told}`,
            }),
          ),
        },
        ok && button(ui, 'held-sail', 'Set sail  Enter', () => this.setSail(), { role: 'primary', padding: [7, 14] }),
      ],
    };
  }
}

/** The card's ground and its gold edge. */
const cardGround: Drawing = (renderer, box, scale, clip, fade) => {
  const tone = (css: string) => {
    const [red, green, blue, alpha] = colourOf(css);
    return [red, green, blue, alpha * fade] as const;
  };
  const { x, y, width, height } = box;
  renderer.quads.add(box, tone('rgba(10, 13, 17, 0.72)'), clip);
  const gold = tone('#f3cf6a');
  for (const edge of [
    { x, y, width, height: scale },
    { x, y: y + height - scale, width, height: scale },
    { x, y, width: scale, height },
    { x: x + width - scale, y, width: scale, height },
  ])
    renderer.quads.add(edge, gold, clip);
};

/** The ship's arrow on the map: a red point 12 px across and 16 tall. */
const SHIP_ARROW: Picture = {
  key: 'held ship',
  source: {
    draw: (context, width, height) => {
      context.fillStyle = '#781c14';
      context.beginPath();
      context.moveTo(width / 2, 0);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fill();
    },
  },
};

/** A ring, or a dot for a port, 9 px across in the map's ink. */
const markDot = (port: boolean): Picture => ({
  key: port ? 'held port' : 'held mark',
  source: {
    draw: (context, width, height) => {
      const radius = Math.min(width, height) / 2 - 1;
      context.strokeStyle = context.fillStyle = MAP_INK;
      context.lineWidth = (1.5 * width) / 9;
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
      if (port) context.fill();
      context.stroke();
    },
  },
});

const MAP_INK = '#3a2816';
const MAP_ROUTE = '#781c14';

/** A place's name on the map, its ring or dot at its point and its name beside it; the chosen one in the route's red. */
export function markNode(
  place: MapPlace,
  chosen: boolean,
  pin: { readonly to: 'screen'; readonly x: number; readonly y: number },
): Node {
  const port = place.kind === 'port';
  return {
    gap: 4,
    // Words on the map: a click on them reaches the map, which picks the place.
    through: true,
    float: { ...pin, x: pin.x - 4, y: pin.y - 8 },
    children: [
      { padding: [4, 0, 0, 0], children: [{ width: 9, height: 9, picture: markDot(port) }] },
      {
        text: {
          words: place.name,
          colour: chosen ? MAP_ROUTE : MAP_INK,
          edge: 'halo',
          edgeColour: '#eedebe',
          tracking: port ? 2 : 1,
          wrap: false,
        },
      },
    ],
  };
}

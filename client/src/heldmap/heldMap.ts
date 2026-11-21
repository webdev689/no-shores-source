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
  type Extent,
  nearestMark,
  OPEN_S,
  PAN_PX,
  raised,
  type Rect,
  routeOf,
  SHEET,
  stageOf,
  toInk,
  toWorld,
  type View,
  viewOn,
  wheelFactor,
  zoomAt,
} from './heldMapLaw.ts';
import { type HeldMapFrame, HeldMapView, ROUTE_POINTS } from './heldMapView.ts';
import { paintLand } from './landLetters.ts';
import type { LandSheet } from './landSheet.ts';
import { HeldMapWaters, onOwnSea, ruinedPlaces } from './heldMapWaters.ts';
import { type KeyPlace, keySize, landUnder } from './mapKey.ts';
import { handsCover, layOut, type Lettering, letterScale } from './mapLayout.ts';
import { fontOf, type IsleInk, ISLE_HALF, paintLettering } from './mapLetters.ts';
import type { MapWaters } from './watersWash.ts';
import { button } from '../ui/controls.ts';
import type { Child, Drawing, Node } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import type { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';

/** The world's frame, metres. */
const WORLD = { width: WORLD_FRAME.widthM, height: WORLD_FRAME.heightM } as const;
/** How much of the land the map first shows across, metres, and the most it zooms in there, screen pixels a metre. */
const LAND_SPAN_M = 400;
const LAND_SCALE_MOST = 8;
/** On land the world's ink is turned off the sheet, which shows only what is painted on it. */
const OFF_WORLD = { left: -1e7, top: -1e7, scale: 1 } as const;
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

/** A found island as the map marks it: where it lies in the world, its kind (`cove`, `ruin`, `quarry`), and whether it
 *  is an isle, which is marked with a tower. */
export interface IsleMark {
  readonly at: Point2;
  readonly kind: string;
  readonly isle: boolean;
}

/** A route as the map inks it, or why there is none. */
export type Course =
  { readonly ok: true; readonly points: readonly Point2[] } | { readonly ok: false; readonly why: string };

/** What the map is asked each frame: where the ship lies and heads (on land, the player, in the world), what is
 *  discovered, and the course sailed now. */
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
export type Difficulty = 'normal' | 'elite' | 'abyss';
const DIFFICULTY_WORDS: readonly (readonly [Difficulty, string, string])[] = [
  ['normal', 'Normal', 'The island’s foes as they are.'],
  ['elite', 'Elite', 'Foes two levels higher; half again the XP, Aurem and Vestiges.'],
  ['abyss', 'Abyss', 'Foes three levels higher; twice the XP, Aurem and Vestiges.'],
];

export class HeldMap {
  private readonly view: HeldMapView;
  private readonly store: ForgeStore;
  private readonly plan: (to: Point2) => Course;
  /** How far up the map stands and how far down its lowering it is drawn, CSS pixels, while its card shows. */
  private shownAt: { readonly lift: number; readonly drop: number } | null = null;
  /** The parchment's picture its words, marks and key are painted on, laid down with its ink under the hands. */
  private readonly lettering = new OffscreenCanvas(1, 1);
  private readonly painter: OffscreenCanvasRenderingContext2D;
  private readonly field: CoastField;
  private key: KeyPlace | null = null;
  /** Where the land's table stood when last painted, so it keeps its corner while it can. */
  private table: KeyPlace | null = null;
  /** The words' widths and the key's size as last measured, and the face's loading they were measured in. */
  private readonly widths = new Map<string, number>();
  private keySize: { width: number; height: number } | null = null;
  private measuredFonts = '';
  private letteredShape = '';
  /** The last layout, and what it read: laid out again only when that has changed. */
  private readonly laidOut = new Kept<Lettering>();
  /** Counts the times the charted sea and its waters were set, which the layout reads but no key can cheaply hold. */
  private chartings = 0;
  private phase: Phase = { kind: 'closed' };
  private mapView: View = { left: 0, top: 0, scale: 1 };
  private ink: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private press: { x: number; y: number; view: View; panning: boolean } | null = null;
  private choice: Choice | null = null;
  /** The key that sets sail, as bound now, which its press names. */
  sailKey: () => string = () => 'Enter';
  /** The difficulty the voyage set out at: what the card showed when the player set sail. */
  difficulty: Difficulty = 'normal';
  /** The difficulty chosen on the card, kept only once the player sets sail with it. */
  private picked: Difficulty = 'normal';
  private placed: { readonly place: MapPlace; readonly x: number; readonly y: number }[] = [];
  private gauntlets: string | null | undefined = undefined;
  private clock = 0;
  private lowered: (sail: Point2 | null) => void = () => undefined;
  /** The waters once they are open: their wash, letters and key, and which cities are ports. */
  private waters: HeldMapWaters | null = null;
  private charted: Uint8Array | null = null;
  private isles: readonly IsleMark[] = [];
  /** The land the map shows while raised on foot (`openLand`), and what its view is held to: the world at sea. */
  private land: LandSheet | null = null;
  private extent: Extent = WORLD;

  constructor(gpu: Gpu, field: CoastField, store: ForgeStore, plan: (to: Point2) => Course, stack: Stack) {
    this.view = new HeldMapView(gpu, field);
    this.field = field;
    this.store = store;
    this.plan = plan;
    stack.add((ui) => this.node(ui));
    const painter = this.lettering.getContext('2d');
    if (!painter) throw new Error('the held map has no 2D canvas to letter on');
    this.painter = painter;
  }

  /** The waters, opened once a page: the map tints, letters and keys them from now on, and marks the ruins. */
  setWaters(waters: MapWaters): void {
    this.waters = new HeldMapWaters(waters);
    this.chartings++;
    if (this.charted) this.view.setWash(this.waters.chart(this.charted));
  }

  /** The found islands the map marks from now on, each where it lies. */
  setIsles(marks: readonly IsleMark[]): void {
    this.isles = marks;
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
    this.view.setCharted(charted);
    this.charted = charted;
    this.chartings++;
    if (this.waters) this.view.setWash(this.waters.chart(charted));
    [this.land, this.extent] = [null, WORLD];
    this.raise(viewport, gauntlets, (ink) => viewOn(ship, ink, WORLD));
  }

  /** Raises the map on foot, showing `sheet`, the land the player stands on, centred on them where they stand (`standing`,
   *  the sheet's metres): only to look at, panned and zoomed, never clicked to go anywhere. */
  openLand(
    viewport: { readonly width: number; readonly height: number },
    sheet: LandSheet,
    gauntlets: string | null,
    standing: Point2,
  ): void {
    if (this.phase.kind !== 'closed') return;
    [this.land, this.extent] = [sheet, { width: sheet.width, height: sheet.height, most: LAND_SCALE_MOST }];
    this.table = null;
    this.raise(viewport, gauntlets, (ink) => viewOn(standing, ink, this.extent, LAND_SPAN_M));
  }

  /** Lifts the map from its foot in `gauntlets`, its view as `viewed` lays it on the screen's map. */
  private raise(
    viewport: { readonly width: number; readonly height: number },
    gauntlets: string | null,
    viewed: (ink: Rect) => View,
  ): void {
    if (gauntlets !== this.gauntlets) this.load(gauntlets);
    this.ink = stageOf(viewport).ink;
    this.mapView = viewed(this.ink);
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

  /** Puts the map away at once, with no destination: where the player is taken from where it was raised. */
  drop(): void {
    this.phase = { kind: 'closed' };
    this.press = null;
    this.shownAt = null;
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
    this.mapView = zoomAt(moved, 0, 0, 1, this.ink, this.extent);
  }

  /** A press let go: a click picks the nearest discovered place, or the point of the sea under it; on land, nothing. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    if (!press || press.panning || this.phase.kind !== 'open' || this.land) return;
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
    this.mapView = zoomAt(this.mapView, x - this.ink.x, y - this.ink.y, factor, this.ink, this.extent);
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
      this.mapView = zoomAt(this.mapView, 0, 0, 1, stage.ink, this.extent);
    const drop = (1 - lift) * stage.sprite.height;
    this.ink = stage.ink;
    const scaled = (rect: Rect, down: number): Rect => ({
      x: rect.x * dpr,
      y: (rect.y + down) * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    });
    const { sprite } = stage;
    const parchment = {
      x: sprite.x + SHEET.x0 * sprite.width,
      y: sprite.y + SHEET.y0 * sprite.height,
      width: (SHEET.x1 - SHEET.x0) * sprite.width,
      height: (SHEET.y1 - SHEET.y0) * sprite.height,
    };
    const picture = scaled(parchment, drop);
    const [width, height] = [Math.ceil(picture.width), Math.ceil(picture.height)];
    if (this.lettering.width !== width || this.lettering.height !== height)
      [this.lettering.width, this.lettering.height] = [width, height];
    const inkAt = { x: stage.ink.x - parchment.x, y: stage.ink.y - parchment.y };
    this.shownAt = { lift, drop };
    // Words are measured again once the face has loaded.
    const fonts = ((globalThis as { fonts?: FontFaceSet }).fonts ?? document.fonts).status;
    if (fonts !== this.measuredFonts) {
      [this.measuredFonts, this.keySize] = [fonts, null];
      this.widths.clear();
    }
    const reads = layoutKey(this.mapView, stage, fonts, this.chartings, scene, this.choice?.place ?? null);
    // Painted and sent to the device only when what is lettered, where, or its face's loading has changed.
    const letteringChanged = this.letter(reads, scene, stage.sprite, { width, height, inkAt, dpr });
    const land = this.land !== null;
    return {
      parchment: picture,
      lettering: this.lettering,
      letteringChanged,
      screen: { width: viewport.width * dpr, height: viewport.height * dpr },
      sprite: scaled(stage.sprite, drop),
      ink: scaled(stage.ink, drop),
      view: land ? OFF_WORLD : { left: this.mapView.left, top: this.mapView.top, scale: this.mapView.scale * dpr },
      handsFrame: this.fidget(),
      knownIslands: land ? 0 : scene.knownIslands,
      route: routeOf(this.choice?.course.ok ? this.choice.course.points : land ? [] : scene.course, ROUTE_POINTS),
    };
  }

  /** Paints the parchment's picture, `size` device pixels with the map's top-left at `inkAt` in it, if what `reads`
   *  has changed: at sea the world's places, waters and islands laid out clear of the gauntlets; on land, the land's
   *  sheet with the player's arrow. Answers whether it was painted. */
  private letter(
    reads: string,
    scene: HeldMapScene,
    sprite: Rect,
    size: { width: number; height: number; inkAt: { x: number; y: number }; dpr: number },
  ): boolean {
    const { width, height, inkAt, dpr } = size;
    const land = this.land;
    const lettering = land ? null : this.laidOut.made(reads, () => this.layout(scene, sprite));
    const isles = lettering ? this.isleInks(lettering.scale) : [];
    const shape = JSON.stringify([width, height, inkAt, dpr, land ? reads : [this.measuredFonts, lettering, isles]]);
    if (shape === this.letteredShape) return false;
    this.letteredShape = shape;
    if (lettering) paintLettering(this.painter, this.lettering, inkAt, dpr, lettering, isles);
    else if (land) {
      const player = {
        at: [scene.ship[0] - land.origin[0], scene.ship[1] - land.origin[1]] as const,
        heading: scene.heading,
      };
      const [scale, covers] = [letterScale(this.ink), handsCover(sprite, this.ink)];
      const painting = { sheet: land, view: this.mapView, ink: this.ink, scale, covers, table: this.table, player };
      this.table = paintLand(this.painter, this.lettering, inkAt, dpr, painting);
    }
    return true;
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

  /** What is lettered on the map this frame (`layOut`): each place on it and each charted water named, the ship's
   *  arrow and the key, all clear of the gauntlets on the painting at `sprite`; and the card over the parchment,
   *  `drop` pixels down its lowering. */
  private layout(scene: HeldMapScene, sprite: Rect): Lettering {
    const onSheet = (x: number, y: number) => x >= 0 && y >= 0 && x <= this.ink.width && y <= this.ink.height;
    this.placed = [];
    const places = [];
    for (const place of ruinedPlaces(scene.places, this.waters?.waters.mainPorts ?? null)) {
      const [x, y] = toInk(this.mapView, place.at[0], place.at[1]);
      if (!onSheet(x, y)) continue;
      this.placed.push({ place, x, y });
      places.push({ text: place.name, x, y, kind: place.kind, chosen: this.choice?.place === place.id });
    }
    const [shipX, shipY] = toInk(this.mapView, scene.ship[0], scene.ship[1]);
    const lettering = layOut({
      ink: { width: this.ink.width, height: this.ink.height },
      scale: letterScale(this.ink),
      covers: handsCover(sprite, this.ink),
      places,
      waters:
        this.waters?.letters(
          this.ink,
          (x, y) => toInk(this.mapView, x, y),
          (x, y) => toWorld(this.mapView, x, y),
        ) ?? [],
      ship: onSheet(shipX, shipY) ? { x: shipX, y: shipY, heading: scene.heading } : null,
      widthOf: (text, kind) => this.widthOf(text, kind),
      land: (box) => landUnder(this.field, scene.knownIslands, this.mapView, box),
      sea: (box, continent) =>
        this.waters ? onOwnSea(this.waters.waters, this.field, this.mapView, box, continent) : 2,
      key: this.waters ? (this.keySize ??= keySize(this.painter)) : null,
      current: this.key,
    });
    this.key = lettering.key;
    // A click picks a mark where it is drawn: a node's moved clear of a port or ruin it stood on.
    this.placed = this.placed.map((each, index) => {
      const letter = lettering.letters[index];
      return letter ? { ...each, x: letter.x, y: letter.y } : each;
    });
    return lettering;
  }

  /** The found islands' marks on the sheet now, ink pixels, whole marks only. */
  private isleInks(scale: number): IsleInk[] {
    const inks: IsleInk[] = [];
    const half = ISLE_HALF * scale;
    for (const mark of this.isles) {
      const [x, y] = toInk(this.mapView, mark.at[0], mark.at[1]);
      if (x < half || y < half || x > this.ink.width - half || y > this.ink.height - half) continue;
      inks.push({ x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, isle: mark.isle });
    }
    return inks;
  }

  /** A word's width in its kind's face, units, measured once a word and kind. */
  private widthOf(text: string, kind: string): number {
    const known = this.widths.get(`${kind} ${text}`);
    if (known !== undefined) return known;
    this.painter.font = fontOf(kind);
    const width = this.painter.measureText(text).width;
    this.widths.set(`${kind} ${text}`, width);
    return width;
  }

  /** The card over the parchment, drawn by the game as a layer of its interface while the map is up: where the course
   *  is set for, the seas to sail it in, and the press to sail. */
  node(ui: Interface): Child {
    const shown = this.shownAt;
    const choice = this.choice;
    if (!shown || !choice) return null;
    const ok = choice.course.ok;
    const words = ok ? `Set a course for ${choice.name}` : choice.course.why;
    const said = (text: string): Node => ({ text: { words: text, colour: TONES.ink, wrap: false }, through: true });
    return {
      id: 'held-card',
      alignY: 'center',
      gap: 14,
      padding: [8, 14],
      opacity: shown.lift,
      // Drawn, not filled, so only its presses take the pointer and a click beside them reaches the map.
      draw: cardGround,
      float: {
        to: 'screen',
        anchor: [0.5, 1],
        x: Math.round(this.ink.x + this.ink.width / 2),
        y: Math.round(this.ink.y + shown.drop - 12),
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
        ok &&
          button(ui, 'held-sail', ['Set sail', this.sailKey()].filter(Boolean).join('  '), () => this.setSail(), {
            role: 'primary',
            padding: [7, 14],
          }),
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

/** What the map's layout reads, as one string: the map's view, the stage's ink and hands, the face's loading, how often
 *  the charted sea was set, the ship's point and heading, the places and islands known, and the place chosen. */
export function layoutKey(
  view: View,
  stage: { readonly ink: Rect; readonly sprite: Rect },
  fonts: string,
  chartings: number,
  scene: HeldMapScene,
  chosen: string | null,
): string {
  const { ship, heading, places, knownIslands } = scene;
  return JSON.stringify([view, stage.ink, stage.sprite, fonts, chartings, ship, heading, places, knownIslands, chosen]);
}

/** A value made again only when its key changes: the held map's layout, keyed by `layoutKey`. */
export class Kept<Value> {
  private key: string | null = null;
  private value: Value | undefined;

  made(key: string, make: () => Value): Value {
    if (key !== this.key || this.value === undefined) [this.value, this.key] = [make(), key];
    return this.value;
  }
}

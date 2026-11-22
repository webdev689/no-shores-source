import { FEEL } from '../combat/attackFeel.ts';
import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { Hud } from '../combat/hud.ts';
import type { BannerTone } from '../combat/publicBanner.ts';
import type { Box as Laid } from '../ui/quads.ts';
import { abilityPictures } from './artsCards.ts';
import { MarkDraw } from '../combat/markDraw.ts';
import type { Gpu } from '../gpu.ts';
import type { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { uiScale } from '../ui/uiRenderer.ts';
import type { Cards } from '../player/cards.ts';
import { SAMPLES } from '../water/waterView.ts';
import { fromEyeMatrix, type Shot, shifted, shiftedExactly } from './camera.ts';
import { times } from './deckFight.ts';
import type { Foot, FootFrame } from './foot.ts';
import type { NodeInfo } from './worldData.ts';
import type { Drawer } from './scene.ts';
import { SwingView } from './swingView.ts';

type Point = readonly [number, number, number];

/** What the view reads of a place played on foot: its blood's origin (its node's first spawn, else its centre), the
 *  boxes its blood lies on, its fight, and whether its room is being joined again. A node's `Foot` is one; so is the
 *  prologue's wreck. */
export type FootShown = Pick<Foot, 'boxes' | 'fight' | 'rejoining'> & {
  readonly node: Pick<NodeInfo, 'spawns' | 'centre'>;
};

/** The land is drawn a little off the ground bodies stand on, so what lies on it (the marks of telegraphed blows, the
 *  blood) is drawn this much higher, in metres, or the drawn land would hide it. */
const OVER_THE_LAND_M = 0.12;

/**
 * The fight on foot as the game shows it: its blood on the node's land and boxes, its marks on the ground and in the
 * air, and its display over the view, under the game's own (its place, its hints, its menus and its veil).
 */
export class FootView {
  private readonly gpu: Gpu;
  private readonly marks: MarkDraw;
  private readonly swings: SwingView;
  private readonly hud: Hud;
  /** Whether the fight's display shows: on foot only. */
  private showing = false;
  private blood: { readonly foot: FootShown; readonly drawn: FightBlood; readonly origin: Point } | null = null;

  /** The display is a layer of `stack` under the game's own; `beside` answers where the game's own pieces over the
   *  view stand (its hints, in the interface's pixels), which the fight's display keeps clear of. */
  constructor(gpu: Gpu, stack: Stack, forge: Cards, beside: (ui: Interface) => readonly Laid[] = () => []) {
    this.gpu = gpu;
    this.marks = new MarkDraw(gpu, SAMPLES);
    this.swings = new SwingView(gpu);
    // Where the game's own pieces stand, as the interface last laid them.
    let laidBy: Interface | null = null;
    this.hud = new Hud(abilityPictures, forge, () =>
      (laidBy ? beside(laidBy) : []).map((box) => ({
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      })),
    );
    stack.under((ui) => {
      laidBy = ui;
      return this.showing ? this.hud.node(ui) : null;
    });
  }

  /** Whether the fight's display shows (on foot), whether a Boss's bar or a public event's banner (its tone) stands
   *  under its compass, which the game's own pieces at the top give way to. */
  get shown(): { readonly fight: boolean; readonly bossed: boolean; readonly banner: BannerTone | null } {
    return {
      fight: this.showing,
      bossed: this.showing && this.hud.bossed,
      banner: this.showing ? this.hud.bannerTone : null,
    };
  }

  /** The node's blood, kept from its first spawn so its marks keep their centimetres; made again in a new node. */
  private bloodOf(foot: FootShown, groundAt: (x: number, y: number) => number | null) {
    if (this.blood?.foot === foot) return this.blood;
    this.blood?.drawn.destroy();
    const [x, y] = foot.node.spawns[0] ?? foot.node.centre;
    const origin: Point = [x, y, 0];
    const surfaces = surfacesOf(foot.boxes, (east, south) => groundAt(east, south) ?? 0);
    this.blood = { foot, drawn: new FightBlood(this.gpu, surfaces, location.search, origin, SAMPLES), origin };
    return this.blood;
  }

  /**
   * One frame of the fight on foot: its blood run on by `seconds`, its marks taken, and its display shown over a canvas
   * `viewport` CSS pixels big (the display lays out in the drawn interface's own), drawn `size` device pixels. Answers the drawers that lie under the figures (the blood)
   * and over them (the marks; the arcs and the see-through marks over the water; and the light of marks and arcs while
   * the attack feel's light is on and there are any). On a struck ship's deck (`onBoarded`), the fight is in its own frame
   * and drawn through the world's `shot` as its deck's `turn` lays it into the world.
   */
  frame(
    foot: FootShown,
    shown: FootFrame,
    seconds: number,
    {
      size,
      groundAt,
      onBoarded,
    }: {
      size: { readonly width: number; readonly height: number };
      viewport: { readonly width: number; readonly height: number };
      groundAt: (x: number, y: number) => number | null;
      onBoarded?: { readonly shot: Shot; readonly turn: Float32Array };
    },
  ): { under: Drawer; over: Drawer } {
    this.showing = true;
    const { shot, fight } = shown;
    const aspect = size.width / Math.max(1, size.height);
    const fromEye = onBoarded
      ? times(fromEyeMatrix(onBoarded.shot, aspect), onBoarded.turn)
      : fromEyeMatrix(shot, aspect);
    // The scene's matrices take the world's steps from its eye; its deck's steps are turned into the world's first.
    const own = (eyeMatrix: Float32Array) => (onBoarded ? times(eyeMatrix, onBoarded.turn) : eyeMatrix);
    const [eyeX, eyeY, eyeZ] = shot.eye;
    const blood = this.bloodOf(foot, groundAt);
    const [originX, originY, originZ] = blood.origin;
    const local: Point = [eyeX - originX, eyeY - originY, eyeZ - originZ];
    blood.drawn.frame(seconds, fight.events, foot.fight, {
      viewProjection: shifted(fromEye, [-local[0], -local[1], OVER_THE_LAND_M - local[2]]),
      focus: local,
      eye: local,
      right: [Math.cos(shot.yaw), Math.sin(shot.yaw), 0],
    });
    // The marks are measured from the eye: it stands at their origin.
    this.marks.set(shown.marks, [0, 0, 0], shot.eye);
    this.marks.setAbove(shown.lit);
    this.swings.set(shown.swings);
    const matrix = shiftedExactly(fromEye, [-eyeX, -eyeY, -eyeZ]);
    this.hud.update(
      {
        ...fight,
        matrix,
        // In the drawn interface's own pixels, where it lays the display out.
        width: size.width / uiScale(devicePixelRatio),
        height: size.height / uiScale(devicePixelRatio),
        lost: null,
        rejoining: foot.rejoining,
        groundAt,
      },
      seconds,
    );
    const drawn = blood.drawn;
    const marks = this.marks;
    const raised = (eyeMatrix: Float32Array) => shifted(own(eyeMatrix), [0, 0, OVER_THE_LAND_M]);
    const lit = FEEL.light && (shown.marks.length > 0 || shown.swings.length > 0);
    const lightInto = (pass: GPURenderPassEncoder, eyeMatrix: Float32Array) => {
      marks.drawLight(pass, raised(eyeMatrix));
      this.swings.drawLight(pass, own(eyeMatrix));
    };
    return {
      under: { drawInto: (pass) => drawn.draw(pass) },
      // The solid marks with the figures; the blows' arcs and the see-through marks over the water, so its sky and
      // surface never cover them; and the lit keepers' marks after them with no depth, so no wall hides them.
      over: {
        drawInto: (pass, eyeMatrix) => marks.drawSolid(pass, raised(eyeMatrix)),
        overWater: (encoder, target, eyeMatrix, depth) => {
          this.swings.drawOver(encoder, target, depth, own(eyeMatrix));
          marks.drawClearOver(encoder, target, depth, raised(eyeMatrix));
          marks.drawAbove(encoder, target, raised(eyeMatrix));
        },
        ...(lit ? { lightInto } : {}),
      },
    };
  }

  /** Hides the fight's display for this frame alone, its drawing kept: as while the held map is up. */
  hideDisplay(): void {
    this.showing = false;
  }

  /** Hides the fight's display off foot, and lets go of the last node's blood. */
  hide(): void {
    this.showing = false;
    this.blood?.drawn.destroy();
    this.blood = null;
  }
}

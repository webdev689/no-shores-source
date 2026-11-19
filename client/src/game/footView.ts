import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { Hud } from '../combat/hud.ts';
import { abilityPictures } from './artsCards.ts';
import { MarkDraw } from '../combat/markDraw.ts';
import type { Gpu } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';
import { fromEyeMatrix, shifted } from './camera.ts';
import type { Foot, FootFrame } from './foot.ts';
import type { Drawer } from './scene.ts';
import { SwingView } from './swingView.ts';

type Point = readonly [number, number, number];

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
  private readonly root: HTMLElement;
  private readonly hud: Hud;
  private blood: { readonly foot: Foot; readonly drawn: FightBlood; readonly origin: Point } | null = null;

  constructor(gpu: Gpu, hudRoot: HTMLElement) {
    this.gpu = gpu;
    this.marks = new MarkDraw(gpu, SAMPLES);
    this.swings = new SwingView(gpu);
    this.root = document.createElement('div');
    this.root.className = 'fight';
    this.root.hidden = true;
    hudRoot.prepend(this.root);
    this.hud = new Hud(this.root, abilityPictures);
  }

  /** The node's blood, kept from its first spawn so its marks keep their centimetres; made again in a new node. */
  private bloodOf(foot: Foot, groundAt: (x: number, y: number) => number | null) {
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
   * `viewport` CSS pixels big, drawn `size` device pixels. Answers the drawers that lie under the figures (the blood)
   * and over them (the marks, their see-through ones over the water too).
   */
  frame(
    foot: Foot,
    shown: FootFrame,
    seconds: number,
    {
      size,
      viewport,
      groundAt,
    }: {
      size: { readonly width: number; readonly height: number };
      viewport: { readonly width: number; readonly height: number };
      groundAt: (x: number, y: number) => number | null;
    },
  ): { under: Drawer; over: Drawer } {
    this.root.hidden = false;
    const { shot, fight } = shown;
    const fromEye = fromEyeMatrix(shot, size.width / Math.max(1, size.height));
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
    this.swings.set(shown.swings, shot.eye);
    const matrix = shifted(fromEye, [-eyeX, -eyeY, -eyeZ]);
    this.hud.update(
      { ...fight, matrix, width: viewport.width, height: viewport.height, lost: null, rejoining: foot.rejoining },
      seconds,
    );
    const drawn = blood.drawn;
    const marks = this.marks;
    const raised = (eyeMatrix: Float32Array) => shifted(eyeMatrix, [0, 0, OVER_THE_LAND_M]);
    return {
      under: { drawInto: (pass) => drawn.draw(pass) },
      // The solid marks and the blows' arcs with the figures; the see-through marks over the water, so it never
      // covers them.
      over: {
        drawInto: (pass, eyeMatrix) => {
          marks.drawSolid(pass, raised(eyeMatrix));
          this.swings.drawInto(pass, eyeMatrix);
        },
        overWater: (encoder, target, eyeMatrix, depth) =>
          marks.drawClearOver(encoder, target, depth, raised(eyeMatrix)),
      },
    };
  }

  /** Hides the fight's display off foot, and lets go of the last node's blood. */
  hide(): void {
    this.root.hidden = true;
    this.blood?.drawn.destroy();
    this.blood = null;
  }
}

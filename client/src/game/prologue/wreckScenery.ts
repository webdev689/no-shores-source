import type { Flames } from '../../cinema/flames.ts';
import type { Gpu } from '../../gpu.ts';
import type { Drawer } from '../scene.ts';
import { WRECK } from './skies.ts';
import type { Story } from './story.ts';
import type { WreckLayout } from './wreckLayout.ts';
import { type WreckMesh, WreckView } from './wreckView.ts';

/** The wreck's sounds: its fires, the rain and wind, the sea against the hulls and their timbers working. */
const WRECK_SOUNDS = { fire: 0.8, rain: 0.65, wind: 0.5, waves: 0.8, creak: 0.9, deep: 0, gulls: 0 } as const;

/** The wreck's light as drawn: all of the fires' baked light, and the sky's at the share that matches what a ship's
 *  own deck takes in the storm (its ambient and the sun on its planks). */
const LOOK = { fire: 1, sky: 0.85 } as const;

/** Lights the wreck's fires, each with its own flicker. */
export function lightFires(flames: Flames, layout: WreckLayout): void {
  flames.clear();
  layout.fires.forEach((fire, index) => flames.light(fire.at, fire.size, index + 1));
}

/** The wreck as each of its beats on deck opens on it, so a page begun at one plays as the story does: its storm,
 *  its fires and their sounds, and no lightning of the storm's own. */
export function setAblaze(story: Story, layout: WreckLayout): void {
  const { stage } = story;
  story.lightning.striking = false;
  stage.weatherTowards(WRECK, 0);
  lightFires(stage.parts.flames, layout);
  stage.parts.ambience.set(WRECK_SOUNDS, 2);
}

/** The wreck's mesh and its baked light, once they have come. */
export interface WreckDrawn {
  readonly mesh: WreckMesh;
  readonly light: ImageBitmap;
}

/**
 * The wreck as drawn, from the wake to the deep: the mesh built in Blender, laid at `origin`, every heap of wreckage
 * across the way drawn while it stands. It draws nothing until its mesh and light have come; a wreck that cannot
 * come is drawn as nothing, and the beats go on over the sea.
 */
export class WreckScenery {
  /** The zones whose heaps stand. */
  readonly standing = new Set<number>();
  private view: WreckView | null = null;
  private state: 'coming' | 'drawn' | 'failed' = 'coming';
  private left = false;
  private readonly origin: readonly [number, number];

  constructor(gpu: Gpu, drawn: Promise<WreckDrawn>, layout: WreckLayout, origin: readonly [number, number]) {
    this.origin = origin;
    layout.zones.forEach((zone, index) => {
      if (zone.gate) this.standing.add(index);
    });
    drawn.then(
      ({ mesh, light }) => {
        if (this.left) return;
        this.view = new WreckView(gpu, mesh, light);
        this.state = 'drawn';
      },
      (error: unknown) => {
        console.error('the wreck could not be drawn:', error);
        this.state = 'failed';
      },
    );
  }

  /** Whether its mesh and light are still on their way. */
  get coming(): boolean {
    return this.state === 'coming';
  }

  /** The drawer the scene draws it with. */
  get drawer(): Drawer {
    return {
      drawInto: (pass, fromEye, shot, time) => {
        // A heap is its zone's run of the mesh: piece z + 1 for the heap closing zone z.
        this.view?.drawInto(pass, this.origin, { fromEye, eye: shot.eye }, { ...LOOK, flash: 0, time }, (piece) =>
          this.standing.has(piece - 1),
        );
      },
    };
  }

  /** Lets go of everything it holds on the GPU; it is never drawn again. */
  destroy(): void {
    this.left = true;
    this.view?.destroy();
    this.view = null;
  }
}

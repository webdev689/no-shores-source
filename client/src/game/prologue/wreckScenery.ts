import { FIRELIGHT, type LampPlace } from '../../sky/lamps.ts';
import type { Flames } from '../../cinema/flames.ts';
import type { Gpu } from '../../gpu.ts';
import type { HullMask } from '../../water/hullMask.ts';
import type { Drawer } from '../scene.ts';
import { WRECK } from './skies.ts';
import type { Story } from './story.ts';
import type { WreckLayout } from './wreckLayout.ts';
import { type WreckLook, type WreckMesh, WreckView } from './wreckView.ts';

/** The wreck's sounds: its fires, the rain and wind, the sea against the hulls and their timbers working. */
const WRECK_SOUNDS = { fire: 0.8, rain: 0.65, wind: 0.5, waves: 0.8, creak: 0.9, deep: 0, gulls: 0 } as const;

/** The share of the fires' baked light the wreck is drawn with; the sky's is the game's sky, as a ship's is. */
const FIRE_SHARE = 1;

/** Lights the wreck's fires, each with its own flicker. */
export function lightFires(flames: Flames, layout: WreckLayout): void {
  flames.clear();
  layout.fires.forEach((fire, index) => flames.light(fire.at, fire.size, index + 1, fire.along ?? undefined));
}

/** The wreck as each of its beats on deck opens on it, so a page begun at one plays as the story does: its storm,
 *  its fires and their sounds, and no lightning of the storm's own. */
export function setAblaze(story: Story, layout: WreckLayout): void {
  const { stage } = story;
  story.lightning.striking = false;
  stage.weatherTowards(WRECK, 0);
  lightFires(stage.parts.flames, layout);
  stage.parts.scene.lamps = fireLamps(layout);
  stage.parts.ambience.set(WRECK_SOUNDS, 2);
}

/** How far a fire's light reaches round it as a lamp, metres (this, and this much more a metre of its size), and how
 *  strong it is against a city's lantern: a soft fill under the flames' own light, which lights what stands nearest. */
const LAMP_REACH_M = 4;
const LAMP_REACH_A_METRE = 3;
const LAMP_STRENGTH = 0.4;

/** Each fire as a lamp of the game's night, at the middle of its flames (a line fire's, halfway along it). */
export function fireLamps(layout: WreckLayout): LampPlace[] {
  return layout.fires.map((fire, index) => {
    const [east, south, up] = fire.along ?? [0, 0, 0];
    return {
      at: [fire.at[0] + east / 2, fire.at[1] + south / 2, fire.at[2] + up / 2 + fire.size * 0.5],
      reachM: LAMP_REACH_M + LAMP_REACH_A_METRE * fire.size,
      light: [FIRELIGHT[0] * LAMP_STRENGTH, FIRELIGHT[1] * LAMP_STRENGTH, FIRELIGHT[2] * LAMP_STRENGTH],
      seed: index + 1,
    };
  });
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
  /** Where the sea is not drawn: its ships' waterlines and its rafts, which the swell would rise through. Every beat
   *  that draws the wreck hands them to the water. */
  readonly hulls: readonly HullMask[];
  private view: WreckView | null = null;
  /** Its mesh once it has come, which the camera on its decks keeps clear of. */
  mesh: WreckMesh | null = null;
  private state: 'coming' | 'drawn' | 'failed' = 'coming';
  private left = false;
  private readonly origin: readonly [number, number];

  private readonly gpu: Gpu;
  private readonly drawn: () => Promise<WreckDrawn>;

  /** Its mesh and light are asked for of `drawn`, which fetches them once they have come and again after a failure. */
  constructor(gpu: Gpu, drawn: () => Promise<WreckDrawn>, layout: WreckLayout, origin: readonly [number, number]) {
    [this.gpu, this.drawn, this.origin] = [gpu, drawn, origin];
    this.hulls = layout.dry;
    layout.zones.forEach((zone, index) => {
      if (zone.gate) this.standing.add(index);
    });
    this.ask();
  }

  /** Asks again for a mesh and light that failed to come, as each beat that shows the wreck begins. */
  again(): void {
    if (this.state === 'failed' && !this.left) this.ask();
  }

  private ask(): void {
    this.state = 'coming';
    this.drawn().then(
      ({ mesh, light }) => {
        if (this.left) return;
        this.view = new WreckView(this.gpu, mesh, light);
        this.mesh = mesh;
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

  /** A light near the wreck, the wisp's, while it shines. */
  near: WreckLook['near'] = null;

  /** The drawer the scene draws it with. */
  get drawer(): Drawer {
    return {
      drawInto: (pass, fromEye, shot, time) => {
        const look = { fire: FIRE_SHARE, time, near: this.near };
        // A heap is its zone's run of the mesh: piece z + 1 for the heap closing zone z.
        this.view?.drawInto(pass, this.origin, { fromEye, eye: shot.eye }, look, (piece) =>
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
    this.mesh = null;
  }
}

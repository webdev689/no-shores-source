// For trying the ambush under `npm run dev` with `?ambush=1`: once she is at sea, three pirates are set upon her
// where she lies, and the story's fight is drawn in place of the sea's own frame, her ship the Brig. The keys reach
// the fight (W to set sail, A and D to steer, C to brace); `window.__ambush` turns the camera for pictures.
import type { Gpu } from '../../gpu.ts';
import type { Swell } from '../../rules/landRules.ts';
import { MarkView } from '../../ships/markView.ts';
import { type ShipView, shipViewNamed } from '../../ships/shipView.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { Drawer, GameScene } from '../scene.ts';
import { type Ambusher, StoryFight } from './fightAtSea.ts';

/** The trial's pirates: off her bows and her quarter, near enough to close at once. */
const PIRATES: readonly Ambusher[] = [
  { bearing: 0.5, distanceM: 420, faction: 2, rank: 1 },
  { bearing: -0.9, distanceM: 480, faction: 2, rank: 2 },
  { bearing: 2.6, distanceM: 520, faction: 2, rank: 1 },
];
/** How far the trial's camera draws, metres. */
const FAR_M = 20_000;

/** What the trial needs of the game: the land worker, the GPU, the scene and its standing drawers, and the Sloop's
 *  view the pirates are drawn with. */
export interface AmbushNeeds {
  readonly land: LandWorker;
  readonly gpu: Gpu;
  readonly scene: GameScene;
  readonly standing: () => Drawer[];
  readonly sloop: ShipView;
}

let trial: { fight: StoryFight | null; brig: ShipView | null } | null = null;

/** Draws the trial's frame and answers true, once begun round her `ship`; false while it is still coming. */
export function ambushFrame(
  needs: AmbushNeeds,
  ship: { x: number; y: number; heading: number },
  frame: { clock: number; seconds: number; size: { width: number; height: number }; swell: Swell | undefined },
): boolean {
  if (!trial) {
    const started: { fight: StoryFight | null; brig: ShipView | null } = { fight: null, brig: null };
    trial = started;
    void shipViewNamed(needs.gpu, 'brig', 1).then((brig) => (started.brig = brig));
    void StoryFight.begin(
      needs.land,
      ship,
      PIRATES,
      { sails: needs.sloop.sails, marks: new MarkView(needs.gpu) },
      frame.clock,
    ).then((fight) => {
      started.fight = fight;
      Object.assign(window, { __ambush: fight });
      const key = (down: boolean) => (event: KeyboardEvent) => void fight.key(event.key.toLowerCase(), down);
      addEventListener('keydown', key(true));
      addEventListener('keyup', key(false));
    });
  }
  const { fight, brig } = trial;
  if (!fight) return false;
  const shown = fight.frame({ seconds: frame.seconds, time: frame.clock, far: FAR_M, swell: frame.swell });
  const ships: Drawer = {
    drawInto: (pass, fromEye, shot, time) => {
      const camera = { fromEye, eye: shot.eye };
      shown.ships.forEach((drawn, slot) => {
        if (drawn.sunk) return;
        if (drawn.hull === 'own') brig?.drawInto(pass, drawn.place, camera, 0, drawn.shade, drawn.rig);
        else needs.sloop.drawInto(pass, drawn.place, camera, slot, drawn.shade, drawn.rig);
      });
      fight.draw(pass, camera, time);
    },
  };
  const [own] = shown.ships;
  const focus = own ? ([own.place.x, own.place.y] as const) : undefined;
  needs.scene.draw(shown.shot, frame.size, frame.clock, frame.seconds, [...needs.standing(), ships], {
    hulls: shown.hulls,
    ...(focus ? { focus } : {}),
  });
  return true;
}

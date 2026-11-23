// What stands on the open landmass in a frame, as every view of the game draws it: the land's city, layouts and
// nature, the fight's blood under the figures, the ships and what a fight at sea draws with them, the figures
// themselves (casting their shadows first), and the fight's marks over them.
import type { CardAt } from '../player/cards.ts';
import type { ShipCamera } from '../ships/shipView.ts';
import type { FigureView } from './figureView.ts';
import type { LandDrawers } from './landDrawers.ts';
import type { Drawer } from './scene.ts';

export function standingDrawers(
  land: Pick<LandDrawers, 'city' | 'layouts' | 'nature'> | null,
  ships: (pass: GPURenderPassEncoder, camera: ShipCamera, time: number) => void,
  figureView: FigureView,
  figures: readonly CardAt[],
  fight?: { readonly under: Drawer; readonly over: Drawer },
): Drawer[] {
  const found: (Drawer | null | undefined)[] = [
    land?.city,
    land?.layouts,
    land?.nature,
    fight?.under,
    { drawInto: (pass, fromEye, shot, time) => ships(pass, { fromEye, eye: shot.eye }, time) },
    {
      castInto: (pass, fromEye, shot, _time, shadow) =>
        figureView.castInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
      drawInto: (pass, fromEye, shot, _time, shadow) =>
        figureView.drawInto(
          pass,
          fromEye,
          shot.eye,
          shot.yaw,
          figures,
          shadow,
          undefined,
          !!(land?.city || land?.layouts),
        ),
    },
    fight?.over,
  ];
  return found.filter((drawer): drawer is Drawer => !!drawer);
}

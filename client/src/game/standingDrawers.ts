// The drawers that stand on the open landmass each frame, in the order they draw: its city and its nature, on foot the
// fight's blood, the ships near (with a sea fight's effects), the figures, and on foot the fight's marks over them.
import type { CardAt } from '../player/cards.ts';
import type { ShipModels } from '../ships/shipModels.ts';
import type { FigureView } from './figureView.ts';
import type { Drawer } from './scene.ts';
import type { SeaCombat } from './seaCombat.ts';
import type { SeaShip } from './seaShips.ts';

/** What stands on the open landmass: its city and nature as opened, and the views that draw ships and figures. */
export interface StandingParts {
  readonly city: Drawer | null | undefined;
  readonly nature: Drawer | null | undefined;
  readonly shipModels: ShipModels;
  readonly figureView: FigureView;
  readonly seaFight: SeaCombat | null | undefined;
}

/** The frame's standing drawers: `ships` and `figures` where they are this frame, and a fight on foot's two layers. */
export function standingDrawers(
  parts: StandingParts,
  ships: readonly SeaShip[],
  figures: readonly CardAt[],
  fight?: { under: Drawer; over: Drawer },
): Drawer[] {
  const found: (Drawer | null | undefined)[] = [
    parts.city,
    parts.nature,
    fight?.under,
    {
      castInto: (pass, fromEye, shot, _time, shadow) =>
        parts.shipModels.castInto(pass, ships, { fromEye, eye: shot.eye }, shadow),
      drawInto: (pass, fromEye, shot, time, shadow) => {
        const camera = { fromEye, eye: shot.eye };
        parts.shipModels.draw(pass, ships, camera, shadow);
        parts.seaFight?.draw(pass, camera, time);
      },
    },
    {
      castInto: (pass, fromEye, shot, _time, shadow) =>
        parts.figureView.castInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
      drawInto: (pass, fromEye, shot, _time, shadow) =>
        parts.figureView.drawInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
    },
    fight?.over,
  ];
  return found.filter((drawer): drawer is Drawer => !!drawer);
}

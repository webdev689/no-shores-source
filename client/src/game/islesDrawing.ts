// The sea's islands as the scene draws them: their modules on their ground tiles (`gameIsles`, in a file of its own,
// since the islands' manifest is read by the page's bundler alone) and their land's own plants (`isleNature.ts`).
import { IslesNature } from './isleNature.ts';
import { gameIsles } from './isleTiles.ts';
import type { Drawer } from './scene.ts';

/** The sea's islands as drawn: their modules (`IslesView`) and their land's own plants, as one drawer of the scene. */
export function islesDrawing(gpu: ConstructorParameters<typeof IslesNature>[0]) {
  const view = gameIsles(gpu);
  const nature = new IslesNature(gpu);
  const drawer: Drawer = {
    castInto: (pass, fromEye, shot, time, shadow) => {
      view.castInto(pass, fromEye, shot, time, shadow);
      nature.castInto(pass, fromEye, shot, time, shadow);
    },
    drawInto: (pass, fromEye, shot, time, shadow) => {
      view.drawInto(pass, fromEye, shot, time, shadow);
      nature.drawInto(pass, fromEye, shot, time, shadow);
    },
  };
  return { view, nature, drawer };
}

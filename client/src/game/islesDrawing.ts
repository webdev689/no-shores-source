// The sea's islands as the scene draws them: their modules (`IslesView`) and their land's own plants (`isleNature.ts`)
// as one drawer. Its own file, since the islands' manifest is read by the page's bundler alone.
import { ISLE_MANIFEST, islePacksPrefix } from '../islands/isleManifest.ts';
import { GROWTH_ROLES, IslesView } from '../islands/isleView.ts';
import { IslesNature } from './isleNature.ts';
import type { Drawer } from './scene.ts';

/** The sea's islands as drawn: their modules (`IslesView`) and their land's own plants, as one drawer of the scene. */
export function islesDrawing(gpu: ConstructorParameters<typeof IslesNature>[0]) {
  const view = new IslesView(gpu, ISLE_MANIFEST, islePacksPrefix(location.search), undefined, GROWTH_ROLES);
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

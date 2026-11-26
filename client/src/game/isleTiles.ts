// The sea's islands as the game draws them: from the published kits, their plants left to the land's (`isleNature.ts`),
// and their ground wearing the land's ground tiles, painted for each island's climate as the land's are.
import { painting } from '../city/painter.ts';
import type { Gpu } from '../gpu.ts';
import { ISLE_MANIFEST, islePacksPrefix } from '../islands/isleManifest.ts';
import { GROWTH_ROLES, IslesView, type TilesOf } from '../islands/isleView.ts';
import { groundTiles } from './groundTiles.ts';

/** Each climate's ground tiles for the islands (`IslesView`'s `tilesOf`), as `groundTiles` paints the land's. */
export const isleTiles =
  (gpu: Gpu): TilesOf =>
  (climate, onPainted) => {
    const painter = groundTiles(gpu, climate, onPainted);
    return { view: painter.view, painting: () => painting(painter), destroy: () => painter.destroy() };
  };

/** The game's view of the sea's islands and the passages' hollows. */
export const gameIsles = (gpu: Gpu): IslesView =>
  new IslesView(gpu, ISLE_MANIFEST, islePacksPrefix(location.search), undefined, GROWTH_ROLES, isleTiles(gpu));

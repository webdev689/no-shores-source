// What the game loads before anything is shown: the world's layout and edits, the RMB index's blocks, the movement
// rules, the forge's figures with the first person's hands, and the Sloop's model, all at once.
import { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import { loadForgedBirds } from '../combat/forgedBirds.ts';
import { openCards } from '../player/cards.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { loadShip, shipSails } from '../ships/shipMesh.ts';
import { ShipView } from '../ships/shipView.ts';
import type { FigureView } from './figureView.ts';
import { loadWorld } from './worldData.ts';

/** The most ships drawn at sea in a frame: the player's and those near it. */
const SEA_SHIPS = 16;

/** The forge's figures and the first person's hands, read from the forge's published renders. */
async function openForge(gpu: Gpu, figures: FigureView) {
  const { forge, store } = await openCards(figures);
  loadForgedBirds((path) => store.strip(path));
  return { forge, firstPerson: await FirstPerson.open(gpu, store), store };
}

/** Everything the game needs loaded first, from the pages served under `base`. */
export async function loadParts(gpu: Gpu, base: string, figureView: FigureView) {
  const [world, rmbText, movement, { forge, firstPerson, store }, sloop] = await Promise.all([
    loadWorld(base),
    fetch(`${base}world/rmb/index.json`)
      .then((answer) => (answer.ok ? answer.text() : null))
      .catch(() => null),
    fetch(`${base}movement.wasm`)
      .then((answer) => {
        if (!answer.ok) throw new Error(`movement.wasm: ${answer.status}`);
        return answer.arrayBuffer();
      })
      .then(startMovementRules),
    openForge(gpu, figureView),
    loadShip('sloop').then((mesh) => new ShipView(gpu, mesh, shipSails('sloop'), SEA_SHIPS)),
  ]);
  return { world, rmbText, movement, forge, firstPerson, store, sloop };
}

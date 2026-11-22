import { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import { loadForgedBirds } from '../combat/forgedBirds.ts';
import { openCards } from '../player/cards.ts';
import { loadNodeCards } from './nodeCards.ts';
import type { FigureView } from './figureView.ts';

/** The forge's figures and the first person's hands, read from the forge's published renders. */
export async function openForge(gpu: Gpu, figures: FigureView) {
  const { forge, store } = await openCards(figures);
  loadForgedBirds((path) => store.strip(path));
  loadNodeCards(
    (path) => store.strip(path),
    (pixels, width, height, root) => figures.card(pixels, width, height, root),
  );
  return { forge, firstPerson: await FirstPerson.open(gpu, store), store };
}

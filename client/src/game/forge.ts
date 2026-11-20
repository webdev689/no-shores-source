import { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import { openCards } from '../player/cards.ts';
import type { FigureView } from './figureView.ts';

/** The forge's figures and the first person's hands, read from the forge's published renders. */
export async function openForge(gpu: Gpu, figures: FigureView) {
  const { forge, store } = await openCards(figures);
  return { forge, firstPerson: await FirstPerson.open(gpu, store), store };
}

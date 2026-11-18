// The forge's figures and the first person's hands, opened from the forge's published renders for the game.
import { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Colours } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { Cards } from '../player/cards.ts';
import type { FigureView } from './figureView.ts';

/** The forge's figures and the first person's hands, read from the forge's published renders. */
export async function openForge(
  gpu: Gpu,
  figures: FigureView,
): Promise<{ forge: Cards; firstPerson: FirstPerson; store: ForgeStore }> {
  const store = await ForgeStore.open();
  const [looks, skins, hair, dyes] = await Promise.all([
    store.table<ForgeLooks>('looks'),
    store.table<RaceSkins>('skins'),
    store.table<HairColours>('hair'),
    store.table<DyeTable>('dyes'),
  ]);
  const colours: Colours = { skins, hair, snap: new PaletteSnap(dyes.palette) };
  return {
    forge: new Cards(figures, store, looks, colours, dyes),
    firstPerson: await FirstPerson.open(gpu, store),
    store,
  };
}

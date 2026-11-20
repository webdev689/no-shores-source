// The fight's display over the World Editor's picture, as the game shows it at sea: each captain's plate over her
// masthead, and in a captain's fight the readout (her plate and battery rose, the card and the tally) beside them.
import { wearKit } from '../plus/kit.ts';
import { SeaFightReadout, type SeaFightModel, wearSeaFight } from '../plus/seaFight.ts';
import { type ShipBar, ShipPlates } from './shipBars.ts';

/** Where a point (window metres) falls on a picture of `size`, or null behind the eye. */
type Projector = (size: { readonly width: number; readonly height: number }) => Parameters<ShipPlates['draw']>[2];

export class FightOverlay {
  /** The picture's overlay, which the editor clears each frame: each captain's plate is drawn on it. */
  private readonly overlay: SVGSVGElement;
  private readonly plates = new ShipPlates();
  /** Made beside the overlay the first time a fight shows it. */
  private readout: SeaFightReadout | null = null;

  constructor(overlay: SVGSVGElement) {
    this.overlay = overlay;
  }

  /** Draws `bars` where `project` lays them at `now` (seconds), and shows `model`, or hides the readout for none. */
  show(bars: readonly ShipBar[], project: Projector, now: number, model: SeaFightModel | null): void {
    if (bars.length > 0) {
      const size = { width: this.overlay.clientWidth, height: this.overlay.clientHeight };
      this.plates.draw(this.overlay, bars, project(size), size.width, now);
    }
    const parent = this.overlay.parentElement;
    if (!this.readout && model && parent) {
      wearKit(parent.ownerDocument);
      wearSeaFight(parent.ownerDocument);
      this.readout = new SeaFightReadout(parent);
    }
    this.readout?.update(model);
  }
}

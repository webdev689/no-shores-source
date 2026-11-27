// Whether the held map's legend shows, its table on land and its key at sea, kept in this browser: hidden, as a player
// asked, nothing of the map lies under it.
const LEGEND_KEY = 'noshores.mapLegend';

export class MapLegend {
  /** Whether it shows: it does unless it was left hidden. */
  shown = MapLegend.kept();

  /** Shows it, or hides it, and keeps that for the next map. */
  toggle(): void {
    this.shown = !this.shown;
    try {
      localStorage.setItem(LEGEND_KEY, this.shown ? 'shown' : 'hidden');
    } catch {
      // A browser that keeps nothing still hides it until the page closes.
    }
  }

  private static kept(): boolean {
    try {
      return localStorage.getItem(LEGEND_KEY) !== 'hidden';
    } catch {
      return true;
    }
  }
}

// Where the game's window opens: where it was left, while a screen still shows enough of it to be grabbed; otherwise
// centred on the main screen, large but not past a usual monitor, so a first launch never opens a sliver or a window
// bigger than the screen. A window left on a screen since unplugged comes back to the main one.
import type { WindowPlace } from './config.ts';

/** A screen's work area: what windows may cover, its taskbar or dock left out. */
export interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest the window may be: the game lays out its interface down to this. */
export const LEAST_WIDTH = 960;
export const LEAST_HEIGHT = 600;
/** A first window's share of the screen, and its most. */
const FIRST_SHARE = 0.8;
const FIRST_MOST_WIDTH = 1920;
const FIRST_MOST_HEIGHT = 1080;
/** How much of a kept window must stand on a screen for it to open there. */
const SHOWN_LEAST = 120;

function overlap(place: Area, area: Area): { width: number; height: number } {
  const width = Math.min(place.x + place.width, area.x + area.width) - Math.max(place.x, area.x);
  const height = Math.min(place.y + place.height, area.y + area.height) - Math.max(place.y, area.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** A first window on `main`. */
export function firstPlace(main: Area): WindowPlace {
  const width = Math.round(Math.min(FIRST_MOST_WIDTH, Math.max(LEAST_WIDTH, main.width * FIRST_SHARE)));
  const height = Math.round(Math.min(FIRST_MOST_HEIGHT, Math.max(LEAST_HEIGHT, main.height * FIRST_SHARE)));
  return {
    x: Math.round(main.x + (main.width - width) / 2),
    y: Math.round(main.y + (main.height - height) / 2),
    width: Math.min(width, main.width),
    height: Math.min(height, main.height),
    maximized: false,
    fullScreen: false,
  };
}

/** Where the window opens, from what was kept and the screens there are now (the main one first). */
export function openingPlace(kept: WindowPlace | null, screens: readonly Area[]): WindowPlace | null {
  const main = screens[0];
  if (!main) return kept;
  if (!kept) return firstPlace(main);
  const shown = screens.some((area) => {
    const { width, height } = overlap(kept, area);
    return width >= SHOWN_LEAST && height >= SHOWN_LEAST;
  });
  if (!shown) return { ...firstPlace(main), maximized: kept.maximized, fullScreen: kept.fullScreen };
  return { ...kept, width: Math.max(LEAST_WIDTH, kept.width), height: Math.max(LEAST_HEIGHT, kept.height) };
}
